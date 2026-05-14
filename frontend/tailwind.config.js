/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Premium global-finance palette
        charcoal: {
          DEFAULT: "#14110F",
          950: "#0B0908",
          900: "#14110F",
          800: "#1B1714",
          700: "#231E1A",
          600: "#2E2822",
          500: "#3A322B",
        },
        ivory: {
          DEFAULT: "#F4ECDD",
          50: "#FAF6EC",
          100: "#F4ECDD",
          200: "#E8DDC6",
          300: "#D9CDB5",
        },
        sand: {
          DEFAULT: "#C8B998",
          200: "#E8DDC6",
          300: "#C8B998",
          400: "#A89878",
          500: "#7C6F5A",
        },
        forest: {
          DEFAULT: "#6B8475",
          300: "#8DA796",
          400: "#6B8475",
          500: "#4F6B5A",
          600: "#3F5648",
          700: "#2C3E33",
        },
        amber: {
          DEFAULT: "#D9A24E",
          200: "#EDD3A1",
          300: "#E5B976",
          400: "#D9A24E",
          500: "#C8893E",
          600: "#A6712E",
          700: "#7E5520",
        },
        copper: "#A6712E",
        clay: {
          DEFAULT: "#B85C3E",
          400: "#C97554",
          500: "#B85C3E",
          600: "#964530",
        },
        // Backward-compatible aliases used across pages
        btc: "#D9A24E",
        ink: "#14110F",
        musd: "#6B8475",
        ok: "#6B8475",
        warn: "#D9A24E",
        danger: "#B85C3E",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      boxShadow: {
        "card-lg":
          "0 1px 0 0 rgba(244, 236, 221, 0.04) inset, 0 24px 48px -24px rgba(0,0,0,0.55)",
        glow: "0 0 0 1px rgba(217,162,78,0.18), 0 18px 40px -20px rgba(217,162,78,0.35)",
      },
      backgroundImage: {
        "amber-sheen":
          "linear-gradient(135deg, #E5B976 0%, #D9A24E 45%, #A6712E 100%)",
        "ivory-sheen":
          "linear-gradient(135deg, #FAF6EC 0%, #F4ECDD 50%, #E8DDC6 100%)",
      },
    },
  },
  plugins: [],
};
