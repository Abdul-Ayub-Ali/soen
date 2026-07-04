import userModel from "../models/user.model.js";

export const createUser = async ({ name, email, password }) => {
  if (!name || !email || !password) {
    throw new Error("Name, Email, and password are required");
  }

  const hashedPassword = await userModel.hashPassword(password);

  const user = await userModel.create({
    name,
    email,
    password: hashedPassword,
  });

  return user;
};

export const getAllUsers = async ({ userId }) => {
  const users = await userModel.find({
    _id: { $ne: userId },
  });
  return users;
};

export const getUserProfile = async ({ userId, email }) => {
  const user = await userModel.findOne({
    _id: userId,
    email,
  });

  if (!user) {
    const error = new Error("Account no longer exists");
    error.code = "USER_DELETED";
    throw error;
  }

  return user;
};
