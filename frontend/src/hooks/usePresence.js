import { useEffect, useRef, useState } from "react";
import {
  connectSocket,
  emitTypingStart,
  emitTypingStop,
  fetchPresence,
  subscribeToSocketEvent,
} from "../config/socket";

export const usePresence = (emails = []) => {
  const [presence, setPresence] = useState({});
  const emailsKey = emails.filter(Boolean).sort().join(",");

  useEffect(() => {
    if (!emailsKey) {
      return undefined;
    }

    const emailList = emailsKey.split(",");

    const loadPresence = () => {
      fetchPresence(emailList)
        .then((data) => {
          setPresence(data.presence || {});
        })
        .catch(() => {});
    };

    loadPresence();

    const socket = connectSocket();
    const handleConnect = () => loadPresence();
    socket?.on("connect", handleConnect);

    const unsubscribe = subscribeToSocketEvent("user-presence", (update) => {
      if (!update?.email || !emailList.includes(update.email)) {
        return;
      }

      setPresence((current) => ({
        ...current,
        [update.email]: {
          online: update.online,
          lastSeenAt: update.lastSeenAt,
        },
      }));
    });

    return () => {
      socket?.off("connect", handleConnect);
      unsubscribe();
    };
  }, [emailsKey]);

  return presence;
};

export const useTypingIndicator = ({ context, contextId, currentUserEmail }) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef({});

  useEffect(() => {
    if (!context || !contextId) {
      return undefined;
    }

    const unsubscribe = subscribeToSocketEvent("typing-update", (update) => {
      if (update.context !== context) {
        return;
      }

      if (context === "direct") {
        if (update.contextId !== currentUserEmail) {
          return;
        }

        if (contextId && update.email !== contextId) {
          return;
        }
      } else if (update.contextId !== contextId) {
        return;
      }

      if (update.email === currentUserEmail) {
        return;
      }

      setTypingUsers((current) => {
        if (update.isTyping) {
          return current.includes(update.email)
            ? current
            : [...current, update.email];
        }

        return current.filter((email) => email !== update.email);
      });

      if (typingTimeoutRef.current[update.email]) {
        clearTimeout(typingTimeoutRef.current[update.email]);
      }

      if (update.isTyping) {
        typingTimeoutRef.current[update.email] = setTimeout(() => {
          setTypingUsers((current) =>
            current.filter((email) => email !== update.email),
          );
        }, 4000);
      }
    });

    return () => {
      unsubscribe();
      Object.values(typingTimeoutRef.current).forEach(clearTimeout);
      typingTimeoutRef.current = {};
    };
  }, [context, contextId, currentUserEmail]);

  const notifyTyping = (isTyping) => {
    if (!context || !contextId) {
      return;
    }

    if (isTyping) {
      emitTypingStart({ context, contextId });
      return;
    }

    emitTypingStop({ context, contextId });
  };

  return { typingUsers, notifyTyping };
};
