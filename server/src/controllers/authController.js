import bcrypt from "bcryptjs";
import createError from "http-errors";
import { nanoid } from "nanoid";
import path from "path";
import { User } from "../models/User.js";
import { OtpVerification } from "../models/OtpVerification.js";
import { generateOtp, isValidEmail, otpExpiresAt } from "../utils/otp.js";
import { hashToken, setRefreshCookie, signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/token.js";
import { sendOtpEmail } from "../services/mailService.js";
import { env } from "../config/env.js";

function publicUser(user) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    displayName: user.displayName || user.fullName,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio || "",
    activeStatus: user.activeStatus,
    privacy: user.privacy,
    notifications: user.notifications,
    theme: user.theme
  };
}

function setAccessCookie(res, token, rememberMe = true) {
  res.cookie("nextalk_at", token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: rememberMe ? 1000 * 60 * 15 : undefined
  });
}

function randomUsernameFromEmail(email) {
  const base = String(email || "user").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "user";
  return `${base}${Math.floor(Math.random() * 10000)}`;
}

async function upsertOAuthUser({ email, fullName = "", avatarUrl = "" }) {
  const lowerEmail = String(email).toLowerCase();
  let user = await User.findOne({ email: lowerEmail });
  if (!user) {
    let username = randomUsernameFromEmail(lowerEmail);
    // ensure uniqueness
    while (await User.findOne({ username })) username = randomUsernameFromEmail(lowerEmail);
    user = await User.create({
      fullName: fullName || username,
      username,
      email: lowerEmail,
      passwordHash: await bcrypt.hash(nanoid(24), 10),
      avatarUrl: avatarUrl || undefined
    });
  }
  return user;
}

async function issueSession(res, user, rememberMe = true) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshTokenHash = hashToken(refreshToken);
  user.isOnline = true;
  user.lastSeenAt = new Date();
  await user.save();
  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, accessToken, rememberMe);
  return { accessToken, refreshToken };
}

async function createVerification({ purpose, email, payload }) {
  const verificationId = nanoid(24);
  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = otpExpiresAt();

  await OtpVerification.create({ verificationId, purpose, email, codeHash, expiresAt, payload });
  await sendOtpEmail(email, code);
  return verificationId;
}

export async function signupInit(req, res, next) { try {
  const { fullName, username, email, password } = req.body;
  if (!fullName || !username || !email || !password) throw createError(400, "Missing required fields");
  if (!isValidEmail(email)) throw createError(400, "Valid email is required");

  const lowerEmail = email.toLowerCase();
  const lowerUsername = username.toLowerCase();

  const existing = await User.findOne({ $or: [{ email: lowerEmail }, { username: lowerUsername }] }).lean();
  if (existing) throw createError(409, "Account with this email or username already exists");

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationId = await createVerification({ purpose: "signup", email: lowerEmail, payload: { fullName, username: lowerUsername, passwordHash } });
  res.status(200).json({ verificationId });
} catch (error) { next(error); } }

export async function loginInit(req, res, next) { try {
  const { email, password, rememberMe = true } = req.body;
  if (!email || !password) throw createError(400, "Email and password are required");
  if (!isValidEmail(email)) throw createError(400, "Valid email is required");

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw createError(401, "Invalid credentials");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw createError(401, "Invalid credentials");

  const verificationId = await createVerification({ purpose: "login", email: user.email, payload: { userId: user._id.toString(), rememberMe } });
  res.json({ verificationId });
} catch (error) { next(error); } }

export async function resendOtp(req, res, next) { try {
  const { verificationId } = req.body;
  const verification = await OtpVerification.findOne({ verificationId });
  if (!verification) throw createError(404, "Verification session not found");

  const code = generateOtp();
  verification.codeHash = await bcrypt.hash(code, 10);
  verification.expiresAt = otpExpiresAt();
  verification.attempts = 0;
  await verification.save();

  await sendOtpEmail(verification.email, code);
  res.json({ ok: true });
} catch (error) { next(error); } }

