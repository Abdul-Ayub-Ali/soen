import { useState, useEffect, useContext, useRef } from "react";
import { UserContext } from "../context/user.context";
import { Link, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from "../config/axios";
import {
  connectSocket,
  disconnectSocket,
  emitWithAck,
  joinGroupRoom,
  leaveGroupRoom,
  subscribeToSocketEvent,
} from "../config/socket";
import Markdown from "markdown-to-jsx";
import hljs from "highlight.js";
import { getWebContainer } from "../config/webContainer";

function SyntaxHighlightedCode(props) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && props.className?.includes("lang-")) {
      hljs.highlightElement(ref.current);

      // hljs won't reprocess the element unless this attribute is removed
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

const Group = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { groupId } = useParams();
  const routeGroupId = location.state?.group?._id || groupId;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loadingGroupAction, setLoadingGroupAction] = useState(false);
  const [group, setGroup] = useState(location.state?.group || null);
  const [message, setMessage] = useState("");
  const { user, setUser } = useContext(UserContext);
  const messageBox = useRef(null);

  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]); // New state variable for messages
  const [fileTree, setFileTree] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(new Set());

  const [currentFile, setCurrentFile] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);

  const [webContainer, setWebContainer] = useState(null);
  const [iframeUrl, setIframeUrl] = useState(null);

  const [runProcess, setRunProcess] = useState(null);
  const webContainerRef = useRef(null);

  useEffect(() => {
    webContainerRef.current = webContainer;
  }, [webContainer]);

  const handleUserClick = (id) => {
    setSelectedUserId((prevSelectedUserId) => {
      const newSelectedUserId = new Set(prevSelectedUserId);
      if (newSelectedUserId.has(id)) {
        newSelectedUserId.delete(id);
      } else {
        newSelectedUserId.add(id);
      }

      return newSelectedUserId;
    });
  };

  function inviteCollaborator(e) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      alert("Enter an email to invite.");
      return;
    }

    setLoadingGroupAction(true);
    axios
      .put("/groups/invite-user", {
        groupId: routeGroupId,
        email,
      })
      .then((res) => {
        setGroup(res.data.group);
        setInviteEmail("");
      })
      .catch((err) => {
        console.log(err.response?.data || err.message);
        alert(err.response?.data?.error || "Failed to invite user.");
      })
      .finally(() => {
        setLoadingGroupAction(false);
      });
  }

  function kickCollaborator(userIdToRemove) {
    if (!window.confirm("Remove this collaborator from the room?")) {
      return;
    }

    setLoadingGroupAction(true);
    axios
      .put("/groups/kick-user", {
        groupId: routeGroupId,
        userId: userIdToRemove,
      })
      .then((res) => {
        setGroup(res.data.group);
      })
      .catch((err) => {
        console.log(err.response?.data || err.message);
        alert(err.response?.data?.error || "Failed to remove collaborator.");
      })
      .finally(() => {
        setLoadingGroupAction(false);
      });
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    disconnectSocket();
    setUser(null);
    navigate("/login");
  }

  function deleteRoom() {
    if (!window.confirm("Delete this room? This action cannot be undone.")) {
      return;
    }

    axios
      .delete(`/groups/delete/${routeGroupId}`)
      .then(() => {
        alert("Room deleted successfully.");
        navigate("/");
      })
      .catch((err) => {
        console.log(err.response?.data || err.message);
        alert(err.response?.data?.error || "Failed to delete room.");
      });
  }

  function addCollaborators() {
    if (!selectedUserId || selectedUserId.size === 0) {
      alert("Select at least one user to add.");
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
      })
      .catch((err) => {
        console.log(err.response?.data || err.message);
        alert(err.response?.data?.error || "Failed to add collaborators.");
      })
      .finally(() => {
        setLoadingGroupAction(false);
      });
  }

  const send = () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return;
    }

    emitWithAck("send-group-message", {
      groupId: routeGroupId,
      content: trimmedMessage,
    })
      .then(() => {
        setMessage("");
      })
      .catch((error) => {
        alert(error.message || "Failed to send message.");
      });
  };

  function WriteAiMessage(rawMessage) {
    let messageObject = { text: rawMessage };

    try {
      messageObject = JSON.parse(rawMessage);
    } catch (error) {
      messageObject = { text: rawMessage };
    }

    return (
      <div className="overflow-auto bg-slate-950 text-white rounded-sm p-2">
        <Markdown
          children={messageObject.text}
          options={{
            overrides: {
              code: SyntaxHighlightedCode,
            },
          }}
        />
      </div>
    );
  }

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messageBox.current) {
      messageBox.current.scrollTop = messageBox.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (webContainer) {
      return;
    }

    getWebContainer().then((container) => {
      setWebContainer(container);
      console.log("container started");
    });
  }, [webContainer]);

  useEffect(() => {
    if (!webContainer || Object.keys(fileTree).length === 0) {
      return;
    }

    webContainer.mount(fileTree).catch((error) => {
      console.log("Failed to mount file tree:", error);
    });
  }, [webContainer, fileTree]);

  useEffect(() => {
    if (!routeGroupId) {
      return;
    }

    connectSocket();
    joinGroupRoom(routeGroupId).catch((err) => console.log(err.message));

    const unsubscribeGroupMessages = subscribeToSocketEvent(
      "group-message",
      (data) => {
        if (data.groupId !== routeGroupId) {
          return;
        }

        console.log("Received message:", data);

        if (data.sender?._id === "ai") {
          try {
            const parsed = JSON.parse(getMessageText(data));
            if (parsed.fileTree) {
              setFileTree(parsed.fileTree);
              webContainerRef.current?.mount(parsed.fileTree);
            }
          } catch (error) {
            console.error("Failed to parse AI message:", error);
          }
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

    axios
      .get(`/groups/get-group/${routeGroupId}`)
      .then((res) => {
        setGroup(res.data.group);
        setFileTree(res.data.group.fileTree || {});
      })
      .catch((err) => {
        console.log(err);
      });

    axios
      .get(`/messages/group/${routeGroupId}`)
      .then((res) => {
        setMessages(res.data.messages || []);
      })
      .catch((err) => {
        console.log(err);
      });

    axios
      .get("/users/all")
      .then((res) => {
        setUsers(res.data.users);
      })
      .catch((err) => {
        console.log(err);
      });

    return () => {
      unsubscribeGroupMessages();
      leaveGroupRoom(routeGroupId);
    };
  }, [routeGroupId]);

  function saveFileTree(ft) {
    axios
      .put("/groups/update-file-tree", {
        groupId: routeGroupId,
        fileTree: ft,
      })
      .then((res) => {
        console.log(res.data);
      })
      .catch((err) => {
        console.log(err);
      });
  }

  return (
    <main className="h-screen w-screen flex">
      <section className="left relative flex flex-col h-screen min-w-96 bg-slate-300">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-4 w-full bg-slate-100 absolute z-10 top-0">
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md"
              onClick={() => setIsModalOpen(true)}
            >
              <i className="ri-add-fill"></i>
              Add collaborator
            </button>
            <button
              onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
              className="px-4 py-2 bg-white border border-slate-300 rounded-md"
            >
              <i className="ri-group-fill"></i> Room Info
            </button>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <p className="text-sm text-slate-600">
              Room: {group?.groupName || "Loading..."}
            </p>
            <Link
              to="/dashboard"
              className="px-4 py-2 bg-blue-600 text-white rounded-md"
            >
              Dashboard
            </Link>
            <Link to="/profile" className="px-4 py-2 bg-slate-100 rounded-md">
              Profile
            </Link>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-500 text-white rounded-md"
            >
              Logout
            </button>
          </div>
        </header>
        <div className="conversation-area pt-14 pb-10 flex-grow flex flex-col h-full relative">
          <div
            ref={messageBox}
            className="message-box p-1 flex-grow flex flex-col gap-1 overflow-auto max-h-full scrollbar-hide"
          >
            {messages.map((msg, index) => {
              const senderEmail = getSenderEmail(msg);
              const isAi = msg.sender?._id === "ai";
              const isCurrentUser = !isAi && senderEmail === user?.email;
              const messageKey =
                msg._id ||
                `${senderEmail || "unknown"}-${msg.timestamp || index}`;

              return (
                <div
                  key={messageKey}
                  className={`${isAi ? "max-w-80" : "max-w-52"} ${isCurrentUser ? "ml-auto" : ""}  message flex flex-col p-2 bg-slate-50 w-fit rounded-md`}
                >
                  <small className="opacity-65 text-xs">
                    {senderEmail || "Unknown"}
                  </small>
                  <div className="text-sm">
                    {isAi ? (
                      WriteAiMessage(getMessageText(msg))
                    ) : (
                      <p>{getMessageText(msg)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="inputField w-full flex absolute bottom-0">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="p-2 px-4 border-none outline-none flex-grow"
              type="text"
              placeholder="Enter message"
            />
            <button onClick={send} className="px-5 bg-slate-950 text-white">
              <i className="ri-send-plane-fill"></i>
            </button>
          </div>
        </div>
        <div
          className={`sidePanel w-full h-full flex flex-col gap-4 bg-slate-50 absolute transition-all ${isSidePanelOpen ? "translate-x-0" : "-translate-x-full"} top-0 px-4 py-4`}
        >
          <header className="flex justify-between items-center px-2 py-2 bg-slate-200 rounded-md">
            <div>
              <h1 className="font-semibold text-lg">Group Info</h1>
              <p className="text-sm text-gray-600">
                Room details & collaborators
              </p>
            </div>
            <button
              onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
              className="p-2 rounded-full bg-white shadow-sm"
            >
              <i className="ri-close-fill"></i>
            </button>
          </header>

          <div className="p-4 bg-white rounded-md shadow-sm">
            <p className="text-sm text-gray-500">Room Key</p>
            <p className="font-medium break-words">
              {group?._id || "Loading..."}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(group?._id || "")}
              className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-md text-sm"
            >
              <i className="ri-file-copy-line"></i> Copy Room Key
            </button>
            <div className="mt-4 border-t pt-4">
              <p className="text-sm text-gray-500">Owner</p>
              <p className="font-medium">{group?.owner?.email || "Unknown"}</p>
            </div>
            {group?.owner?._id?.toString() === user?._id?.toString() && (
              <button
                onClick={deleteRoom}
                className="mt-4 w-full px-3 py-2 bg-red-600 text-white rounded-md text-sm"
              >
                Delete Room
              </button>
            )}
          </div>

          {group?.owner?._id?.toString() === user?._id?.toString() && (
            <form
              onSubmit={inviteCollaborator}
              className="p-4 bg-white rounded-md shadow-sm"
            >
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invite collaborator by email
              </label>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                type="email"
                className="w-full p-2 border border-gray-300 rounded-md mb-3"
                placeholder="collaborator@example.com"
              />
              <button
                type="submit"
                disabled={loadingGroupAction}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md"
              >
                {loadingGroupAction ? "Inviting..." : "Invite User"}
              </button>
            </form>
          )}

          <div className="p-4 bg-white rounded-md shadow-sm flex-1 overflow-auto">
            <h2 className="font-semibold mb-3">Collaborators</h2>
            <div className="space-y-3">
              {group?.members?.map((member) => {
                const isOwner = member._id === group?.owner?._id;
                return (
                  <div
                    key={member._id}
                    className="flex items-center justify-between gap-3 p-3 rounded-md bg-slate-100"
                  >
                    <div>
                      <p className="font-medium">{member.email}</p>
                      <p className="text-xs text-gray-500">
                        {isOwner ? "Owner" : "Collaborator"}
                      </p>
                    </div>
                    {group?.owner?._id?.toString() === user?._id?.toString() &&
                      !isOwner && (
                        <button
                          onClick={() => kickCollaborator(member._id)}
                          className="px-3 py-1 bg-red-500 text-white rounded-md text-sm"
                        >
                          Remove
                        </button>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="right  bg-red-50 flex-grow h-full flex">
        <div className="explorer h-full max-w-64 min-w-52 bg-slate-200">
          <div className="file-tree w-full">
            {Object.keys(fileTree).map((file) => (
              <button
                key={file}
                onClick={() => {
                  setCurrentFile(file);
                  setOpenFiles([...new Set([...openFiles, file])]);
                }}
                className="tree-element cursor-pointer p-2 px-4 flex items-center gap-2 bg-slate-300 w-full"
              >
                <p className="font-semibold text-lg">{file}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="code-editor flex flex-col flex-grow h-full shrink">
          <div className="top flex justify-between w-full">
            <div className="files flex">
              {openFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => setCurrentFile(file)}
                  className={`open-file cursor-pointer p-2 px-4 flex items-center w-fit gap-2 bg-slate-300 ${currentFile === file ? "bg-slate-400" : ""}`}
                >
                  <p className="font-semibold text-lg">{file}</p>
                </button>
              ))}
            </div>

            <div className="actions flex gap-2">
              <button
                onClick={async () => {
                  await webContainer.mount(fileTree);

                  const installProcess = await webContainer.spawn("npm", [
                    "install",
                  ]);

                  installProcess.output.pipeTo(
                    new WritableStream({
                      write(chunk) {
                        console.log(chunk);
                      },
                    }),
                  );

                  if (runProcess) {
                    runProcess.kill();
                  }

                  let tempRunProcess = await webContainer.spawn("npm", [
                    "start",
                  ]);

                  tempRunProcess.output.pipeTo(
                    new WritableStream({
                      write(chunk) {
                        console.log(chunk);
                      },
                    }),
                  );

                  setRunProcess(tempRunProcess);

                  webContainer.on("server-ready", (port, url) => {
                    console.log(port, url);
                    setIframeUrl(url);
                  });
                }}
                className="p-2 px-4 bg-slate-300 text-white"
              >
                run
              </button>
            </div>
          </div>
          <div className="bottom flex flex-grow max-w-full shrink overflow-auto">
            {fileTree[currentFile] && (
              <div className="code-editor-area h-full overflow-auto flex-grow bg-slate-50">
                <pre className="hljs h-full">
                  <code
                    className="hljs h-full outline-none"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const updatedContent = e.target.innerText;
                      const ft = {
                        ...fileTree,
                        [currentFile]: {
                          file: {
                            contents: updatedContent,
                          },
                        },
                      };
                      setFileTree(ft);
                      saveFileTree(ft);
                    }}
                    dangerouslySetInnerHTML={{
                      __html: hljs.highlight(
                        fileTree[currentFile].file.contents,
                        { language: "javascript" },
                      ).value,
                    }}
                    style={{
                      whiteSpace: "pre-wrap",
                      paddingBottom: "25rem",
                      counterSet: "line-numbering",
                    }}
                  />
                </pre>
              </div>
            )}
          </div>
        </div>

        {iframeUrl && webContainer && (
          <div className="flex min-w-96 flex-col h-full">
            <div className="address-bar">
              <input
                type="text"
                onChange={(e) => setIframeUrl(e.target.value)}
                value={iframeUrl}
                className="w-full p-2 px-4 bg-slate-200"
              />
            </div>
            <iframe src={iframeUrl} className="w-full h-full"></iframe>
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded-md w-96 max-w-full relative">
            <header className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Select User</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2">
                <i className="ri-close-fill"></i>
              </button>
            </header>
            <div className="users-list flex flex-col gap-2 mb-16 max-h-96 overflow-auto">
              {users.map((user) => (
                <div
                  key={user._id}
                  className={`user cursor-pointer hover:bg-slate-200 ${Array.from(selectedUserId).indexOf(user._id) != -1 ? "bg-slate-200" : ""} p-2 flex gap-2 items-center`}
                  onClick={() => handleUserClick(user._id)}
                >
                  <div className="aspect-square relative rounded-full w-fit h-fit flex items-center justify-center p-5 text-white bg-slate-600">
                    <i className="ri-user-fill absolute"></i>
                  </div>
                  <h1 className="font-semibold text-lg">{user.email}</h1>
                </div>
              ))}
            </div>
            <button
              onClick={addCollaborators}
              className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-blue-600 text-white rounded-md"
            >
              Add Collaborators
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Group;
