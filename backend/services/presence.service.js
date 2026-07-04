import userModel from "../models/user.model.js";

const normalizeEmail = (email = "") => email.trim().toLowerCase();

const onlineUsers = new Map();
const typingState = new Map();

export const ensureUserExists = async (userId, email) => {
  const user = await userModel.findOne({
    _id: userId,
    email: normalizeEmail(email),
  });

  if (!user) {
    const error = new Error("Account no longer exists");
    error.code = "USER_DELETED";
    throw error;
  }

  return user;
};

export const setUserOnline = (email, socketId) => {
  const normalizedEmail = normalizeEmail(email);
  const current = onlineUsers.get(normalizedEmail) || {
    socketIds: new Set(),
    lastSeen: new Date(),
  };

  current.socketIds.add(socketId);
  current.lastSeen = new Date();
  onlineUsers.set(normalizedEmail, current);
};

export const setUserOffline = async (email, socketId) => {
  const normalizedEmail = normalizeEmail(email);
  const current = onlineUsers.get(normalizedEmail);

  if (!current) {
    return new Date();
  }

  current.socketIds.delete(socketId);

  if (current.socketIds.size === 0) {
    onlineUsers.delete(normalizedEmail);
    const lastSeen = new Date();
    await userModel.updateOne(
      { email: normalizedEmail },
      { $set: { lastSeenAt: lastSeen } },
    );
    return lastSeen;
  }

  current.lastSeen = new Date();
  return current.lastSeen;
};

export const isUserOnline = (email) => {
  const normalizedEmail = normalizeEmail(email);
  const current = onlineUsers.get(normalizedEmail);
  return Boolean(current?.socketIds?.size);
};

export const getOnlineUsers = () =>
  Array.from(onlineUsers.keys()).map((email) => normalizeEmail(email));

export const getPresenceSnapshot = async (emails = []) => {
  const normalizedEmails = emails.map(normalizeEmail).filter(Boolean);

  if (!normalizedEmails.length) {
    return {};
  }

  const users = await userModel
    .find({ email: { $in: normalizedEmails } })
    .select("email lastSeenAt");

  const snapshot = {};

  normalizedEmails.forEach((email) => {
    const user = users.find((entry) => entry.email === email);
    snapshot[email] = {
      online: isUserOnline(email),
      lastSeenAt: user?.lastSeenAt || null,
    };
  });

  return snapshot;
};

const getTypingKey = (context, contextId, email) =>
  `${context}:${contextId}:${normalizeEmail(email)}`;

export const setTyping = (context, contextId, email, isTyping) => {
  const key = getTypingKey(context, contextId, email);

  if (!isTyping) {
    typingState.delete(key);
    return;
  }

  if (typingState.has(key)) {
    clearTimeout(typingState.get(key).timeout);
  }

  const timeout = setTimeout(() => {
    typingState.delete(key);
  }, 4000);

  typingState.set(key, { email: normalizeEmail(email), timeout });
};

export const getTypingUsers = (context, contextId, excludeEmail) => {
  const prefix = `${context}:${contextId}:`;
  const excluded = normalizeEmail(excludeEmail);

  return Array.from(typingState.entries())
    .filter(([key, value]) => key.startsWith(prefix) && value.email !== excluded)
    .map(([, value]) => value.email);
};
