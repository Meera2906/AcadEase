export default function Card({ className = "", hover = false, children, ...props }) {
  return (
    <div
      className={`bg-card border border-border rounded-card shadow-card p-6 ${
        hover ? "transition-shadow hover:shadow-lift cursor-pointer" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
