import cookie from "cookie";
import { verifyAccessToken } from "../utils/token.js";
import { User } from "../models/User.js";
import { Conversation } from "../models/Conversation.js";

export function setupSocket(io) {
  io.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie || "";
      const parsed = cookie.parse(rawCookie);
      const accessToken = parsed.nextalk_at;
      if (!accessToken) return next(new Error("Unauthorized"));

      const payload = verifyAccessToken(accessToken);
      const user = await User.findById(payload.sub).lean();
      if (!user) return next(new Error("Unauthorized"));
      socket.user = user;
      next();
    } catch (_error) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);

    if (socket.user.activeStatus) {
      await User.findByIdAndUpdate(userId, { $set: { isOnline: true, lastSeenAt: new Date() } });
      io.emit("presence:update", { userId, online: true });
    } else {
      await User.findByIdAndUpdate(userId, { $set: { isOnline: false } });
    }

    const conversations = await Conversation.find({ participants: userId }).select("_id").lean();
    conversations.forEach((conversation) => {
      socket.join(`conversation:${conversation._id.toString()}`);
    });

    socket.on("typing:start", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", { conversationId, userId, typing: true });
    });
    socket.on("typing:stop", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", { conversationId, userId, typing: false });
    });

    socket.on("disconnect", async () => {
      await User.findByIdAndUpdate(userId, { $set: { isOnline: false, lastSeenAt: new Date() } });
      if (socket.user.activeStatus) io.emit("presence:update", { userId, online: false });
    });
  });
}
