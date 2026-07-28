import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        turf: {
          50: "rgb(var(--turf-50) / <alpha-value>)",
          100: "rgb(var(--turf-100) / <alpha-value>)",
          400: "rgb(var(--turf-400) / <alpha-value>)",
          500: "rgb(var(--turf-500) / <alpha-value>)",
          700: "rgb(var(--turf-700) / <alpha-value>)",
          900: "rgb(var(--turf-900) / <alpha-value>)"
        },
        perimeter: {
          400: "rgb(var(--perimeter-400) / <alpha-value>)",
          500: "rgb(var(--perimeter-500) / <alpha-value>)",
          700: "rgb(var(--perimeter-700) / <alpha-value>)"
        },
        red: {
          100: "rgb(var(--red-100) / <alpha-value>)",
          200: "rgb(var(--red-200) / <alpha-value>)",
          300: "rgb(var(--red-300) / <alpha-value>)",
          400: "rgb(var(--red-400) / <alpha-value>)",
          500: "rgb(var(--red-500) / <alpha-value>)"
        },
        amber: {
          100: "rgb(var(--amber-100) / <alpha-value>)",
          200: "rgb(var(--amber-200) / <alpha-value>)",
          300: "rgb(var(--amber-300) / <alpha-value>)"
        },
        ink: {
          900: "rgb(var(--ink-900) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)"
        },
        chalk: "rgb(var(--chalk) / <alpha-value>)",
        "gold-ink": "#171814",
        "pitch-line": "#f5f2e8",
        floodlight: "rgb(var(--floodlight) / <alpha-value>)",
        "league-gold": "rgb(var(--league-gold) / <alpha-value>)",
        "league-gold-dark": "rgb(var(--league-gold-dark) / <alpha-value>)"
      },
      fontFamily: {
        display: ["var(--font-oswald)", "Arial Narrow", "sans-serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        glow: "0 0 30px rgba(40,168,255,.18)",
        amber: "0 0 24px rgba(247,183,51,.22)"
      },
      backgroundImage: {
        turf: "url('/turf-texture.webp')",
        turfMuted: "var(--app-background)"
      }
    }
  },
  plugins: []
};

export default config;
