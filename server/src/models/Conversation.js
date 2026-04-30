import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    chatBuckets: {
      type: Map,
      of: { type: String, enum: ["primary", "general", "hidden", "requests"], default: "primary" },
      default: {}
    },
    pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    visibleFor: { type: Map, of: { type: Boolean, default: true }, default: {} }
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
