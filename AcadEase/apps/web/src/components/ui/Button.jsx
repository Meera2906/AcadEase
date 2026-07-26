export default function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center font-semibold rounded-pill transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-1";

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm",
  };

  const variants = {
    primary:     "bg-signal text-white hover:bg-signal-dark shadow-card hover:shadow-lift focus:ring-signal/40",
    citrus:      "bg-citrus text-ink hover:brightness-95 shadow-card hover:shadow-lift focus:ring-citrus/40",
    secondary:   "border border-border text-text-primary bg-white hover:bg-paper focus:ring-border",
    destructive: "bg-danger text-white hover:brightness-95 focus:ring-danger/40",
    ghost:       "text-text-secondary hover:bg-black/5 focus:ring-border",
    success:     "bg-success text-white hover:brightness-95 focus:ring-success/40",
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
