import createError from "http-errors";
import path from "path";
import { User } from "../models/User.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Story } from "../models/Story.js";
import { CallLog } from "../models/CallLog.js";
import { env } from "../config/env.js";
import { assertParticipant, getOrCreateDirectConversation } from "../services/chatService.js";

function messageAttachment(file) {
  if (!file) return [];
  const isImage = file.mimetype.startsWith("image/");
  const isVideo = file.mimetype.startsWith("video/");
  const isAudio = file.mimetype.startsWith("audio/");
  const folder = isImage ? "images" : "files";
  const mediaType = isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "file";
  return [{ fileName: file.originalname, fileType: file.mimetype, mediaType, fileSize: file.size, url: `${env.uploadBaseUrl}/uploads/${folder}/${path.basename(file.path)}` }];
}

function canEditMessage(message) {
  const fifteenMinutes = 15 * 60 * 1000;
  return Date.now() - new Date(message.createdAt).getTime() <= fifteenMinutes;
}

async function isBlockedBetween(userId, otherId) {
  const [a, b] = await Promise.all([
    User.findById(userId).select("blockedUsers").lean(),
    User.findById(otherId).select("blockedUsers").lean()
  ]);
  return (a?.blockedUsers || []).some((x) => x.toString() === otherId.toString()) || (b?.blockedUsers || []).some((x) => x.toString() === userId.toString());
}

async function canMessageUser(senderId, targetId) {
  const [sender, target] = await Promise.all([
    User.findById(senderId).select("friends").lean(),
    User.findById(targetId).select("friends privacy.messaging").lean()
  ]);
  if (!target) return false;
  if (target.privacy?.messaging === "friends") {
    return (sender?.friends || []).some((x) => x.toString() === targetId.toString()) || (target.friends || []).some((x) => x.toString() === senderId.toString());
  }
  return true;
}

export async function searchUsers(req, res, next) { try {
  const q = (req.query.q || "").trim(); if (!q) return res.json({ users: [] });
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const me = await User.findById(req.user._id).select("blockedUsers").lean();
  const users = await User.find({
    _id: { $ne: req.user._id, $nin: me?.blockedUsers || [] },
    blockedUsers: { $ne: req.user._id },
    $or: [{ username: regex }, { email: regex }]
  }).select("_id fullName username email avatarUrl isOnline").limit(12).lean();
  res.json({ users });
} catch (error) { next(error); } }

export async function createDirectConversation(req, res, next) { try {
  const { targetUserId } = req.body;
  const target = await User.findById(targetUserId).lean();
  if (!target) throw createError(404, "User not found");
  if (await isBlockedBetween(req.user._id, targetUserId)) throw createError(403, "User unavailable");
  if (!(await canMessageUser(req.user._id, targetUserId))) throw createError(403, "Messaging restricted by privacy settings");
  const conversation = await getOrCreateDirectConversation(req.user._id, targetUserId);
  const me = await User.findById(req.user._id).select("friends").lean();
  const isFriend = (me?.friends || []).some((x) => x.toString() === targetUserId.toString());
  if (!isFriend) {
    conversation.chatBuckets.set(targetUserId.toString(), "requests");
    await conversation.save();
  }
  res.status(201).json({ conversation });
} catch (error) { next(error); } }

