import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    caller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    callee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", default: null },
    callType: { type: String, enum: ["audio", "video"], default: "audio" },
    status: {
      type: String,
      enum: ["ringing", "ongoing", "completed", "missed", "rejected", "canceled", "failed"],
      default: "ringing"
    },
    initiatedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    endedReason: { type: String, default: "" }
  },
  { timestamps: true }
);

callLogSchema.index({ participants: 1, createdAt: -1 });
callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ callee: 1, createdAt: -1 });

export const CallLog = mongoose.model("CallLog", callLogSchema);

