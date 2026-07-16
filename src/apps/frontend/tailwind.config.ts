import type { Config } from "tailwindcss";

const config: Config = {
  content: [
  "./src/**/*.{ts,tsx,js,jsx}",
  "./app/**/*.{ts,tsx,js,jsx}",
  "./components/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    fontFamily: {
      sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      display: ["var(--font-display)", "Georgia", "serif"],
    },
    extend: {
      colors: {
        ink: { DEFAULT: "#162113", light: "#33412d", muted: "#64725f", faint: "#8a9585" },
        brand: {
          DEFAULT: "#157a2c",
          dark: "#0f5f22",
          darker: "#0b4f1b",
          50: "#f3faf2",
          100: "#e8f4e7",
          200: "#d4ead1",
          300: "#b7dcb2",
          400: "#7ebf7a",
          500: "#1f8f35",
          600: "#157a2c",
          700: "#0f5f22",
        },
        coral: { DEFAULT: "#d36a5b", light: "#fbe5e3", dark: "#b3473a" },
        gold: { DEFAULT: "#d4a72c", light: "#fff2cf", dark: "#8d6a00" },
        mint: { DEFAULT: "#d6f1d4", dark: "#8bcf84" },
        surface: { DEFAULT: "#ffffff", elevated: "#ffffff", overlay: "rgba(255,255,255,0.94)" },
        muted: { DEFAULT: "#f6f8f3", darker: "#eef4ec" },
        paper: "#f7f8f4",
        cream: "#fbfcf8",
        forest: "#0f5f22",
        skyline: "#eef4ec",
        leaf: "#157a2c",
        portal: {
          bg: "#f2fbf5",
          ink: "#173126",
          muted: "#65756d",
          line: "#d6eadc",
          green: "#16a34a",
          mint: "#e8f8ee",
          blue: "#22c55e",
          purple: "#dcfce7",
          amber: "#f0fdf4",
          red: "#d73b32",
        },
      },
      spacing: {
        "4.5": "1.125rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "18": "4.5rem",
        "sidebar": "270px",
      },
      borderRadius: {
        "4xl": "1.25rem",
        "5xl": "1.5rem",
      },
      boxShadow: {
        panel: "0 4px 16px rgba(16, 24, 16, 0.05)",
        portal: "0 8px 24px rgba(16, 24, 16, 0.06)",
        soft: "0 2px 10px rgba(16, 24, 16, 0.04)",
        glow: "0 8px 24px rgba(21, 122, 44, 0.10)",
        card: "0 2px 10px rgba(16, 24, 16, 0.04)",
        "card-hover": "0 6px 18px rgba(16, 24, 16, 0.06)",
        lift: "rgba(22, 163, 74, 0.12) 0px 0px 0px 1px, rgba(21, 128, 61, 0.16) 0px 24px 36px -18px",
      },
      fontSize: {
        "display": ["3.25rem", { lineHeight: "1.04", fontWeight: "800" }],
        "heading-1": ["2.75rem", { lineHeight: "1.08", fontWeight: "800" }],
        "heading-2": ["2rem", { lineHeight: "1.14", fontWeight: "800" }],
        "heading-3": ["1.5rem", { lineHeight: "1.2", fontWeight: "700" }],
        "display-sm": ["2.5rem", { lineHeight: "1.05", fontWeight: "700" }],
        "body-lg": ["1.125rem", { lineHeight: "1.65" }],
        "body": ["1rem", { lineHeight: "1.65" }],
        "caption": ["0.8125rem", { lineHeight: "1.5" }],
      },
      animation: {
        "fade-in": "fadeIn 300ms ease-out",
        "slide-up": "slideUp 300ms ease-out",
        "slide-in-left": "slideInLeft 250ms ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideInLeft: { from: { opacity: "0", transform: "translateX(-12px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        pulseSoft: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.7" } },
      },
      transitionDuration: {
        "250": "250ms",
      },
    },
  },
  plugins: [],
};

export default config;
