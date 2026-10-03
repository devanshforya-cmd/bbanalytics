/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          dark: "#0b1329",
          sidebar: "#0f172a",
          card: "#1e293b",
          primary: "#2563eb",
          accent: "#3b82f6",
        },
        forya: {
          DEFAULT: "#059669",
          light: "#10b981",
          dark: "#047857",
          bg: "#ecfdf5",
          text: "#065f46"
        },
        peesafe: {
          DEFAULT: "#0891b2",
          light: "#06b6d4",
          dark: "#0e7490",
          bg: "#ecfeff",
          text: "#155e75"
        },
        renee: {
          DEFAULT: "#e11d48",
          light: "#f43f5e",
          dark: "#be123c",
          bg: "#fff1f2",
          text: "#9f1239"
        }
      },
    },
  },
  plugins: [],
};
