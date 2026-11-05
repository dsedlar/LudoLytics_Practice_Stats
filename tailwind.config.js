/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // VES Ludolytics brand
        garnet: "#7a0019",
        "garnet-dark": "#5c0013",
        navy: "#13293d",
        // Heat-map tiers (below average -> elite)
        tier1: "#f4b8b8", // below average
        tier2: "#f5e6a8", // average
        tier3: "#cfe8c0", // above average
        tier4: "#9ed69e", // high level
        tier5: "#4fae5a", // elite
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
