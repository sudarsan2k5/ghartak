/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        page: "#FCFBF8",
        ink: "#35203C",
        lime: "#D7F66B",
        line: "#E9E5E9",
        muted: "#837B86",
        secondary: "#665D6C",
        savings: "#527527",
        "savings-wash": "#EEF6DC",
      },
      boxShadow: {
        card: "0 2px 8 rgba(53, 32, 60, 0.05)",
        selected: "0 4px 12 rgba(53, 32, 60, 0.08)",
      },
    },
  },
  plugins: [],
};
