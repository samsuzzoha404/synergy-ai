import { useMemo } from "react";
import { TableProperties, Info } from "lucide-react";
import { LeadsTable } from "@/components/LeadsTable";
import { leads as mockLeads } from "@/data/mockData";
import { useLeads } from "@/hooks/useLeads";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(value: number) {
  if (value >= 1_000_000_000) return `RM ${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${value.toLocaleString()}`;
}

export default function LeadWorkbench() {
  const { data: leads = mockLeads, isLoading } = useLeads();

  const totalValue = useMemo(() => leads.reduce((s, l) => s + l.value, 0), [leads]);
  const wonLeads = useMemo(() => leads.filter((l) => l.status === "Won").length, [leads]);
  const duplicates = useMemo(() => leads.filter((l) => l.isDuplicate).length, [leads]);

  return (
    <div className="p-4 md:p-6 space-y-5 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <TableProperties className="w-5 h-5 text-primary" />
            Lead Workbench
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI-scored leads from BCI data. Click any row to open the Smart Recommendation Drawer.
          </p>
        </div>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Syncing from API…
          </span>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))
        ) : (
          [
            { label: "Total Leads", value: leads.length.toString(), sub: "in workbench", color: "text-primary", bg: "bg-primary-light" },
            { label: "Pipeline Value", value: formatCurrency(totalValue), sub: "gross dev. value", color: "text-success", bg: "bg-success-light" },
            { label: "Closed Won", value: wonLeads.toString(), sub: "leads won", color: "text-info", bg: "bg-info-light" },
            { label: "Conflicts", value: duplicates.toString(), sub: "need review", color: "text-destructive", bg: "bg-destructive/10" },
          ].map((stat) => (
            <div key={stat.label} className={`${stat.bg} border border-border rounded-xl px-4 py-3`}>
              <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
              <p className={`text-lg font-black mt-0.5 ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.sub}</p>
            </div>
          ))
        )}
      </div>

      {/* Info Banner */}
      <div className="bg-primary-light border border-primary/20 rounded-xl p-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold text-primary">Tribal Knowledge Engine active: </span>
          <span className="text-foreground">Click any lead row to open the AI-powered Smart Drawer with cross-sell recommendations. Duplicate alerts redirect to Conflict Resolution.</span>
        </div>
      </div>

      {/* Table — receives merged mock + real leads */}
      <LeadsTable leads={leads} />
    </div>
  );
}
