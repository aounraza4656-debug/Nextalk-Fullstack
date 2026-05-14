import cookie from "cookie";
import { nanoid } from "nanoid";
import { verifyAccessToken } from "../utils/token.js";
import { User } from "../models/User.js";
import { Conversation } from "../models/Conversation.js";
import { CallLog } from "../models/CallLog.js";

const RING_TIMEOUT_MS = 30000;

function roomHasConnectedUser(io, userId) {
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  return Boolean(room && room.size > 0);
}

export function setupSocket(io) {
  const activeCalls = new Map();
  const userCallBinding = new Map();

  const clearSessionState = (callId) => {
    const session = activeCalls.get(callId);
    if (!session) return;
    if (session.ringTimer) clearTimeout(session.ringTimer);
    activeCalls.delete(callId);
    if (userCallBinding.get(session.callerId) === callId) userCallBinding.delete(session.callerId);
    if (userCallBinding.get(session.calleeId) === callId) userCallBinding.delete(session.calleeId);
  };

  const resolveConversationId = async (conversationId, callerId, calleeId) => {
    if (conversationId) {
      const conversation = await Conversation.findById(conversationId).select("_id participants").lean();
      if (
        conversation
        && conversation.participants?.some((id) => id.toString() === callerId)
        && conversation.participants?.some((id) => id.toString() === calleeId)
      ) {
        return conversation._id;
      }
      return null;
    }
    const direct = await Conversation.findOne({
      participants: { $all: [callerId, calleeId], $size: 2 }
    }).select("_id").lean();
    return direct?._id || null;
  };

  const finalizeCall = async (callId, { status, reason = "", actorId = null, notify = true } = {}) => {
    const session = activeCalls.get(callId);
    if (!session) return;
    const now = new Date();
    const finalStatus = status || (session.status === "active" ? "completed" : "canceled");
    const acceptedAt = session.acceptedAt || null;
    const durationSeconds = acceptedAt ? Math.max(0, Math.round((now.getTime() - acceptedAt.getTime()) / 1000)) : 0;

    await CallLog.findByIdAndUpdate(session.logId, {
      $set: {
        status: finalStatus,
        endedAt: now,
        durationSeconds,
        endedReason: reason || (actorId ? "hangup" : ""),
        acceptedAt: acceptedAt || undefined
      }
    }).catch(() => {});

    if (notify) {
      const payload = {
        callId,
        status: finalStatus,
        reason,
        actorId,
        durationSeconds,
        endedAt: now.toISOString()
      };
      io.to(`user:${session.callerId}`).emit("call:ended", payload);
      io.to(`user:${session.calleeId}`).emit("call:ended", payload);
    }

    clearSessionState(callId);
  };

  io.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie || "";
      const parsed = cookie.parse(rawCookie);
      const accessToken = parsed.nexvocal_at || parsed.nextalk_at;
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

    if (socket.user.activeStatus) await User.findByIdAndUpdate(userId, { $set: { isOnline: true, lastSeenAt: new Date() } });
    else await User.findByIdAndUpdate(userId, { $set: { isOnline: false } });

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

    socket.on("call:start", async ({ targetUserId, type = "audio", conversationId = null } = {}) => {
      try {
        const calleeId = (targetUserId || "").toString();
        if (!calleeId || calleeId === userId) {
          socket.emit("call:failed", { reason: "invalid-target" });
          return;
        }
        if (userCallBinding.has(userId) || userCallBinding.has(calleeId)) {
          socket.emit("call:failed", { reason: "busy" });
          return;
        }

        const callee = await User.findById(calleeId).select("_id username fullName displayName avatarUrl").lean();
        if (!callee) {
          socket.emit("call:failed", { reason: "user-offline" });
          return;
        }

        const callType = type === "video" ? "video" : "audio";
        const resolvedConversationId = await resolveConversationId(conversationId, userId, calleeId);
        const initiatedAt = new Date();
        const callLog = await CallLog.create({
          participants: [userId, calleeId],
          caller: userId,
          callee: calleeId,
          conversationId: resolvedConversationId,
          callType,
          status: "ringing",
          initiatedAt
        });

        const callId = nanoid();
        const session = {
          callId,
          logId: callLog._id,
          callerId: userId,
          calleeId,
          callType,
          conversationId: resolvedConversationId?.toString?.() || null,
          status: "ringing",
          acceptedAt: null,
          ringTimer: null
        };

        session.ringTimer = setTimeout(() => {
          finalizeCall(callId, { status: "missed", reason: "no-answer", actorId: null }).catch(() => {});
        }, RING_TIMEOUT_MS);

        activeCalls.set(callId, session);
        userCallBinding.set(userId, callId);
        userCallBinding.set(calleeId, callId);

        const callerProfile = {
          _id: socket.user._id,
          username: socket.user.username,
          fullName: socket.user.fullName,
          displayName: socket.user.displayName,
          avatarUrl: socket.user.avatarUrl
        };

        socket.emit("call:ringing", {
          callId,
          toUserId: calleeId,
          callType,
          conversationId: session.conversationId
        });

        if (!roomHasConnectedUser(io, calleeId)) {
          await finalizeCall(callId, { status: "missed", reason: "offline", actorId: null });
          return;
        }

        io.to(`user:${calleeId}`).emit("call:incoming", {
          callId,
          callType,
          conversationId: session.conversationId,
          fromUser: callerProfile,
          initiatedAt: initiatedAt.toISOString()
        });
      } catch {
        socket.emit("call:failed", { reason: "server-error" });
      }
    });

    socket.on("call:accept", async ({ callId } = {}) => {
      const session = activeCalls.get(callId);
      if (!session || session.calleeId !== userId || session.status !== "ringing") return;
      session.status = "active";
      session.acceptedAt = new Date();
      if (session.ringTimer) {
        clearTimeout(session.ringTimer);
        session.ringTimer = null;
      }

      await CallLog.findByIdAndUpdate(session.logId, {
        $set: { status: "ongoing", acceptedAt: session.acceptedAt }
      }).catch(() => {});

      io.to(`user:${session.callerId}`).emit("call:accepted", {
        callId: session.callId,
        byUserId: session.calleeId,
        callType: session.callType
      });
      io.to(`user:${session.calleeId}`).emit("call:accepted", {
        callId: session.callId,
        byUserId: session.calleeId,
        callType: session.callType
      });
    });

    socket.on("call:reject", async ({ callId } = {}) => {
      const session = activeCalls.get(callId);
      if (!session || session.calleeId !== userId || session.status !== "ringing") return;
      await finalizeCall(callId, { status: "rejected", reason: "rejected", actorId: userId });
      io.to(`user:${session.callerId}`).emit("call:rejected", { callId, byUserId: userId });
    });

    socket.on("call:end", async ({ callId, reason = "hangup" } = {}) => {
      const session = activeCalls.get(callId);
      if (!session) return;
      if (session.callerId !== userId && session.calleeId !== userId) return;
      const status = session.status === "active" ? "completed" : "canceled";
      await finalizeCall(callId, { status, reason, actorId: userId });
    });

    socket.on("call:signal", ({ callId, toUserId, description, candidate } = {}) => {
      const session = activeCalls.get(callId);
      if (!session) return;
      if (session.callerId !== userId && session.calleeId !== userId) return;
      const expectedPeer = session.callerId === userId ? session.calleeId : session.callerId;
      if (!toUserId || toUserId.toString() !== expectedPeer) return;
      io.to(`user:${expectedPeer}`).emit("call:signal", {
        callId,
        fromUserId: userId,
        description: description || null,
        candidate: candidate || null
      });
    });

    socket.on("disconnect", async () => {
      await User.findByIdAndUpdate(userId, { $set: { isOnline: false, lastSeenAt: new Date() } });
      const hasAnotherSocket = roomHasConnectedUser(io, userId);
      if (hasAnotherSocket) return;
      const callId = userCallBinding.get(userId);
      if (!callId) return;
      const session = activeCalls.get(callId);
      if (!session) {
        userCallBinding.delete(userId);
        return;
      }
      const status = session.status === "active" ? "completed" : "missed";
      await finalizeCall(callId, { status, reason: "disconnect", actorId: userId });
    });
  });
}
