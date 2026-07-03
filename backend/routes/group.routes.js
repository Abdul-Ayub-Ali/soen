import { Router } from "express";
import { body } from "express-validator";
import * as groupController from "../controllers/group.controller.js";
import * as authMiddleWare from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/create",
  authMiddleWare.authUser,
  body("groupName").trim().notEmpty().withMessage("Group Name is required"),
  groupController.createGroup,
);

router.get("/all", authMiddleWare.authUser, groupController.getAllGroup);

router.put(
  "/add-user",
  authMiddleWare.authUser,
  body("groupId").isString().withMessage("Group ID is required"),
  body("users")
    .isArray({ min: 1 })
    .withMessage("Users must be an array of strings")
    .bail()
    .custom((users) => users.every((user) => typeof user === "string"))
    .withMessage("Each user must be a string"),
  groupController.addUserToGroup,
);

router.post(
  "/join",
  authMiddleWare.authUser,
  body("groupId").trim().notEmpty().withMessage("Group ID is required"),
  groupController.joinGroup,
);

router.put(
  "/join",
  authMiddleWare.authUser,
  body("groupId").trim().notEmpty().withMessage("Group ID is required"),
  groupController.joinGroup,
);

router.put(
  "/invite-user",
  authMiddleWare.authUser,
  body("groupId").trim().notEmpty().withMessage("Group ID is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  groupController.inviteUserByEmail,
);

router.put(
  "/kick-user",
  authMiddleWare.authUser,
  body("groupId").trim().notEmpty().withMessage("Group ID is required"),
  body("userId").trim().notEmpty().withMessage("User ID is required"),
  groupController.kickUserFromGroup,
);

router.delete(
  "/delete/:groupId",
  authMiddleWare.authUser,
  groupController.deleteGroup,
);

router.get(
  "/get-group/:groupId",
  authMiddleWare.authUser,
  groupController.getGroupById,
);

router.put(
  "/update-file-tree",
  authMiddleWare.authUser,
  body("groupId").isString().withMessage("Group ID is required"),
  body("fileTree").isObject().withMessage("File tree is required"),
  groupController.updateFileTree,
);

export default router;
