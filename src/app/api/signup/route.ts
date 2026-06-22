import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// Server-side signup. We create the auth user with the SERVICE ROLE key and
// email_confirm:true so the fake "@ebhs.local" address never needs a real
// confirmation email. The new-user trigger then creates a profile with 1000
// play credits. The client signs in with the same username + password.
//
// Abuse control: every attempt is logged by client IP (signup_attempts table,
// migration 0025). An IP that already created an account in the last hour — or
// that has hammered too many attempts in that window — is turned away. This is
// what stops a bot mass-creating accounts / spamming approval requests.

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS_PER_WINDOW = 8; // failed-attempt hammer guard

// Best-effort client IP. Behind Vercel/most proxies x-forwarded-for is set to
// "client, proxy1, ..."; the first entry is the real client.
function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

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
  if (!instagram) {
    return NextResponse.json(
      { error: "Instagram is required (used for prize claims)." },
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

  const ip = getClientIp(req);
  const recordAttempt = (success: boolean) =>
    admin.from("signup_attempts").insert({ ip, username, success });

  // IP throttle: one account per IP per hour, plus a hammer guard on repeated
  // attempts. Skipped outside production (no proxy → no real IP locally).
  if (process.env.NODE_ENV === "production") {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from("signup_attempts")
      .select("success")
      .eq("ip", ip)
      .gt("created_at", since);
    const attempts = recent ?? [];
    const madeAccount = attempts.some((a) => a.success);
    if (madeAccount || attempts.length >= MAX_ATTEMPTS_PER_WINDOW) {
      return NextResponse.json(
        {
          error:
            "Too many sign-ups from your network. Please wait an hour before creating another account.",
        },
        { status: 429 }
      );
    }
  }

  // Reject taken usernames up front for a friendlier message.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    await recordAttempt(false);
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

  await recordAttempt(!error);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
