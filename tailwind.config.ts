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
    },
  },
  plugins: [],
};
export default config;
