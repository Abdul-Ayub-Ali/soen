import mongoose from "mongoose";
import DirectChat from "../models/directChat.model.js";
import Message from "../models/message.model.js";
import groupModel from "../models/group.model.js";
import userModel from "../models/user.model.js";

export const normalizeEmail = (email = "") => email.trim().toLowerCase();

const normalizeDirectParticipants = (firstEmail, secondEmail) =>
  [normalizeEmail(firstEmail), normalizeEmail(secondEmail)].sort();

const getParticipantsKey = (firstEmail, secondEmail) =>
  normalizeDirectParticipants(firstEmail, secondEmail).join("::");

const buildDirectMessagePairQuery = (firstEmail, secondEmail) => {
  const senderEmail = normalizeEmail(firstEmail);
  const recipientEmail = normalizeEmail(secondEmail);

  return {
    $or: [
      { senderEmail, recipientEmail },
      { senderEmail: recipientEmail, recipientEmail: senderEmail },
    ],
  };
};

const ensureRegisteredUser = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await userModel.findOne({ email: normalizedEmail });

  if (!user) {
    throw new Error("No user found with that email");
  }

  return user;
};

export const ensureGroupAccess = async (groupId, userId) => {
  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  const group = await groupModel.findOne({
    _id: groupId,
    members: userId,
  });

  if (!group) {
    throw new Error("You do not have access to this group");
  }

  return group;
};

const getLatestDirectMessageText = (message) =>
  message?.content || message?.message || "";

export const serializeMessage = (message) => {
  if (!message) {
    return null;
  }

  const rawMessage = typeof message.toObject === "function"
    ? message.toObject()
    : message;

  const sender =
    rawMessage.sender && typeof rawMessage.sender === "object"
      ? rawMessage.sender
      : {
          _id: rawMessage.sender,
          email: rawMessage.senderEmail || rawMessage.sender,
        };

  return {
    _id: rawMessage._id?.toString?.() || rawMessage._id,
    sender,
    senderEmail:
      rawMessage.senderEmail || sender?.email || rawMessage.sender || "",
    recipientEmail: rawMessage.recipientEmail || null,
    groupId: rawMessage.groupId?.toString?.() || rawMessage.groupId || null,
    content: rawMessage.content || rawMessage.message || "",
    message: rawMessage.message || rawMessage.content || "",
    timestamp: rawMessage.timestamp || rawMessage.createdAt || new Date(),
  };
};

export const serializeDirectChat = (chat, currentUserEmail) => {
  const rawChat = typeof chat.toObject === "function" ? chat.toObject() : chat;
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail);
  const recipientEmail =
    rawChat.participants.find((email) => email !== normalizedCurrentUserEmail) ||
    normalizedCurrentUserEmail;

  return {
    _id: rawChat._id?.toString?.() || rawChat._id,
    recipientEmail,
    participants: rawChat.participants,
    lastMessage: rawChat.lastMessage || "",
    lastMessageAt: rawChat.lastMessageAt || rawChat.updatedAt || rawChat.createdAt,
    createdAt: rawChat.createdAt,
    updatedAt: rawChat.updatedAt,
  };
};

