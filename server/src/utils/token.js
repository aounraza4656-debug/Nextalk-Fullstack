import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env.js";

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, env.accessSecret, {
    expiresIn: env.accessExpires
  });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user._id.toString(), type: "refresh" }, env.refreshSecret, {
    expiresIn: env.refreshExpires
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.accessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.refreshSecret);
}

export function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function setRefreshCookie(res, token) {
  res.cookie("nextalk_rt", token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}
