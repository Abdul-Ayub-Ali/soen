import { useState, useEffect, useContext, useRef } from "react";
import { UserContext } from "../context/user.context";
import { Link, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from "../config/axios";
import {
  connectSocket,
  emitWithAck,
  joinGroupRoom,
  leaveGroupRoom,
  subscribeToSocketEvent,
} from "../config/socket";
import { getErrorMessage, showError, showSuccess } from "../utils/toast";
import { useTypingIndicator } from "../hooks/usePresence";
import Markdown from "markdown-to-jsx";
import hljs from "highlight.js";

function SyntaxHighlightedCode(props) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && props.className?.includes("lang-")) {
      hljs.highlightElement(ref.current);
      ref.current.removeAttribute("data-highlighted");
    }
  }, [props.className, props.children]);

  return <code {...props} ref={ref} />;
}

const getSenderEmail = (message) =>
  message?.sender?.email ||
  message?.senderEmail ||
  (typeof message?.sender === "string" ? message.sender : "");

const getMessageText = (message) => message?.content || message?.message || "";

const parseAiMessage = (rawMessage) => {
  try {
    return JSON.parse(rawMessage);
  } catch {
    return { text: rawMessage };
  }
};

const collectFilesFromTree = (fileTree, basePath = "") => {
  if (!fileTree || typeof fileTree !== "object") {
    return [];
  }

  const files = [];

  Object.entries(fileTree).forEach(([name, node]) => {
    const filePath = basePath ? `${basePath}/${name}` : name;

    if (node?.file?.contents !== undefined) {
      files.push({ path: filePath, contents: node.file.contents });
      return;
    }

    if (node?.directory) {
      files.push(...collectFilesFromTree(node.directory, filePath));
    }
  });

  return files;
};