export async function listConversations(req, res, next) { try {
  const conversations = await Conversation.find({ participants: req.user._id })
    .populate("participants", "_id fullName displayName username email avatarUrl isOnline blockedUsers bio createdAt lastSeenAt activeStatus")
    .populate("lastMessage", "text createdAt status editedAt sender")
    .sort({ updatedAt: -1 }).lean();

  const me = await User.findById(req.user._id).select("blockedUsers").lean();
  const result = await Promise.all(conversations.map(async (conversation) => {
    const partner = conversation.participants.find((p) => p._id.toString() !== req.user._id.toString());
    if (!partner) return null;
    const blockedByMe = (me?.blockedUsers || []).some((x) => x.toString() === partner._id.toString());
    const blockedByThem = (partner.blockedUsers || []).some?.((x) => x.toString() === req.user._id.toString());
    if (blockedByThem) return null;
    const bucket = conversation.chatBuckets?.[req.user._id.toString()] || "primary";
    const unreadCount = bucket === "requests" ? 0 : await Message.countDocuments({ conversationId: conversation._id, sender: { $ne: req.user._id }, seenBy: { $ne: req.user._id }, isDeleted: false, deletedForUsers: { $ne: req.user._id } });
    const previewText = conversation.lastMessage?.text?.trim()
      ? conversation.lastMessage.text
      : (conversation.lastMessage?.sender?.toString?.() === req.user._id.toString() ? "You have a new message" : "Got a new message");
    return {
      _id: conversation._id,
      partner,
      unreadCount,
      bucket,
      pinned: (conversation.pinnedBy || []).some((x) => x.toString() === req.user._id.toString()),
      visible: (conversation.visibleFor?.get?.(req.user._id.toString()) ?? conversation.visibleFor?.[req.user._id.toString()] ?? true),
      blockedByMe: Boolean(blockedByMe),
      blockedByThem: Boolean(blockedByThem),
      lastMessage: conversation.lastMessage ? { text: previewText, createdAt: conversation.lastMessage.createdAt, status: conversation.lastMessage.status } : null
    };
  }));

  res.json({ conversations: result.filter(Boolean) });
} catch (error) { next(error); } }

export async function updateConversationBucket(req, res, next) { try {
  const { id } = req.params;
  const { bucket } = req.body;
  if (!["primary", "general", "hidden", "requests"].includes(bucket)) throw createError(400, "Invalid bucket");
  const conversation = await assertParticipant(id, req.user._id);
  conversation.chatBuckets.set(req.user._id.toString(), bucket);
  await conversation.save();
  res.json({ ok: true, bucket });
} catch (error) { next(error); } }

export async function updateConversationPin(req, res, next) { try {
  const { id } = req.params;
  const { pinned } = req.body;
  const conversation = await assertParticipant(id, req.user._id);
  if (pinned) conversation.pinnedBy = [...new Set([...(conversation.pinnedBy || []).map((x) => x.toString()), req.user._id.toString()])];
  else conversation.pinnedBy = (conversation.pinnedBy || []).filter((x) => x.toString() !== req.user._id.toString());
  await conversation.save();
  res.json({ ok: true, pinned: Boolean(pinned) });
} catch (error) { next(error); } }

export async function updateConversationVisibility(req, res, next) { try {
  const { id } = req.params;
  const { visible } = req.body;
  const conversation = await assertParticipant(id, req.user._id);
  conversation.visibleFor.set(req.user._id.toString(), Boolean(visible));
  await conversation.save();
  res.json({ ok: true, visible: Boolean(visible) });
} catch (error) { next(error); } }

export async function listMessages(req, res, next) { try {
  const { id } = req.params;
  await assertParticipant(id, req.user._id);

  const conversation = await Conversation.findById(id).select("participants chatBuckets").lean();
  const partnerId = conversation.participants.find((x) => x.toString() !== req.user._id.toString());
  if (await isBlockedBetween(req.user._id, partnerId)) return res.json({ messages: [] });

  const messages = await Message.find({ conversationId: id, deletedForUsers: { $ne: req.user._id }, isDeleted: false })
    .populate("sender", "_id username fullName avatarUrl")
    .populate("replyTo", "_id text attachments")
    .sort({ createdAt: 1 }).lean();

  const bucket = conversation.chatBuckets?.get?.(req.user._id.toString()) ?? conversation.chatBuckets?.[req.user._id.toString()] ?? "primary";
  const sanitized = bucket === "requests"
    ? messages.map((message) => {
      const senderId = message?.sender?._id?.toString?.() || "";
      if (senderId === req.user._id.toString() || !message.attachments?.length) return message;
      return { ...message, attachments: [], lockedMedia: true };
    })
    : messages;

  res.json({ messages: sanitized, bucket });
} catch (error) { next(error); } }

