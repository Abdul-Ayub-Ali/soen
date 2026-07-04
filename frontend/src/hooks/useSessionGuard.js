import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../config/axios";
import { invalidateSession, isUserDeletedError } from "../utils/session";

export const useSessionGuard = (user, setUser) => {
  const navigate = useNavigate();
  const setUserRef = useRef(setUser);

  useEffect(() => {
    setUserRef.current = setUser;
  }, [setUser]);

  useEffect(() => {
    if (!user?.email) {
      return undefined;
    }

    const verifySession = () => {
      axios
        .get("/users/profile")
        .then((response) => {
          setUserRef.current?.(response.data.user);
        })
        .catch((error) => {
          if (isUserDeletedError(error)) {
            invalidateSession({
              message: "Your account was removed. Please register again.",
              setUser: setUserRef.current,
              navigate,
            });
          }
        });
    };

    verifySession();
    const intervalId = window.setInterval(verifySession, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user?.email, navigate]);
};

export const formatLastSeen = (lastSeenAt) => {
  if (!lastSeenAt) {
    return "Offline";
  }

  const lastSeenDate = new Date(lastSeenAt);
  const diffMs = Date.now() - lastSeenDate.getTime();

  if (diffMs < 60_000) {
    return "Last seen just now";
  }

  if (diffMs < 3_600_000) {
    const minutes = Math.max(1, Math.floor(diffMs / 60_000));
    return `Last seen ${minutes}m ago`;
  }

  if (diffMs < 86_400_000) {
    const hours = Math.max(1, Math.floor(diffMs / 3_600_000));
    return `Last seen ${hours}h ago`;
  }

  return `Last seen ${lastSeenDate.toLocaleDateString()}`;
};
