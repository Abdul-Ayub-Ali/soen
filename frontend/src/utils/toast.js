import toast from "react-hot-toast";

export const showSuccess = (message) => toast.success(message);

export const showError = (message) => toast.error(message);

export const showInfo = (message) => toast(message);

export const showLoading = (message) => toast.loading(message);

export const dismissToast = (toastId) => toast.dismiss(toastId);

export const getErrorMessage = (error, fallback = "Something went wrong") => {
  const responseData = error?.response?.data;

  if (responseData?.code === "USER_DELETED") {
    return "Your account was removed. Please register again.";
  }

  if (typeof responseData === "string" && responseData.trim()) {
    return responseData;
  }

  if (typeof responseData?.error === "string") {
    return responseData.error;
  }

  if (typeof responseData?.errors === "string") {
    return responseData.errors;
  }

  if (Array.isArray(responseData?.errors) && responseData.errors[0]?.msg) {
    return responseData.errors[0].msg;
  }

  if (error?.message) {
    return error.message;
  }

  if (error?.response?.status === 404) {
    return "Resource not found (404)";
  }

  return fallback;
};
