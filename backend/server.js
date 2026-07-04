import "dotenv/config";
import http from "http";
import app from "./app.js";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { generateResult } from "./services/ai.service.js";
import redisClient from "./services/redis.service.js";
import * as messageService from "./services/message.service.js";
import * as presenceService from "./services/presence.service.js";

// Validate required environment variables
const requiredEnvVars = ["JWT_SECRET", "MONGODB_URI"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    "❌ Missing required environment variables:",
    missingEnvVars.join(", "),
  );
  console.error("Please check your .env file");
  process.exit(1);
}

const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const getUserRoom = (email) =>
  `user:${messageService.normalizeEmail(email)}`;

const getGroupRoom = (groupId) => `group:${groupId}`;

const respond = (ack, payload) => {
  if (typeof ack === "function") {
    ack(payload);
  }
};

const invalidateDeletedUser = (socket, error) => {
  if (error?.code !== "USER_DELETED") {
    return false;
  }

  socket.emit("account-deleted", {
    message: "Your account was removed. Please register again.",
  });
  socket.disconnect(true);
  return true;
};

const broadcastPresence = async (email) => {
  const normalizedEmail = messageService.normalizeEmail(email);
  const snapshot = await presenceService.getPresenceSnapshot([normalizedEmail]);
  io.emit("user-presence", {
    email: normalizedEmail,
    ...snapshot[normalizedEmail],
  });
};

