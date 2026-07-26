/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // AcadEase design tokens v2 — "Campus Pass" direction.
      // Energetic but disciplined: one dark ink surface, one warm paper
      // surface, a vivid signal-blue for action, citrus for gamification.
      colors: {
        ink: "#14162B",
        "ink-light": "#232744",
        paper: "#FAF8F3",
        card: "#FFFFFF",
        border: "#E7E3D8",
        "text-primary": "#14162B",
        "text-secondary": "#5B5D72",
        "text-muted": "#9496A8",
        signal: "#3654FF",
        "signal-dark": "#2540DB",
        citrus: "#C6FF4D",
        coral: "#FF6B4A",
        teal: "#0FB8A5",
        danger: "#FF4D5E",
        warning: "#FFB020",
        success: "#1FAF6A",
        // legacy aliases kept for pages not yet migrated
        primary: "#3654FF",
        "primary-light": "#EEF1FF",
        surface: "#FAF8F3",
        "success-light": "#E9FCE0",
        "danger-light": "#FFE7E9",
        "warning-light": "#FFF3DC",
        gold: "#FFB020",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,22,43,0.04), 0 8px 24px rgba(20,22,43,0.06)",
        lift: "0 4px 8px rgba(20,22,43,0.06), 0 16px 32px rgba(20,22,43,0.10)",
        glow: "0 0 0 4px rgba(198,255,77,0.25)",
        md: "0 4px 12px rgba(20,22,43,0.08)",
        lg: "0 8px 24px rgba(20,22,43,0.10)",
      },
      backgroundImage: {
        "ink-fade": "linear-gradient(135deg, #14162B 0%, #232744 55%, #2B2F52 100%)",
        "signal-coral": "linear-gradient(120deg, #3654FF 0%, #FF6B4A 100%)",
        // legacy gradient aliases
        "gradient-primary": "linear-gradient(135deg, #3654FF 0%, #2540DB 100%)",
        "gradient-teal": "linear-gradient(135deg, #0FB8A5 0%, #0d9488 100%)",
        "gradient-danger": "linear-gradient(135deg, #FF4D5E 0%, #e03040 100%)",
        "gradient-warning": "linear-gradient(135deg, #FFB020 0%, #e09010 100%)",
        "gradient-success": "linear-gradient(135deg, #1FAF6A 0%, #178f55 100%)",
      },
    },
  },
  plugins: [],
};
