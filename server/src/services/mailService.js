import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  auth: {
    user: env.smtpUser,
    pass: env.smtpPass
  }
});

export async function sendOtpEmail(toEmail, code) {
  await transporter.sendMail({
    from: env.mailFrom,
    to: toEmail,
    subject: "Your Nextalk verification code",
    html: `
      <div style="font-family:Arial,sans-serif;background:#090f1e;color:#e2e8f0;padding:24px;border-radius:14px;">
        <h2 style="margin:0 0 10px 0;">Nextalk Verification</h2>
        <p style="margin:0 0 12px 0;">Use this 6-digit code to verify your account:</p>
        <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:8px 0 14px 0;color:#3f7cff;">${code}</p>
        <p style="margin:0;color:#94a3b8;">Code expires in 10 minutes.</p>
      </div>
    `
  });
}
