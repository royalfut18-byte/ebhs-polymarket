"use client";

import { Clock, LogOut, UserX } from "lucide-react";
import { useAuth } from "./AuthProvider";

// Whole-app gate. New accounts are banned in auth until approved, so a pending
// user normally can't even get a session — but if an approved user is declined
// mid-session (their JWT stays valid until it refreshes), this catches it and
// shows the waiting / declined screen instead of the app.
export default function AppGate({ children }: { children: React.ReactNode }) {
  const { session, profile, approvalStatus, signOut } = useAuth();

  // Only gate a real, loaded session whose profile is explicitly not approved.
  if (session && profile && approvalStatus && approvalStatus !== "approved") {
    const declined = approvalStatus === "declined";
    return (
      <div className="mx-auto mt-12 w-full max-w-md">
        <div className="card flex flex-col items-center gap-3 p-7 text-center">
          <span
            className={
              "flex h-12 w-12 items-center justify-center rounded-2xl " +
              (declined ? "bg-no/15 text-no-text" : "bg-yellow-400/15 text-yellow-300")
            }
          >
            {declined ? <UserX size={24} /> : <Clock size={24} />}
          </span>
          <h1 className="text-xl font-bold">
            {declined ? "Account not approved" : "Waiting for sign-up approval"}
          </h1>
          <p className="text-sm text-ink-dim">
            {declined
              ? "An admin didn't approve this account, so it can't access the app."
              : "An admin needs to approve your account before you can start trading. You'll get in as soon as they do."}
          </p>
          <button onClick={() => signOut()} className="btn btn-ghost mt-1 w-full">
            <LogOut size={15} /> Log out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
