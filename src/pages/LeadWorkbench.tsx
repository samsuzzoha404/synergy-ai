import { useMemo, useState } from "react";
import { TableProperties, Info, LayoutGrid, List } from "lucide-react";
import { LeadsTable } from "@/components/LeadsTable";
import { LeadPipeline } from "@/components/LeadPipeline";
import { SmartDrawer } from "@/components/SmartDrawer";
import { leads as mockLeads, type Lead } from "@/data/mockData";
import { useLeads } from "@/hooks/useLeads";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function formatCurrency(value: number) {
  if (value >= 1_000_000_000) return `RM ${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${value.toLocaleString()}`;
}

export default function LeadWorkbench() {
  const { data: leads = mockLeads, isLoading } = useLeads();
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [pipelineLead, setPipelineLead] = useState<Lead | null>(null);

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

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View toggle */}
          <div className="flex items-center bg-muted border border-border rounded-lg p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                view === "list"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setView("pipeline")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                view === "pipeline"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Pipeline
            </button>
          </div>

          {isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Syncing…
            </span>
          )}
        </div>
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
          <span className="text-foreground">
            {view === "list"
              ? "Click any lead row to open the AI-powered Smart Drawer with cross-sell recommendations. Duplicate alerts redirect to Conflict Resolution."
              : "Drag cards between columns to move a lead through the pipeline. Click any card to open the Smart Drawer."}
          </span>
        </div>
      </div>

      {/* Content — List or Pipeline */}
      {view === "list" ? (
        <LeadsTable leads={leads} />
      ) : (
        <>
          <LeadPipeline leads={leads} onLeadClick={setPipelineLead} />
          <SmartDrawer lead={pipelineLead} onClose={() => setPipelineLead(null)} />
        </>
      )}
    </div>
  );
}
