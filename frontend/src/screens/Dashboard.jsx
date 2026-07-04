import { useEffect, useState } from "react";
import axios from "../config/axios";
import { getErrorMessage, showError } from "../utils/toast";
import { Link } from "react-router-dom";

const Dashboard = () => {
  const [stats, setStats] = useState({ groups: 0, collaborators: 0 });
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    axios
      .get("/groups/all")
      .then((res) => {
        const groups = res.data.groups || [];
        const collaborators = groups.reduce(
          (sum, group) => sum + (group.members?.length || 0),
          0,
        );
        setStats({ groups: groups.length, collaborators });
        setRooms(groups.slice(0, 4));
      })
      .catch((err) => {
        showError(getErrorMessage(err, "Failed to load dashboard data."));
      });
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-[2rem] bg-slate-900/90 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/90">
                Dashboard
              </p>
              <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">
                Rooms, collaborators, and AI at a glance.
              </h1>
              <p className="mt-4 max-w-2xl text-slate-400">
                Monitor your active rooms, invite teammates, and jump straight
                into the latest collaboration spaces.
              </p>
            </div>
            <Link
              to="/home"
              className="inline-flex rounded-3xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105"
            >
              Back to Rooms
            </Link>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <section className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-2xl ring-1 ring-white/10">
                <p className="text-sm uppercase tracking-[0.26em] text-cyan-300/80">
                  Rooms
                </p>
                <p className="mt-4 text-5xl font-semibold text-white">
                  {stats.groups}
                </p>
                <p className="mt-2 text-slate-400">
                  Active rooms you own or collaborate in.
                </p>
              </div>
              <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-2xl ring-1 ring-white/10">
                <p className="text-sm uppercase tracking-[0.26em] text-cyan-300/80">
                  Collaborators
                </p>
                <p className="mt-4 text-5xl font-semibold text-white">
                  {stats.collaborators}
                </p>
                <p className="mt-2 text-slate-400">
                  Team members connected across your rooms.
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-2xl ring-1 ring-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">
                  Recent Rooms
                </h2>
                <Link
                  to="/home"
                  className="text-sm text-cyan-300 hover:text-cyan-200"
                >
                  View all
                </Link>
              </div>
              <div className="mt-6 space-y-4">
                {rooms.length > 0 ? (
                  rooms.map((room) => (
                    <div
                      key={room._id}
                      className="rounded-3xl bg-slate-950/80 p-4 ring-1 ring-white/5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            {room.groupName}
                          </h3>
                          <p className="mt-1 text-sm text-slate-400">
                            {room.owner?.email || "Room owner"}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                          {room.members?.length || 0} members
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400">No rooms found yet.</p>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-2xl ring-1 ring-white/10">
              <h2 className="text-xl font-semibold text-white">
                Quick Actions
              </h2>
              <ul className="mt-6 space-y-4 text-slate-400">
                <li className="rounded-3xl bg-slate-950/80 p-4 ring-1 ring-white/5">
                  <p className="font-semibold text-white">Create a new room</p>
                  <p className="mt-2 text-sm">
                    Click Rooms and start a new collaboration space in seconds.
                  </p>
                </li>
                <li className="rounded-3xl bg-slate-950/80 p-4 ring-1 ring-white/5">
                  <p className="font-semibold text-white">Use @ai in chat</p>
                  <p className="mt-2 text-sm">
                    Ask the AI assistant in any room for instant help.
                  </p>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default Dashboard;
