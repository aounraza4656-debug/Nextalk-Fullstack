import mongoose from "mongoose";

const storySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    caption: { type: String, trim: true, default: "" },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ["image", "file"], default: "image" },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

storySchema.index({ createdAt: -1 });

export const Story = mongoose.model("Story", storySchema);