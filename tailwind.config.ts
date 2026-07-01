import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Season 2 — deep navy-blue "Polymarket" palette
        bg: {
          DEFAULT: "#0a1424",
          soft: "#0d1a2e",
          card: "#112138",
          hover: "#172b49",
          elevated: "#1d3458",
        },
        border: {
          DEFAULT: "rgba(120,160,230,0.12)",
          soft: "rgba(120,160,230,0.20)",
          strong: "rgba(120,160,230,0.30)",
        },
        ink: {
          DEFAULT: "#eef3fc",
          dim: "#93a4c4",
          faint: "#5c6e8e",
        },
        yes: {
          DEFAULT: "#22c55e",
          soft: "#0f2a1b",
          text: "#4ade80",
        },
        no: {
          DEFAULT: "#f43f5e",
          soft: "#2c1119",
          text: "#fb7185",
        },
        brand: {
          DEFAULT: "#2f80ff",
          dark: "#1c63e6",
          light: "#6aa6ff",
          glow: "#3d8bff",
        },
        accent: {
          violet: "#3b82f6",
          cyan: "#38bdf8",
        },
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "26px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 10px 30px -16px rgba(0,0,0,0.8)",
        lift: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 50px -20px rgba(0,0,0,0.85)",
        glow: "0 0 0 1px rgba(47,128,255,0.40), 0 12px 40px -12px rgba(47,128,255,0.50)",
        "glow-yes": "0 0 0 1px rgba(34,197,94,0.35), 0 12px 40px -12px rgba(34,197,94,0.4)",
        "glow-no": "0 0 0 1px rgba(244,63,94,0.35), 0 12px 40px -12px rgba(244,63,94,0.4)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #3d8bff 0%, #1c63e6 100%)",
        "brand-sheen": "linear-gradient(135deg, #6aa6ff 0%, #38bdf8 100%)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "gradient-pan": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        float: "float 6s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease both",
        "gradient-pan": "gradient-pan 8s ease infinite",
      },
    },
  },
  plugins: [],
};

export default config;
