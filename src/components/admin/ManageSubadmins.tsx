"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield, ShieldOff } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchAllProfiles } from "@/lib/queries";
import type { Profile } from "@/lib/types";
import Avatar from "@/components/Avatar";

export default function ManageSubadmins() {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: fetchAllProfiles,
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setRole(user: Profile, role: "user" | "subadmin") {
    setBusyId(user.id);
    setError(null);
    const { error } = await supabase.rpc("admin_set_role", { p_user_id: user.id, p_role: role });
    setBusyId(null);
    if (error) setError(error.message);
    else queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
  }

  if (isLoading) {
    return <div className="card py-10 text-center text-sm text-ink-faint">Loading…</div>;
  }

  const admins = users.filter((u) => u.role === "admin");
  const others = users.filter((u) => u.role !== "admin");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-bg-soft p-3 text-sm text-ink-dim">
        Sub-admins can create, edit and resolve markets — but cannot manage users, adjust balances,
        or change roles. Admins are shown for reference and can&apos;t be changed here.
      </div>

      {error && (
        <div className="rounded-xl border border-no/30 bg-no/10 p-3 text-sm text-no-text">
          {error}
        </div>
      )}

      <div className="card divide-y divide-border">
        {admins.map((u) => (
          <Row key={u.id} user={u}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand">
              <Shield size={13} /> Admin
            </span>
          </Row>
        ))}
        {others.map((u) => {
          const busy = busyId === u.id;
          const isSub = u.role === "subadmin";
          return (
            <Row key={u.id} user={u}>
              {isSub ? (
                <button
                  onClick={() => setRole(u, "user")}
                  disabled={busy}
                  className="btn px-3 py-1.5 text-xs bg-no/15 text-no-text hover:bg-no/25"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
                  Remove sub-admin
                </button>
              ) : (
                <button
                  onClick={() => setRole(u, "subadmin")}
                  disabled={busy}
                  className="btn px-3 py-1.5 text-xs bg-brand/15 text-brand hover:bg-brand/25"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                  Make sub-admin
                </button>
              )}
            </Row>
          );
        })}
      </div>
    </div>
  );
}

function Row({ user, children }: { user: Profile; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar name={user.username} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink">@{user.username}</span>
          {user.role === "subadmin" && (
            <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs font-medium text-ink-dim">
              sub-admin
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
