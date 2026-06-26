import Script from "next/script";

export default function AdsterraSidebar() {
  return (
    <aside
      className="fixed right-4 top-[120px] z-[99] hidden h-[600px] w-40 overflow-hidden lg:block"
      aria-label="Advertisement"
    >
      <Script id="adsterra-config" strategy="afterInteractive">
        {`
          atOptions = {
            'key' : 'c52a16f07ce586730d804ac8f6804a35',
            'format' : 'iframe',
            'height' : 600,
            'width' : 160,
            'params' : {}
          };
        `}
      </Script>
      <Script
        src="https://www.highperformanceformat.com/c52a16f07ce586730d804ac8f6804a35/invoke.js"
        strategy="afterInteractive"
      />
    </aside>
  );
}
