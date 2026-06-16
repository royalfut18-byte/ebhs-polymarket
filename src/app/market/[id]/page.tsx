import { Suspense } from "react";
import MarketDetail from "@/components/MarketDetail";

export default function MarketPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="py-20 text-center text-ink-faint">Loading market…</div>}>
      <MarketDetail id={params.id} />
    </Suspense>
  );
}
