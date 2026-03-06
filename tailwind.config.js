/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        pureql: {
          accent: "#10b981",
          "accent-dim": "#10b98115",
          purple: "#8b5cf6",
          blue: "#3b82f6",
          orange: "#f59e0b",
          pink: "#ec4899",
          cyan: "#06b6d4",
          dark: "#09090b",
          panel: "#0c0e14",
          card: "#12151c",
          border: "#1e2130",
        },
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "SF Mono",
          "Cascadia Code",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
