import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema(
  {
    verificationId: { type: String, required: true, unique: true, index: true },
    purpose: { type: String, enum: ["signup", "login"], required: true },
    email: { type: String, required: true, lowercase: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpVerification = mongoose.model("OtpVerification", otpVerificationSchema);
