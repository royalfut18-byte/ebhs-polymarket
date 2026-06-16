// ============================================================================
// EBHS Polymarket — seed script
//
//   node scripts/seed.mjs   (or: npm run seed)
//
// Creates the default admin account and a handful of sample markets.
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local,
// and the SQL migration (supabase/migrations/0001_init.sql) to have been run.
//
// All currency is FAKE play money.
// ============================================================================

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || "ebhs.local";

if (!url || !serviceKey) {
  console.error(
    "\n✖ Missing env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.\n"
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Default/dev admin credentials. CHANGE THE PASSWORD for any real deployment.
const ADMIN = { username: "ashaz", password: "12345678", display: "Ashaz" };

// LMSR: q_yes = b * ln(p / (1 - p)), q_no = 0  =>  starting YES price = p
const qYesFor = (p, b) => b * Math.log(p / (1 - p));

const SAMPLE_MARKETS = [
  {
    question: "Will EBHS win the homecoming football game?",
    description: "Resolves YES if the EBHS varsity team wins this Friday's homecoming game.",
    category: "Sports",
    image: "🏈",
    prob: 0.6,
    b: 120,
  },
  {
    question: "Will school be cancelled for snow before March?",
    description: "Resolves YES if EBHS has at least one official snow day before March 1.",
    category: "School",
    image: "❄️",
    prob: 0.35,
    b: 100,
  },
  {
    question: "Will the cafeteria bring back the pizza Fridays?",
    description: "Resolves YES if pizza is served on a Friday at least once this semester.",
    category: "School",
    image: "🍕",
    prob: 0.72,
    b: 80,
  },
  {
    question: "Will senior prom be held off-campus this year?",
    description: "Resolves YES if the official prom venue is off school grounds.",
    category: "Random",
    image: "🎉",
    prob: 0.5,
    b: 100,
  },
  {
    question: "Will the class president meme account hit 1,000 followers?",
    description: "Resolves YES if the account reaches 1,000 followers before the end of term.",
    category: "Memes",
    image: "😹",
    prob: 0.28,
    b: 90,
  },
  {
    question: "Will the student council pass the new dress code proposal?",
    description: "Resolves YES if the proposal passes the next council vote.",
    category: "Politics",
    image: "🏛️",
    prob: 0.45,
    b: 110,
  },
];

async function ensureAdmin() {
  const email = `${ADMIN.username}@${domain}`;
  let userId;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: ADMIN.password,
    email_confirm: true,
    user_metadata: { username: ADMIN.username, full_name: ADMIN.display, instagram: "" },
  });

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      console.log("• Admin user already exists — ensuring role is set.");
      const { data: prof } = await admin
        .from("profiles")
        .select("id")
        .eq("username", ADMIN.username)
        .maybeSingle();
      if (prof) {
        userId = prof.id;
      } else {
        const { data: list } = await admin.auth.admin.listUsers();
        userId = list?.users?.find((u) => u.email === email)?.id;
      }
    } else {
      throw error;
    }
  } else {
    userId = data.user.id;
    console.log("• Created admin auth user.");
  }

  if (!userId) throw new Error("Could not determine the admin user id.");

  const { error: upErr } = await admin
    .from("profiles")
    .update({ role: "admin", display_name: ADMIN.display })
    .eq("id", userId);
  if (upErr) throw upErr;

  console.log(`✔ Admin ready:  username "${ADMIN.username}"  password "${ADMIN.password}"`);
  return userId;
}

async function seedMarkets(adminId) {
  const { count, error: cErr } = await admin
    .from("markets")
    .select("*", { count: "exact", head: true });
  if (cErr) throw cErr;

  if (count && count > 0) {
    console.log(`• ${count} market(s) already exist — skipping sample markets.`);
    return;
  }

  const rows = SAMPLE_MARKETS.map((m) => ({
    question: m.question,
    description: m.description,
    category: m.category,
    image_url: m.image,
    created_by: adminId,
    status: "open",
    b: m.b,
    q_yes: qYesFor(m.prob, m.b),
    q_no: 0,
    initial_prob: m.prob,
  }));

  const { error } = await admin.from("markets").insert(rows);
  if (error) throw error;
  console.log(`✔ Inserted ${rows.length} sample markets.`);
}

async function main() {
  console.log("\nSeeding EBHS Polymarket…\n");
  const adminId = await ensureAdmin();
  await seedMarkets(adminId);
  console.log("\n✅ Done. Log in at /login with the admin credentials above.\n");
}

main().catch((err) => {
  console.error("\n✖ Seed failed:", err.message ?? err);
  console.error("  Make sure the SQL migration has been run on your Supabase project.\n");
  process.exit(1);
});
