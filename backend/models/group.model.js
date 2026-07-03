import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
  groupName: {
    type: String,
    lowercase: true,
    required: true,
    trim: true,
    unique: [true, "Group name must be unique"],
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },

  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
  ],
  fileTree: {
    type: Object,
    default: {},
  },
});

const Group = mongoose.model("group", groupSchema);

export default Group;
