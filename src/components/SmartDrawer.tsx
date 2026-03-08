import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Brain, Sparkles, CheckCircle2, Building2, MapPin, DollarSign,
  Users, Package, Calendar, Layers, Phone, Mail, Send, Clock,
  FileText, PhoneCall, AtSign, Activity, Plus, Loader2, History, GitCommitHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MatchScoreBadge, StatusBadge } from "@/components/StatusBadge";
import { Lead } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLeadActivities, useCreateActivity, useAuditLogs, useUpdateLeadStage, useBUContacts } from "@/hooks/useLeads";
import type { AuditLog, LeadActivity } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface SmartDrawerProps {
  lead: Lead | null;
  onClose: () => void;
}

function formatCurrency(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${(value / 1_000).toFixed(0)}K`;
}



export function SmartDrawer({ lead, onClose }: SmartDrawerProps) {
  const [assigning, setAssigning] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "contact" | "activities" | "audit">("overview");
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<"Note" | "Call" | "Email">("Note");

  const { user } = useAuth();

  // LW-B4 fix: reset tab and note state whenever a different lead is opened.
  // Without this, switching from lead A (on Activities tab) to lead B keeps
  // the Activities tab active, showing B's activities under the wrong context.
  useEffect(() => {
    if (lead) {
      setActiveTab("overview");
      setNoteText("");
      setNoteType("Note");
    }
  }, [lead?.id]);

  const { data: activities = [], isLoading: activitiesLoading } = useLeadActivities(lead?.id ?? null);
  const { mutateAsync: createActivity, isPending: submittingNote } = useCreateActivity(lead?.id ?? "");
  const { data: auditLogs = [], isLoading: auditLoading } = useAuditLogs(lead?.id ?? null);
  const { data: buContacts = [] } = useBUContacts();

  // Stable "historical projects" count per lead — deterministic from lead id
  // to avoid re-generating on every render (T-02: no Math.random() in JSX).
  const historicalCount = useMemo(() => {
    if (!lead) return 43;
    const seed = lead.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return 30 + (seed % 30);
  }, [lead?.id]);

  const { mutateAsync: updateLead } = useUpdateLeadStage();

  const handleApprove = async () => {
    if (!lead) return;
    setAssigning(true);
    try {
      await updateLead({ leadId: lead.id, update: { status: 'Assigned' } });
      toast({
        title: '✅ Lead Assigned Successfully',
        description: `${lead.projectName} assigned to ${lead.matches[0]?.bu}. Email notification sent to admin.`,
        duration: 5000,
      });
      onClose();
    } catch {
      toast({
        title: 'Assignment failed',
        description: 'Could not update lead status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  const topBU = lead?.matches[0]?.bu;
  // Partial matching: handles cases where the AI returns "Stucken AAC" but
  // the BU key in bu_contacts.json is "Stucken" (BUG-F6).
  const contact = topBU
    ? buContacts.find((c) => c.bu === topBU) ??
      buContacts.find(
        (c) =>
          topBU.toLowerCase().includes(c.bu.toLowerCase()) ||
          c.bu.toLowerCase().includes(topBU.toLowerCase()),
      ) ??
      null
    : null;

  return (
    <AnimatePresence>
      {lead && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-card shadow-drawer z-50 flex flex-col overflow-hidden border-l border-border"
          >
            {/* Gradient header strip */}
            <div className="gradient-primary h-1 flex-shrink-0" />

            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0 bg-card">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusBadge status={lead.status} />
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{lead.id}</span>
                </div>
                <h2 className="text-base font-bold text-foreground leading-snug">{lead.projectName}</h2>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{lead.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />{lead.type}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />{lead.createdDate}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0 bg-card px-5">
              {(["overview", "contact", "activities", "audit"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-1 py-3 text-xs font-semibold capitalize border-b-2 mr-5 transition-colors whitespace-nowrap",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "overview"
                    ? "AI Synergy"
                    : tab === "contact"
                    ? "BU Contact"
                    : tab === "activities"
                    ? "Activities & Notes"
                    : "Audit History"}
                </button>
              ))}
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
              {activeTab === "overview" ? (
                <>
                  {/* Project Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: DollarSign, label: "Project Value", value: formatCurrency(lead.value), color: "text-primary" },
                      { icon: Layers, label: "Stage", value: lead.stage, color: "text-foreground" },
                      { icon: Users, label: "Developer", value: lead.developer, color: "text-foreground" },
                      {
                        icon: Building2,
                        label: "Floors / GFA",
                        value: lead.floors ? `${lead.floors}F · ${(lead.gfa! / 1000).toFixed(0)}K sqft` : "—",
                        color: "text-foreground"
                      },
                    ].map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="bg-muted/50 rounded-xl p-3.5 border border-border hover:border-primary/20 transition-colors">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground font-medium">{label}</p>
                        </div>
                        <p className={cn("text-sm font-bold truncate", color)}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* AI Match Scores */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">AI Match Scores</h3>
                        <p className="text-xs text-muted-foreground">Business unit compatibility</p>
                      </div>
                    </div>
                    <div className="space-y-3.5">
                      {lead.matches.map((match, i) => (
                        <div key={match.bu}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-xs font-bold px-1.5 py-0.5 rounded",
                                i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                              )}>
                                {i === 0 ? "★" : `#${i + 1}`}
                              </span>
                              <span className="text-sm font-semibold text-foreground">{match.bu}</span>
                            </div>
                            <span className={cn(
                              "text-sm font-black",
                              match.score >= 80 ? "text-success" : match.score >= 60 ? "text-warning" : "text-destructive"
                            )}>{match.score}%</span>
                          </div>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${match.score}%` }}
                              transition={{ duration: 0.9, delay: i * 0.15, ease: "easeOut" }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: match.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Block A — Action Recommendation */}
                  <div className="bg-info-light border border-info/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-info flex items-center justify-center">
                        <Package className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Suggested Bundle</h3>
                    </div>
                    <p className="text-base font-black text-foreground leading-snug">
                      Pitch <span className="text-primary">{lead.crossSell[0]?.bu} {lead.crossSell[0]?.product}</span>
                    </p>
                    <p className="text-sm font-bold text-info mt-1">
                      Est. Revenue: RM {(lead.value * 0.064 / 1_000_000).toFixed(1)}M
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {lead.crossSell.map((cs, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold border border-info/20 bg-white dark:bg-card rounded-full px-2.5 py-0.5 text-info">
                          <CheckCircle2 className="w-3 h-3" />
                          {cs.product}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Block B — Rationale */}
                  <div className="bg-muted/50 border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Brain className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-muted-foreground">Tribal Knowledge Rationale</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{lead.aiRationale}</p>
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground/70">
                      <Clock className="w-3 h-3" />
                      Based on {historicalCount} historical projects · Confidence: High · 73% acceptance rate
                    </div>
                  </div>
                </>
              ) : activeTab === "contact" ? (
                /* ----- Contact Tab (unchanged) ----- */
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-xl p-4 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recommended BU</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                        {lead.matches[0]?.bu?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{lead.matches[0]?.bu}</p>
                        <p className="text-xs text-muted-foreground">Business Unit · Match: {lead.matches[0]?.score}%</p>
                      </div>
                    </div>
                  </div>

                  {contact && (
                    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales Manager</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground font-bold text-sm">
                          {contact.contact_name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{contact.contact_name}</p>
                          <p className="text-xs text-muted-foreground">{contact.contact_title}</p>
                        </div>
                      </div>
                      <div className="space-y-2 pt-1">
                        <a href={`tel:${contact.phone}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted transition-colors group">
                          <div className="w-7 h-7 rounded-lg bg-success-light flex items-center justify-center group-hover:bg-success/20 transition-colors">
                            <Phone className="w-3.5 h-3.5 text-success" />
                          </div>
                          <span className="text-sm text-foreground font-medium">{contact.phone}</span>
                        </a>
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted transition-colors group">
                          <div className="w-7 h-7 rounded-lg bg-info-light flex items-center justify-center group-hover:bg-info/20 transition-colors">
                            <Mail className="w-3.5 h-3.5 text-info" />
                          </div>
                          <span className="text-sm text-foreground font-medium">{contact.email}</span>
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="bg-primary-light border border-primary/20 rounded-xl p-4">
                    <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" />
                      Notification Preview
                    </p>
                    <div className="bg-card rounded-lg p-3 border border-border text-xs text-muted-foreground leading-relaxed">
                      � <strong className="text-foreground">Email to {contact?.contact_name}:</strong><br />
                      "New lead assigned: {lead.projectName} ({formatCurrency(lead.value)}) — {lead.location}. Please review and initiate contact within 24 hours. — Synergy Genius"
                    </div>
                  </div>
                </div>
              ) : activeTab === "activities" ? (
                /* ----- Activities & Notes Tab ----- */
                <div className="space-y-4">
                  {/* Add Note */}
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Log Activity</p>

                    {/* Activity type pills */}
                    <div className="flex gap-2">
                      {(["Note", "Call", "Email"] as const).map((type) => {
                        const Icon = type === "Note" ? FileText : type === "Call" ? PhoneCall : AtSign;
                        return (
                          <button
                            key={type}
                            onClick={() => setNoteType(type)}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all",
                              noteType === type
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:border-primary/40",
                            )}
                          >
                            <Icon className="w-3 h-3" />
                            {type}
                          </button>
                        );
                      })}
                    </div>

                    <Textarea
                      placeholder={`Add a ${noteType.toLowerCase()}…`}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                    />

                    <Button
                      size="sm"
                      disabled={!noteText.trim() || submittingNote}
                      onClick={async () => {
                        if (!noteText.trim()) return;
                        try {
                          await createActivity({
                            user_name: user?.name ?? "Sales Rep",
                            activity_type: noteType,
                            content: noteText.trim(),
                          });
                          setNoteText("");
                          toast({ title: `✅ ${noteType} logged`, duration: 3000 });
                        } catch {
                          toast({ title: "Failed to save note", variant: "destructive", duration: 3000 });
                        }
                      }}
                      className="w-full gradient-primary text-white font-semibold"
                    >
                      {submittingNote ? (
                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 mr-2" />
                      )}
                      Add {noteType}
                    </Button>
                  </div>

                  {/* Timeline */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Activity Timeline</p>

                    {activitiesLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span className="text-sm">Loading activities…</span>
                      </div>
                    ) : activities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Activity className="w-8 h-8 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">No activities yet</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Add a note above to start the conversation.</p>
                      </div>
                    ) : (
                      <div className="relative pl-5 space-y-4">
                        {/* Vertical timeline line */}
                        <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />

                        {[...activities].reverse().map((activity) => {
                          const Icon = activity.activity_type === "Call"
                            ? PhoneCall
                            : activity.activity_type === "Email"
                            ? AtSign
                            : activity.activity_type === "System"
                            ? Activity
                            : FileText;
                          const dotColor =
                            activity.activity_type === "Call" ? "bg-success" :
                            activity.activity_type === "Email" ? "bg-info" :
                            activity.activity_type === "System" ? "bg-muted-foreground" :
                            "bg-primary";

                          return (
                            <div key={activity.id} className="relative">
                              {/* Timeline dot */}
                              <div className={cn("absolute -left-3.5 top-1 w-2.5 h-2.5 rounded-full border-2 border-card", dotColor)} />

                              <div className="bg-muted/50 border border-border rounded-xl p-3.5">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Icon className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs font-bold text-foreground">{activity.user_name}</span>
                                    <span className="text-xs text-muted-foreground">· {activity.activity_type}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(activity.timestamp).toLocaleString("en-MY", {
                                      month: "short", day: "numeric",
                                      hour: "2-digit", minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <p className="text-sm text-foreground leading-relaxed">{activity.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ----- Audit History Tab ----- */
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                      <History className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Change History</p>
                      <p className="text-xs text-muted-foreground">Immutable audit trail of all edits</p>
                    </div>
                  </div>

                  {auditLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-sm">Loading history…</span>
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <GitCommitHorizontal className="w-8 h-8 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">No changes recorded yet</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Move this lead between Kanban stages to start the audit trail.
                      </p>
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-4">
                      {/* Vertical timeline spine */}
                      <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

                      {[...auditLogs].reverse().map((log: AuditLog) => {
                        const isStageChange = log.field_name === "stage";
                        const dotColor = isStageChange ? "bg-primary" : "bg-warning";

                        return (
                          <div key={log.id} className="relative">
                            {/* Timeline node */}
                            <div
                              className={cn(
                                "absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                                dotColor,
                              )}
                            />

                            <div className="bg-muted/50 border border-border rounded-xl p-3.5">
                              {/* Top row: action + timestamp */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={cn(
                                      "inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                                      isStageChange
                                        ? "bg-primary/10 text-primary"
                                        : "bg-warning/10 text-warning",
                                    )}
                                  >
                                    {log.action}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground/60 flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                                  <Clock className="w-3 h-3" />
                                  {new Date(log.timestamp).toLocaleString("en-MY", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>

                              {/* Change description */}
                              <p className="text-sm text-foreground leading-relaxed">
                                <span className="font-semibold">{log.user_name}</span>
                                {" moved "}
                                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                  {log.field_name}
                                </span>
                                {" from "}
                                <span className="font-bold text-destructive/80">{log.previous_value}</span>
                                {" → "}
                                <span className="font-bold text-success">{log.new_value}</span>
                              </p>

                              {/* Author email */}
                              <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                                <AtSign className="w-3 h-3" />
                                {log.user_email}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Footer */}
            {/* LW-B6 fix: hide Approve & Assign for leads that are already in a
                terminal state (Merged, Discarded, Won, Lost). These leads need
                no further action and re-assigning them would create inconsistencies. */}
            {["Merged", "Discarded", "Won", "Lost"].includes(lead.status) ? (
              <div className="border-t border-border p-4 flex-shrink-0 bg-card">
                <p className="text-xs text-muted-foreground text-center">
                  This lead is{" "}
                  <span className="font-semibold capitalize">{lead.status.toLowerCase()}</span>
                  {" "}— no further action required.
                </p>
              </div>
            ) : (
              <div className="border-t border-border p-4 flex-shrink-0 bg-card space-y-3">
                <div className="flex gap-3">
                  <Button
                    onClick={handleApprove}
                    disabled={assigning}
                    className="flex-1 gradient-primary text-white font-bold"
                  >
                    {assigning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Assigning...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Approve & Assign
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={onClose} className="flex-1">
                    Defer Review
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  SMS + email will be sent to {lead.matches[0]?.bu} Sales Manager upon approval
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
