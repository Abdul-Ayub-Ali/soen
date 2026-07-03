import React from "react";
import { Route, BrowserRouter, Routes, Navigate } from "react-router-dom";
import Login from "../screens/Login";
import Register from "../screens/Register";
import Home from "../screens/Home";
import Group from "../screens/Group";
import Dashboard from "../screens/Dashboard";
import Profile from "../screens/Profile";
import UserAuth from "../auth/UserAuth";
import { useContext } from "react";
import { UserContext } from "../context/user.context";

const AppRoutes = () => {
  const { user, loading } = useContext(UserContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Loading...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/home" /> : <Login />} />
        <Route path="/login" element={user ? <Navigate to="/home" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/home" /> : <Register />} />
        <Route
          path="/home"
          element={
            <UserAuth>
              <Home />
            </UserAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <UserAuth>
              <Dashboard />
            </UserAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <UserAuth>
              <Profile />
            </UserAuth>
          }
        />
        <Route
          path="/group/:groupId"
          element={
            <UserAuth>
              <Group />
            </UserAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRoutes;
