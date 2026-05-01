/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        btc: "#F7931A",
        ink: "#1A1A2E",
        musd: "#00D4AA",
        danger: "#FF4757",
        warn: "#FFA502",
        ok: "#2ED573",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
