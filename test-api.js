import axios from "axios";
import { io } from "socket.io-client";

const API_BASE = process.env.API_BASE || "http://localhost:3000";

const log = (step, message) => console.log(`\n[${step}] ${message}`);
const fail = (message) => {
  console.error(`\n❌ ${message}`);
  process.exit(1);
};

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const emitAck = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response?.ok) {
        resolve(response.data);
        return;
      }

      reject(new Error(response?.error || `${event} failed`));
    });
  });

const waitForEvent = (socket, eventName, predicate, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    const handler = (payload) => {
      if (predicate && !predicate(payload)) {
        return;
      }

      clearTimeout(timer);
      socket.off(eventName, handler);
      resolve(payload);
    };

    socket.on(eventName, handler);
  });

async function runTests() {
  console.log("Starting SEON API + RTC Tests...");
  console.log(`API base: ${API_BASE}`);

  const suffix = Date.now();
  const user1Email = `alice_${suffix}@example.com`;
  const user2Email = `bob_${suffix}@example.com`;

  try {
    log(1, "Register user 1");
    const registerRes = await axios.post(`${API_BASE}/users/register`, {
      name: "Alice",
      email: user1Email,
      password: "password123",
    });
    const user1Token = registerRes.data.token;
    const user1Id = registerRes.data.user._id;

    log(2, "Register user 2");
    const registerRes2 = await axios.post(`${API_BASE}/users/register`, {
      name: "Bob",
      email: user2Email,
      password: "password123",
    });
    const user2Token = registerRes2.data.token;
    const user2Id = registerRes2.data.user._id;

    log(3, "Profile + list users");
    const profile = await axios.get(`${API_BASE}/users/profile`, {
      headers: authHeaders(user1Token),
    });
    if (!profile.data.user?.email) {
      fail("Profile endpoint did not return user email");
    }

    const allUsers = await axios.get(`${API_BASE}/users/all`, {
      headers: authHeaders(user1Token),
    });
    if (!Array.isArray(allUsers.data.users)) {
      fail("Users list endpoint failed");
    }

    log(4, "Create group");
    const createGroupRes = await axios.post(
      `${API_BASE}/groups/create`,
      { groupName: `Group_${suffix}` },
      { headers: authHeaders(user1Token) },
    );
    const groupId = createGroupRes.data._id;

    log(5, "Add user 2 to group");
    await axios.put(
      `${API_BASE}/groups/add-user`,
      { groupId, users: [user2Id] },
      { headers: authHeaders(user1Token) },
    );

    log(6, "Join group as user 2");
    await axios.post(
      `${API_BASE}/groups/join`,
      { groupId },
      { headers: authHeaders(user2Token) },
    );

    log(7, "Start direct chat");
    await axios.post(
      `${API_BASE}/messages/direct/start`,
      { recipientEmail: user2Email },
      { headers: authHeaders(user1Token) },
    );

    log(8, "Connect sockets + presence");
    const socket1 = io(API_BASE, { auth: { token: user1Token } });
    const socket2 = io(API_BASE, { auth: { token: user2Token } });

    await Promise.all([
      waitForEvent(socket1, "connect"),
      waitForEvent(socket2, "connect"),
    ]);

    const presenceData = await emitAck(socket1, "get-presence", {
      emails: [user2Email],
    });

    if (typeof presenceData.presence?.[user2Email]?.online !== "boolean") {
      fail("Presence snapshot missing online status");
    }

    log(9, "Direct message over socket");
    await emitAck(socket1, "send-direct-message", {
      recipientEmail: user2Email,
      content: "Hello Bob from RTC test",
    });

    const directMessage = await waitForEvent(
      socket2,
      "direct-message",
      (msg) => msg.content === "Hello Bob from RTC test",
    );

    if (directMessage.recipientEmail !== user2Email) {
      fail("Direct message recipient mismatch");
    }

    log(10, "Typing indicator");
    socket1.emit("typing-start", {
      context: "direct",
      contextId: user2Email,
    });

    const typingUpdate = await waitForEvent(
      socket2,
      "typing-update",
      (update) =>
        update.context === "direct" &&
        update.contextId === user2Email &&
        update.email === user1Email &&
        update.isTyping === true,
    );

    if (!typingUpdate) {
      fail("Typing update not received");
    }

    socket1.emit("typing-stop", {
      context: "direct",
      contextId: user2Email,
    });

    log(11, "Group AI message");
    await emitAck(socket1, "join-group", { groupId });

    const aiThinkingPromise = waitForEvent(
      socket1,
      "ai-thinking",
      (payload) => payload.groupId === groupId,
    );

    await emitAck(socket1, "send-group-message", {
      groupId,
      content: "@ai Say hello to testing!",
    });

    await aiThinkingPromise;

    const aiMessage = await waitForEvent(
      socket1,
      "group-message",
      (msg) => msg.groupId === groupId && msg.sender?._id === "ai",
      60000,
    );

    await waitForEvent(
      socket1,
      "ai-done",
      (payload) => payload.groupId === groupId,
    );

    const aiText = aiMessage.content || aiMessage.message || "";
    if (!aiText) {
      fail("AI response was empty");
    }

    log(12, "Fetch message history");
    const messagesRes = await axios.get(`${API_BASE}/messages/group/${groupId}`, {
      headers: authHeaders(user1Token),
    });

    if (!messagesRes.data.messages?.length) {
      fail("Group message history is empty");
    }

    const directHistory = await axios.get(
      `${API_BASE}/messages/direct/${encodeURIComponent(user2Email)}`,
      { headers: authHeaders(user1Token) },
    );

    if (!directHistory.data.messages?.some((msg) => msg.content.includes("RTC test"))) {
      fail("Direct message history missing sent message");
    }

    log(13, "Presence API");
    const presenceApi = await axios.get(
      `${API_BASE}/users/presence?emails=${encodeURIComponent(user2Email)}`,
      { headers: authHeaders(user1Token) },
    );

    if (!presenceApi.data.presence?.[user2Email]) {
      fail("REST presence endpoint failed");
    }

    log(14, "Logout");
    await axios.get(`${API_BASE}/users/logout`, {
      headers: authHeaders(user1Token),
    });

    socket1.disconnect();
    socket2.disconnect();

    console.log("\n✅ All SEON API + RTC tests passed!");
    process.exit(0);
  } catch (error) {
    fail(error.response?.data?.error || error.message);
  }
}

runTests();
