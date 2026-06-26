export default function AdsterraSidebar() {
  return (
    <aside
      className="fixed right-4 top-[120px] z-[99] hidden h-[600px] w-40 overflow-hidden lg:block"
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
