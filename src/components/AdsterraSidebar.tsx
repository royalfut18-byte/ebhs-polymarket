export default function AdsterraSidebar() {
  return (
    // The page content is centred at max-w-7xl (1280px). Only show the 160px
    // banner once the viewport is wide enough for it to sit in the right gutter
    // WITHOUT overlapping content (~1640px+); below that it's hidden so it never
    // covers the UI/games.
    <aside
      className="fixed right-3 top-1/2 z-[40] hidden h-[600px] w-40 -translate-y-1/2 overflow-hidden min-[1640px]:block"
      aria-label="Advertisement"
    >
      <iframe
        src="/ad-sidebar.html"
        width={160}
        height={600}
        title="Advertisement"
        className="border-0"
      />
    </aside>
  );
}