const FileTreeViewer = ({ fileTree, fullHeight = false }) => {
  const files = collectFilesFromTree(fileTree);
  const [activeFile, setActiveFile] = useState(files[0]?.path || "");

  useEffect(() => {
    if (files.length && !files.some((file) => file.path === activeFile)) {
      setActiveFile(files[0].path);
    }
  }, [fileTree, files, activeFile]);

  if (!files.length) {
    return null;
  }

  const selectedFile = files.find((file) => file.path === activeFile) || files[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90">
      <div className="border-b border-white/10 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
          Generated Code
        </p>
      </div>
      <div className={`flex ${fullHeight ? "h-[calc(100vh-12rem)]" : "max-h-80"}`}>
        <div className="hide-scrollbar w-40 shrink-0 overflow-y-auto border-r border-white/10 bg-slate-900/80">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setActiveFile(file.path)}
              className={`block w-full truncate px-3 py-2 text-left text-xs transition ${
                selectedFile.path === file.path
                  ? "bg-cyan-500/20 text-cyan-200"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <i className="ri-file-code-line mr-1"></i>
              {file.path}
            </button>
          ))}
        </div>
        <pre className="hide-scrollbar flex-1 overflow-auto p-4 text-xs leading-relaxed text-slate-200">
          <code>{selectedFile.contents}</code>
        </pre>
      </div>
    </div>
  );
};

const Group = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { groupId } = useParams();
  const routeGroupId = location.state?.group?._id || groupId;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loadingGroupAction, setLoadingGroupAction] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [group, setGroup] = useState(location.state?.group || null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const { user } = useContext(UserContext);
  const messageBoxRef = useRef(null);
  const typingStopTimerRef = useRef(null);

  const { typingUsers, notifyTyping } = useTypingIndicator({
    context: "group",
    contextId: routeGroupId,
    currentUserEmail: user?.email,
  });

  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(new Set());

  const isOwner =
    group?.owner?._id?.toString() === user?._id?.toString();

  const aiMessages = messages.filter((msg) => {
    const isAi = msg.sender?._id === "ai";
    const text = getMessageText(msg);
    return isAi || /@ai/i.test(text);
  });

  const handleUserClick = (id) => {
    setSelectedUserId((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyRoomId = async () => {
    if (!group?._id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(group._id);
      setCopiedRoomId(true);
      showSuccess("Room ID copied");
      setTimeout(() => setCopiedRoomId(false), 2000);
    } catch {
      showError("Could not copy room ID. Please copy it manually.");
    }
  };

  const inviteCollaborator = (e) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      showError("Enter an email to invite.");
      return;
    }

    setLoadingGroupAction(true);
    axios
      .put("/groups/invite-user", { groupId: routeGroupId, email })
      .then((res) => {
        setGroup(res.data.group);
        setInviteEmail("");
        showSuccess("Collaborator invited");
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to invite user."));
      })
      .finally(() => setLoadingGroupAction(false));
  };

  const kickCollaborator = (userIdToRemove) => {
    if (!window.confirm("Remove this collaborator from the room?")) {
      return;
    }

    setLoadingGroupAction(true);
    axios
      .put("/groups/kick-user", { groupId: routeGroupId, userId: userIdToRemove })
      .then((res) => {
        setGroup(res.data.group);
        showSuccess("Collaborator removed");
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to remove collaborator."));
      })
      .finally(() => setLoadingGroupAction(false));
  };

  const deleteRoom = () => {
    if (!window.confirm("Delete this room? This action cannot be undone.")) {
      return;
    }

    axios
      .delete(`/groups/delete/${routeGroupId}`)
      .then(() => {
        showSuccess("Room deleted successfully");
        navigate("/home");
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to delete room."));
      });
  };

  const addCollaborators = () => {
    if (!selectedUserId.size) {
      showError("Select at least one user to add.");
      return;
    }

    setLoadingGroupAction(true);
    axios
      .put("/groups/add-user", {
        groupId: routeGroupId,
        users: Array.from(selectedUserId),
      })
      .then((res) => {
        setGroup(res.data.group);
        setSelectedUserId(new Set());
        setIsModalOpen(false);
        showSuccess("Collaborators added");
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to add collaborators."));
      })
      .finally(() => setLoadingGroupAction(false));
  };

  const sendAiMessage = (e) => {
    e?.preventDefault();

    const trimmedMessage = message.trim();
    if (!trimmedMessage || sending) {
      return;
    }

    const content = /@ai/i.test(trimmedMessage)
      ? trimmedMessage
      : `@ai ${trimmedMessage}`;

    setSending(true);
    notifyTyping(false);
    emitWithAck("send-group-message", {
      groupId: routeGroupId,
      content,
    })
      .then(() => setMessage(""))
      .catch((error) => {
        showError(getErrorMessage(error, "Failed to send message."));
      })
      .finally(() => setSending(false));
  };

  const handleMessageChange = (value) => {
    setMessage(value);

    if (!value.trim()) {
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

  const renderAiResponse = (rawMessage) => {
    const messageObject = parseAiMessage(rawMessage);

    return (
      <div>
        <div className="hide-scrollbar overflow-auto rounded-2xl bg-slate-950/80 p-4 ring-1 ring-white/10">
          <Markdown
            options={{
              overrides: {
                code: SyntaxHighlightedCode,
              },
            }}
          >
            {messageObject.text || rawMessage}
          </Markdown>
        </div>
        {messageObject.fileTree && (
          <div className="mt-4">
            <FileTreeViewer fileTree={messageObject.fileTree} />
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    messageBoxRef.current?.scrollTo({
      top: messageBoxRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [aiMessages]);

  useEffect(() => {
    if (!routeGroupId) {
      return undefined;
    }

    connectSocket();
    joinGroupRoom(routeGroupId).catch((err) => {
      showError(getErrorMessage(err, "Failed to join group room."));
    });

    const unsubscribeGroupMessages = subscribeToSocketEvent(
      "group-message",
      (data) => {
        if (data.groupId !== routeGroupId) {
          return;
        }

        if (data.sender?._id === "ai") {
          setAiThinking(false);
        }

        setMessages((prevMessages) => {
          if (
            data._id &&
            prevMessages.some((messageItem) => messageItem._id === data._id)
          ) {
            return prevMessages;
          }

          return [...prevMessages, data];
        });
      },
    );

    const unsubscribeAiThinking = subscribeToSocketEvent(
      "ai-thinking",
      ({ groupId }) => {
        if (groupId === routeGroupId) {
          setAiThinking(true);
        }
      },
    );

    const unsubscribeAiDone = subscribeToSocketEvent("ai-done", ({ groupId }) => {
      if (groupId === routeGroupId) {
        setAiThinking(false);
      }
    });

    axios
      .get(`/groups/get-group/${routeGroupId}`)
      .then((res) => setGroup(res.data.group))
      .catch((err) => showError(getErrorMessage(err, "Failed to load room.")));

    axios
      .get(`/messages/group/${routeGroupId}`)
      .then((res) => setMessages(res.data.messages || []))
      .catch((err) => showError(getErrorMessage(err, "Failed to load messages.")));

    axios
      .get("/users/all")
      .then((res) => setUsers(res.data.users))
      .catch((err) => showError(getErrorMessage(err, "Failed to load users.")));

    return () => {
      unsubscribeGroupMessages();
      unsubscribeAiThinking();
      unsubscribeAiDone();
      leaveGroupRoom(routeGroupId);
    };
  }, [routeGroupId]);

  return (
    <main className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Left sidebar */}
      <aside className="flex w-full max-w-sm flex-col border-r border-white/10 bg-slate-900/90 backdrop-blur-xl lg:max-w-md">
        <div className="border-b border-white/10 p-5">
          <Link
            to="/home"
            className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
          >
            <i className="ri-arrow-left-line"></i>
            Back to Home
          </Link>
        </div>

        <div className="hide-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl ring-1 ring-white/5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Room
            </p>
            <h1 className="mt-3 text-2xl font-semibold capitalize text-white">
              {group?.groupName || "Loading room..."}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Share the room ID below so others can join this space.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl ring-1 ring-white/5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Room ID
            </p>
            <p className="mt-3 break-all rounded-2xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-200">
              {group?._id || "Loading..."}
            </p>
            <button
              type="button"
              onClick={copyRoomId}
              disabled={!group?._id}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-file-copy-line"></i>
              {copiedRoomId ? "Copied!" : "Copy & Share Room ID"}
            </button>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl ring-1 ring-white/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                  Collaborators
                </p>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  Peers in this room
                </h2>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-white/15"
                >
                  <i className="ri-user-add-line mr-1"></i>
                  Add
                </button>
              )}
            </div>

            <div className="space-y-3">
              {group?.members?.length ? (
                group.members.map((member) => {
                  const memberIsOwner = member._id === group?.owner?._id;

                  return (
                    <div
                      key={member._id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900/80 px-4 py-3 ring-1 ring-white/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {member.email}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                          {memberIsOwner ? "Owner" : "Collaborator"}
                        </p>
                      </div>
                      {isOwner && !memberIsOwner && (
                        <button
                          type="button"
                          onClick={() => kickCollaborator(member._id)}
                          className="rounded-xl bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/25"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-400">No collaborators yet.</p>
              )}
            </div>
          </div>

          {isOwner && (
            <form
              onSubmit={inviteCollaborator}
              className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl ring-1 ring-white/5"
            >
              <label className="block text-sm font-medium text-slate-300">
                Invite collaborator by email
              </label>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                type="email"
                placeholder="peer@example.com"
                className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
              <button
                type="submit"
                disabled={loadingGroupAction}
                className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingGroupAction ? "Inviting..." : "Send Invite"}
              </button>
            </form>
          )}

          {isOwner && (
            <button
              type="button"
              onClick={deleteRoom}
              className="w-full rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/25"
            >
              Delete Room
            </button>
          )}
        </div>
      </aside>

      {/* AI Assistant - full width */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-slate-900/50 px-6 py-5 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
            AI Assistant
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Chat with @ai
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Ask questions, generate code, or get help for this room. Messages
            are sent with @ai automatically.
          </p>
          {typingUsers.length > 0 && (
            <p className="mt-2 text-xs text-cyan-300">
              {typingUsers.join(", ")}{" "}
              {typingUsers.length === 1 ? "is" : "are"} typing...
            </p>
          )}
        </header>

        <div
          ref={messageBoxRef}
          className="message-box hide-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-6"
        >
          {aiMessages.length === 0 ? (
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/15 text-3xl text-cyan-300">
                  <i className="ri-robot-2-line"></i>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Start a conversation with AI
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  Type a prompt below to ask @ai for help in this room.
                </p>
              </div>
            </div>
          ) : (
            aiMessages.map((msg, index) => {
              const senderEmail = getSenderEmail(msg);
              const isAi = msg.sender?._id === "ai";
              const isCurrentUser = !isAi && senderEmail === user?.email;
              const messageKey =
                msg._id ||
                `${senderEmail || "unknown"}-${msg.timestamp || index}`;

              return (
                <div
                  key={messageKey}
                  className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-5xl rounded-[1.5rem] border px-4 py-3 ${
                      isAi
                        ? "w-full border-cyan-500/20 bg-slate-900/80"
                        : isCurrentUser
                          ? "border-cyan-500/40 bg-cyan-500/20"
                          : "border-white/10 bg-white/5"
                    }`}
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {isAi ? "AI Response" : senderEmail || "Peer"}
                    </p>
                    {isAi ? (
                      renderAiResponse(getMessageText(msg))
                    ) : (
                      <p className="whitespace-pre-wrap text-sm text-slate-100">
                        {getMessageText(msg)}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {aiThinking && (
            <div className="flex justify-start">
              <div className="max-w-3xl rounded-[1.5rem] border border-cyan-500/20 bg-slate-900/80 px-4 py-3 text-sm text-cyan-200">
                <i className="ri-loader-4-line mr-2 animate-spin"></i>
                @ai is generating a response...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-slate-900/70 p-5 backdrop-blur">
          <form onSubmit={sendAiMessage} className="mx-auto flex max-w-5xl gap-3">
            <input
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              onBlur={() => notifyTyping(false)}
              type="text"
              placeholder="Ask @ai anything for this room..."
              className="flex-1 rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
            <button
              type="submit"
              disabled={sending || !message.trim() || aiThinking}
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-4 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending || aiThinking ? (
                "Sending..."
              ) : (
                <>
                  <i className="ri-send-plane-fill mr-2"></i>
                  Send
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-[1.75rem] border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <header className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Add Collaborators
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Select peers to add to this room.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </header>

            <div className="hide-scrollbar mb-20 max-h-96 space-y-2 overflow-y-auto">
              {users.map((listedUser) => (
                <button
                  key={listedUser._id}
                  type="button"
                  onClick={() => handleUserClick(listedUser._id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                    selectedUserId.has(listedUser._id)
                      ? "bg-cyan-500/20 ring-1 ring-cyan-500/30"
                      : "bg-slate-950/80 hover:bg-white/5"
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-white">
                    <i className="ri-user-fill"></i>
                  </div>
                  <span className="truncate font-medium text-white">
                    {listedUser.email}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={addCollaborators}
              disabled={loadingGroupAction}
              className="absolute bottom-6 left-1/2 w-[calc(100%-3rem)] -translate-x-1/2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingGroupAction ? "Adding..." : "Add Selected Peers"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Group;
