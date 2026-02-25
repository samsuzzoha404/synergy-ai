import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, GitMerge, Trash2, Copy, CheckCircle, ChevronRight, Shield, Loader2 } from "lucide-react";
import { leads, existingDuplicateLead } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, useConflicts } from "@/hooks/useLeads";

function formatCurrency(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${value.toLocaleString()}`;
}

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/40 text-foreground rounded-sm px-0.5 font-semibold">{text.slice(idx, idx + highlight.length)}</mark>
      {text.slice(idx + highlight.length)}
    </>
  );
}

interface FieldRowProps {
  label: string;
  newVal: string;
  existingVal: string;
  highlight: string;
  match: boolean;
}

function FieldRow({ label, newVal, existingVal, highlight, match }: FieldRowProps) {
  return (
    <div className={cn("grid grid-cols-[1fr_1fr] items-center py-3 border-b border-border last:border-0", match && "bg-warning/5 rounded-lg")}>
      <div className="px-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
          {label}
          {match && <span className="text-[10px] bg-warning/20 text-warning px-1 rounded font-medium">Match</span>}
        </p>
        <p className="text-sm font-semibold text-foreground">
          <HighlightText text={newVal} highlight={highlight} />
        </p>
      </div>
      <div className="px-4 border-l border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <p className="text-sm font-semibold text-foreground">
          <HighlightText text={existingVal} highlight={highlight} />
        </p>
      </div>
    </div>
  );
}

export default function ConflictResolution() {
  const [resolved, setResolved] = useState(false);
  const queryClient = useQueryClient();

  // Primary data source: live API conflicts
  const { data: apiConflicts = [], isLoading } = useConflicts();

  // Demo fallback: static mock data (shown when backend is offline)
  const mockDuplicate = leads.find((l) => l.isDuplicate);
  const duplicateLead = mockDuplicate;
  const existing = existingDuplicateLead;

  // Total conflict count: prefer real API count, fall back to mock
  const totalConflicts = apiConflicts.length > 0 ? apiConflicts.length : (duplicateLead && !resolved ? 1 : 0);

  const handleAction = (action: "merge" | "discard" | "keep") => {
    const messages = {
      merge: { title: "✅ Leads Merged", desc: "Leads merged. The primary record has been updated with the latest data." },
      discard: { title: "🗑️ New Lead Discarded", desc: "The duplicate lead has been removed. Existing record retained as primary." },
      keep: { title: "📋 Both Records Kept", desc: "Both records tracked independently with a cross-reference link." },
    };
    toast({ title: messages[action].title, description: messages[action].desc, duration: 4000 });

    // Optimistic cache update (BUG-F8): remove the resolved conflict from the
    // TanStack Query cache immediately so the sidebar badge drops without a refetch.
    // If there are live API conflicts, pop the first one (the one just actioned).
    // Otherwise clear entirely for the mock-data demo path.
    queryClient.setQueryData(QUERY_KEYS.conflicts, (prev: unknown) => {
      const current = Array.isArray(prev) ? prev : [];
      return current.length > 0 ? current.slice(1) : [];
    });

    setResolved(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Checking conflict queue…</p>
      </div>
    );
  }

  if (!duplicateLead && totalConflicts === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-full bg-success-light flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">No Conflicts Detected</h2>
        <p className="text-sm text-muted-foreground mt-1">All leads are unique. Great work!</p>
      </div>
    );
  }

  if (resolved) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-16 h-16 rounded-full bg-success-light flex items-center justify-center mb-4"
        >
          <CheckCircle className="w-8 h-8 text-success" />
        </motion.div>
        <h2 className="text-lg font-bold text-foreground">Conflict Resolved!</h2>
        <p className="text-sm text-muted-foreground mt-1">No more pending conflicts to review.</p>
        <Button className="mt-4 gradient-primary text-white" onClick={() => setResolved(false)}>
          Reset Demo
        </Button>
      </div>
    );
  }

  const fields = [
    { label: "Project Name", newVal: duplicateLead.projectName, existingVal: existing.projectName, highlight: "Twin Towers", match: true },
    { label: "Location", newVal: duplicateLead.location, existingVal: existing.location, highlight: "KLCC", match: true },
    { label: "Developer", newVal: duplicateLead.developer, existingVal: existing.developer, highlight: "Petronas", match: true },
    { label: "Value", newVal: formatCurrency(duplicateLead.value), existingVal: formatCurrency(existing.value), highlight: "", match: false },
    { label: "Stage", newVal: duplicateLead.stage, existingVal: existing.stage, highlight: "", match: false },
    { label: "Status", newVal: duplicateLead.status, existingVal: existing.status, highlight: "", match: false },
    { label: "Created", newVal: duplicateLead.createdDate, existingVal: existing.createdDate, highlight: "", match: false },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-destructive" />
            Conflict Resolution
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI detected a duplicate entry — review and decide the action below.
          </p>
        </div>
        <span className="hidden sm:flex items-center gap-1.5 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-1.5 font-semibold flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
          {totalConflicts} Conflict{totalConflicts !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Alert Banner */}
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-destructive">Duplicate Alert: High-confidence match found</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            AI detected <strong className="text-foreground">L003 "Twin Towers Reno"</strong> is a likely duplicate of <strong className="text-foreground">L003-ORIG</strong>. 
            Matching fields are <mark className="bg-warning/40 px-0.5 rounded-sm font-semibold">highlighted in yellow</mark>. Please review and take action.
          </p>
        </div>
      </div>

      {/* AI Similarity Score */}
      <div className="bg-primary-light border border-primary/20 rounded-xl p-4 flex items-center gap-5">
        <div className="flex-shrink-0 text-center">
          <p className="text-4xl font-black text-primary">94%</p>
          <p className="text-xs text-muted-foreground font-medium">Similarity</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">High-confidence duplicate detected</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Matched on: Project Name (87%), Developer (100%), Location (92%), Value proximity (98%)
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {[
              { label: "Name", score: 87 },
              { label: "Developer", score: 100 },
              { label: "Location", score: 92 },
              { label: "Value", score: 98 },
            ].map((m) => (
              <span key={m.label} className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
                {m.label}: {m.score}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison View — Side-by-Side Split */}
      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        {/* Column Headers */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-b border-border">
          <div className="flex items-center gap-2 px-4 py-3 bg-destructive/5 border-b md:border-b-0 md:border-r border-border">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-bold text-destructive uppercase tracking-wide">New Lead (Incoming)</span>
            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{duplicateLead.id}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 bg-success-light">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs font-bold text-success uppercase tracking-wide">Existing Record</span>
            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{existing.id}</span>
          </div>
        </div>

        {/* Mobile: stacked cards */}
        <div className="md:hidden p-4 space-y-4">
          <div className="border border-destructive/30 rounded-xl overflow-hidden">
            <div className="bg-destructive/10 px-4 py-2.5 border-b border-destructive/20 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-bold text-destructive">New Lead · {duplicateLead.id}</span>
            </div>
            <div className="p-4 space-y-3">
              {fields.map((f) => (
                <div key={f.label}>
                  <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    <HighlightText text={f.newVal} highlight={f.highlight} />
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-success/30 rounded-xl overflow-hidden">
            <div className="bg-success-light px-4 py-2.5 border-b border-success/20 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-xs font-bold text-success">Existing · {existing.id}</span>
            </div>
            <div className="p-4 space-y-3">
              {fields.map((f) => (
                <div key={f.label}>
                  <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    <HighlightText text={f.existingVal} highlight={f.highlight} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop: true side-by-side rows */}
        <div className="hidden md:block">
          {fields.map((f) => (
            <FieldRow key={f.label} {...f} />
          ))}
        </div>
      </div>

      {/* AI Recommendation */}
      <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
          <ChevronRight className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">AI Recommendation: Merge Records</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Keep the existing record (L003-ORIG) as primary. Update with the newer contact date and discard L003.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => handleAction("merge")}
          className="flex-1 gradient-primary text-white font-bold gap-2 h-11"
        >
          <GitMerge className="w-4 h-4" />
          Merge Records
        </Button>
        <Button
          onClick={() => handleAction("discard")}
          variant="outline"
          className="flex-1 gap-2 h-11 border-destructive/40 text-destructive hover:bg-destructive/5 font-semibold"
        >
          <Trash2 className="w-4 h-4" />
          Discard New Lead
        </Button>
        <Button
          onClick={() => handleAction("keep")}
          variant="outline"
          className="flex-1 gap-2 h-11 font-semibold"
        >
          <Copy className="w-4 h-4" />
          Keep Both
        </Button>
      </div>
    </div>
  );
}
