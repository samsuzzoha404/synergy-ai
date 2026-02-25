import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Brain, Sparkles, CheckCircle2, Building2, MapPin, DollarSign,
  Users, Package, Calendar, Layers, Phone, Mail, Send, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchScoreBadge, StatusBadge } from "@/components/StatusBadge";
import { Lead } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface SmartDrawerProps {
  lead: Lead | null;
  onClose: () => void;
}

function formatCurrency(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${(value / 1_000).toFixed(0)}K`;
}

const BU_CONTACTS: Record<string, { name: string; phone: string; email: string }> = {
  "Stucken": { name: "Azrul Hamid", phone: "+60 12-388 4521", email: "azrul.hamid@stucken.com.my" },
  "Ajiya": { name: "Priya Chandran", phone: "+60 12-771 2034", email: "priya@ajiya.com.my" },
  "G-Cast": { name: "Wong Khai Seng", phone: "+60 16-223 9810", email: "ks.wong@gcast.com.my" },
  "Signature": { name: "Nurul Aina", phone: "+60 11-902 5566", email: "nurul@signature.com.my" },
  "Fiamma": { name: "Ravi Kumar", phone: "+60 17-554 8890", email: "ravi@fiamma.com.my" },
};

export function SmartDrawer({ lead, onClose }: SmartDrawerProps) {
  const [assigning, setAssigning] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "contact">("overview");

  const handleApprove = () => {
    if (!lead) return;
    setAssigning(true);
    setTimeout(() => {
      setAssigning(false);
      toast({
        title: "✅ Lead Assigned Successfully",
        description: `${lead.projectName} assigned to ${lead.matches[0]?.bu}. SMS + email sent to Sales Manager.`,
        duration: 5000,
      });
      onClose();
    }, 1500);
  };

  const topBU = lead?.matches[0]?.bu;
  // Partial matching: handles cases where the AI returns "Stucken AAC" but
  // the key in BU_CONTACTS is "Stucken" (BUG-F6).
  const contact = topBU
    ? BU_CONTACTS[topBU] ??
      Object.entries(BU_CONTACTS).find(
        ([key]) => topBU.toLowerCase().includes(key.toLowerCase()) ||
                   key.toLowerCase().includes(topBU.toLowerCase())
      )?.[1] ??
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
              {(["overview", "contact"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-1 py-3 text-xs font-semibold capitalize border-b-2 mr-5 transition-colors",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "overview" ? "AI Overview" : "BU Contact"}
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
                      Based on {Math.floor(Math.random() * 30 + 30)} historical projects · Confidence: High · 73% acceptance rate
                    </div>
                  </div>
                </>
              ) : (
                /* Contact Tab */
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
                          {contact.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{topBU} Sales Manager</p>
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
                      📱 <strong className="text-foreground">SMS to {contact?.name}:</strong><br />
                      "New lead assigned: {lead.projectName} ({formatCurrency(lead.value)}) — {lead.location}. Please review and initiate contact within 24 hours. — Synergy Genius"
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Footer */}
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
