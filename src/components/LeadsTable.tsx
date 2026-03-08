import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import { Lead, LeadStatus, LeadStage } from "@/data/mockData";
import { MatchScoreBadge, StatusBadge } from "@/components/StatusBadge";
import { SmartDrawer } from "@/components/SmartDrawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function formatCurrency(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${(value / 1_000).toFixed(0)}K`;
}

type SortKey = "projectName" | "value" | "status" | null;

const STATUS_OPTIONS: LeadStatus[] = ["New", "In Review", "Under Review", "Assigned", "Duplicate Alert", "Won", "Lost", "Merged", "Discarded"];
const STAGE_OPTIONS: LeadStage[] = ["Planning", "Tender", "Construction", "Completed"];

interface LeadsTableProps {
  filterStatus?: string;
  leads?: Lead[];
}

export function LeadsTable({ filterStatus: externalFilter, leads: propLeads }: LeadsTableProps) {
  // Use injected leads prop if provided; empty array when no data yet.
  const leads = propLeads ?? [];
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(externalFilter || "");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const navigate = useNavigate();

  // LW-B2 fix: sync externalFilter prop into local state whenever the parent
  // changes it (e.g., navigating from Dashboard with a pre-set status filter).
  // useState only reads the initial prop value, so a useEffect is required.
  useEffect(() => {
    setStatusFilter(externalFilter || "");
  }, [externalFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let result = leads.filter((l) => {
      const matchesSearch = l.projectName.toLowerCase().includes(search.toLowerCase()) ||
        l.location.toLowerCase().includes(search.toLowerCase()) ||
        l.developer.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = !statusFilter || l.status === statusFilter;
      const matchesStage = !stageFilter || l.stage === stageFilter;
      return matchesSearch && matchesStatus && matchesStage;
    });

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av: string | number = a[sortKey] as string | number;
        const bv: string | number = b[sortKey] as string | number;
        const aComp = typeof av === "string" ? av.toLowerCase() : av;
        const bComp = typeof bv === "string" ? bv.toLowerCase() : bv;
        if (aComp < bComp) return sortDir === "asc" ? -1 : 1;
        if (aComp > bComp) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [leads, search, statusFilter, stageFilter, sortKey, sortDir]);

  const activeFilters = [
    statusFilter && { key: "status", label: statusFilter, clear: () => setStatusFilter("") },
    stageFilter && { key: "stage", label: stageFilter, clear: () => setStageFilter("") },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown className={cn("w-3 h-3 ml-0.5 inline-block opacity-40 group-hover:opacity-100 transition-opacity", sortKey === k && "opacity-100 text-primary")} />
  );

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search leads, developer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            variant={filterOpen ? "default" : "outline"}
            size="sm"
            className="h-9 gap-2"
            onClick={() => setFilterOpen(!filterOpen)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilters.length > 0 && (
              <span className="bg-primary-foreground text-primary rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold">
                {activeFilters.length}
              </span>
            )}
          </Button>
          <div className="text-xs text-muted-foreground ml-auto">
            <span className="font-semibold text-foreground">{filtered.length}</span> of {leads.length} leads
          </div>
        </div>

        {/* Filter Panel */}
        <AnimatePresence>
          {filterOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 p-4 bg-muted/50 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Status:</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs h-8 border border-input bg-background rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">All</option>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Stage:</label>
                  <select
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                    className="text-xs h-8 border border-input bg-background rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">All</option>
                    {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {activeFilters.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                    onClick={() => { setStatusFilter(""); setStageFilter(""); }}>
                    Clear all
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Active:</span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                onClick={f.clear}
                className="flex items-center gap-1 text-xs bg-primary-light text-primary border border-primary/20 rounded-full px-2.5 py-0.5 hover:bg-primary/20 transition-colors font-medium"
              >
                {f.label} <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3.5 text-left">
                  <button onClick={() => handleSort("projectName")} className="group text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
                    Project Name <SortIcon k="projectName" />
                  </button>
                </th>
                <th className="px-5 py-3.5 text-left hidden md:table-cell">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</span>
                </th>
                <th className="px-5 py-3.5 text-right">
                  <button onClick={() => handleSort("value")} className="group text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
                    Value <SortIcon k="value" />
                  </button>
                </th>
                <th className="px-5 py-3.5 text-left hidden lg:table-cell">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</span>
                </th>
                <th className="px-5 py-3.5 text-left">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Match</span>
                </th>
                <th className="px-5 py-3.5 text-left hidden xl:table-cell">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Synergy Bundle</span>
                </th>
                <th className="px-5 py-3.5 text-left">
                  <button onClick={() => handleSort("status")} className="group text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
                    Status <SortIcon k="status" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                        <Search className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">No leads found</p>
                        <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); setStageFilter(""); }}>
                        Clear filters
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <motion.tr
                    key={lead.id}
                    layout
                    className={cn(
                      "table-row-hover transition-colors",
                      lead.isDuplicate && "bg-destructive/5"
                    )}
                    onClick={() => {
                      // Only redirect to conflict resolution for ACTIVE (unresolved) duplicates.
                      // Merged / Discarded leads have isDuplicate=false after resolution, so
                      // they open the SmartDrawer like any normal lead.
                      if (lead.isDuplicate && lead.status === "Duplicate Alert") navigate("/conflicts");
                      else setSelectedLead(lead);
                    }}
                  >
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-sm font-semibold text-foreground leading-tight">{lead.projectName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{lead.id} · {lead.type}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{lead.location}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-bold text-foreground">{formatCurrency(lead.value)}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">{lead.stage}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {/* Always show AI match score and BU — even for duplicate-flagged leads.
                          A small indicator marks unresolved conflicts without hiding the AI data. */}
                      <div className="space-y-1">
                        {lead.isDuplicate && lead.status === "Duplicate Alert" && (
                          <span className="flex items-center gap-1 text-[10px] text-destructive font-semibold leading-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse flex-shrink-0" />
                            Conflict pending
                          </span>
                        )}
                        <MatchScoreBadge
                          score={lead.matches[0]?.score ?? 0}
                          bu={lead.matches[0]?.bu ?? "—"}
                          size="sm"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden xl:table-cell">
                      {lead.crossSell.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {lead.crossSell.slice(0, 3).map((cs, i) => {
                            const colors = [
                              "bg-primary/10 text-primary border-primary/20",
                              "bg-success-light text-success border-success/20",
                              "bg-warning-light text-warning border-warning/20",
                              "bg-info-light text-info border-info/20",
                            ];
                            const shortName = cs.product.replace(/^(Starken |Ajiya |G-Cast |Signature |Fiamma |Premium |Fire[ -])/i, "");
                            return (
                              <span key={i} className={cn("inline-flex items-center text-[10px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap", colors[i % colors.length])}>
                                + {shortName}
                              </span>
                            );
                          })}
                          {lead.crossSell.length > 3 && (
                            <span className="text-[10px] text-muted-foreground font-medium">+{lead.crossSell.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={lead.status} />
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer — total count summary only; pagination is handled by the parent page */}
        <div className="px-5 py-3 border-t border-border bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span>
            {filtered.length !== leads.length && (
              <> (filtered) of <span className="font-semibold text-foreground">{leads.length}</span> on this page</>
            )}
            {filtered.length === leads.length && <> leads on this page</>}
          </div>
        </div>
      </div>

      <SmartDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </>
  );
}
