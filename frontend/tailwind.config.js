/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Premium global-finance palette
        charcoal: {
          DEFAULT: "#0C0C0D",
          950: "#070709",
          900: "#0C0C0D",
          800: "#141416",
          700: "#1A1A1D",
          600: "#222226",
          500: "#2C2C31",
        },
        ivory: {
          DEFAULT: "#F2F0EC",
          50: "#FAFAF7",
          100: "#F2F0EC",
          200: "#DCD8D0",
          300: "#C8C4BC",
        },
        sand: {
          DEFAULT: "#C8C4BC",
          200: "#DCD8D0",
          300: "#C8C4BC",
          400: "#9A968E",
          500: "#6E6B65",
        },
        forest: {
          DEFAULT: "#A8F060",
          300: "#C5F58E",
          400: "#A8F060",
          500: "#8FDB45",
          600: "#6FB52E",
          700: "#4F8A1F",
        },
        amber: {
          DEFAULT: "#A8F060",
          200: "#D6F8AF",
          300: "#C5F58E",
          400: "#A8F060",
          500: "#8FDB45",
          600: "#6FB52E",
          700: "#4F8A1F",
        },
        copper: "#A8F060",
        clay: {
          DEFAULT: "#C8C4BC",
          400: "#DCD8D0",
          500: "#C8C4BC",
          600: "#9A968E",
        },
        // Backward-compatible aliases used across pages
        btc: "#A8F060",
        ink: "#0C0C0D",
        musd: "#A8F060",
        ok: "#A8F060",
        warn: "#A8F060",
        danger: "#C8C4BC",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Syne", "Inter", "system-ui", "sans-serif"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        "card-lg":
          "0 1px 0 0 rgba(242, 240, 236, 0.03) inset, 0 24px 48px -24px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(168,240,96,0.22), 0 18px 40px -20px rgba(168,240,96,0.35)",
      },
      backgroundImage: {
        "amber-sheen":
          "linear-gradient(135deg, #C5F58E 0%, #A8F060 45%, #8FDB45 100%)",
        "ivory-sheen":
          "linear-gradient(135deg, #FAFAF7 0%, #F2F0EC 50%, #DCD8D0 100%)",
      },
    },
  },
  plugins: [],
};
