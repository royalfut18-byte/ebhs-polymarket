"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Instagram, Loader2, UserX, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { fetchAllProfiles, fetchProfilesPrivate } from "@/lib/queries";
import type { Profile, ProfilePrivate } from "@/lib/types";
import Avatar from "@/components/Avatar";

// Admin-only queue of sign-up requests awaiting approval. Approving lifts the
// account's ban so it can log in; declining keeps it banned. Both run through
// SECURITY DEFINER RPCs (admin_approve_user / admin_decline_user).
export default function AccountApprovals() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: fetchAllProfiles,
  });
  const { data: privateMap = {} } = useQuery({
    queryKey: ["profiles-private"],
    queryFn: fetchProfilesPrivate,
  });

  const pending = users.filter((u) => u.approval_status === "pending");
  const declined = users.filter((u) => u.approval_status === "declined");

  if (isLoading) {
    return <div className="card py-10 text-center text-sm text-ink-faint">Loading requests…</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-bg-soft p-3 text-sm text-ink-dim">
        New sign-ups can&apos;t log in until you approve them here. Approving lets them log in with
        their username and password; declining keeps them locked out.
      </div>

      <Section
        title="Pending requests"
        icon={<Clock size={15} className="text-yellow-300" />}
        count={pending.length}
        empty="No accounts waiting for approval. 🎉"
      >
        {pending.map((u) => (
          <ApprovalRow key={u.id} user={u} priv={privateMap[u.id]} queryClient={queryClient} />
        ))}
      </Section>

      {declined.length > 0 && (
        <Section
          title="Declined"
          icon={<UserX size={15} className="text-no-text" />}
          count={declined.length}
          empty=""
        >
          {declined.map((u) => (
            <ApprovalRow
              key={u.id}
              user={u}
              priv={privateMap[u.id]}
              queryClient={queryClient}
              declined
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
        <span className="rounded-full bg-bg-hover px-2 py-0.5 text-xs font-medium text-ink-dim">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div className="card py-8 text-center text-sm text-ink-faint">{empty}</div>
      ) : (
        <div className="card divide-y divide-border">{children}</div>
      )}
    </div>
  );
}

function ApprovalRow({
  user,
  priv,
  queryClient,
  declined,
}: {
  user: Profile;
  priv?: ProfilePrivate;
  queryClient: ReturnType<typeof useQueryClient>;
  declined?: boolean;
}) {
  const supabase = getSupabase();
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(action: "approve" | "decline") {
    setBusy(action);
    setErr(null);
    const fn = action === "approve" ? "admin_approve_user" : "admin_decline_user";
    const { error } = await supabase.rpc(fn, { p_user_id: user.id });
    setBusy(null);
    if (error) {
      setErr(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
  }

  const insta = priv?.instagram?.trim().replace(/^@+/, "");

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={user.username} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">@{user.username}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-dim">
          <span>{priv?.full_name?.trim() || <span className="text-ink-faint">no name given</span>}</span>
          {insta ? (
            <a
              href={`https://instagram.com/${insta}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              <Instagram size={12} /> @{insta}
            </a>
          ) : (
            <span className="text-ink-faint">no Instagram</span>
          )}
          <span className="text-ink-faint">
            {new Date(user.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        {err && <div className="mt-1 text-xs text-no-text">{err}</div>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!declined && (
          <button
            onClick={() => run("decline")}
            disabled={!!busy}
            className="btn border border-no/40 bg-no/10 px-3 py-1.5 text-xs text-no-text hover:bg-no/25"
          >
            {busy === "decline" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
            Decline
          </button>
        )}
        <button
          onClick={() => run("approve")}
          disabled={!!busy}
          className="btn bg-yes px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
        >
          {busy === "approve" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {declined ? "Approve anyway" : "Approve"}
        </button>
      </div>
    </div>
  );
}
