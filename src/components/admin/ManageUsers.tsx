"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchAllProfiles } from "@/lib/queries";
import { formatCredits } from "@/lib/format";
import type { Profile } from "@/lib/types";
import Avatar from "@/components/Avatar";

export default function ManageUsers() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: fetchAllProfiles,
  });

  if (isLoading) {
    return <div className="card py-10 text-center text-sm text-ink-faint">Loading users…</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Balance (credits)</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ user }: { user: Profile }) {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(user.balance));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const name = user.display_name || user.username;
  const dirty = Number(value) !== Number(user.balance);

  async function save() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    const { error } = await supabase.rpc("admin_set_balance", {
      p_user_id: user.id,
      p_balance: Number(value) || 0,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    }
  }

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={name} size={30} />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{name}</div>
            <div className="truncate text-xs text-ink-faint">@{user.username}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs font-medium capitalize text-ink-dim">
          {user.role}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input w-32"
          />
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="btn btn-ghost px-2.5 py-1.5 text-xs"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : saved ? (
              <Check size={13} className="text-yes-text" />
            ) : (
              "Set"
            )}
          </button>
          {!dirty && !saving && (
            <span className="text-xs text-ink-faint">{formatCredits(user.balance)}</span>
          )}
        </div>
        {err && <div className="mt-1 text-xs text-no-text">{err}</div>}
      </td>
    </tr>
  );
}
