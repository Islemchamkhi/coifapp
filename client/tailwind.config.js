/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0a0b",
          900: "#111113",
          800: "#18181b",
          700: "#232327",
          600: "#2e2e33",
        },
        gold: {
          400: "#e2c064",
          500: "#c9a227",
          600: "#a9861e",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 8px 30px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(201,162,39,0.25), 0 8px 24px -8px rgba(201,162,39,0.25)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
