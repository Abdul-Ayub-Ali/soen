import mongoose from "mongoose";

const directChatSchema = new mongoose.Schema(
  {
    participants: {
      type: [String],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: "A direct chat must have exactly two participants",
      },
    },
    participantsKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deletedBy: {
      type: [String],
      default: [],
    },
    lastMessage: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const DirectChat = mongoose.model("directChat", directChatSchema);

export default DirectChat;
