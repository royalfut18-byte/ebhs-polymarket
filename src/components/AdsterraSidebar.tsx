export default function AdsterraSidebar() {
  return (
    <aside
      className="fixed right-2 top-1/2 z-[99] hidden h-[600px] w-40 -translate-y-1/2 overflow-hidden md:block"
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
