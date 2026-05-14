import dotenv from "dotenv";

dotenv.config();

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseIceServers() {
  const fallback = [{ urls: ["stun:stun.l.google.com:19302"] }];
  const raw = process.env.CALL_ICE_SERVERS;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    const valid = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const urls = Array.isArray(entry.urls) ? entry.urls : (entry.urls ? [entry.urls] : []);
        if (!urls.length) return null;
        const server = { urls };
        if (entry.username) server.username = entry.username;
        if (entry.credential) server.credential = entry.credential;
        return server;
      })
      .filter(Boolean);
    return valid.length ? valid : fallback;
  } catch {
    return fallback;
  }
}

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  clientOrigin: process.env.CLIENT_ORIGIN || "https://nexvocal.com",

  mongoUri: required("MONGODB_URI"),

  accessSecret: required("JWT_ACCESS_SECRET"),
  refreshSecret: required("JWT_REFRESH_SECRET"),

  accessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || "30d",

  smtpHost: required("SMTP_HOST"),
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: required("SMTP_USER"),
  smtpPass: required("SMTP_PASS"),

  mailFrom:
    process.env.MAIL_FROM || "NexVocal <no-reply@nexvocal.com>",

  uploadBaseUrl:
    process.env.UPLOAD_BASE_URL ||
    process.env.APP_URL ||
    "https://nexvocal.com",

  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET || "",
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ||
    "https://nexvocal.com/api/auth/google/callback",

  callIceServers: parseIceServers()
};
