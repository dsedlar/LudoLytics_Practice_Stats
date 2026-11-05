/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // VES brand palette
        garnet: "#B20000", // primary: logos, headlines, keylines, graphic elements
        "deep-garnet": "#3C0019", // secondary: backgrounds & body copy only
        navy: "#00142D", // tertiary: background alternative to deep garnet
        ivory: "#FBFAF5", // warm background
        cream: "#F3EED4", // richer warm background
        // Heat-map tiers (below average -> elite) — data viz, not brand
        tier1: "#f4b8b8",
        tier2: "#f5e6a8",
        tier3: "#cfe8c0",
        tier4: "#9ed69e",
        tier5: "#4fae5a",
      },
      fontFamily: {
        sans: ["var(--font-grotesque)"],
        serif: ["var(--font-serif)"],
        compressed: ["var(--font-compressed)"],
        gothic: ["var(--font-gothic)"],
      },
    },
  },
  plugins: [],
};
