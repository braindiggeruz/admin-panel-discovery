/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Fraunces'", "'Playfair Display'", "serif"],
        sans: ["'Geist'", "'Inter Tight'", "ui-sans-serif", "system-ui"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          50: "#F4F4F8",
          100: "#E2E2EA",
          200: "#C7C7D2",
          300: "#9494A8",
          400: "#5A5A6E",
          500: "#3A3A4A",
          600: "#262633",
          700: "#1A1A26",
          800: "#13131C",
          850: "#0F0F16",
          900: "#0B0B10",
          950: "#07070A",
        },
        gold: {
          50: "#FFF6DC",
          100: "#FBE7A8",
          200: "#F4D17A",
          300: "#E9BC56",
          400: "#D4A23A",
          500: "#B98622",
          600: "#8B6314",
          700: "#5C400A",
        },
        accent: {
          rose: "#E25A6A",
          mint: "#5BD3A9",
          sky: "#5CA8F0",
        },
      },
      boxShadow: {
        royal: "0 25px 60px -25px rgba(212, 162, 58, 0.18)",
        innerline: "inset 0 0 0 1px rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "grain": "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
    },
  },
  plugins: [],
};
