/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: {
          DEFAULT: "rgb(31 41 55)",
          light: "rgb(229 231 235)",
        },
      },
    },
  },
  plugins: [],
}