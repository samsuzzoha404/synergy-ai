import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface MatchScoreBadgeProps {
  score: number;
  bu: string;
  size?: "sm" | "md";
}

export function MatchScoreBadge({ score, bu, size = "md" }: MatchScoreBadgeProps) {
  const color =
    score >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    score >= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
    "bg-red-500/10 text-red-400 border-red-500/20";

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
    "New": "bg-sky-500/10 text-sky-400 border-sky-500/20",
    "In Review": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Under Review": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Assigned": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Duplicate Alert": "bg-red-500/10 text-red-400 border-red-500/20",
    "Won": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Lost": "bg-slate-500/10 text-slate-400 border-slate-500/20",
    "Merged": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "Discarded": "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  const dotColor: Record<string, string> = {
    "Duplicate Alert": "bg-red-400",
    "Merged": "bg-blue-400",
    "Discarded": "bg-slate-400",
  };

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", config[status] ?? "bg-muted text-muted-foreground border-border")}>
      {dotColor[status] && (
        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", dotColor[status], status === "Duplicate Alert" && "animate-pulse")} />
      )}
      {status}
    </span>
  );
}
