import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    fileName: String,
    fileType: String,
    fileSize: Number,
    url: String
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, trim: true, default: "" },
    attachments: [attachmentSchema],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    status: { type: String, enum: ["sent", "delivered", "seen"], default: "sent" },
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deliveredAt: { type: Date, default: null },
    seenAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedForEveryone: { type: Boolean, default: false },
    deletedForUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    editedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, sender: 1, seenAt: 1 });

export const Message = mongoose.model("Message", messageSchema);
