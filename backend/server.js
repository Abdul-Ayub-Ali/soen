import "dotenv/config";
import http from "http";
import app from "./app.js";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { generateResult } from "./services/ai.service.js";
import redisClient from "./services/redis.service.js";
import * as messageService from "./services/message.service.js";

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

    socket.user = {
      _id: decoded._id,
      email: messageService.normalizeEmail(decoded.email),
    };

    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  const userEmail = socket.user.email;
  socket.join(getUserRoom(userEmail));

  console.log(`User ${userEmail} connected`);

  socket.on("join-group", async ({ groupId } = {}, ack) => {
    try {
      await messageService.ensureGroupAccess(groupId, socket.user._id);
      socket.join(getGroupRoom(groupId));

      respond(ack, {
        ok: true,
        data: { groupId },
      });
    } catch (error) {
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

  socket.on("send-group-message", async ({ groupId, content } = {}, ack) => {
    try {
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

        const result = await generateResult(prompt);
        const aiMessage = await messageService.saveAiGroupMessage({
          groupId,
          content: result,
        });

        io.to(getGroupRoom(groupId)).emit("group-message", aiMessage);
      }
    } catch (error) {
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
        console.log("Error sending direct message:", error.message);
        respond(ack, {
          ok: false,
          error: error.message,
        });
      }
    },
  );

  socket.on("disconnect", () => {
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
