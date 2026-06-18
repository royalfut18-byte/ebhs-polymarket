import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// Change the caller's own username. The username doubles as the local-part of
// the login email (username@<domain>), so we must update BOTH auth.users.email
// and profiles.username, or the user could no longer log in. This needs the
// service-role key (auth email lives in auth.users), so we verify the caller
// from their Bearer token and only ever act on their own account.

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let payload: { username?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const username = (payload.username ?? "").trim().toLowerCase();

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–20 characters: letters, numbers or underscores." },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server isn't configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local." },
      { status: 500 }
    );
  }

  // Identify the caller from their token.
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const uid = caller.user.id;

  // Current username — no-op if unchanged.
  const { data: me } = await admin.from("profiles").select("username").eq("id", uid).single();
  if (me?.username === username) {
    return NextResponse.json({ ok: true, username });
  }

  // Reject taken usernames up front for a friendly message.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || "ebhs.local";
  const newEmail = `${username}@${domain}`;

  // 1. Update the auth email first (keeps login working with the new username).
  const { error: emailErr } = await admin.auth.admin.updateUserById(uid, {
    email: newEmail,
    email_confirm: true,
  });
  if (emailErr) {
    const msg = emailErr.message.toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ error: emailErr.message }, { status: 400 });
  }

  // 2. Update the public profile. display_name mirrors the username (no real
  //    names in public). If this fails, revert the email so login isn't broken.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ username, display_name: username })
    .eq("id", uid);
  if (profileErr) {
    const prevEmail = caller.user.email;
    if (prevEmail) {
      await admin.auth.admin.updateUserById(uid, { email: prevEmail, email_confirm: true });
    }
    const msg = profileErr.message.toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, username });
}
