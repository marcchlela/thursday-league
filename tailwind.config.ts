import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        turf: {
          50: "#effff1",
          100: "#d7fadd",
          400: "#31b94e",
          500: "#148a32",
          700: "#0b5a23",
          900: "#063916"
        },
        perimeter: {
          400: "#28a8ff",
          500: "#0c74d9",
          700: "#063f83"
        },
        ink: {
          900: "#11110f",
          850: "#171714",
          800: "#1e1d19"
        },
        chalk: "#f5f2e8",
        floodlight: "#f7b733"
      },
      fontFamily: {
        display: ["Oswald", "Impact", "Arial Narrow", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        glow: "0 0 30px rgba(40,168,255,.18)",
        amber: "0 0 24px rgba(247,183,51,.22)"
      },
      backgroundImage: {
        turf: "url('/turf-texture.png')",
        turfMuted: "linear-gradient(rgba(17,17,15,.88), rgba(17,17,15,.92)), url('/turf-muted.png')"
      }
    }
  },
  plugins: []
};

export default config;
