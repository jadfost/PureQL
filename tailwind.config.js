/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        pureql: {
          accent: "#0ea5e9",       // sky-500 — azul/cyan moderno
          "accent-dim": "#f0f9ff", // sky-50  — fondo sutil para elementos activos
          purple: "#7c3aed",
          blue: "#2563eb",
          orange: "#ea580c",
          pink: "#db2777",
          cyan: "#0891b2",
          dark: "#fafafa",         // fondo principal (zinc-50)
          panel: "#f4f4f5",        // fondo secundario (zinc-100)
          card: "#ffffff",         // superficies elevadas (blanco puro)
          border: "#e4e4e7",       // bordes (zinc-200)
        },
      },
      fontFamily: {
        sans: [
          "Instrument Sans",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
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