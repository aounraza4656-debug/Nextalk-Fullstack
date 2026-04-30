import mongoose from "mongoose";

const privacySchema = new mongoose.Schema(
  {
    profilePhoto: { type: String, enum: ["everyone", "friends", "nobody"], default: "everyone" },
    lastSeen: { type: String, enum: ["everyone", "contacts", "nobody"], default: "everyone" },
    messageRequests: { type: String, enum: ["everyone", "contacts", "nobody"], default: "everyone" },
    profileVisibility: { type: String, enum: ["public", "private"], default: "public" },
    activeStatusVisibility: { type: String, enum: ["everyone", "contacts", "nobody"], default: "everyone" },
    friendRequests: { type: String, enum: ["everyone", "fof", "nobody"], default: "everyone" },
    readReceipts: { type: Boolean, default: true },
    messaging: { type: String, enum: ["everyone", "friends"], default: "everyone" }
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    sound: { type: Boolean, default: true }
  },
  { _id: false }
);

const themeSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["dark", "light", "system", "blue", "signature-blue", "premium-dark", "glass-neon", "midnight-purple", "soft-light", "royal-black", "frost-white"],
      default: "signature-blue"
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    displayName: { type: String, default: "", trim: true, maxlength: 60 },
    username: { type: String, required: true, trim: true, unique: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    avatarUrl: {
      type: String,
      default: function defaultAvatar() {
        const seed = encodeURIComponent(this.username || this.email || "nextalk");
        return `https://api.dicebear.com/8.x/initials/svg?seed=${seed}`;
      }
    },
    bio: { type: String, default: "", trim: true, maxlength: 200 },
    isOnline: { type: Boolean, default: false },
    activeStatus: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: null },
    refreshTokenHash: { type: String, default: null },
    privacy: { type: privacySchema, default: () => ({}) },
    notifications: { type: notificationSchema, default: () => ({}) },
    theme: { type: themeSchema, default: () => ({}) },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    incomingFriendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    outgoingFriendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ isOnline: 1, lastSeenAt: -1 });

export const User = mongoose.model("User", userSchema);
