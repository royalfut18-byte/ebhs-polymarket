export default function AdsterraSidebar() {
  return (
    // Shown from 1200px wide. At that point the page content reserves a right
    // gutter (see <main> in layout.tsx), so the banner sits cleanly in it and
    // never overlaps the UI — and it shows at normal 100% zoom on laptops.
    <aside
      className="fixed right-3 top-1/2 z-[40] hidden h-[600px] w-40 -translate-y-1/2 overflow-hidden min-[1200px]:block"
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
