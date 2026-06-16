import { Suspense } from "react";
import HomeClient from "@/components/HomeClient";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-ink-faint">Loading markets…</div>}>
      <HomeClient />
    </Suspense>
  );
}
