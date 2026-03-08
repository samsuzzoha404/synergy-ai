import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Download, Printer, FileText, Filter, TrendingUp,
  Building2, CheckCircle2, AlertTriangle, DollarSign, Loader2,
  RefreshCw, Calendar,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useAllLeads } from "@/hooks/useLeads";
import { downloadAuthBlob, buildCSV, triggerCSVDownload, todayISO, formatDateLabel } from "@/lib/exportUtils";
import type { Lead } from "@/data/mockData";
import { BU_NAMES } from "@/data/mockData";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number) {
  if (value >= 1_000_000_000) return `RM ${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}M`;
  return `RM ${value.toLocaleString()}`;
}

const STATUS_OPTIONS = ["All", "New", "In Review", "Under Review", "Assigned", "Won", "Lost", "Duplicate Alert", "Merged", "Discarded"];
const BU_OPTIONS = ["All", ...BU_NAMES];

const CHART_COLORS = [
  "hsl(217,91%,50%)", "hsl(142,71%,45%)", "hsl(32,95%,50%)",
  "hsl(280,70%,55%)", "hsl(0,72%,51%)", "hsl(199,89%,48%)", "hsl(262,80%,56%)",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

function SummaryCard({ icon: Icon, label, value, sub, color = "text-primary" }: SummaryCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", "bg-muted")}>
        <Icon className={cn("w-5 h-5", color)} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        <p className="text-xs font-semibold text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Reports() {
  const { data: allLeads = [], isLoading, refetch, isFetching } = useAllLeads();

  // Filters
  const [statusFilter, setStatusFilter] = useState("All");
  const [buFilter, setBuFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Export state
  const [exporting, setExporting] = useState(false);

  // ---------------------------------------------------------------------------
  // Filtered leads
  // ---------------------------------------------------------------------------
  const filtered = useMemo<Lead[]>(() => {
    return allLeads.filter((l) => {
      if (statusFilter !== "All" && l.status !== statusFilter) return false;
      if (buFilter !== "All" && l.matches[0]?.bu !== buFilter) return false;
      if (dateFrom && l.createdDate < dateFrom) return false;
      if (dateTo && l.createdDate > dateTo) return false;
      return true;
    });
  }, [allLeads, statusFilter, buFilter, dateFrom, dateTo]);

  // ---------------------------------------------------------------------------
  // Summary stats
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const total = filtered.length;
    const totalValue = filtered.reduce((s, l) => s + l.value, 0);
    const avgScore = filtered.length
      ? Math.round(filtered.reduce((s, l) => s + (l.matches[0]?.score ?? 0), 0) / filtered.length)
      : 0;
    const duplicates = filtered.filter((l) => l.isDuplicate).length;
    const assigned = filtered.filter((l) => l.status === "Assigned" || l.status === "Won").length;
    return { total, totalValue, avgScore, duplicates, assigned };
  }, [filtered]);

  // ---------------------------------------------------------------------------
  // BU breakdown
  // ---------------------------------------------------------------------------
  const buBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    filtered.forEach((l) => {
      const bu = l.matches[0]?.bu ?? "Unassigned";
      const prev = map.get(bu) ?? { count: 0, value: 0 };
      map.set(bu, { count: prev.count + 1, value: prev.value + l.value });
    });
    return Array.from(map.entries())
      .map(([bu, d]) => ({ bu, ...d }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ---------------------------------------------------------------------------
  // Status breakdown
  // ---------------------------------------------------------------------------
  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((l) => {
      map.set(l.status, (map.get(l.status) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

  /** Download from the backend — full dataset, server-generated CSV */
  const handleServerExport = async () => {
    setExporting(true);
    try {
      await downloadAuthBlob('/api/leads/export', `synergy-leads-${todayISO()}.csv`);
      toast({ title: "✅ Export downloaded", description: "Full dataset CSV saved." });
    } catch {
      toast({ title: "Export failed", description: "Could not download CSV.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  /** Export filtered view from the frontend — respects current filters */
  const handleFilteredExport = () => {
    const columns = [
      { label: "ID", key: "id" },
      { label: "Project Name", key: "projectName" },
      { label: "Location", key: "location" },
      { label: "Value (RM)", key: "value" },
      { label: "Type", key: "type" },
      { label: "Stage", key: "stage" },
      { label: "Status", key: "status" },
      { label: "Top BU", key: "_topBU" },
      { label: "Match Score", key: "_matchScore" },
      { label: "Developer", key: "developer" },
      { label: "Created Date", key: "createdDate" },
      { label: "Duplicate", key: "isDuplicate" },
    ];
    const rows = filtered.map((l) => ({
      ...l,
      _topBU: l.matches[0]?.bu ?? "",
      _matchScore: l.matches[0]?.score ?? "",
    }));
    const csv = buildCSV(rows as unknown as Record<string, unknown>[], columns);
    triggerCSVDownload(csv, `synergy-filtered-${todayISO()}.csv`);
    toast({ title: "✅ Filtered export downloaded", description: `${filtered.length} leads exported.` });
  };

  /** Print-friendly view */
  const handlePrint = () => {
    window.print();
  };

  // ---------------------------------------------------------------------------
  // Reset filters
  // ---------------------------------------------------------------------------
  const resetFilters = () => {
    setStatusFilter("All");
    setBuFilter("All");
    setDateFrom("");
    setDateTo("");
  };
  const hasFilters = statusFilter !== "All" || buFilter !== "All" || dateFrom || dateTo;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto print:p-2">
      {/* ── Header ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between flex-wrap gap-3 print:hidden"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Reports & Export
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyse leads, apply filters, and export to CSV or PDF.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-2"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFilteredExport}
            disabled={filtered.length === 0}
            className="gap-2"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Filtered
          </Button>
          <Button
            size="sm"
            onClick={handleServerExport}
            disabled={exporting}
            className="gap-2"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export All (CSV)
          </Button>
        </div>
      </motion.div>

      {/* Print header — only visible when printing */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">Synergy Sales Genius — Lead Report</h1>
        <p className="text-sm text-gray-500">{formatDateLabel()} · {filtered.length} leads</p>
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 print:hidden">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Filters</p>
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="ml-auto text-xs text-primary hover:underline"
            >
              Reset all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Business Unit</Label>
            <Select value={buFilter} onValueChange={setBuFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BU_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Date From
            </Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Date To
            </Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
        {hasFilters && (
          <p className="text-xs text-muted-foreground mt-2">
            Showing <strong className="text-foreground">{filtered.length}</strong> of{" "}
            <strong className="text-foreground">{allLeads.length}</strong> leads
          </p>
        )}
      </div>

      {/* ── Summary Cards ───────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading report data…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard icon={FileText}     label="Total Leads"     value={String(stats.total)} />
            <SummaryCard icon={DollarSign}   label="Total Value"     value={formatCurrency(stats.totalValue)} color="text-success" />
            <SummaryCard icon={TrendingUp}   label="Avg Match Score" value={`${stats.avgScore}%`} color="text-primary" />
            <SummaryCard icon={CheckCircle2} label="Assigned / Won"  value={String(stats.assigned)} color="text-success" />
            <SummaryCard icon={AlertTriangle} label="Duplicates"     value={String(stats.duplicates)} color="text-warning" />
          </div>

          {/* ── Charts row ────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* BU value chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Pipeline Value by Business Unit
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buBreakdown} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="bu"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Value"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {buBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Status count chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Lead Count by Status
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusBreakdown} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    formatter={(v: number) => [v, "Leads"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Detailed tables ───────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* BU breakdown table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border bg-muted/30">
                <p className="text-sm font-semibold text-foreground">BU Breakdown</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Business Unit", "Leads", "Total Value"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buBreakdown.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">No data</td></tr>
                  ) : buBreakdown.map((row, i) => (
                    <tr key={row.bu} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "bg-muted/20" : "")}>
                      <td className="px-4 py-2.5 font-medium text-foreground text-xs">{row.bu}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{row.count}</td>
                      <td className="px-4 py-2.5 text-foreground text-xs font-semibold">{formatCurrency(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Status breakdown table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border bg-muted/30">
                <p className="text-sm font-semibold text-foreground">Status Breakdown</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Status", "Count", "% of Total"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statusBreakdown.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">No data</td></tr>
                  ) : statusBreakdown.map((row, i) => (
                    <tr key={row.status} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "bg-muted/20" : "")}>
                      <td className="px-4 py-2.5 font-medium text-foreground text-xs">{row.status}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{row.count}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${stats.total ? (row.count / stats.total) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground w-8 text-right">
                            {stats.total ? Math.round((row.count / stats.total) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Leads detail table (print-friendly) ──────────── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Lead Details <span className="text-muted-foreground font-normal">({filtered.length} rows)</span>
              </p>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs print:hidden" onClick={handleFilteredExport} disabled={filtered.length === 0}>
                <Download className="w-3 h-3" />
                Export this view
              </Button>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    {["Project", "Location", "Value", "BU", "Score", "Status", "Date"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No leads match the current filters.</td></tr>
                  ) : filtered.map((l, i) => (
                    <tr key={l.id} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "bg-muted/10" : "")}>
                      <td className="px-4 py-2.5 font-medium text-foreground max-w-[180px] truncate">{l.projectName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{l.location}</td>
                      <td className="px-4 py-2.5 text-foreground font-semibold whitespace-nowrap">{formatCurrency(l.value)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{l.matches[0]?.bu ?? "—"}</td>
                      <td className="px-4 py-2.5 text-foreground">{l.matches[0]?.score ?? "—"}%</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                          l.status === "Won" ? "bg-success/10 text-success" :
                          l.status === "Assigned" ? "bg-primary/10 text-primary" :
                          l.status === "Duplicate Alert" ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{l.createdDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
