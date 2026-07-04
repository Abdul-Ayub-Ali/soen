import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/user.context";
import axios from "../config/axios";
import { invalidateSession, isUserDeletedError } from "../utils/session";
import { showError } from "../utils/toast";

const UserAuth = ({ children }) => {
  const { user, setUser } = useContext(UserContext);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("token");
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    if (user) {
      setLoading(false);
      return;
    }

    axios
      .get("/users/profile")
      .then((res) => {
        setUser(res.data.user);
        setLoading(false);
      })
      .catch((error) => {
        if (isUserDeletedError(error)) {
          invalidateSession({
            message: "Your account was removed. Please register again.",
            setUser,
            navigate,
          });
          return;
        }

        localStorage.removeItem("token");
        localStorage.removeItem("user");
        showError("Session expired. Please log in again.");
        navigate("/login");
      });
  }, []);

  useEffect(() => {
    if (!user?.email || !token) {
      return undefined;
    }

    const verifySession = () => {
      axios.get("/users/profile").catch((error) => {
        if (isUserDeletedError(error)) {
          invalidateSession({
            message: "Your account was removed. Please register again.",
            setUser,
            navigate,
          });
        }
      });
    };

    const intervalId = window.setInterval(verifySession, 20000);
    return () => window.clearInterval(intervalId);
  }, [user?.email, token, setUser, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-xl text-white">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
};

export default UserAuth;
