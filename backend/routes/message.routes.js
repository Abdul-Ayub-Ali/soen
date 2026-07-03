import { Router } from "express";
import * as messageController from "../controllers/message.controller.js";
import * as authMiddleWare from "../middleware/auth.middleware.js";

const router = Router();

// Group messages
router.get(
  "/group/:groupId",
  authMiddleWare.authUser,
  messageController.getMessagesByGroupId,
);
router.post(
  "/send",
  authMiddleWare.authUser,
  messageController.sendGroupMessage,
);

// Direct messages
router.get(
  "/direct-chats",
  authMiddleWare.authUser,
  messageController.getDirectChats,
);
router.post(
  "/direct/start",
  authMiddleWare.authUser,
  messageController.startDirectChat,
);
router.get(
  "/direct/:recipientEmail",
  authMiddleWare.authUser,
  messageController.getDirectMessages,
);
router.delete(
  "/direct/:recipientEmail",
  authMiddleWare.authUser,
  messageController.deleteDirectChat,
);
router.post(
  "/direct",
  authMiddleWare.authUser,
  messageController.sendDirectMessage,
);

export default router;