export async function verifyOtp(req, res, next) { try {
  const { verificationId, code } = req.body;
  if (!verificationId || !code) throw createError(400, "Verification code is required");

  const verification = await OtpVerification.findOne({ verificationId });
  if (!verification) throw createError(404, "Verification session expired");
  if (verification.expiresAt < new Date()) throw createError(410, "Verification code expired");
  if (verification.attempts >= 5) throw createError(429, "Too many failed attempts");

  const codeOk = await bcrypt.compare(code, verification.codeHash);
  if (!codeOk) {
    verification.attempts += 1;
    await verification.save();
    throw createError(400, "Invalid verification code");
  }

  let user;
  let rememberMe = true;
  if (verification.purpose === "signup") {
    const { fullName, username, passwordHash } = verification.payload;
    user = await User.create({ fullName, username, email: verification.email, passwordHash });
  } else {
    user = await User.findById(verification.payload.userId);
    rememberMe = Boolean(verification.payload.rememberMe);
    if (!user) throw createError(404, "User account not found");
  }

  const tokens = await issueSession(res, user, rememberMe);
  await OtpVerification.deleteOne({ _id: verification._id });

  res.json({ user: publicUser(user), access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
} catch (error) { next(error); } }

export async function me(req, res, next) { try {
  const user = await User.findById(req.user._id).lean();
  if (!user) throw createError(404, "User not found");
  res.json({ user: publicUser(user) });
} catch (error) { next(error); } }

export async function updateProfile(req, res, next) { try {
  const updates = {};
  const { fullName, displayName, username, bio, profileVisibility, avatarUrl, removeAvatar } = req.body;
  if (fullName !== undefined) updates.fullName = fullName;
  if (displayName !== undefined) updates.displayName = displayName;
  if (bio !== undefined) updates.bio = bio;
  if (req.file) {
    updates.avatarUrl = `${env.uploadBaseUrl}/uploads/images/${path.basename(req.file.path)}`;
  } else if (removeAvatar === true || removeAvatar === "true") {
    const seed = encodeURIComponent(req.user.username || req.user.email || "nextalk");
    updates.avatarUrl = `https://api.dicebear.com/8.x/initials/svg?seed=${seed}`;
  } else if (avatarUrl !== undefined) {
    updates.avatarUrl = avatarUrl;
  }
  if (username !== undefined) {
    const lowerUsername = String(username).toLowerCase();
    const conflict = await User.findOne({ username: lowerUsername, _id: { $ne: req.user._id } }).lean();
    if (conflict) throw createError(409, "Username already taken");
    updates.username = lowerUsername;
  }
  if (profileVisibility !== undefined) updates["privacy.profileVisibility"] = profileVisibility;

  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
  res.json({ user: publicUser(user) });
} catch (error) { next(error); } }

export async function updateSettings(req, res, next) { try {
  const allowed = ["activeStatus", "privacy.profilePhoto", "privacy.lastSeen", "privacy.messageRequests", "privacy.readReceipts", "privacy.messaging", "notifications.push", "notifications.email", "notifications.sound", "theme.mode"];
  const extendedAllowed = ["privacy.profileVisibility", "privacy.activeStatusVisibility", "privacy.friendRequests", "privacy.messageRequests"];
  const set = {};
  for (const key of [...new Set([...allowed, ...extendedAllowed])]) {
    const val = key.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), req.body);
    if (val !== undefined) set[key] = val;
  }
  const user = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true });
  res.json({ user: publicUser(user) });
} catch (error) { next(error); } }

export async function refresh(req, res, next) { try {
  const refreshToken = req.cookies?.nextalk_rt;
  if (!refreshToken) throw createError(401, "No refresh token");
  const payload = verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.sub);
  if (!user || !user.refreshTokenHash || user.refreshTokenHash !== hashToken(refreshToken)) throw createError(401, "Invalid refresh token");
  const nextAccess = signAccessToken(user);
  setAccessCookie(res, nextAccess, true);
  res.json({ ok: true, access_token: nextAccess });
} catch (error) { next(error); } }

export async function googleAuthStart(req, res, next) {
  try {
    if (!env.googleClientId || !env.googleClientSecret) throw createError(503, "Google OAuth is not configured");
    const state = nanoid(24);
    res.cookie("nextalk_google_state", state, {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", env.googleClientId);
    authUrl.searchParams.set("redirect_uri", env.googleCallbackUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");
    res.redirect(authUrl.toString());
  } catch (error) {
    next(error);
  }
}

export async function googleAuthCallback(req, res, next) {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.cookies?.nextalk_google_state) throw createError(400, "Invalid OAuth state");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleCallbackUrl,
        grant_type: "authorization_code"
      }).toString()
    });
    if (!tokenRes.ok) throw createError(401, "Unable to complete Google sign-in");
    const tokenData = await tokenRes.json();

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!profileRes.ok) throw createError(401, "Unable to read Google profile");
    const profile = await profileRes.json();

    const user = await upsertOAuthUser({
      email: profile.email,
      fullName: profile.name,
      avatarUrl: profile.picture
    });
    await issueSession(res, user, true);
    res.clearCookie("nextalk_google_state");
    res.redirect(`${env.clientOrigin}/app`);
  } catch (error) {
    next(error);
  }
}

export async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken || !env.googleClientId) throw createError(400, "Google login payload is invalid");

    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(idToken))}`);
    if (!verifyRes.ok) throw createError(401, "Invalid Google token");
    const tokenInfo = await verifyRes.json();
    if (tokenInfo.aud !== env.googleClientId) throw createError(401, "Google token audience mismatch");
    if (!tokenInfo.email) throw createError(400, "Google account email missing");

    const user = await upsertOAuthUser({
      email: tokenInfo.email,
      fullName: tokenInfo.name,
      avatarUrl: tokenInfo.picture
    });
    const tokens = await issueSession(res, user, true);
    res.json({ user: publicUser(user), access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.nextalk_rt;
    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      await User.findByIdAndUpdate(payload.sub, { $set: { refreshTokenHash: null, isOnline: false, lastSeenAt: new Date() } });
    }
  } catch (_error) {
  } finally {
    res.clearCookie("nextalk_rt");
    res.clearCookie("nextalk_at");
    next();
  }
}
