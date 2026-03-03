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

import { useMemo, useRef, useState } from "react";
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
import { GripVertical, DollarSign, Brain } from "lucide-react";
import { Lead, LeadStage } from "@/data/mockData";
import { useUpdateLeadStage } from "@/hooks/useLeads";
import { cn } from "@/lib/utils";
import { MatchScoreBadge } from "@/components/StatusBadge";

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

// ---------------------------------------------------------------------------
// Lead Card (sortable item)
// ---------------------------------------------------------------------------
interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
  isDragging?: boolean;
  /** When true the click handler is suppressed (drag just ended). */
  suppressClick?: boolean;
}

function LeadCard({ lead, onClick, isDragging = false, suppressClick = false }: LeadCardProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border border-border rounded-xl p-3.5 cursor-pointer select-none",
        "hover:border-primary/30 hover:shadow-sm transition-all duration-150",
        (sortableDragging || isDragging) && "opacity-40 shadow-xl ring-2 ring-primary/30",
      )}
      onClick={() => { if (!suppressClick) onClick(lead); }}
    >
      {/* Drag handle — listeners bound here only, not on the whole card */}
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {lead.projectName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.location}</p>
        </div>
      </div>

      {/* Value + AI score */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1 text-xs font-bold text-success">
          <DollarSign className="w-3 h-3" />
          {formatValue(lead.value)}
        </div>
        {topMatch && (
          <div className="flex items-center gap-1">
            <Brain className="w-3 h-3 text-muted-foreground" />
            <MatchScoreBadge score={topMatch.score} bu={topMatch.bu} size="sm" />
          </div>
        )}
      </div>

      {/* Developer chip */}
      <p className="mt-2 text-xs text-muted-foreground truncate border-t border-border pt-2">
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
  suppressClick: boolean;
}

function KanbanColumn({ stage, leads, onCardClick, suppressClick }: ColumnProps) {
  const meta = STAGE_META[stage];
  const totalValue = leads.reduce((s, l) => s + l.value, 0);

  // Register this column as a droppable target so @dnd-kit can detect
  // cross-column and empty-column drops via the collision algorithm.
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-1">
      {/* Column header */}
      <div className={cn("rounded-xl px-3 py-2.5 mb-3 border border-border", meta.headerBg)}>
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

      {/* Droppable + sortable cards area.
          setNodeRef makes this div the drop target for the stage column.
          rectSortingStrategy handles 2-D / multi-container positioning correctly. */}
      <SortableContext items={leads.map((l) => l.id)} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-col gap-2.5 flex-1 min-h-[120px] rounded-xl p-1 transition-colors duration-150",
            isOver && "bg-primary/5 ring-1 ring-primary/20",
          )}
        >
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={onCardClick}
              suppressClick={suppressClick}
            />
          ))}
          {leads.length === 0 && (
            <div className="flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground/60">
              Drop here
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

  // wasDragging: set to true the moment a drag completes, cleared on the next
  // event loop tick. The LeadCard onClick guard reads this to prevent the
  // pointerup→click sequence from opening the SmartDrawer after a drag.
  const wasDragging = useRef(false);

  // Sync localLeads from the server-truth `leads` prop ONLY while not dragging.
  // Doing this during an active drag would overwrite our optimistic stage moves.
  // We skip the sync while activeId is set (drag in progress) so the board
  // position stays stable mid-flight. After the drag ends, activeId is null and
  // the mutation's setQueriesData already updated the cache to the new stage, so
  // the next sync lands cleanly on the correct final state.
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  if (activeId === null && localLeads !== leads) {
    // Synchronous state update during render — safe in React 18 when the
    // condition is referentially stable (leads identity changes only on fetch).
    setLocalLeads(leads);
  }

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
    wasDragging.current = false;
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

    // Mark that a drag just happened so the card's onClick is suppressed.
    wasDragging.current = true;
    setTimeout(() => { wasDragging.current = false; }, 0);

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
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            leads={byStage[stage]}
            onCardClick={onLeadClick}
            suppressClick={wasDragging.current}
          />
        ))}
      </div>

      {/* Drag overlay — floating card while dragging */}
      <DragOverlay>
        {activeLead ? (
          <LeadCard lead={activeLead} onClick={() => {}} isDragging suppressClick />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
