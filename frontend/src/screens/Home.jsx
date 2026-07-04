import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../context/user.context";
import axios from "../config/axios";
import {
  connectSocket,
  disconnectSocket,
  emitWithAck,
  joinGroupRoom,
  leaveGroupRoom,
  subscribeToSocketEvent,
} from "../config/socket";
import { getErrorMessage, showError, showSuccess } from "../utils/toast";
import { formatLastSeen } from "../hooks/useSessionGuard";
import { usePresence, useTypingIndicator } from "../hooks/usePresence";

const appendUniqueMessage = (messages, incomingMessage) => {
  if (
    incomingMessage?._id &&
    messages.some((message) => message._id === incomingMessage._id)
  ) {
    return messages;
  }

  return [...messages, incomingMessage];
};

const getSenderEmail = (message) =>
  message?.sender?.email ||
  message?.senderEmail ||
  (typeof message?.sender === "string" ? message.sender : "");

const getMessageText = (message) => {
  const rawText = message?.content || message?.message || "";

  if (message?.sender?._id === "ai") {
    try {
      const parsedMessage = JSON.parse(rawText);
      return parsedMessage.text || rawText;
    } catch (error) {
      return rawText;
    }
  }

  return rawText;
};

const isAiRelatedMessage = (message) => {
  const isAi = message?.sender?._id === "ai";
  const text = message?.content || message?.message || "";
  return isAi || /@ai/i.test(text);
};

const upsertDirectChat = (currentChats, currentUserEmail, message) => {
  const senderEmail = getSenderEmail(message);
  const recipientEmail =
    senderEmail === currentUserEmail ? message.recipientEmail : senderEmail;

  if (!recipientEmail) {
    return currentChats;
  }

  const updatedChat = {
    type: "direct",
    recipientEmail,
    recipientName: recipientEmail,
    lastMessage: getMessageText(message),
    lastMessageAt: message.timestamp,
  };

  return [
    updatedChat,
    ...currentChats.filter((chat) => chat.recipientEmail !== recipientEmail),
  ];
};

const getDirectChatPath = (recipientEmail) =>
  `/messages/direct/${encodeURIComponent(recipientEmail.trim().toLowerCase())}`;

