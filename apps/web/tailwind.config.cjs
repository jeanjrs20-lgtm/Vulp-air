/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          primaryDeep: "var(--brand-primary-deep)",
          background: "var(--brand-background)",
          backgroundSoft: "var(--brand-background-soft)",
          highlight: "var(--brand-highlight)",
          highlightSoft: "var(--brand-highlight-soft)",
          textOnDark: "var(--brand-text-on-dark)",
          neutralBg: "var(--brand-neutral-bg)"
        }
      },
      borderRadius: {
        xl: "var(--radius-base)"
      }
    }
  },
  plugins: []
};
