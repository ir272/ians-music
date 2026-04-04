import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#f53d6b",
        "nexus-primary": "#b90040",
        "background-light": "#F4F4F0",
        "background-dark": "#0a0909",
        "spotify": "#f53d6b",
        "apple": "#0066FF",
        "youtube": "#FF0000",
        "soundcloud": "#FF5500",
        "accent-pink": "#FF3366",
        "accent-lime": "#DFFF00",
        "surface": "#faf9f5",
        "surface-container": "#eeeeea",
        "muted": "#999999",
        "accent-1": "#ff3366",
        "accent-2": "#00ffaa",
      },
      fontFamily: {
        headline: ["PANCHANG", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
        sans: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        body: ["Inter Tight", "sans-serif"],
      },
      borderRadius: {
        "DEFAULT": "0.125rem", 
        "lg": "0.25rem", 
        "xl": "0.5rem", 
        "full": "0.75rem"
      },
    },
  },
  plugins: [],
};
export default config;