export async function sendMessage(req, res, next) { try {
  const { conversationId, targetUserId, text = "", replyTo, clientTempId = null } = req.body;
  let conversation;
  if (conversationId) conversation = await assertParticipant(conversationId, req.user._id);
  else if (targetUserId) conversation = await getOrCreateDirectConversation(req.user._id, targetUserId);
  else throw createError(400, "conversationId or targetUserId is required");
  const receiverId = conversation.participants.find((id) => id.toString() !== req.user._id.toString());
  if (await isBlockedBetween(req.user._id, receiverId)) throw createError(403, "User unavailable");
  if (!(await canMessageUser(req.user._id, receiverId))) throw createError(403, "Messaging restricted by privacy settings");

  const files = [...(req.files || []), ...(req.file ? [req.file] : [])];
  const attachments = files.flatMap((file) => messageAttachment(file));
  if (!text.trim() && attachments.length === 0) throw createError(400, "Message content required");
  const sender = await User.findById(req.user._id).select("friends").lean();
  const isFriend = (sender?.friends || []).some((id) => id.toString() === receiverId.toString());
  const receiverBucket = conversation.chatBuckets?.get?.(receiverId.toString()) ?? conversation.chatBuckets?.[receiverId.toString()];
  if (!isFriend && !receiverBucket) conversation.chatBuckets.set(receiverId.toString(), "requests");

  const message = await Message.create({
    conversationId: conversation._id,
    sender: req.user._id,
    text,
    attachments,
    replyTo: replyTo || null,
    status: "delivered",
    deliveredAt: new Date(),
    seenBy: [req.user._id]
  });

  conversation.lastMessage = message._id;
  await conversation.save();

  const populated = await Message.findById(message._id).populate("sender", "_id username fullName avatarUrl").populate("replyTo", "_id text attachments").lean();
  const realtimePayload = { ...populated, conversationId: conversation._id.toString(), clientTempId: clientTempId || undefined };
  req.app.get("io").to(`conversation:${conversation._id}`).emit("message:new", realtimePayload);
  res.status(201).json({ message: realtimePayload });
} catch (error) { next(error); } }

export async function blockUser(req, res, next) { try {
  const targetId = req.params.id;
  if (targetId.toString() === req.user._id.toString()) throw createError(400, "Cannot block yourself");
  const user = await User.findByIdAndUpdate(req.user._id, { $addToSet: { blockedUsers: targetId } }, { new: true });
  res.json({ ok: true, blockedUsers: user.blockedUsers });
} catch (error) { next(error); } }

export async function unblockUser(req, res, next) { try {
  const targetId = req.params.id;
  const user = await User.findByIdAndUpdate(req.user._id, { $pull: { blockedUsers: targetId } }, { new: true });
  res.json({ ok: true, blockedUsers: user.blockedUsers });
} catch (error) { next(error); } }

export async function listBlockedUsers(req, res, next) { try {
  const user = await User.findById(req.user._id).populate("blockedUsers", "_id username fullName avatarUrl").lean();
  res.json({ blockedUsers: user?.blockedUsers || [] });
} catch (error) { next(error); } }

export async function reportUser(req, res, next) { try {
  const targetId = req.params.id;
  const { reason = "unspecified" } = req.body;
  if (!targetId) throw createError(400, "Target required");
  res.json({ ok: true, reported: targetId, reason });
} catch (error) { next(error); } }

export async function sendFriendRequest(req, res, next) { try {
  const targetId = req.params.id;
  if (targetId.toString() === req.user._id.toString()) throw createError(400, "Cannot request yourself");
  const target = await User.findById(targetId);
  if (!target) throw createError(404, "User not found");
  const me = await User.findById(req.user._id).select("friends");
  const isFriend = (me?.friends || []).some((x) => x.toString() === targetId.toString());
  if (isFriend) return res.json({ ok: true, already: true });
  if (target.privacy?.friendRequests === "nobody") throw createError(403, "This user is not accepting friend requests");
  if (target.privacy?.friendRequests === "fof") {
    const targetFriends = new Set((target.friends || []).map((x) => x.toString()));
    const mutual = (me?.friends || []).some((x) => targetFriends.has(x.toString()));
    if (!mutual) throw createError(403, "Only friends of friends can send requests");
  }
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { outgoingFriendRequests: targetId } });
  await User.findByIdAndUpdate(targetId, { $addToSet: { incomingFriendRequests: req.user._id } });
  req.app.get("io").to(`user:${targetId.toString()}`).emit("social:update", { type: "friend_request", fromUserId: req.user._id.toString() });
  res.json({ ok: true, pending: true });
} catch (error) { next(error); } }

