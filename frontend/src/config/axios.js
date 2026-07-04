import axios from "axios";
import { getErrorMessage, showError } from "../utils/toast";
import {
  invalidateSession,
  isSessionInvalidated,
  isUserDeletedError,
} from "../utils/session";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isSessionInvalidated()) {
      return Promise.reject(error);
    }

    if (isUserDeletedError(error)) {
      invalidateSession({
        message: getErrorMessage(error),
        showToast: true,
      });
      return Promise.reject(error);
    }

    const status = error?.response?.status;
    const requestUrl = error?.config?.url || "";

    if (status === 401 && !requestUrl.includes("/users/login")) {
      invalidateSession({
        message: "Session expired. Please log in again.",
        showToast: true,
        navigate: null,
      });
      window.location.assign("/login");
      return Promise.reject(error);
    }

    if (status === 404 && !requestUrl.includes("/users/profile")) {
      showError(getErrorMessage(error, "Resource not found (404)"));
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
