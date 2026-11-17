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
          DEFAULT: "#1470b0",
          50: "#eef5fb",
          100: "#dcebf7",
          200: "#b9d6ee",
          300: "#8bbbe2",
          400: "#4f98d0",
          500: "#1e80c2",
          600: "#1470b0",
          700: "#125e95",
          800: "#1b4a7a",
          900: "#233f70",
          dark: "#0b1329",
          sidebar: "#0f172a",
          card: "#1e293b",
          primary: "#1470b0",
          accent: "#1e80c2",
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
