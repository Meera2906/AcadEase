import { Construction } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import Card from "../components/ui/Card.jsx";

export default function PlaceholderPage({ title, apiHint }) {
  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">{title}</h1>
      <p className="text-sm text-text-secondary mb-6">This screen is scaffolded but not yet built.</p>
      <Card className="border-dashed">
        <div className="flex items-center gap-2 text-text-secondary mb-2">
          <Construction size={16} />
          <p className="text-sm font-medium">Backend route already works</p>
        </div>
        <code className="block text-xs bg-paper border border-border rounded-card px-3 py-2.5 text-text-secondary font-mono">
          {apiHint}
        </code>
        <p className="text-sm text-text-secondary mt-3">
          Build the UI against that endpoint — see{" "}
          <code className="font-mono">ARCHITECTURE.md</code> in the project root for the full route
          catalogue and suggested build order.
        </p>
      </Card>
    </AppShell>
  );
}
