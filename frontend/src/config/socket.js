import { io } from "socket.io-client";
import { invalidateSession } from "../utils/session";

let socketInstance = null;
let heartbeatTimer = null;

const getApiUrl = () => import.meta.env.VITE_API_URL || "http://localhost:3000";

const getAuthToken = () => localStorage.getItem("token");

const startHeartbeat = (socket) => {
  stopHeartbeat();

  heartbeatTimer = window.setInterval(() => {
    if (!socket.connected) {
      return;
    }

    socket.emit("heartbeat", {}, (response) => {
      if (response?.code === "USER_DELETED") {
        invalidateSession({
          message: "Your account was removed. Please register again.",
        });
      }
    });
  }, 15000);
};

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};

export const connectSocket = () => {
  const token = getAuthToken();

  if (!token) {
    return null;
  }

  if (socketInstance && socketInstance.auth?.token !== token) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  if (socketInstance) {
    socketInstance.auth = { token };

    if (!socketInstance.connected) {
      socketInstance.connect();
    }

    return socketInstance;
  }

  socketInstance = io(getApiUrl(), {
    auth: { token },
    autoConnect: true,
  });

  socketInstance.on("connect_error", (error) => {
    if (String(error.message).includes("Account deleted")) {
      invalidateSession({
        message: "Your account was removed. Please register again.",
      });
    }
  });

  socketInstance.on("account-deleted", (payload) => {
    invalidateSession({
      message: payload?.message || "Your account was removed. Please register again.",
    });
  });

  startHeartbeat(socketInstance);

  return socketInstance;
};

export const getSocket = () => socketInstance || connectSocket();

export const disconnectSocket = () => {
  stopHeartbeat();

  if (!socketInstance) {
    return;
  }

  socketInstance.disconnect();
  socketInstance = null;
};

export const subscribeToSocketEvent = (eventName, handler) => {
  const socket = getSocket();

  if (!socket) {
    return () => {};
  }

  socket.on(eventName, handler);

  return () => {
    socket.off(eventName, handler);
  };
};

export const emitWithAck = (eventName, payload) =>
  new Promise((resolve, reject) => {
    const socket = getSocket();

    if (!socket) {
      reject(new Error("Socket connection is not available"));
      return;
    }

    socket.emit(eventName, payload, (response) => {
      if (response?.code === "USER_DELETED") {
        invalidateSession({
          message: "Your account was removed. Please register again.",
        });
        reject(new Error(response.error || "Account deleted"));
        return;
      }

      if (response?.ok) {
        resolve(response.data);
        return;
      }

      reject(new Error(response?.error || "Request failed"));
    });
  });

export const joinGroupRoom = (groupId) =>
  emitWithAck("join-group", { groupId });

export const leaveGroupRoom = (groupId) => {
  const socket = getSocket();

  if (!socket || !groupId) {
    return;
  }

  socket.emit("leave-group", { groupId });
};

export const emitTypingStart = ({ context, contextId }) => {
  const socket = getSocket();

  if (!socket || !context || !contextId) {
    return;
  }

  socket.emit("typing-start", { context, contextId });
};

export const emitTypingStop = ({ context, contextId }) => {
  const socket = getSocket();

  if (!socket || !context || !contextId) {
    return;
  }

  socket.emit("typing-stop", { context, contextId });
};

export const fetchPresence = (emails = []) =>
  emitWithAck("get-presence", { emails });
