import { useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../context/user.context";
import axios from "../config/axios";
import { getErrorMessage, showError, showSuccess } from "../utils/toast";
import { resetSessionInvalidation } from "../utils/session";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  function submitHandler(e) {
    e.preventDefault();
    setError("");

    axios
      .post("/users/register", {
        name,
        email,
        password,
      })
      .then((res) => {
        resetSessionInvalidation();
        localStorage.setItem("token", res.data.token);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        setUser(res.data.user);
        showSuccess("Account created successfully");
        navigate("/home");
      })
      .catch((err) => {
        const message = getErrorMessage(
          err,
          "Unable to register. Please try again.",
        );
        setError(message);
        showError(message);
      });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-8 shadow-[0_25px_100px_-40px_rgba(14,165,233,0.5)] backdrop-blur-xl sm:p-12">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/90">
              Join Seon
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Build rooms, collaborate, and chat with AI.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Create your account to access shared rooms, invite teammates, and
              use @ai for instant responses.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.75rem] bg-slate-950/80 p-8 ring-1 ring-white/10 shadow-xl">
              <h2 className="text-xl font-semibold text-white">
                Create your workspace
              </h2>
              <form onSubmit={submitHandler} className="mt-8 space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-slate-300"
                  >
                    Name
                  </label>
                  <input
                    onChange={(e) => setName(e.target.value)}
                    value={name}
                    type="text"
                    id="name"
                    className="w-full rounded-3xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                    placeholder="Your full name"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-slate-300"
                  >
                    Email
                  </label>
                  <input
                    onChange={(e) => setEmail(e.target.value)}
                    value={email}
                    type="email"
                    id="email"
                    className="w-full rounded-3xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-300"
                  >
                    Password
                  </label>
                  <input
                    onChange={(e) => setPassword(e.target.value)}
                    value={password}
                    type="password"
                    id="password"
                    className="w-full rounded-3xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                    placeholder="Create a password"
                  />
                </div>
                {error && <p className="text-sm text-rose-400">{error}</p>}
                <button
                  type="submit"
                  className="w-full rounded-3xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-950 transition duration-200 hover:brightness-110"
                >
                  Create account
                </button>
              </form>
            </div>

            <div className="rounded-[1.75rem] border border-slate-700 bg-slate-950/70 p-8">
              <h2 className="text-xl font-semibold text-white">
                Already a member?
              </h2>
              <p className="mt-4 text-slate-400">
                Log in to access your rooms, invite teammates, and start
                chatting with AI.
              </p>
              <Link
                to="/login"
                className="mt-8 inline-flex rounded-3xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white"
              >
                Login
              </Link>
              <div className="mt-10 space-y-4 rounded-3xl bg-slate-900/90 p-5 text-sm text-slate-400">
                <p className="font-medium text-slate-200">AI chat tip</p>
                <p>
                  Add <span className="text-cyan-300">@ai</span> to any message
                  to speak with the room assistant.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
