/**
 * LeadPipeline.tsx — Kanban Board for Pipeline View
 * ===================================================
 * Renders leads grouped by LeadStage columns with drag-and-drop reordering
 * powered by @dnd-kit (Multiple Containers pattern). On drop, calls
 * PATCH /api/leads/{id} via TanStack Query and updates the local cache so
 * all views stay in sync.
 *
 * Architecture: each column is a useDroppable container + SortableContext.
 * The root DndContext coordinates cross-column movement via onDragOver.
 *
 * Columns: Planning → Tender → Construction → Completed
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, DollarSign, Brain, ArrowUpRight, Inbox } from "lucide-react";
import { Lead, LeadStage } from "@/data/mockData";
import { useUpdateLeadStage } from "@/hooks/useLeads";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STAGES: LeadStage[] = ["Planning", "Tender", "Construction", "Completed"];

const STAGE_META: Record<LeadStage, { color: string; headerBg: string; dot: string }> = {
  Planning:     { color: "text-blue-600",   headerBg: "bg-blue-50 dark:bg-blue-950/40",   dot: "bg-blue-500" },
  Tender:       { color: "text-amber-600",  headerBg: "bg-amber-50 dark:bg-amber-950/40", dot: "bg-amber-500" },
  Construction: { color: "text-violet-600", headerBg: "bg-violet-50 dark:bg-violet-950/40",dot: "bg-violet-500" },
  Completed:    { color: "text-emerald-600",headerBg: "bg-emerald-50 dark:bg-emerald-950/40",dot: "bg-emerald-500" },
};

function formatValue(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(0)}M`;
  return `RM ${(value / 1_000).toFixed(0)}K`;
}

// Returns Tailwind classes for the AI match score badge based on score tier.
function scoreClasses(score: number): string {
  if (score >= 90) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (score >= 75) return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
}

// ---------------------------------------------------------------------------
// Lead Card (sortable item)
// ---------------------------------------------------------------------------
interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
  isDragging?: boolean;
}

function LeadCard({ lead, onClick, isDragging = false }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const topMatch = lead.matches[0];

  // ── Visual state: floating overlay card (isDragging prop) vs. ghost placeholder
  const isActivelyDragging = isDragging;           // DragOverlay copy — elevated
  const isGhost            = sortableDragging;     // in-place ghost — faded

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        // Base
        "group relative bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 select-none",
        // Idle transitions
        "transition-all duration-200 ease-out",
        // Idle hover
        !isGhost && !isActivelyDragging && [
          "cursor-grab active:cursor-grabbing",
          "hover:border-slate-600 hover:shadow-lg hover:shadow-black/40",
          "shadow-md shadow-black/20",
        ],
        // In-place ghost (card slot while dragging)
        isGhost && !isActivelyDragging && "opacity-30 cursor-grabbing",
        // Floating overlay card (DragOverlay) — elevated, tilted
        isActivelyDragging && [
          "scale-105 rotate-2 opacity-90 cursor-grabbing",
          "shadow-2xl shadow-indigo-500/20 border-indigo-500 z-50",
        ],
      )}
      onClick={() => onClick(lead)}
    >
      {/* ── Top row: grip + title + hover-expand icon ── */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-muted-foreground/30 flex-shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {lead.projectName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.location}</p>
        </div>
        {/* Expand affordance — appears on hover */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-slate-500 hover:text-slate-300">
          <ArrowUpRight className="w-4 h-4" />
        </div>
      </div>

      {/* ── Value + AI score ── */}
      <div className="flex items-center justify-between mt-3">
        {/* Prominent value */}
        <div className="flex items-center gap-1">
          <DollarSign className="w-3 h-3 text-emerald-400" />
          <span className="text-xs font-bold tracking-tight text-emerald-400">
            {formatValue(lead.value)}
          </span>
        </div>
        {/* Dynamic AI badge */}
        {topMatch && (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            scoreClasses(topMatch.score),
          )}>
            <Brain className="w-3 h-3" />
            {topMatch.score}%
          </div>
        )}
      </div>

      {/* ── Developer chip ── */}
      <p className="mt-2 text-xs text-muted-foreground truncate border-t border-slate-700/60 pt-2">
        {lead.developer}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column — each column is a registered @dnd-kit droppable container
// ---------------------------------------------------------------------------
interface ColumnProps {
  stage: LeadStage;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}