export async function respondFriendRequest(req, res, next) { try {
  const userId = req.params.id;
  const { action } = req.body;
  if (!["accept", "decline"].includes(action)) throw createError(400, "Invalid action");
  const me = await User.findById(req.user._id);
  if (!me) throw createError(404, "User not found");
  if (!(me.incomingFriendRequests || []).some((x) => x.toString() === userId.toString())) throw createError(404, "Request not found");
  me.incomingFriendRequests = (me.incomingFriendRequests || []).filter((x) => x.toString() !== userId.toString());
  await me.save();
  await User.findByIdAndUpdate(userId, { $pull: { outgoingFriendRequests: req.user._id } });
  if (action === "accept") {
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { friends: userId } });
    await User.findByIdAndUpdate(userId, { $addToSet: { friends: req.user._id } });
    req.app.get("io").to(`user:${req.user._id.toString()}`).emit("social:update", { type: "friend", userId });
    req.app.get("io").to(`user:${userId.toString()}`).emit("social:update", { type: "friend", userId: req.user._id.toString() });
  } else {
    req.app.get("io").to(`user:${userId.toString()}`).emit("social:update", { type: "friend_request_declined", userId: req.user._id.toString() });
  }
  req.app.get("io").to(`user:${req.user._id.toString()}`).emit("social:update", { type: "friend_request_updated", userId });
  res.json({ ok: true, action });
} catch (error) { next(error); } }

export async function cancelFriendRequest(req, res, next) { try {
  const targetId = req.params.id;
  await User.findByIdAndUpdate(req.user._id, { $pull: { outgoingFriendRequests: targetId } });
  await User.findByIdAndUpdate(targetId, { $pull: { incomingFriendRequests: req.user._id } });
  req.app.get("io").to(`user:${targetId.toString()}`).emit("social:update", { type: "friend_request_canceled", userId: req.user._id.toString() });
  res.json({ ok: true });
} catch (error) { next(error); } }

export async function unfriendUser(req, res, next) { try {
  const targetId = req.params.id;
  await User.findByIdAndUpdate(req.user._id, { $pull: { friends: targetId } });
  await User.findByIdAndUpdate(targetId, { $pull: { friends: req.user._id } });
  req.app.get("io").to(`user:${req.user._id.toString()}`).emit("social:update", { type: "unfriend", userId: targetId.toString() });
  req.app.get("io").to(`user:${targetId.toString()}`).emit("social:update", { type: "unfriend", userId: req.user._id.toString() });
  res.json({ ok: true });
} catch (error) { next(error); } }

export async function getRelationship(req, res, next) { try {
  const targetId = req.params.id;
  const me = await User.findById(req.user._id).select("friends incomingFriendRequests outgoingFriendRequests").lean();
  const status = (me?.friends || []).some((x) => x.toString() === targetId) ? "friends"
    : (me?.incomingFriendRequests || []).some((x) => x.toString() === targetId) ? "incoming"
    : (me?.outgoingFriendRequests || []).some((x) => x.toString() === targetId) ? "pending"
    : "none";
  res.json({ status });
} catch (error) { next(error); } }

