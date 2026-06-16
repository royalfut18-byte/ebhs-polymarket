import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep, slightly indigo-tinted dark palette
        bg: {
          DEFAULT: "#08080d",
          soft: "#0e0e16",
          card: "#13131d",
          hover: "#1b1b28",
          elevated: "#20202e",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.07)",
          soft: "rgba(255,255,255,0.12)",
          strong: "rgba(255,255,255,0.18)",
        },
        ink: {
          DEFAULT: "#f4f4f7",
          dim: "#9d9dac",
          faint: "#63636f",
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
          DEFAULT: "#5b7cfa",
          dark: "#4259d8",
          light: "#8aa0ff",
          glow: "#6d8bff",
        },
        accent: {
          violet: "#a855f7",
          cyan: "#22d3ee",
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
        glow: "0 0 0 1px rgba(91,124,250,0.35), 0 12px 40px -12px rgba(91,124,250,0.45)",
        "glow-yes": "0 0 0 1px rgba(34,197,94,0.35), 0 12px 40px -12px rgba(34,197,94,0.4)",
        "glow-no": "0 0 0 1px rgba(244,63,94,0.35), 0 12px 40px -12px rgba(244,63,94,0.4)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #5b7cfa 0%, #8b5cf6 100%)",
        "brand-sheen": "linear-gradient(135deg, #6d8bff 0%, #22d3ee 100%)",
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
