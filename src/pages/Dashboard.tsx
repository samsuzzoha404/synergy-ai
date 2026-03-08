import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Target, Clock, AlertCircle, BarChart3, PieChart, ArrowUpRight,
  TrendingUp, TrendingDown, Zap, CheckCircle2, AlertTriangle, Upload,
  Package, Activity, type LucideIcon
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, AreaChart, Area, LabelList, Legend,
} from "recharts";
import { kpiData } from "@/data/mockData";
import { KPICard } from "@/components/KPICard";
import { StatusBadge, MatchScoreBadge } from "@/components/StatusBadge";
import { SmartDrawer } from "@/components/SmartDrawer";
import type { Lead } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useLeads } from "@/hooks/useLeads";
import { useAuth } from "@/context/AuthContext";

// Dynamic time-of-day greeting helper
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatCurrency(value: number) {
  if (value >= 1_000_000_000) return `RM ${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${value.toLocaleString()}`;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  fill: string;
}

interface CustomBarTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

const CustomBarTooltip = ({ active, payload, label }: CustomBarTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs">
        <p className="font-bold text-foreground mb-2">{label}</p>
        {payload.map((p: TooltipPayloadEntry) => (
          <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.fill }} />
            {p.name === "leads" ? "Leads" : "Value (RM M)"}: <strong className="text-foreground">{p.value}{p.name === "value" ? "M" : ""}</strong>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Converts a "YYYY-MM-DD" date string to a human-readable relative time.
function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STAGE_COLORS: Record<string, string> = {
  Planning:     "hsl(217, 91%, 50%)",
  Tender:       "hsl(199, 89%, 48%)",
  Construction: "hsl(262, 80%, 56%)",
  Completed:    "hsl(142, 76%, 36%)",
};

const activityIcons: Record<string, { icon: LucideIcon; color: string }> = {
  assign: { icon: CheckCircle2, color: "text-success" },
  alert: { icon: AlertTriangle, color: "text-destructive" },
  new: { icon: Zap, color: "text-primary" },
  win: { icon: TrendingUp, color: "text-success" },
  upload: { icon: Upload, color: "text-info" },
};

export default function Dashboard() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  // All KPI data flows from the hook — RBAC filtering happens inside useLeads().
  const { data, dataUpdatedAt } = useLeads();
  const leads = data?.leads ?? [];

  // Compute a human-readable relative time since the data was last fetched
  // so the "Live" badge shows honest staleness instead of a hardcoded string.
  const lastUpdatedLabel = useMemo(() => {
    if (!dataUpdatedAt) return "…";
    const diffMs = Date.now() - dataUpdatedAt;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1m ago";
    return `${mins}m ago`;
  }, [dataUpdatedAt]);

  // ── Dynamic KPI Computation ─────────────────────────────────────────────
  // 1. Total Leads: live count from merged mock + API leads
  const totalLeadsCount = leads.length;

  // 2. Synergy Potential: sum of value for leads that have a cross-sell bundle
  const synergyPotentialValue = leads
    .filter((l) => l.crossSell && l.crossSell.length > 0)
    .reduce((sum, l) => sum + l.value, 0);

  // 3. Pending Actions: leads requiring attention
  const pendingCount = leads.filter(
    (l) => l.status === "Under Review" || l.status === "New"
  ).length;

  const kpis = [
    {
      label: kpiData.totalLeads.label,
      sublabel: kpiData.totalLeads.sublabel,
      value: totalLeadsCount.toLocaleString(),
      trend: kpiData.totalLeads.trend,
      icon: <Users className="w-4 h-4 text-white" />,
      accent: "bg-primary",
    },
    {
      label: kpiData.synergyPotential.label,
      sublabel: kpiData.synergyPotential.sublabel,
      value: formatCurrency(synergyPotentialValue),
      trend: kpiData.synergyPotential.trend,
      icon: <Target className="w-4 h-4 text-white" />,
      accent: "bg-success",
    },
    {
      label: kpiData.processingSpeed.label,
      sublabel: kpiData.processingSpeed.sublabel,
      value: `${kpiData.processingSpeed.value} mins`,
      trend: kpiData.processingSpeed.trend,
      icon: <Clock className="w-4 h-4 text-white" />,
      accent: "bg-info",
    },
    {
      label: kpiData.pendingActions.label,
      sublabel: kpiData.pendingActions.sublabel,
      value: pendingCount.toString(),
      trend: kpiData.pendingActions.trend,
      icon: <AlertCircle className="w-4 h-4 text-white" />,
      accent: "bg-warning",
    },
  ];

  // ── Chart data computed from live leads ──────────────────────────────────
  // Pie chart: count leads per pipeline stage
  const projectStageData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) counts.set(l.stage, (counts.get(l.stage) ?? 0) + 1);
    return ["Planning", "Tender", "Construction", "Completed"].map((stage) => ({
      stage,
      count: counts.get(stage) ?? 0,
      color: STAGE_COLORS[stage],
    }));
  }, [leads]);

  // Bar chart: group leads by top BU match, sum value in RM Millions
  const leadsbyBU = useMemo(() => {
    const buMap = new Map<string, { leads: number; value: number }>();
    for (const l of leads) {
      const bu = l.matches[0]?.bu ?? (l as { top_match_bu?: string }).top_match_bu ?? "Unknown";
      const existing = buMap.get(bu) ?? { leads: 0, value: 0 };
      buMap.set(bu, { leads: existing.leads + 1, value: existing.value + Math.round(l.value / 1_000_000) });
    }
    return Array.from(buMap.entries())
      .map(([bu, data]) => ({ bu, ...data }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 7);
  }, [leads]);

  // Sum stage totals dynamically so the legend bars always add up correctly
  const stageTotal = projectStageData.reduce((s, d) => s + d.count, 0);

  const recentLeads = leads.slice(0, 5);

  // ── Trend chart — real lead counts grouped by month (last 6 months) ─────
  const computedTrendData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const yr = d.getFullYear();
      const mo = d.getMonth();
      const monthLeads = leads.filter((l) => {
        if (!l.createdDate) return false;
        const ld = new Date(l.createdDate);
        return ld.getFullYear() === yr && ld.getMonth() === mo;
      });
      return {
        month: d.toLocaleString("default", { month: "short" }),
        leads: monthLeads.length,
        value: Math.round(monthLeads.reduce((s, l) => s + l.value, 0) / 1_000_000),
      };
    });
  }, [leads]);

  // ── Quarter-over-quarter lead count change ───────────────────────────────
  const qoqChange = useMemo(() => {
    const now = new Date();
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const prevQStart = new Date(qStart.getFullYear(), qStart.getMonth() - 3, 1);
    const cur = leads.filter((l) => l.createdDate && new Date(l.createdDate) >= qStart).length;
    const prev = leads.filter((l) => {
      if (!l.createdDate) return false;
      const d = new Date(l.createdDate);
      return d >= prevQStart && d < qStart;
    }).length;
    if (prev === 0) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }, [leads]);

  // ── Activity feed derived from real leads (newest first) ────────────────
  const derivedActivity = useMemo(() => {
    const sorted = [...leads].sort(
      (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()
    );
    return sorted.slice(0, 5).map((l) => {
      if (l.isDuplicate)
        return { id: l.id, action: "Duplicate detected", detail: `${l.projectName} flagged`, time: l.createdDate, type: "alert" };
      if (l.status === "Won")
        return { id: l.id, action: "Lead won", detail: `${l.projectName} — ${formatCurrency(l.value)}`, time: l.createdDate, type: "win" };
      if (l.status === "Assigned")
        return { id: l.id, action: "Lead assigned", detail: `${l.projectName} → ${l.matches[0]?.bu ?? ""}`, time: l.createdDate, type: "assign" };
      return { id: l.id, action: "New lead ingested", detail: l.projectName, time: l.createdDate, type: "new" };
    });
  }, [leads]);

  return (
    <>
      <div className="p-4 md:p-6 space-y-5 animate-fade-in">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Executive Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {getGreeting()}, {user?.name ?? 'there'} — {new Date().toLocaleString("default", { month: "long", year: "numeric" })} Synergy overview
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs bg-success-light text-success border border-success/20 rounded-lg px-3 py-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Live · {lastUpdatedLabel}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <KPICard key={kpi.label} {...kpi} />
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Area Trend Chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Lead Volume Trend</h2>
                <p className="text-xs text-muted-foreground">Monthly lead ingestion — last 6 months</p>
              </div>
              {qoqChange !== null && (
                <div className={cn("flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1", qoqChange >= 0 ? "text-success bg-success-light border border-success/20" : "text-destructive bg-destructive/10 border border-destructive/20")}>
                  {qoqChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {qoqChange >= 0 ? "+" : ""}{qoqChange}% QoQ
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={computedTrendData}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217, 91%, 50%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(217, 91%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="leads" stroke="hsl(217, 91%, 50%)" strokeWidth={2} fill="url(#colorLeads)" name="Leads" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Donut Chart */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Project Stage</h2>
                <p className="text-xs text-muted-foreground">Pipeline distribution</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-primary-light flex items-center justify-center">
                <PieChart className="w-4 h-4 text-primary" />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <RechartsPie>
                <Pie
                  data={projectStageData}
                  dataKey="count"
                  nameKey="stage"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={65}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {projectStageData.map((entry) => (
                    <Cell key={entry.stage} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number | string) => [`${val} leads`, ""]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                />
              </RechartsPie>
            </ResponsiveContainer>
            <div className="space-y-2 mt-1">
              {projectStageData.map((d) => (
                <div key={d.stage} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                    {d.stage}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ backgroundColor: d.color, width: `${stageTotal > 0 ? (d.count / stageTotal) * 100 : 0}%` }} />
                    </div>
                    <span className="font-semibold text-foreground w-8 text-right">{d.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* BU Bar Chart + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Bar Chart */}
          <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Leads by Business Unit</h2>
                <p className="text-xs text-muted-foreground">Volume and value breakdown (RM M)</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-primary-light flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={leadsbyBU} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="bu" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "hsl(217 91% 50% / 0.06)" }} />
                <Bar dataKey="value" name="value" stackId="a" fill="hsl(199, 89%, 48%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="leads" name="leads" stackId="a" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="leads" position="top" fontSize={10} fill="hsl(var(--muted-foreground))" formatter={(v: number) => v} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-5 mt-3 justify-center">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-2 rounded-sm bg-primary inline-block" />Lead Count
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-2 rounded-sm bg-info inline-block" />Value (RM M)
              </span>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
                <p className="text-xs text-muted-foreground">Derived from live lead data</p>
              </div>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-3">
              {derivedActivity.map((item) => {
                const config = activityIcons[item.type] || activityIcons.new;
                const Icon = config.icon;
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className={cn("w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0", config.color)}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground leading-tight">{item.action}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                    </div>
                    <span className="text-xs text-muted-foreground/70 flex-shrink-0 whitespace-nowrap">{relativeTime(item.time)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Leads Table */}
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Recent Leads</h2>
              <p className="text-xs text-muted-foreground">Latest AI-scored leads requiring action</p>
            </div>
            <button
              onClick={() => navigate("/leads")}
              className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              View all <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[580px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Project", "Value", "Stage", "AI Match", "Status"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      "table-row-hover transition-colors",
                      lead.isDuplicate && "bg-destructive/5"
                    )}
                    onClick={() => {
                      if (lead.isDuplicate && lead.status === "Duplicate Alert") navigate("/conflicts");
                      else setSelectedLead(lead);
                    }}
                  >
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-sm font-semibold text-foreground leading-tight">{lead.projectName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{lead.location}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-bold text-foreground">{formatCurrency(lead.value)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{lead.stage}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {/* Always show AI score — small indicator for unresolved conflicts */}
                      <div className="space-y-1">
                        {lead.isDuplicate && lead.status === "Duplicate Alert" && (
                          <span className="text-[10px] text-destructive font-semibold flex items-center gap-1 leading-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse flex-shrink-0" />
                            Conflict pending
                          </span>
                        )}
                        <MatchScoreBadge score={lead.matches[0]?.score ?? 0} bu={lead.matches[0]?.bu ?? "—"} size="sm" />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={lead.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SmartDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </>
  );
}