export async function getUserProfile(req, res, next) { try {
  const targetId = req.params.id;
  const [me, target] = await Promise.all([
    User.findById(req.user._id).select("friends blockedUsers").lean(),
    User.findById(targetId)
      .select("_id fullName displayName username avatarUrl bio createdAt privacy friends blockedUsers nameChangeCount")
      .populate("friends", "_id username fullName displayName avatarUrl")
      .lean()
  ]);

  if (!target) throw createError(404, "User not found");

  const blockedByMe = (me?.blockedUsers || []).some((x) => x.toString() === targetId.toString());
  const blockedByThem = (target?.blockedUsers || []).some((x) => x.toString() === req.user._id.toString());
  if (blockedByMe || blockedByThem) throw createError(403, "User unavailable");

  const meFriendSet = new Set((me?.friends || []).map((x) => x.toString()));
  const targetFriendIds = (target.friends || []).map((friend) => friend?._id?.toString?.() || friend.toString());
  const isSelf = targetId.toString() === req.user._id.toString();
  const isFriend = isSelf || meFriendSet.has(targetId.toString()) || targetFriendIds.includes(req.user._id.toString());
  const visibility = target.privacy?.friendsVisibility || "everyone";
  const canSeeFriends = isSelf || visibility === "everyone" || (visibility === "friends" && isFriend);
  const mutualFriendsCount = isSelf ? targetFriendIds.length : targetFriendIds.filter((id) => meFriendSet.has(id)).length;
  const friends = canSeeFriends
    ? (target.friends || []).map((friend) => ({
      _id: friend._id,
      username: friend.username,
      fullName: friend.fullName,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl
    }))
    : [];

  res.json({
    profile: {
      id: target._id.toString(),
      fullName: target.fullName,
      displayName: target.displayName || target.fullName,
      username: target.username,
      avatarUrl: target.avatarUrl,
      bio: target.bio || "",
      createdAt: target.createdAt,
      nameChangeCount: Number(target.nameChangeCount || 0),
      privacy: target.privacy || {},
      friendsCount: targetFriendIds.length,
      mutualFriendsCount,
      canSeeFriends,
      friends
    }
  });
} catch (error) { next(error); } }

export async function listFriends(req, res, next) { try {
  const user = await User.findById(req.user._id).populate("friends", "_id username fullName avatarUrl isOnline").lean();
  res.json({ friends: user?.friends || [] });
} catch (error) { next(error); } }

export async function listIncomingFriendRequests(req, res, next) { try {
  const user = await User.findById(req.user._id).populate("incomingFriendRequests", "_id username fullName avatarUrl").lean();
  res.json({ requests: user?.incomingFriendRequests || [] });
} catch (error) { next(error); } }

export async function editMessage(req, res, next) { try {
  const { id } = req.params;
  const { text } = req.body;
  const message = await Message.findById(id);
  if (!message) throw createError(404, "Message not found");
  if (message.sender.toString() !== req.user._id.toString()) throw createError(403, "Forbidden");
  if (!canEditMessage(message)) throw createError(400, "Edit window expired");
  message.text = (text || "").trim();
  message.editedAt = new Date();
  await message.save();
  req.app.get("io").to(`conversation:${message.conversationId}`).emit("message:updated", { conversationId: message.conversationId.toString(), message: { _id: message._id.toString(), text: message.text, editedAt: message.editedAt } });
  res.json({ ok: true });
} catch (error) { next(error); } }

export async function deleteMessage(req, res, next) { try {
  const { id } = req.params;
  const { mode = "me" } = req.body;
  const message = await Message.findById(id);
  if (!message) throw createError(404, "Message not found");
  await assertParticipant(message.conversationId, req.user._id);

  if (mode === "everyone") {
    if (message.sender.toString() !== req.user._id.toString()) throw createError(403, "You can only unsend your own messages");
    message.isDeleted = true;
    message.deletedForEveryone = true;
    message.text = "";
    message.attachments = [];
  } else {
    message.deletedForUsers = [...new Set([...(message.deletedForUsers || []).map((x) => x.toString()), req.user._id.toString()])];
  }

  await message.save();
  const payload = {
    _id: message._id.toString(),
    deleteMode: mode,
    actorId: req.user._id.toString(),
    isDeleted: message.isDeleted,
    deletedForEveryone: message.deletedForEveryone,
    deletedForUsers: message.deletedForUsers
  };
  req.app.get("io").to(`conversation:${message.conversationId}`).emit("message:updated", {
    conversationId: message.conversationId.toString(),
    message: payload
  });
  res.json({ ok: true });
} catch (error) { next(error); } }

export async function getMessageInfo(req, res, next) { try {
  const { id } = req.params;
  const message = await Message.findById(id).lean();
  if (!message) throw createError(404, "Message not found");
  await assertParticipant(message.conversationId, req.user._id);
  res.json({
    info: {
      sentAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      readAt: message.seenAt,
      editedAt: message.editedAt,
      status: message.status,
      mediaType: message.attachments?.length ? [...new Set(message.attachments.map((a) => a.mediaType || "file"))].join(", ") : "text",
      seenStatus: message.status === "seen" ? "seen" : "delivered"
    }
  });
} catch (error) { next(error); } }

