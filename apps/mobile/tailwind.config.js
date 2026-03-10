/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#07384D",
          background: "#5ADCE8",
          highlight: "#DCEB15",
          textOnDark: "#FFFFFF",
          neutralBg: "#EAF4F6"
        }
      }
    }
  },
  plugins: []
};
