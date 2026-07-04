import React from "react";
import { Toaster } from "react-hot-toast";
import AppRoutes from "./routes/AppRoutes";
import { UserProvider } from "./context/user.context";

const App = () => {
  return (
    <UserProvider>
      <AppRoutes />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3200,
          style: {
            background: "#0f172a",
            color: "#f8fafc",
            border: "1px solid rgba(255,255,255,0.08)",
          },
          success: {
            iconTheme: {
              primary: "#22d3ee",
              secondary: "#0f172a",
            },
          },
          error: {
            iconTheme: {
              primary: "#f87171",
              secondary: "#0f172a",
            },
          },
        }}
      />
    </UserProvider>
  );
};

export default App;
