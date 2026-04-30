import dotenv from "dotenv";

dotenv.config();

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",

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
    process.env.MAIL_FROM || "Nextalk <no-reply@nextalk.app>",

  uploadBaseUrl:
    process.env.UPLOAD_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}`,

  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET || "",
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:5000/api/auth/google/callback"
};
