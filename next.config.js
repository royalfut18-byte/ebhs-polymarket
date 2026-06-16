/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We rely on TypeScript for type-safety during the build. ESLint is run
  // separately via `npm run lint` so a stylistic lint warning never blocks a build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Allow remote market images (admins can paste any image URL).
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

module.exports = nextConfig;
