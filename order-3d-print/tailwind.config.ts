import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#111827",
        muted: "#6b7280",
        surface: "#fafaf9",
        line: "#e7e5e4",
        accent: "#ea580c",
        "accent-hover": "#c2410c",
      },
    },
  },
  plugins: [],
};

export default config;
