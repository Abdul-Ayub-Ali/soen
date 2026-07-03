import { io } from "socket.io-client";

let socketInstance = null;

const getApiUrl = () => import.meta.env.VITE_API_URL || "http://localhost:3000";

const getAuthToken = () => localStorage.getItem("token");

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

  return socketInstance;
};

export const getSocket = () => socketInstance || connectSocket();

export const disconnectSocket = () => {
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
