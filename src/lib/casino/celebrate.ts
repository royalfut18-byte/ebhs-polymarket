// Fires a confetti burst on a casino win. `big` for a heavier, double burst
// on large multipliers. Confetti is lazy-loaded so it never blocks the bundle.
export async function celebrate(big = false) {
  if (typeof window === "undefined") return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#fbbf24", "#a855f7", "#5b7cfa", "#22d3ee", "#22c55e", "#f43f5e"];
  confetti({
    particleCount: big ? 180 : 90,
    spread: big ? 100 : 65,
    startVelocity: 45,
    origin: { y: 0.62 },
    colors,
  });
  if (big) {
    setTimeout(
      () => confetti({ particleCount: 120, spread: 130, scalar: 0.9, origin: { y: 0.55 }, colors }),
      220
    );
  }
}
