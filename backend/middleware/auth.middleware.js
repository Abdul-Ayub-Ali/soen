import jwt from "jsonwebtoken";
import redisClient from "../services/redis.service.js";
import * as userService from "../services/user.service.js";

export const authUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      req.cookies.token || (authHeader ? authHeader.split(" ")[1] : null);

    if (!token) {
      return res.status(401).send({ error: "Unauthorized User" });
    }

    const isBlackListed = await redisClient.get(token);

    if (isBlackListed) {
      res.cookie("token", "");

      return res.status(401).send({ error: "Unauthorized User" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    try {
      const user = await userService.getUserProfile({
        userId: decoded._id,
        email: decoded.email,
      });

      req.user = {
        _id: user._id.toString(),
        email: user.email,
        name: user.name,
      };
    } catch (profileError) {
      if (profileError.code === "USER_DELETED") {
        return res.status(404).send({
          error: "Account no longer exists",
          code: "USER_DELETED",
        });
      }

      throw profileError;
    }

    next();
  } catch (error) {
    console.log(error);

    res.status(401).send({ error: "Unauthorized User" });
  }
};