export async function markConversationSeen(req, res, next) { try {
  const { id } = req.params;
  await assertParticipant(id, req.user._id);
  const me = await User.findById(req.user._id).select("privacy.readReceipts");
  const targetMessages = await Message.find({ conversationId: id, sender: { $ne: req.user._id }, seenBy: { $ne: req.user._id }, isDeleted: false }).select("_id").lean();
  const now = new Date();
  if (me?.privacy?.readReceipts === false) {
    await Message.updateMany(
      { conversationId: id, sender: { $ne: req.user._id }, seenBy: { $ne: req.user._id }, isDeleted: false },
      { $addToSet: { seenBy: req.user._id }, $set: { status: "delivered", deliveredAt: now } }
    );
    targetMessages.forEach((entry) => {
      req.app.get("io").to(`conversation:${id}`).emit("message:updated", {
        conversationId: id.toString(),
        message: { _id: entry._id.toString(), status: "delivered", deliveredAt: now }
      });
    });
  } else {
    await Message.updateMany(
      { conversationId: id, sender: { $ne: req.user._id }, seenBy: { $ne: req.user._id }, isDeleted: false },
      { $addToSet: { seenBy: req.user._id }, $set: { status: "seen", seenAt: now, deliveredAt: now } }
    );
    targetMessages.forEach((entry) => {
      req.app.get("io").to(`conversation:${id}`).emit("message:updated", {
        conversationId: id.toString(),
        message: { _id: entry._id.toString(), status: "seen", seenAt: now, deliveredAt: now }
      });
    });
  }

  res.json({ ok: true });
} catch (error) { next(error); } }

export async function getCallConfig(_req, res, next) { try {
  res.json({ iceServers: env.callIceServers });
} catch (error) { next(error); } }

export async function listCallLogs(req, res, next) { try {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));
  const meId = req.user._id.toString();
  const calls = await CallLog.find({ participants: req.user._id })
    .populate("caller", "_id username fullName displayName avatarUrl")
    .populate("callee", "_id username fullName displayName avatarUrl")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const logs = calls.map((call) => {
    const callerId = call?.caller?._id?.toString?.() || call?.caller?.toString?.() || "";
    const calleeId = call?.callee?._id?.toString?.() || call?.callee?.toString?.() || "";
    const direction = callerId === meId ? "outgoing" : "incoming";
    const partner = callerId === meId ? call.callee : call.caller;
    return {
      _id: call._id,
      callType: call.callType || "audio",
      status: call.status || "completed",
      direction,
      conversationId: call.conversationId || null,
      initiatedAt: call.initiatedAt || call.createdAt,
      acceptedAt: call.acceptedAt || null,
      endedAt: call.endedAt || null,
      durationSeconds: Number(call.durationSeconds || 0),
      endedReason: call.endedReason || "",
      partner: partner ? {
        _id: partner._id,
        username: partner.username,
        fullName: partner.fullName,
        displayName: partner.displayName,
        avatarUrl: partner.avatarUrl
      } : {
        _id: callerId === meId ? calleeId : callerId,
        username: "unknown",
        fullName: "Unknown User",
        displayName: "Unknown User",
        avatarUrl: ""
      }
    };
  });

  res.json({ calls: logs });
} catch (error) { next(error); } }

export async function listStories(req, res, next) { try {
  const now = new Date();
  const stories = await Story.find({ expiresAt: { $gt: now } }).populate("user", "_id username avatarUrl").sort({ createdAt: -1 }).lean();
  res.json({ stories });
} catch (error) { next(error); } }

export async function createStory(req, res, next) { try {
  if (!req.file) throw createError(400, "Story media required");
  const folder = req.file.mimetype.startsWith("image/") ? "images" : "files";
  const story = await Story.create({
    user: req.user._id,
    caption: req.body.caption || "",
    mediaUrl: `${env.uploadBaseUrl}/uploads/${folder}/${path.basename(req.file.path)}`,
    mediaType: req.file.mimetype.startsWith("image/") ? "image" : "file",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
  res.status(201).json({ story });
} catch (error) { next(error); } }
