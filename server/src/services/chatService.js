import createError from "http-errors";
import mongoose from "mongoose";
import { Conversation } from "../models/Conversation.js";
import { User } from "../models/User.js";

export async function getOrCreateDirectConversation(userIdA, userIdB) {
  if (!mongoose.Types.ObjectId.isValid(userIdB)) throw createError(400, "Invalid target user");
  if (userIdA.toString() === userIdB.toString()) throw createError(400, "Cannot chat with yourself");

  const [a, b] = await Promise.all([User.findById(userIdA).select("blockedUsers").lean(), User.findById(userIdB).select("blockedUsers").lean()]);
  const blocked = (a?.blockedUsers || []).some((id) => id.toString() === userIdB.toString()) || (b?.blockedUsers || []).some((id) => id.toString() === userIdA.toString());
  if (blocked) throw createError(403, "Cannot start conversation");

  let conversation = await Conversation.findOne({
    participants: { $all: [userIdA, userIdB], $size: 2 }
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userIdA, userIdB]
    });
  }

  return conversation;
}

export async function assertParticipant(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw createError(404, "Conversation not found");
  if (!conversation.participants.some((id) => id.toString() === userId.toString())) {
    throw createError(403, "Forbidden");
  }
  return conversation;
}
