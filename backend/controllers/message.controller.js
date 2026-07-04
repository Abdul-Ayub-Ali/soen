import * as messageService from "../services/message.service.js";

export const getMessagesByGroupId = async (req, res) => {
  try {
    const { groupId } = req.params;
    const messages = await messageService.listGroupMessages({
      groupId,
      userId: req.user._id,
    });

    res.status(200).json({ messages });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const getDirectChats = async (req, res) => {
  try {
    const chats = await messageService.listDirectChats(req.user.email);
    res.status(200).json({ chats });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const startDirectChat = async (req, res) => {
  try {
    const { recipientEmail } = req.body;
    const chat = await messageService.startDirectChat({
      currentUserEmail: req.user.email,
      recipientEmail,
    });

    res.status(201).json({ chat });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

export const deleteDirectChat = async (req, res) => {
  try {
    const recipientEmail = decodeURIComponent(req.params.recipientEmail || "");
    const result = await messageService.deleteDirectChat({
      currentUserEmail: req.user.email,
      recipientEmail,
    });

    res.status(200).json({
      message: "Chat deleted successfully",
      ...result,
    });
  } catch (err) {
    console.log(err);
    const statusCode = err.message === "Chat not found" ? 404 : 400;
    res.status(statusCode).json({ error: err.message });
  }
};

export const getDirectMessages = async (req, res) => {
  try {
    const recipientEmail = decodeURIComponent(req.params.recipientEmail || "");
    const messages = await messageService.listDirectMessages({
      currentUserEmail: req.user.email,
      recipientEmail,
    });

    res.status(200).json({ messages });
  } catch (err) {
    console.log(err);
    const statusCode = err.message === "Chat not found" ? 404 : 400;
    res.status(statusCode).json({ error: err.message });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { groupId, content } = req.body;
    const message = await messageService.saveGroupMessage({
      senderId: req.user._id,
      senderEmail: req.user.email,
      groupId,
      content,
    });

    res.status(201).json({ message });
  } catch (err) {
    console.log("Error sending group message:", err);
    res.status(400).json({ error: err.message });
  }
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { recipientEmail, content } = req.body;
    const message = await messageService.saveDirectMessage({
      senderId: req.user._id,
      senderEmail: req.user.email,
      recipientEmail,
      content,
    });

    res.status(201).json({ message });
  } catch (err) {
    console.log("Error sending direct message:", err);
    res.status(400).json({ error: err.message });
  }
};
