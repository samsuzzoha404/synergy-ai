import { useState } from "react";
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
import { kpiData, leadsbyBU, projectStageData, leads as mockLeads, recentActivity } from "@/data/mockData";
import { KPICard } from "@/components/KPICard";
import { StatusBadge, MatchScoreBadge } from "@/components/StatusBadge";
import { SmartDrawer } from "@/components/SmartDrawer";
import type { Lead } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useLeads } from "@/hooks/useLeads";

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

const trendData = [
  { month: "Jan", leads: 58, value: 24 },
  { month: "Feb", leads: 72, value: 31 },
  { month: "Mar", leads: 65, value: 28 },
  { month: "Apr", leads: 91, value: 45 },
  { month: "May", leads: 84, value: 39 },
  { month: "Jun", leads: 127, value: 62 },
];

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
  const { data: leads = mockLeads } = useLeads();

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

  // Sum stage totals dynamically so the legend bars always add up correctly
  const stageTotal = projectStageData.reduce((s, d) => s + d.count, 0);

  const recentLeads = leads.slice(0, 5);

  return (
    <>
      <div className="p-4 md:p-6 space-y-5 animate-fade-in">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Executive Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {getGreeting()}, Marvis — Q2 2025 Synergy overview
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs bg-success-light text-success border border-success/20 rounded-lg px-3 py-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Live · 2m ago
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
                <p className="text-xs text-muted-foreground">Monthly lead ingestion — Jan to Jun 2025</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-success font-medium bg-success-light border border-success/20 rounded-lg px-2.5 py-1">
                <TrendingUp className="w-3 h-3" />
                +15% QoQ
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendData}>
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
                <p className="text-xs text-muted-foreground">System event log</p>
              </div>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-3">
              {recentActivity.map((item, i) => {
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
                    <span className="text-xs text-muted-foreground/70 flex-shrink-0 whitespace-nowrap">{item.time}</span>
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
                      if (lead.isDuplicate) navigate("/conflicts");
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
                      {lead.isDuplicate ? (
                        <span className="text-xs text-destructive font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                          Duplicate
                        </span>
                      ) : (
                        <MatchScoreBadge score={lead.matches[0]?.score ?? 0} bu={lead.matches[0]?.bu ?? ""} size="sm" />
                      )}
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
