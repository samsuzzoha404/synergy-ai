import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface MatchScoreBadgeProps {
  score: number;
  bu: string;
  size?: "sm" | "md";
}

export function MatchScoreBadge({ score, bu, size = "md" }: MatchScoreBadgeProps) {
  const color =
    score >= 80 ? "bg-success-light text-success border-success/20" :
    score >= 60 ? "bg-warning-light text-warning border-warning/20" :
    "bg-destructive/10 text-destructive border-destructive/20";

  return (
    <div className={cn("flex items-center gap-1.5", size === "sm" ? "text-xs" : "text-sm")}>
      <div className={cn("font-semibold px-2 py-0.5 rounded border text-xs", color)}>
        {score}%
      </div>
      <span className="text-muted-foreground font-medium">{bu}</span>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<string, string> = {
    "New": "bg-info-light text-info border-info/20",
    "In Review": "bg-warning-light text-warning border-warning/20",
    "Assigned": "bg-success-light text-success border-success/20",
    "Duplicate Alert": "bg-destructive/10 text-destructive border-destructive/20",
    "Won": "bg-success-light text-success border-success/20",
    "Lost": "bg-muted text-muted-foreground border-border",
  };

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", config[status] || "bg-muted text-muted-foreground")}>
      {status === "Duplicate Alert" && <span className="w-1.5 h-1.5 rounded-full bg-destructive mr-1.5 animate-pulse" />}
      {status}
    </span>
  );
}
