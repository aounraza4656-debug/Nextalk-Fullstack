import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  createDirectConversation,
  createStory,
  deleteMessage,
  editMessage,
  listActiveUsers,
  getMessageInfo,
  listFriends,
  listIncomingFriendRequests,
  respondFriendRequest,
  cancelFriendRequest,
  unfriendUser,
  getRelationship,
  listConversations,
  listMessages,
  listStories,
  markConversationSeen,
  blockUser,
  unblockUser,
  listBlockedUsers,
  reportUser,
  searchUsers,
  sendFriendRequest,
  sendMessage,
  updateConversationBucket
  ,updateConversationPin
  ,updateConversationVisibility
} from "../controllers/chatController.js";

const router = Router();

router.use(requireAuth);
router.get("/users/search", searchUsers);
router.get("/users/active", listActiveUsers);
router.get("/friends", listFriends);
router.get("/friends/requests/incoming", listIncomingFriendRequests);
router.post("/friends/:id/request", sendFriendRequest);
router.post("/friends/:id/respond", respondFriendRequest);
router.post("/friends/:id/cancel", cancelFriendRequest);
router.post("/friends/:id/unfriend", unfriendUser);
router.get("/users/:id/relationship", getRelationship);
router.post("/users/:id/block", blockUser);
router.post("/users/:id/unblock", unblockUser);
router.get("/users/blocked", listBlockedUsers);
router.post("/users/:id/report", reportUser);
router.post("/conversations/direct", createDirectConversation);
router.get("/conversations", listConversations);
router.patch("/conversations/:id/bucket", updateConversationBucket);
router.patch("/conversations/:id/pin", updateConversationPin);
router.patch("/conversations/:id/visibility", updateConversationVisibility);
router.get("/conversations/:id/messages", listMessages);
router.patch("/conversations/:id/seen", markConversationSeen);
router.post("/messages", upload.array("files", 10), sendMessage);
router.patch("/messages/:id", editMessage);
router.post("/messages/:id/delete", deleteMessage);
router.get("/messages/:id/info", getMessageInfo);
router.get("/stories", listStories);
router.post("/stories", upload.single("file"), createStory);

export default router;
