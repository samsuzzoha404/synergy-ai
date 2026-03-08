import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  label: string;
  sublabel: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
  accent?: string;
  loading?: boolean;
}

export function KPICard({ label, sublabel, value, trend, icon, accent = "bg-primary", loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-card">
        <div className="shimmer h-4 w-24 rounded mb-3" />
        <div className="shimmer h-8 w-32 rounded mb-2" />
        <div className="shimmer h-3 w-20 rounded" />
      </div>
    );
  }

  const isPositive = trend > 0;
  const trendColor = isPositive ? "text-success" : "text-destructive";
  const trendBg = isPositive ? "bg-success-light border-success/20" : "bg-destructive/10 border-destructive/20";
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-card hover:border-white/10 transition-all duration-200 group cursor-default active:scale-[0.98]">
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{sublabel}</p>
        </div>
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", accent)}>
          {icon}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-2xl font-black text-foreground tracking-tighter font-mono">{value}</p>
        <div className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 border",
          trendBg, trendColor
        )}>
          <TrendIcon className="w-3 h-3" />
          <span>{Math.abs(trend)}% {isPositive ? "increase" : "decrease"}</span>
        </div>
      </div>
    </div>
  );
}