function KanbanColumn({ stage, leads, onCardClick }: ColumnProps) {
  const meta = STAGE_META[stage];
  const totalValue = leads.reduce((s, l) => s + l.value, 0);

  // Register this column as a droppable target so @dnd-kit can detect
  // cross-column and empty-column drops via the collision algorithm.
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    // Fixed height column — flex-col so the header stays sticky and the
    // card area fills the remaining space and scrolls independently.
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-shrink-0 h-[calc(100vh-250px)]">
      {/* ── Sticky column header ── */}
      <div className={cn("flex-shrink-0 rounded-xl px-3 py-2.5 mb-2 border border-border", meta.headerBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", meta.dot)} />
            <span className={cn("text-sm font-bold", meta.color)}>{stage}</span>
          </div>
          <span className="text-xs font-semibold bg-card border border-border rounded-full px-2 py-0.5 text-foreground">
            {leads.length}
          </span>
        </div>
        {leads.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 ml-4">
            {formatValue(totalValue)} pipeline
          </p>
        )}
      </div>

      {/* ── Scrollable card area ──
          SortableContext wraps the scrollable div so @dnd-kit can locate items
          within their scroll container. setNodeRef is on the inner div so
          droppable collision detection maps to the scrollable region. */}
      <SortableContext items={leads.map((l) => l.id)} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden",
            "flex flex-col gap-2.5 min-h-[80px] rounded-xl p-2 transition-colors duration-150",
            // Custom slim scrollbar
            "scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent hover:scrollbar-thumb-slate-600",
            isOver && "bg-primary/5 ring-1 ring-primary/20",
          )}
        >
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={onCardClick}
            />
          ))}
          {leads.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 p-6 mt-1 rounded-xl border-2 border-dashed border-slate-700/50 text-slate-500">
              <Inbox className="w-7 h-7 opacity-40" />
              <p className="text-xs text-center leading-relaxed opacity-70">
                No leads yet.<br />Drag a card here.
              </p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export: LeadPipeline
// ---------------------------------------------------------------------------
interface LeadPipelineProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}

export function LeadPipeline({ leads, onLeadClick }: LeadPipelineProps) {
  const { mutate: moveStage } = useUpdateLeadStage();

  // Optimistic local copy — updated immediately on drag so the UI feels instant.
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads);

  // ID of the card currently being dragged (null when idle).
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync localLeads from the server-truth `leads` prop ONLY while not dragging.
  // Doing this during an active drag would overwrite our optimistic stage moves.
  // We skip the sync while activeId is set (drag in progress) so the board
  // position stays stable mid-flight. After the drag ends, activeId is null and
  // the mutation's setQueriesData already updated the cache to the new stage, so
  // the next sync lands cleanly on the correct final state.
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  // Bug #1 fix: replace the render-phase sync with a useEffect so it only
  // fires when `leads` (server data) actually changes — NOT when activeId
  // transitions to null on drag-end. By omitting activeId from the dep array,
  // the optimistic stage update applied in handleDragOver is preserved until
  // the mutation's setQueriesData / invalidateQueries delivers the confirmed
  // server state, at which point `leads` changes and this effect runs cleanly.
  useEffect(() => {
    if (activeId === null) {
      setLocalLeads(leads);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);

  const activeLead = useMemo(
    () => localLeads.find((l) => l.id === activeId) ?? null,
    [activeId, localLeads],
  );

  const byStage = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = {
      Planning: [], Tender: [], Construction: [], Completed: [],
    };
    for (const lead of localLeads) {
      const s = lead.stage in map ? lead.stage : "Planning";
      map[s].push(lead);
    }
    return map;
  }, [localLeads]);

  // PointerSensor: distance:5 means small taps don't accidentally start a drag.
  // TouchSensor: delay:250 + tolerance:5 gives mobile users time to scroll before
  // the board claims the touch gesture as a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeLeadId = String(active.id);
    const overId = String(over.id);
    if (activeLeadId === overId) return;

    // Resolve target stage: over can be a column droppable (stage name)
    // OR another card — in which case we read that card's current stage.
    const isOverColumn = (STAGES as string[]).includes(overId);
    const targetStage: LeadStage | null = isOverColumn
      ? (overId as LeadStage)
      : (localLeads.find((l) => l.id === overId)?.stage ?? null);

    if (!targetStage) return;

    const activeStage = localLeads.find((l) => l.id === activeLeadId)?.stage;
    if (activeStage === targetStage) return;

    // Immediately move the card to the target stage in local state so the
    // column re-renders with the card in the right place while dragging.
    setLocalLeads((prev) =>
      prev.map((l) => (l.id === activeLeadId ? { ...l, stage: targetStage } : l)),
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const leadId = String(active.id);
    setActiveId(null);

    if (!over) {
      // Dropped outside any droppable — revert to server truth.
      setLocalLeads(leadsRef.current);
      return;
    }

    const overId = String(over.id);
    const isOverColumn = (STAGES as string[]).includes(overId);
    const newStage: LeadStage | null = isOverColumn
      ? (overId as LeadStage)
      : (localLeads.find((l) => l.id === overId)?.stage ?? null);

    if (!newStage) {
      setLocalLeads(leadsRef.current);
      return;
    }

    // Compare against the *original* server stage, not the optimistic one,
    // to skip a mutation when the card was returned to its starting column.
    const originalStage = leadsRef.current.find((l) => l.id === leadId)?.stage;
    if (newStage === originalStage) return;

    // Delegate to the hook — it distinguishes mock vs real leads internally.
    moveStage({ leadId, update: { stage: newStage } });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      autoScroll
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            leads={byStage[stage]}
            onCardClick={onLeadClick}
          />
        ))}
      </div>

      {/* Drag overlay — floating card while dragging */}
      <DragOverlay>
        {activeLead ? (
          <LeadCard lead={activeLead} onClick={() => {}} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
