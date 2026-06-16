import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// Server-side signup. We create the auth user with the SERVICE ROLE key and
// email_confirm:true so the fake "@ebhs.local" address never needs a real
// confirmation email. The new-user trigger then creates a profile with 1000
// play credits. The client signs in with the same username + password.

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(req: Request) {
  let payload: {
    username?: string;
    password?: string;
    fullName?: string;
    instagram?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = (payload.username ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  const fullName = (payload.fullName ?? "").trim();
  // normalise instagram: strip a leading "@" if present
  const instagram = (payload.instagram ?? "").trim().replace(/^@+/, "");

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–20 characters: letters, numbers or underscores." },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
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

  // Reject taken usernames up front for a friendlier message.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || "ebhs.local";
  const email = `${username}@${domain}`;

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName, instagram },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
