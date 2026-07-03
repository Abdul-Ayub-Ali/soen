import axios from "axios";
import { io } from "socket.io-client";

const API_BASE = "http://localhost:3000";

async function runTests() {
  console.log("Starting API Tests...");

  try {
    console.log("\n[1] Testing User Registration (User 1)...");
    const registerRes = await axios.post(`${API_BASE}/users/register`, {
      name: "Alice",
      email: `alice_${Date.now()}@example.com`,
      password: "password123",
    });
    const user1Token = registerRes.data.token;
    const user1Id = registerRes.data.user._id;
    console.log("Registration successful:", registerRes.data.user.email);

    console.log("\n[2] Testing User Registration (User 2)...");
    const registerRes2 = await axios.post(`${API_BASE}/users/register`, {
      name: "Bob",
      email: `bob_${Date.now()}@example.com`,
      password: "password123",
    });
    const user2Id = registerRes2.data.user._id;
    console.log("Registration successful:", registerRes2.data.user.email);

    console.log("\n[3] Testing Create Group...");
    const createGroupRes = await axios.post(
      `${API_BASE}/groups/create`,
      {
        groupName: `Group_${Date.now()}`,
      },
      {
        headers: { Authorization: `Bearer ${user1Token}` },
      },
    );
    const groupId = createGroupRes.data._id;
    console.log("Group created:", createGroupRes.data.groupName);

    console.log("\n[4] Testing Add User to Group...");
    await axios.put(
      `${API_BASE}/groups/add-user`,
      {
        groupId,
        users: [user2Id],
      },
      {
        headers: { Authorization: `Bearer ${user1Token}` },
      },
    );
    console.log("User added to group.");

    console.log("\n[5] Testing AI via Socket.io...");
    const socket = io(API_BASE, {
      auth: { token: user1Token },
    });

    socket.on("connect", () => {
      console.log("Socket connected. Joining room...");
      socket.emit("join-group", { groupId }, (joinResponse) => {
        if (!joinResponse?.ok) {
          console.error("Failed to join room:", joinResponse?.error);
          process.exit(1);
        }

        console.log("Joined room. Emitting AI message...");
        socket.emit(
          "send-group-message",
          {
            groupId,
            content: "@ai Say hello to testing!",
          },
          (sendResponse) => {
            if (!sendResponse?.ok) {
              console.error("Failed to send message:", sendResponse?.error);
              process.exit(1);
            }
          },
        );
      });
    });

    socket.on("group-message", (data) => {
      if (data.sender._id === "ai") {
        console.log("Received AI response:");
        console.log(data.message);

        testMessagesApi(user1Token, groupId).then(() => {
          socket.disconnect();
          console.log("\nAll tests completed successfully!");
          process.exit(0);
        });
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket error:", err.message);
      process.exit(1);
    });
  } catch (error) {
    console.error("Test failed:", error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

async function testMessagesApi(token, groupId) {
  console.log("\n[6] Testing Fetch Messages...");
  const messagesRes = await axios.get(`${API_BASE}/messages/group/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Fetched ${messagesRes.data.messages.length} messages from history.`);
}

runTests();
