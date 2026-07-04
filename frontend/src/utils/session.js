import { disconnectSocket } from "../config/socket";

let sessionInvalidated = false;

export const isSessionInvalidated = () => sessionInvalidated;

export const clearSessionStorage = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  disconnectSocket();
};

export const invalidateSession = ({
  message = "Your account was removed. Please register again.",
  setUser,
  navigate,
  showToast = true,
}) => {
  if (sessionInvalidated) {
    return;
  }

  sessionInvalidated = true;
  clearSessionStorage();

  if (setUser) {
    setUser(null);
  }

  if (showToast && message) {
    import("./toast.js").then(({ showError }) => {
      showError(message);
    });
  }

  if (navigate) {
    navigate("/register", { replace: true });
    return;
  }

  window.location.assign("/register");
};

export const resetSessionInvalidation = () => {
  sessionInvalidated = false;
};

export const isUserDeletedError = (error) =>
  error?.response?.data?.code === "USER_DELETED" ||
  error?.response?.status === 404 &&
    String(error?.response?.data?.error || "").includes("Account no longer exists");
