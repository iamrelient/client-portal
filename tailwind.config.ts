import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          50: "#eef1f8",
          100: "#d5dbed",
          200: "#b0bbd9",
          300: "#8a9bc5",
          400: "#6479b0",
          500: "#4a6199",
          600: "#374476",
          700: "#2d3860",
          800: "#232c4b",
          900: "#1a2038",
        },
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up-fade": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 500ms ease-in-out forwards",
        "slide-up-fade": "slide-up-fade 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-out": "fade-out 500ms ease-in-out forwards",
      },
    },
  },
  plugins: [],
};
export default config;
