import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Polymarket-ish dark palette
        bg: {
          DEFAULT: "#0d0d12",
          soft: "#13131a",
          card: "#16161f",
          hover: "#1c1c27",
        },
        border: {
          DEFAULT: "#23232e",
          soft: "#2a2a37",
        },
        ink: {
          DEFAULT: "#f5f5f7",
          dim: "#a1a1ac",
          faint: "#6b6b78",
        },
        yes: {
          DEFAULT: "#27ae60",
          soft: "#1e3a2c",
          text: "#4ade80",
        },
        no: {
          DEFAULT: "#e0524b",
          soft: "#3a1e1e",
          text: "#f87171",
        },
        brand: {
          DEFAULT: "#2d7ff9",
          dark: "#1f5fd0",
        },
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