const Home = () => {
  const { user, setUser } = useContext(UserContext);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [groups, setGroups] = useState([]);
  const [directChats, setDirectChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [groupName, setGroupName] = useState("");
  const [joinGroupId, setJoinGroupId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [deletingChatEmail, setDeletingChatEmail] = useState(null);
  const [deletingGroupId, setDeletingGroupId] = useState(null);
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameGroupName, setRenameGroupName] = useState("");
  const [groupPreviews, setGroupPreviews] = useState({});
  const [aiThinkingGroupId, setAiThinkingGroupId] = useState(null);
  const messagesEndRef = useRef(null);
  const selectedChatRef = useRef(null);
  const typingStopTimerRef = useRef(null);

  const navigate = useNavigate();

  const presenceEmails = directChats.map((chat) => chat.recipientEmail);

  const presence = usePresence(presenceEmails);

  const typingContext =
    selectedChat?.type === "group"
      ? { context: "group", contextId: selectedChat._id }
      : selectedChat?.type === "direct"
        ? { context: "direct", contextId: selectedChat.recipientEmail }
        : { context: null, contextId: null };

  const { typingUsers, notifyTyping } = useTypingIndicator({
    context: typingContext.context,
    contextId: typingContext.contextId,
    currentUserEmail: user?.email,
  });

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadGroups = () => {
    axios
      .get("/groups/all")
      .then((res) => {
        const loadedGroups = res.data.groups || [];
        setGroups(loadedGroups);
        loadGroupPreviews(loadedGroups);
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to load groups."));
      });
  };

  const loadGroupPreviews = (groupsList) => {
    groupsList.forEach((group) => {
      axios
        .get(`/messages/group/${group._id}`)
        .then((res) => {
          const aiMsgs = (res.data.messages || []).filter(isAiRelatedMessage);
          if (aiMsgs.length) {
            const lastMsg = aiMsgs[aiMsgs.length - 1];
            setGroupPreviews((prev) => ({
              ...prev,
              [group._id]: getMessageText(lastMsg),
            }));
          }
        })
        .catch(() => {});
    });
  };

  const isGroupOwner = (group) =>
    group?.owner?._id?.toString() === user?._id?.toString() ||
    group?.owner?.toString() === user?._id?.toString();

  const loadDirectChats = () => {
    axios
      .get("/messages/direct-chats")
      .then((res) => {
        const chats = (res.data.chats || []).map((chat) => ({
          ...chat,
          type: "direct",
          recipientName: chat.recipientEmail,
        }));

        setDirectChats(chats);
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to load chats."));
      });
    axios
      .get(`/messages/group/${groupId}`)
      .then((res) => {
        setMessages(res.data.messages || []);
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to load messages."));
      });
  };

  const loadDirectMessages = (chatRecipientEmail) => {
    axios
      .get(getDirectChatPath(chatRecipientEmail))
      .then((res) => {
        setMessages(res.data.messages || []);
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to load messages."));
      });
  };

  useEffect(() => {
    if (!user?.email) {
      return undefined;
    }

    connectSocket();
    loadGroups();
    loadDirectChats();

    const unsubscribeDirectMessages = subscribeToSocketEvent(
      "direct-message",
      (incomingMessage) => {
        setDirectChats((currentChats) =>
          upsertDirectChat(currentChats, user.email, incomingMessage),
        );

        if (
          selectedChatRef.current?.type === "direct" &&
          [
            getSenderEmail(incomingMessage),
            incomingMessage.recipientEmail,
          ].includes(selectedChatRef.current.recipientEmail)
        ) {
          setMessages((currentMessages) =>
            appendUniqueMessage(currentMessages, incomingMessage),
          );
        }
      },
    );

    const unsubscribeGroupMessages = subscribeToSocketEvent(
      "group-message",
      (incomingMessage) => {
        if (isAiRelatedMessage(incomingMessage)) {
          setGroupPreviews((prev) => ({
            ...prev,
            [incomingMessage.groupId]: getMessageText(incomingMessage),
          }));
          setAiThinkingGroupId((current) =>
            current === incomingMessage.groupId ? null : current,
          );
        }

        if (
          selectedChatRef.current?.type === "group" &&
          selectedChatRef.current._id === incomingMessage.groupId
        ) {
          setMessages((currentMessages) =>
            appendUniqueMessage(currentMessages, incomingMessage),
          );
        }
      },
    );

    const unsubscribeAiThinking = subscribeToSocketEvent(
      "ai-thinking",
      ({ groupId }) => {
        setAiThinkingGroupId(groupId);
      },
    );

    const unsubscribeAiDone = subscribeToSocketEvent("ai-done", ({ groupId }) => {
      setAiThinkingGroupId((current) => (current === groupId ? null : current));
    });

    return () => {
      unsubscribeDirectMessages();
      unsubscribeGroupMessages();
      unsubscribeAiThinking();
      unsubscribeAiDone();
    };
  }, [user?.email]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return undefined;
    }

    if (selectedChat.type === "group") {
      joinGroupRoom(selectedChat._id).catch((err) => {
        showError(getErrorMessage(err, "Failed to join group room."));
      });
      loadGroupMessages(selectedChat._id);

      return () => {
        leaveGroupRoom(selectedChat._id);
      };
    }

    loadDirectMessages(selectedChat.recipientEmail);

    return undefined;
  }, [selectedChat]);

  const createGroup = (e) => {
    e.preventDefault();
    const trimmedName = groupName.trim();

    if (!trimmedName) {
      showError("Group name cannot be empty.");
      return;
    }

    axios
      .post("/groups/create", { groupName: trimmedName })
      .then(() => {
        setIsModalOpen(false);
        setGroupName("");
        loadGroups();
        showSuccess("Group created successfully");
      })
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to create group."));
      });
  };

  const joinGroup = (e) => {
    e.preventDefault();
    const trimmedId = joinGroupId.trim();

    if (!trimmedId) {
      showError("Group ID cannot be empty.");
      return;
    }

    axios
      .post("/groups/join", { groupId: trimmedId })
      .then(() => {
        setIsModalOpen(false);
        setJoinGroupId("");
        loadGroups();
        showSuccess("Joined group successfully");
      })
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to join group."));
      });
  };

  const startDirectChat = (e) => {
    e.preventDefault();
    const trimmedEmail = recipientEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      showError("Email cannot be empty.");
      return;
    }

    if (trimmedEmail === user?.email) {
      showError("You cannot chat with yourself.");
      return;
    }

    axios
      .post("/messages/direct/start", { recipientEmail: trimmedEmail })
      .then((res) => {
        const chat = {
          ...res.data.chat,
          type: "direct",
          recipientName: res.data.chat.recipientEmail,
        };

        setDirectChats((currentChats) => [
          chat,
          ...currentChats.filter(
            (currentChat) => currentChat.recipientEmail !== chat.recipientEmail,
          ),
        ]);
        setSelectedChat(chat);
        setIsModalOpen(false);
        setRecipientEmail("");
        showSuccess("Direct chat started");
      })
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to start chat."));
      });
  };

  const deleteDirectChat = (chatRecipientEmail) => {
    const normalizedEmail = chatRecipientEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      return;
    }

    if (!window.confirm("Delete this direct chat from your list?")) {
      return;
    }

    setDeletingChatEmail(normalizedEmail);

    axios
      .delete(getDirectChatPath(normalizedEmail))
      .then(() => {
        setDirectChats((currentChats) =>
          currentChats.filter(
            (chat) => chat.recipientEmail !== normalizedEmail,
          ),
        );

        if (selectedChat?.recipientEmail === normalizedEmail) {
          setSelectedChat(null);
          setMessages([]);
        }

        showSuccess("Chat deleted");
      })
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to delete chat."));
      })
      .finally(() => {
        setDeletingChatEmail(null);
      });
  };

  const deleteGroup = (groupId) => {
    if (!window.confirm("Delete this room? This action cannot be undone.")) {
      return;
    }

    setDeletingGroupId(groupId);

    axios
      .delete(`/groups/delete/${groupId}`)
      .then(() => {
        setGroups((currentGroups) =>
          currentGroups.filter((group) => group._id !== groupId),
        );
        setGroupPreviews((prev) => {
          const next = { ...prev };
          delete next[groupId];
          return next;
        });

        if (selectedChat?._id === groupId) {
          setSelectedChat(null);
          setMessages([]);
        }

        showSuccess("Room deleted successfully");
      })
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to delete room."));
      })
      .finally(() => {
        setDeletingGroupId(null);
      });
  };

  const openRenameGroup = (group, event) => {
    event.stopPropagation();
    setRenamingGroup(group);
    setRenameGroupName(group.groupName);
  };

  const updateGroupName = (e) => {
    e.preventDefault();
    const trimmedName = renameGroupName.trim();

    if (!trimmedName || !renamingGroup) {
      return;
    }

    axios
      .put("/groups/update-name", {
        groupId: renamingGroup._id,
        groupName: trimmedName,
      })
      .then((res) => {
        const updatedGroup = res.data.group;
        setGroups((currentGroups) =>
          currentGroups.map((group) =>
            group._id === updatedGroup._id ? updatedGroup : group,
          ),
        );

        if (selectedChat?._id === updatedGroup._id) {
          setSelectedChat({ ...updatedGroup, type: "group" });
        }

        setRenamingGroup(null);
        setRenameGroupName("");
        showSuccess("Room renamed successfully");
      })
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to rename room."));
      });
  };

  const sendChatMessage = (e) => {
    e.preventDefault();

    const trimmedMessage = messageInput.trim();

    if (!trimmedMessage || !selectedChat) {
      return;
    }

    const sendPromise =
      selectedChat.type === "group"
        ? emitWithAck("send-group-message", {
            groupId: selectedChat._id,
            content: /@ai/i.test(trimmedMessage)
              ? trimmedMessage
              : `@ai ${trimmedMessage}`,
          })
        : emitWithAck("send-direct-message", {
            recipientEmail: selectedChat.recipientEmail,
            content: trimmedMessage,
          });

    sendPromise
      .then(() => {
        setMessageInput("");
        notifyTyping(false);
      })
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to send message."));
      });
  };

  const handleMessageInputChange = (value) => {
    setMessageInput(value);

    if (!selectedChat || !value.trim()) {
      notifyTyping(false);
      return;
    }

    notifyTyping(true);

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = setTimeout(() => {
      notifyTyping(false);
    }, 1200);
  };

  const logout = () => {
    axios
      .get("/users/logout")
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        disconnectSocket();
        setUser(null);
        showSuccess("Logged out successfully");
        navigate("/login");
      });
  };

  const getChatStatusText = () => {
    if (!selectedChat) {
      return "";
    }

    if (selectedChat.type === "group") {
      if (aiThinkingGroupId === selectedChat._id) {
        return "@ai is thinking...";
      }

      if (typingUsers.length) {
        return `${typingUsers.join(", ")} ${typingUsers.length === 1 ? "is" : "are"} typing...`;
      }

      return `${selectedChat.members?.length || 0} members`;
    }

    const recipientPresence = presence[selectedChat.recipientEmail];

    if (typingUsers.includes(selectedChat.recipientEmail)) {
      return "typing...";
    }

    if (recipientPresence?.online) {
      return "Online";
    }

    return formatLastSeen(recipientPresence?.lastSeenAt);
  };

  const displayedMessages =
    selectedChat?.type === "group"
      ? messages.filter(isAiRelatedMessage)
      : messages;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div
        className={`fixed left-0 top-0 z-40 h-full overflow-hidden border-r border-white/10 bg-slate-900 shadow-2xl transition-all duration-300 md:static ${
          sidebarOpen ? "w-80" : "w-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="flex items-center gap-2 text-xl font-bold text-white">
                <i className="ri-chat-4-line text-cyan-400"></i> SEON
              </h1>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded p-2 text-white hover:bg-white/10 md:hidden"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
          </div>

          <div className="border-b border-white/10 p-4">
            <div className="rounded-lg border border-white/10 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-blue-500">
                  <i className="ri-user-line text-white"></i>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {user?.name || "User"}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {user?.email}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  to="/profile"
                  className="flex-1 rounded bg-white/10 px-3 py-2 text-center text-xs text-white transition hover:bg-white/20"
                >
                  <i className="ri-user-settings-line mr-1"></i> Profile
                </Link>
                <button
                  onClick={logout}
                  className="flex-1 rounded bg-red-500/20 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/30"
                >
                  <i className="ri-logout-box-line mr-1"></i> Logout
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Groups
              </h2>
              <button
                onClick={() => {
                  setModalMode("create");
                  setIsModalOpen(true);
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                <i className="ri-add-line"></i>
              </button>
            </div>

            {groups.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-xs text-gray-500">No groups yet</p>
                <button
                  onClick={() => {
                    setModalMode("join");
                    setIsModalOpen(true);
                  }}
                  className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Join a group
                </button>
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group._id}
                  onClick={() => setSelectedChat({ ...group, type: "group" })}
                  className={`cursor-pointer rounded-lg border p-3 transition ${
                    selectedChat?._id === group._id
                      ? "border-cyan-500/50 bg-cyan-500/30"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        <i className="ri-group-2-line mr-2 text-cyan-400"></i>
                        {group.groupName}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-400">
                        {groupPreviews[group._id] ||
                          `${group.members?.length || 0} members`}
                      </p>
                    </div>
                    {isGroupOwner(group) && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={(event) => openRenameGroup(group, event)}
                          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-cyan-300"
                          title="Rename room"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteGroup(group._id);
                          }}
                          disabled={deletingGroupId === group._id}
                          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Delete room"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto border-t border-white/10 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Chats
              </h2>
              <button
                onClick={() => {
                  setModalMode("direct");
                  setIsModalOpen(true);
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                <i className="ri-add-line"></i>
              </button>
            </div>

            {directChats.length === 0 ? (
              <p className="py-2 text-center text-xs text-gray-500">
                No direct chats
              </p>
            ) : (
              directChats.map((chat) => (
                <div
                  key={chat.recipientEmail}
                  onClick={() => setSelectedChat(chat)}
                  className={`cursor-pointer rounded-lg border p-3 transition ${
                    selectedChat?.recipientEmail === chat.recipientEmail
                      ? "border-cyan-500/50 bg-cyan-500/30"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        <i className="ri-user-line mr-2 text-blue-400"></i>
                        {chat.recipientEmail}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-400">
                        {chat.lastMessage || "No messages yet"}
                      </p>
                      {presence[chat.recipientEmail]?.online ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                          Online
                        </span>
                      ) : (
                        <span className="mt-1 text-[10px] text-gray-500">
                          {formatLastSeen(
                            presence[chat.recipientEmail]?.lastSeenAt,
                          )}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteDirectChat(chat.recipientEmail);
                      }}
                      disabled={deletingChatEmail === chat.recipientEmail}
                      className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete chat"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/50 p-4 backdrop-blur">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-2 text-white hover:bg-white/10 md:hidden"
          >
            <i className="ri-menu-line text-xl"></i>
          </button>

          {selectedChat ? (
            <div className="ml-4 flex-1">
              <h2 className="text-lg font-semibold text-white">
                {selectedChat.type === "group"
                  ? selectedChat.groupName
                  : selectedChat.recipientEmail}
              </h2>
              <p className="text-xs text-gray-400">
                {getChatStatusText()}
              </p>
            </div>
          ) : (
            <div className="ml-4 flex-1">
              <h2 className="text-lg font-semibold text-white">Welcome</h2>
              <p className="text-xs text-gray-400">Select a chat to start</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            {selectedChat?.type === "group" && (
              <Link
                to={`/group/${selectedChat._id}`}
                className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm text-cyan-300 transition hover:bg-cyan-500/30"
              >
                <i className="ri-arrow-right-line mr-1"></i> Open
              </Link>
            )}
            {selectedChat?.type === "direct" && (
              <button
                onClick={() => deleteDirectChat(selectedChat.recipientEmail)}
                disabled={deletingChatEmail === selectedChat.recipientEmail}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-delete-bin-line mr-1"></i>{" "}
                {deletingChatEmail === selectedChat.recipientEmail
                  ? "Deleting..."
                  : "Delete Chat"}
              </button>
            )}
          </div>
        </div>

        <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
          {!selectedChat ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-4 text-6xl text-cyan-400">
                  <i className="ri-chat-4-line"></i>
                </div>
                <h3 className="mb-2 text-2xl font-semibold text-white">
                  Welcome to SEON
                </h3>
                <p className="mb-6 text-gray-400">
                  Select a group or start a direct chat
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setModalMode("create");
                      setIsModalOpen(true);
                    }}
                    className="rounded-lg bg-cyan-500/20 px-6 py-2 text-cyan-300 transition hover:bg-cyan-500/30"
                  >
                    <i className="ri-add-line mr-2"></i> New Group
                  </button>
                  <button
                    onClick={() => {
                      setModalMode("direct");
                      setIsModalOpen(true);
                    }}
                    className="rounded-lg bg-blue-500/20 px-6 py-2 text-blue-300 transition hover:bg-blue-500/30"
                  >
                    <i className="ri-chat-line mr-2"></i> New Chat
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {displayedMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-gray-500">
                    {selectedChat.type === "group"
                      ? "No @ai conversation yet. Send a message with @ai to start."
                      : "No messages yet. Start the conversation!"}
                  </p>
                </div>
              ) : (
                displayedMessages.map((message) => {
                  const senderEmail = getSenderEmail(message);
                  const isCurrentUserMessage = senderEmail === user?.email;
                  const isAi = message?.sender?._id === "ai";

                  return (
                    <div
                      key={
                        message._id ||
                        `${senderEmail}-${message.timestamp}-${getMessageText(message)}`
                      }
                      className={`flex ${
                        isCurrentUserMessage ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-xs rounded-lg border px-4 py-2 ${
                          isAi
                            ? "border-cyan-500/30 bg-slate-900/80 text-gray-100"
                            : isCurrentUserMessage
                              ? "border-cyan-500/50 bg-cyan-500/30 text-white"
                              : "border-white/10 bg-white/10 text-gray-100"
                        }`}
                      >
                        {selectedChat.type === "group" && (
                          <p className="mb-1 text-xs text-gray-400">
                            {isAi ? "AI" : senderEmail || "Unknown"}
                          </p>
                        )}
                        <p className="break-words text-sm">
                          {getMessageText(message)}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              {selectedChat?.type === "group" &&
                aiThinkingGroupId === selectedChat._id && (
                  <div className="flex justify-start">
                    <div className="rounded-lg border border-cyan-500/30 bg-slate-900/80 px-4 py-2 text-sm text-cyan-200">
                      <i className="ri-loader-4-line mr-2 animate-spin"></i>
                      @ai is generating a response...
                    </div>
                  </div>
                )}
              {typingUsers.length > 0 && (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-gray-300">
                    {typingUsers.join(", ")}{" "}
                    {typingUsers.length === 1 ? "is" : "are"} typing...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {selectedChat && (
          <div className="border-t border-white/10 bg-slate-900/50 p-4 backdrop-blur">
            <form onSubmit={sendChatMessage} className="flex gap-3">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => handleMessageInputChange(e.target.value)}
                onBlur={() => notifyTyping(false)}
                placeholder={
                  selectedChat?.type === "group"
                    ? "Message @ai..."
                    : "Type a message..."
                }
                className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
              <button
                type="submit"
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-3 font-medium text-white transition hover:from-cyan-600 hover:to-blue-600"
              >
                <i className="ri-send-plane-line"></i>
              </button>
            </form>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex justify-between">
              <h2 className="text-xl font-semibold text-white">
                {modalMode === "create"
                  ? "Create New Group"
                  : modalMode === "join"
                    ? "Join Group"
                    : "New Direct Chat"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {modalMode === "create" ? (
              <form onSubmit={createGroup} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name..."
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 font-medium text-white transition hover:from-cyan-600 hover:to-blue-600"
                >
                  Create Group
                </button>
              </form>
            ) : modalMode === "join" ? (
              <form onSubmit={joinGroup} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Group ID
                  </label>
                  <input
                    type="text"
                    value={joinGroupId}
                    onChange={(e) => setJoinGroupId(e.target.value)}
                    placeholder="Paste group ID..."
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 font-medium text-white transition hover:from-cyan-600 hover:to-blue-600"
                >
                  Join Group
                </button>
              </form>
            ) : (
              <form onSubmit={startDirectChat} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="Enter email..."
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 font-medium text-white transition hover:from-cyan-600 hover:to-blue-600"
                >
                  Start Chat
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {renamingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex justify-between">
              <h2 className="text-xl font-semibold text-white">Rename Room</h2>
              <button
                onClick={() => {
                  setRenamingGroup(null);
                  setRenameGroupName("");
                }}
                className="text-gray-400 hover:text-white"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <form onSubmit={updateGroupName} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-gray-300">
                  Room Name
                </label>
                <input
                  type="text"
                  value={renameGroupName}
                  onChange={(e) => setRenameGroupName(e.target.value)}
                  placeholder="Enter new room name..."
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 font-medium text-white transition hover:from-cyan-600 hover:to-blue-600"
              >
                Save Name
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