const seedMissingDirectChatsFromMessages = async (currentUserEmail) => {
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail);
  const directMessages = await Message.find({
    recipientEmail: { $exists: true, $ne: null },
    $or: [
      { senderEmail: normalizedCurrentUserEmail },
      { recipientEmail: normalizedCurrentUserEmail },
    ],
  })
    .sort({ timestamp: -1 })
    .select("senderEmail recipientEmail content message timestamp");

  const seenKeys = new Set();
  const bulkOperations = [];

  for (const message of directMessages) {
    const counterpartEmail =
      message.senderEmail === normalizedCurrentUserEmail
        ? message.recipientEmail
        : message.senderEmail;

    if (!counterpartEmail) {
      continue;
    }

    const participants = normalizeDirectParticipants(
      normalizedCurrentUserEmail,
      counterpartEmail,
    );
    const participantsKey = participants.join("::");

    if (seenKeys.has(participantsKey)) {
      continue;
    }

    seenKeys.add(participantsKey);

    bulkOperations.push({
      updateOne: {
        filter: { participantsKey },
        update: {
          $setOnInsert: {
            participants,
            participantsKey,
            deletedBy: [],
            lastMessage: getLatestDirectMessageText(message),
            lastMessageAt: message.timestamp || new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (bulkOperations.length > 0) {
    await DirectChat.bulkWrite(bulkOperations, { ordered: false });
  }
};

export const listDirectChats = async (currentUserEmail) => {
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail);
  await seedMissingDirectChatsFromMessages(normalizedCurrentUserEmail);

  const chats = await DirectChat.find({
    participants: normalizedCurrentUserEmail,
    deletedBy: { $nin: [normalizedCurrentUserEmail] },
  }).sort({ lastMessageAt: -1, updatedAt: -1 });

  return chats.map((chat) =>
    serializeDirectChat(chat, normalizedCurrentUserEmail),
  );
};

export const startDirectChat = async ({
  currentUserEmail,
  recipientEmail,
}) => {
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail);
  const normalizedRecipientEmail = normalizeEmail(recipientEmail);

  if (!normalizedRecipientEmail) {
    throw new Error("recipientEmail is required");
  }

  if (normalizedCurrentUserEmail === normalizedRecipientEmail) {
    throw new Error("You cannot start a chat with yourself");
  }

  await ensureRegisteredUser(normalizedRecipientEmail);

  const participants = normalizeDirectParticipants(
    normalizedCurrentUserEmail,
    normalizedRecipientEmail,
  );
  const participantsKey = participants.join("::");

  const chat = await DirectChat.findOneAndUpdate(
    { participantsKey },
    {
      $setOnInsert: {
        participants,
        participantsKey,
        lastMessage: "",
        lastMessageAt: new Date(),
      },
      $pull: {
        deletedBy: normalizedCurrentUserEmail,
      },
    },
    {
      new: true,
      upsert: true,
    },
  );

  return serializeDirectChat(chat, normalizedCurrentUserEmail);
};

export const deleteDirectChat = async ({
  currentUserEmail,
  recipientEmail,
}) => {
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail);
  const normalizedRecipientEmail = normalizeEmail(recipientEmail);

  if (!normalizedRecipientEmail) {
    throw new Error("recipientEmail is required");
  }

  if (normalizedCurrentUserEmail === normalizedRecipientEmail) {
    throw new Error("You cannot delete a chat with yourself");
  }

  const participants = normalizeDirectParticipants(
    normalizedCurrentUserEmail,
    normalizedRecipientEmail,
  );
  const participantsKey = participants.join("::");

  let chat = await DirectChat.findOne({ participantsKey });

  if (!chat) {
    const hasMessages = await Message.exists(
      buildDirectMessagePairQuery(
        normalizedCurrentUserEmail,
        normalizedRecipientEmail,
      ),
    );

    if (!hasMessages) {
      throw new Error("Chat not found");
    }

    chat = await DirectChat.create({
      participants,
      participantsKey,
      deletedBy: [normalizedCurrentUserEmail],
      lastMessage: "",
      lastMessageAt: new Date(),
    });
  } else if (chat.deletedBy.includes(normalizedCurrentUserEmail)) {
    return {
      deletedFor: normalizedCurrentUserEmail,
      recipientEmail: normalizedRecipientEmail,
      deletedForEveryone: false,
    };
  } else {
    chat = await DirectChat.findOneAndUpdate(
      { participantsKey },
      {
        $addToSet: {
          deletedBy: normalizedCurrentUserEmail,
        },
      },
      { new: true },
    );
  }

  const allParticipantsDeleted = participants.every((email) =>
    chat.deletedBy.includes(email),
  );

  if (allParticipantsDeleted) {
    await Message.deleteMany(
      buildDirectMessagePairQuery(
        normalizedCurrentUserEmail,
        normalizedRecipientEmail,
      ),
    );

    await DirectChat.deleteOne({ _id: chat._id });
  }

  return {
    deletedFor: normalizedCurrentUserEmail,
    recipientEmail: normalizedRecipientEmail,
    deletedForEveryone: allParticipantsDeleted,
  };
};

export const listDirectMessages = async ({
  currentUserEmail,
  recipientEmail,
}) => {
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail);
  const normalizedRecipientEmail = normalizeEmail(recipientEmail);

  const participants = normalizeDirectParticipants(
    normalizedCurrentUserEmail,
    normalizedRecipientEmail,
  );
  const participantsKey = participants.join("::");
  const chat = await DirectChat.findOne({ participantsKey });

  if (chat?.deletedBy?.includes(normalizedCurrentUserEmail)) {
    throw new Error("Chat not found");
  }

  const messages = await Message.find(
    buildDirectMessagePairQuery(
      normalizedCurrentUserEmail,
      normalizedRecipientEmail,
    ),
  ).sort({ timestamp: 1 });

  return messages.map(serializeMessage);
};

export const listGroupMessages = async ({ groupId, userId }) => {
  await ensureGroupAccess(groupId, userId);

  const messages = await Message.find({ groupId }).sort({ timestamp: 1 });
  return messages.map(serializeMessage);
};

export const saveDirectMessage = async ({
  senderId,
  senderEmail,
  recipientEmail,
  content,
}) => {
  const normalizedSenderEmail = normalizeEmail(senderEmail);
  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const trimmedContent = content?.trim();

  if (!normalizedRecipientEmail || !trimmedContent) {
    throw new Error("recipientEmail and content are required");
  }

  if (normalizedSenderEmail === normalizedRecipientEmail) {
    throw new Error("You cannot send a message to yourself");
  }

  await ensureRegisteredUser(normalizedRecipientEmail);

  const participants = normalizeDirectParticipants(
    normalizedSenderEmail,
    normalizedRecipientEmail,
  );
  const participantsKey = participants.join("::");

  await DirectChat.findOneAndUpdate(
    { participantsKey },
    {
      $set: {
        participants,
        participantsKey,
        lastMessage: trimmedContent,
        lastMessageAt: new Date(),
        deletedBy: [],
      },
    },
    {
      new: true,
      upsert: true,
    },
  );

  const message = await Message.create({
    sender: {
      _id: senderId,
      email: normalizedSenderEmail,
    },
    senderEmail: normalizedSenderEmail,
    recipientEmail: normalizedRecipientEmail,
    content: trimmedContent,
    message: trimmedContent,
    timestamp: new Date(),
  });

  return serializeMessage(message);
};

export const saveGroupMessage = async ({
  senderId,
  senderEmail,
  groupId,
  content,
}) => {
  const normalizedSenderEmail = normalizeEmail(senderEmail);
  const trimmedContent = content?.trim();

  if (!trimmedContent) {
    throw new Error("content is required");
  }

  await ensureGroupAccess(groupId, senderId);

  const message = await Message.create({
    sender: {
      _id: senderId,
      email: normalizedSenderEmail,
    },
    senderEmail: normalizedSenderEmail,
    groupId,
    content: trimmedContent,
    message: trimmedContent,
    timestamp: new Date(),
  });

  return serializeMessage(message);
};

export const saveAiGroupMessage = async ({ groupId, content }) => {
  const trimmedContent = content?.trim();

  if (!trimmedContent) {
    throw new Error("content is required");
  }

  if (!groupId) {
    throw new Error("groupId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new Error("Invalid groupId");
  }

  const message = await Message.create({
    sender: {
      _id: "ai",
      email: "AI",
    },
    senderEmail: "ai@system.local",
    groupId,
    content: trimmedContent,
    message: trimmedContent,
    timestamp: new Date(),
  });

  return serializeMessage(message);
};
