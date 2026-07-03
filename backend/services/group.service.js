import groupModel from "../models/group.model.js";
import userModel from "../models/user.model.js";
import mongoose from "mongoose";

export const createGroup = async ({ name, userId }) => {
  if (!name) {
    throw new Error("Name is required");
  }
  if (!userId) {
    throw new Error("UserId is required");
  }

  let group;
  try {
    group = await groupModel.create({
      groupName: name,
      owner: userId,
      members: [userId],
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new Error("Group name already exists");
    }
    throw error;
  }

  return group;
};

export const joinGroupById = async ({ groupId, userId }) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  if (!userId) {
    throw new Error("userId is required");
  }

  const group = await groupModel.findById(groupId);
  if (!group) {
    throw new Error("Group not found");
  }

  if (group.members.some((member) => member.toString() === userId.toString())) {
    return group;
  }

  group.members.push(userId);
  await group.save();

  return await group.populate("members owner");
};

export const inviteUserByEmail = async ({ groupId, ownerId, email }) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  if (!ownerId) {
    throw new Error("ownerId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(ownerId)) {
    throw new Error("Invalid ownerId");
  }

  if (!email) {
    throw new Error("Email is required");
  }

  const group = await groupModel.findById(groupId);
  if (!group) {
    throw new Error("Group not found");
  }

  if (group.owner.toString() !== ownerId.toString()) {
    throw new Error("Only the group owner can invite collaborators");
  }

  const user = await userModel.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new Error("No user found with that email");
  }

  if (
    group.members.some((member) => member.toString() === user._id.toString())
  ) {
    return await group.populate("members owner");
  }

  group.members.push(user._id);
  await group.save();

  return await group.populate("members owner");
};

export const kickUserFromGroup = async ({
  groupId,
  ownerId,
  userIdToRemove,
}) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  if (!ownerId) {
    throw new Error("ownerId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(ownerId)) {
    throw new Error("Invalid ownerId");
  }

  if (!userIdToRemove) {
    throw new Error("userIdToRemove is required");
  }

  if (!mongoose.Types.ObjectId.isValid(userIdToRemove)) {
    throw new Error("Invalid userIdToRemove");
  }

  const group = await groupModel.findById(groupId);
  if (!group) {
    throw new Error("Group not found");
  }

  if (group.owner.toString() !== ownerId.toString()) {
    throw new Error("Only the group owner can remove collaborators");
  }

  if (group.owner.toString() === userIdToRemove.toString()) {
    throw new Error("Owner cannot remove themselves");
  }

  if (
    !group.members.some(
      (member) => member.toString() === userIdToRemove.toString(),
    )
  ) {
    throw new Error("User is not a collaborator in this group");
  }

  const updatedGroup = await groupModel
    .findByIdAndUpdate(
      groupId,
      {
        $pull: {
          members: userIdToRemove,
        },
      },
      { new: true },
    )
    .populate("members owner");

  return updatedGroup;
};

export const getAllGroupByUserId = async ({ userId }) => {
  if (!userId) {
    throw new Error("UserId is required");
  }

  const allUserGroups = await groupModel
    .find({
      members: userId,
    })
    .populate("owner");

  return allUserGroups;
};

export const addUsersToGroup = async ({ groupId, users, userId }) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  if (!users) {
    throw new Error("users are required");
  }

  if (
    !Array.isArray(users) ||
    users.some((userId) => !mongoose.Types.ObjectId.isValid(userId))
  ) {
    throw new Error("Invalid userId(s) in users array");
  }

  if (!userId) {
    throw new Error("userId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid userId");
  }

  const group = await groupModel.findOne({
    _id: groupId,
    members: userId,
  });

  console.log(group);

  if (!group) {
    throw new Error("User not belong to this group");
  }

  const updatedGroup = await groupModel.findOneAndUpdate(
    {
      _id: groupId,
    },
    {
      $addToSet: {
        members: {
          $each: users,
        },
      },
    },
    {
      new: true,
    },
  );

  return updatedGroup;
};

export const getGroupById = async ({ groupId }) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  const group = await groupModel
    .findOne({
      _id: groupId,
    })
    .populate("members owner");

  return group;
};

export const deleteGroup = async ({ groupId, ownerId }) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  if (!ownerId) {
    throw new Error("ownerId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(ownerId)) {
    throw new Error("Invalid ownerId");
  }

  const group = await groupModel.findById(groupId);
  if (!group) {
    throw new Error("Group not found");
  }

  if (group.owner.toString() !== ownerId.toString()) {
    throw new Error("Only the group owner can delete the room");
  }

  await groupModel.deleteOne({ _id: groupId });

  return { _id: groupId, deleted: true };
};

export const updateFileTree = async ({ groupId, fileTree }) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  if (!fileTree) {
    throw new Error("fileTree is required");
  }

  const group = await groupModel.findOneAndUpdate(
    {
      _id: groupId,
    },
    {
      fileTree,
    },
    {
      new: true,
    },
  );

  return group;
};
