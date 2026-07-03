import { useContext } from "react";
import { Link } from "react-router-dom";
import { UserContext } from "../context/user.context";

const Profile = () => {
  const { user } = useContext(UserContext);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] bg-slate-900/90 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300/90">
                Profile
              </p>
              <h1 className="mt-4 text-4xl font-semibold text-white">
                Your account details
              </h1>
              <p className="mt-3 max-w-2xl text-slate-400">
                Manage your profile, view your email, and jump back into rooms
                or analytics.
              </p>
            </div>
            <Link
              to="/home"
              className="inline-flex rounded-3xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white"
            >
              Back to Rooms
            </Link>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-[1.75rem] bg-slate-950/80 p-8 ring-1 ring-white/10 shadow-xl">
              <h2 className="text-xl font-semibold text-white">Account</h2>
              <div className="mt-6 space-y-5 text-slate-300">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">
                    Name
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {user?.name || "Anonymous"}
                  </p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">
                    Email
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {user?.email || "Not available"}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[1.75rem] bg-slate-950/80 p-8 ring-1 ring-white/10 shadow-xl">
              <h2 className="text-xl font-semibold text-white">Membership</h2>
              <div className="mt-6 space-y-5 text-slate-300">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">
                    Role
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Collaborator
                  </p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">
                    Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Active
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Profile;