io.use(async (socket, next) => {
  try {
    const authHeader = socket.handshake.headers.authorization;
    const token =
      socket.handshake.auth?.token ||
      (authHeader ? authHeader.split(" ")[1] : null);

    if (!token) {
      return next(new Error("Authentication error"));
    }

    const isBlackListed = await redisClient.get(token);

    if (isBlackListed) {
      return next(new Error("Authentication error"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return next(new Error("Authentication error"));
    }

    const user = await presenceService.ensureUserExists(
      decoded._id,
      decoded.email,
    );

    socket.user = {
      _id: user._id.toString(),
      email: messageService.normalizeEmail(user.email),
    };

    next();
  } catch (error) {
    if (error.code === "USER_DELETED") {
      return next(new Error("Account deleted"));
    }

    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  const userEmail = socket.user.email;
  socket.join(getUserRoom(userEmail));
  presenceService.setUserOnline(userEmail, socket.id);
  broadcastPresence(userEmail);

  console.log(`User ${userEmail} connected`);

  socket.on("heartbeat", async (_, ack) => {
    try {
      await presenceService.ensureUserExists(socket.user._id, socket.user.email);
      respond(ack, { ok: true });
    } catch (error) {
      if (invalidateDeletedUser(socket, error)) {
        respond(ack, { ok: false, error: error.message, code: "USER_DELETED" });
        return;
      }

      respond(ack, { ok: false, error: error.message });
    }
  });

  socket.on("get-presence", async ({ emails } = {}, ack) => {
    try {
      const presence = await presenceService.getPresenceSnapshot(emails || []);
      respond(ack, { ok: true, data: { presence } });
    } catch (error) {
      respond(ack, { ok: false, error: error.message });
    }
  });

  socket.on("join-group", async ({ groupId } = {}, ack) => {
    try {
      await presenceService.ensureUserExists(
        socket.user._id,
        socket.user.email,
      );
      await messageService.ensureGroupAccess(groupId, socket.user._id);
      socket.join(getGroupRoom(groupId));

      respond(ack, {
        ok: true,
        data: { groupId },
      });
    } catch (error) {
      if (invalidateDeletedUser(socket, error)) {
        respond(ack, { ok: false, error: error.message, code: "USER_DELETED" });
        return;
      }

      console.log("Error joining group:", error.message);
      respond(ack, {
        ok: false,
        error: error.message,
      });
    }
  });

  socket.on("leave-group", ({ groupId } = {}) => {
    if (!groupId) {
      return;
    }

    socket.leave(getGroupRoom(groupId));
  });

  socket.on("typing-start", ({ context, contextId } = {}) => {
    if (!context || !contextId) {
      return;
    }

    presenceService.setTyping(context, contextId, userEmail, true);

    const payload = {
      context,
      contextId,
      email: userEmail,
      isTyping: true,
    };

    if (context === "group") {
      socket.to(getGroupRoom(contextId)).emit("typing-update", payload);
      return;
    }

    if (context === "direct") {
      io.to(getUserRoom(contextId)).emit("typing-update", payload);
    }
  });

  socket.on("typing-stop", ({ context, contextId } = {}) => {
    if (!context || !contextId) {
      return;
    }

    presenceService.setTyping(context, contextId, userEmail, false);

    const payload = {
      context,
      contextId,
      email: userEmail,
      isTyping: false,
    };

    if (context === "group") {
      socket.to(getGroupRoom(contextId)).emit("typing-update", payload);
      return;
    }

    if (context === "direct") {
      io.to(getUserRoom(contextId)).emit("typing-update", payload);
    }
  });

  socket.on("send-group-message", async ({ groupId, content } = {}, ack) => {
    try {
      await presenceService.ensureUserExists(
        socket.user._id,
        socket.user.email,
      );

      const savedMessage = await messageService.saveGroupMessage({
        senderId: socket.user._id,
        senderEmail: socket.user.email,
        groupId,
        content,
      });

      io.to(getGroupRoom(groupId))
        .to(getUserRoom(socket.user.email))
        .emit("group-message", savedMessage);

      respond(ack, {
        ok: true,
        data: { message: savedMessage },
      });

      if (savedMessage.content.includes("@ai")) {
        const prompt = savedMessage.content.replace(/@ai/gi, "").trim();

        if (!prompt) {
          return;
        }

        io.to(getGroupRoom(groupId)).emit("ai-thinking", { groupId });

        try {
          const result = await generateResult(prompt);
          const aiMessage = await messageService.saveAiGroupMessage({
            groupId,
            content: result,
          });

          io.to(getGroupRoom(groupId)).emit("group-message", aiMessage);
        } catch (aiError) {
          console.log("Error generating AI response:", aiError.message);
          const fallbackMessage = await messageService.saveAiGroupMessage({
            groupId,
            content: JSON.stringify({
              text: "Sorry, I could not generate a response right now. Please try again.",
            }),
          });
          io.to(getGroupRoom(groupId)).emit("group-message", fallbackMessage);
        } finally {
          io.to(getGroupRoom(groupId)).emit("ai-done", { groupId });
        }
      }
    } catch (error) {
      if (invalidateDeletedUser(socket, error)) {
        respond(ack, { ok: false, error: error.message, code: "USER_DELETED" });
        return;
      }

      console.log("Error sending group message:", error.message);
      respond(ack, {
        ok: false,
        error: error.message,
      });
    }
  });

  socket.on(
    "send-direct-message",
    async ({ recipientEmail, content } = {}, ack) => {
      try {
        await presenceService.ensureUserExists(
          socket.user._id,
          socket.user.email,
        );

        const savedMessage = await messageService.saveDirectMessage({
          senderId: socket.user._id,
          senderEmail: socket.user.email,
          recipientEmail,
          content,
        });

        io.to(getUserRoom(socket.user.email))
          .to(getUserRoom(savedMessage.recipientEmail))
          .emit("direct-message", savedMessage);

        respond(ack, {
          ok: true,
          data: { message: savedMessage },
        });
      } catch (error) {
        if (invalidateDeletedUser(socket, error)) {
          respond(ack, {
            ok: false,
            error: error.message,
            code: "USER_DELETED",
          });
          return;
        }

        console.log("Error sending direct message:", error.message);
        respond(ack, {
          ok: false,
          error: error.message,
        });
      }
    },
  );

  socket.on("disconnect", async () => {
    const lastSeen = await presenceService.setUserOffline(userEmail, socket.id);
    io.emit("user-presence", {
      email: userEmail,
      online: false,
      lastSeenAt: lastSeen,
    });
    console.log(`User ${userEmail} disconnected`);
  });
});

// Error handling for server
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `❌ Port ${port} is already in use. Trying alternate port...`,
    );
    const newPort = port + 1;
    server.listen(newPort, () => {
      console.log(`✅ Server is running on port ${newPort} (fallback)`);
    });
  } else {
    console.error("❌ Server Error:", err);
  }
});

// Start server with proper error handling
server
  .listen(port, () => {
    console.log(`✅ Server is running on port ${port}`);
  })
  .on("error", (err) => {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("📦 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("📦 SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
