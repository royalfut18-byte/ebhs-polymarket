import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// Admin-only: set a new password for another user. Uses the SERVICE ROLE key
// (which can change any password), so we MUST verify server-side that the
// caller is actually an admin before doing anything. The caller sends their
// Supabase access token as a Bearer header.

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let payload: { userId?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const userId = (payload.userId ?? "").trim();
  const password = payload.password ?? "";
  if (!userId) {
    return NextResponse.json({ error: "Missing user." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
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

  // 1. Resolve + verify the caller from their token.
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  // 2. Don't let an admin reset another admin's password (only their own).
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.role === "admin" && userId !== caller.user.id) {
    return NextResponse.json(
      { error: "You can't reset another admin's password." },
      { status: 403 }
    );
  }

  // 3. Set the new password.
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
