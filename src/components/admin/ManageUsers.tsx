"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Instagram, Loader2, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchAllProfiles, fetchProfilesPrivate } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import type { Profile, ProfilePrivate } from "@/lib/types";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/components/AuthProvider";

export default function ManageUsers() {
  const { isAdmin } = useAuth();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: fetchAllProfiles,
  });

  // Private info (real name + Instagram) is admin-only.
  const { data: privateMap = {} } = useQuery({
    queryKey: ["profiles-private"],
    queryFn: fetchProfilesPrivate,
    enabled: isAdmin,
  });

  if (isLoading) {
    return <div className="card py-10 text-center text-sm text-ink-faint">Loading users…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {!isAdmin && (
        <div className="rounded-xl border border-border bg-bg-soft p-3 text-sm text-ink-dim">
          You can view players here. Adjusting balances, roles, and seeing private contact info is
          admin-only.
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Name / Instagram</th>}
              <th className="px-4 py-3 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} isAdmin={isAdmin} priv={privateMap[u.id]} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  user,
  isAdmin,
  priv,
}: {
  user: Profile;
  isAdmin: boolean;
  priv?: ProfilePrivate;
}) {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(user.balance));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = Number(value) !== Number(user.balance);

  async function deleteUser() {
    if (
      !confirm(
        `Delete @${user.username}? This removes their account and all their positions across every market. This cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    setErr(null);
    const { error } = await supabase.rpc("admin_delete_user", { p_user_id: user.id });
    setDeleting(false);
    if (error) {
      setErr(error.message);
    } else {
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["market-stats"] });
    }
  }

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
          <Avatar name={user.username} size={30} />
          <div className="min-w-0 font-medium text-ink">@{user.username}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs font-medium capitalize text-ink-dim">
          {user.role}
        </span>
      </td>
      {isAdmin && (
        <td className="px-4 py-3 text-sm">
          <div className="text-ink">{priv?.full_name?.trim() || <span className="text-ink-faint">—</span>}</div>
          {priv?.instagram?.trim() ? (
            <a
              href={`https://instagram.com/${priv.instagram.replace(/^@+/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
            >
              <Instagram size={12} /> @{priv.instagram.replace(/^@+/, "")}
            </a>
          ) : (
            <span className="text-xs text-ink-faint">no Instagram</span>
          )}
        </td>
      )}
      <td className="px-4 py-3">
        {isAdmin ? (
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
            {user.role !== "admin" && (
              <button
                onClick={deleteUser}
                disabled={deleting}
                className="btn shrink-0 border border-no/40 bg-no/10 px-2.5 py-1.5 text-xs text-no-text hover:bg-no/25"
                aria-label="Delete user"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
            {err && <span className="text-xs text-no-text">{err}</span>}
          </div>
        ) : (
          <span className="text-ink">{formatMoney(user.balance)}</span>
        )}
      </td>
    </tr>
  );
}
