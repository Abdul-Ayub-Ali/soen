import groupModel from "../models/group.model.js";
import * as groupService from "../services/group.service.js";
import userModel from "../models/user.model.js";
import { validationResult } from "express-validator";

export const createGroup = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { groupName } = req.body;
    const loggedInUser = await userModel.findOne({ email: req.user.email });
    const userId = loggedInUser._id;

    const newGroup = await groupService.createGroup({
      name: groupName,
      userId,
    });

    res.status(201).json(newGroup);
  } catch (err) {
    console.log(err);
    res.status(400).send(err.message);
  }
};

export const getAllGroup = async (req, res) => {
  try {
    const loggedInUser = await userModel.findOne({
      email: req.user.email,
    });

    const allUserGroups = await groupService.getAllGroupByUserId({
      userId: loggedInUser._id,
    });

    return res.status(200).json({
      groups: allUserGroups,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const addUserToGroup = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { groupId, users } = req.body;

    const loggedInUser = await userModel.findOne({
      email: req.user.email,
    });

    const group = await groupService.addUsersToGroup({
      groupId,
      users,
      userId: loggedInUser._id,
    });

    return res.status(200).json({
      group,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const joinGroup = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { groupId } = req.body;
    const loggedInUser = await userModel.findOne({ email: req.user.email });

    const group = await groupService.joinGroupById({
      groupId,
      userId: loggedInUser._id,
    });

    return res.status(200).json({ group });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const inviteUserByEmail = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { groupId, email } = req.body;
    const loggedInUser = await userModel.findOne({ email: req.user.email });

    const group = await groupService.inviteUserByEmail({
      groupId,
      ownerId: loggedInUser._id,
      email,
    });

    return res.status(200).json({ group });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const kickUserFromGroup = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { groupId, userId } = req.body;
    const loggedInUser = await userModel.findOne({ email: req.user.email });

    const group = await groupService.kickUserFromGroup({
      groupId,
      ownerId: loggedInUser._id,
      userIdToRemove: userId,
    });

    return res.status(200).json({ group });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const getGroupById = async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await groupService.getGroupById({ groupId });

    return res.status(200).json({
      group,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const deleteGroup = async (req, res) => {
  const { groupId } = req.params;

  try {
    const loggedInUser = await userModel.findOne({ email: req.user.email });

    const group = await groupService.deleteGroup({
      groupId,
      ownerId: loggedInUser._id,
    });

    return res.status(200).json({ group });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const updateFileTree = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { groupId, fileTree } = req.body;

    const group = await groupService.updateFileTree({
      groupId,
      fileTree,
    });

    return res.status(200).json({
      group,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};
