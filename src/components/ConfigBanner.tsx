"use client";

import { AlertTriangle } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-center text-sm text-yellow-200">
      <span className="inline-flex items-center gap-2">
        <AlertTriangle size={15} />
        Supabase isn&apos;t configured yet. Add your keys to{" "}
        <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">.env.local</code> and restart
        the dev server. See the README.
      </span>
    </div>
  );
}
