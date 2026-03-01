/**
 * LeadPipeline.tsx — Kanban Board for Pipeline View
 * ===================================================
 * Renders leads grouped by LeadStage columns with drag-and-drop reordering
 * powered by @dnd-kit. On drop, calls PATCH /api/leads/{id} via TanStack Query
 * and invalidates the leads cache so all views stay in sync.
 *
 * Columns: Planning → Tender → Construction → Completed
 */

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border border-border rounded-xl p-3.5 cursor-pointer select-none",
        "hover:border-primary/30 hover:shadow-sm transition-all duration-150",
        (sortableDragging || isDragging) && "opacity-40 shadow-xl ring-2 ring-primary/30",
      )}
      onClick={() => onClick(lead)}
    >
      {/* Drag handle + project name row */}
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
// Column
// ---------------------------------------------------------------------------
interface ColumnProps {
  stage: LeadStage;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}

function KanbanColumn({ stage, leads, onCardClick }: ColumnProps) {
  const meta = STAGE_META[stage];
  const totalValue = leads.reduce((s, l) => s + l.value, 0);

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

      {/* Droppable cards */}
      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2.5 flex-1 min-h-[120px] rounded-xl p-1">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={onCardClick} />
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

  // Local optimistic copy of leads so the board updates instantly on drop.
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync localLeads when parent data refreshes (e.g., after TanStack Query revalidation).
  // Must be useEffect — setState inside useMemo is a React anti-pattern that causes
  // extra renders and Strict Mode double-invocation warnings.
  useEffect(() => {
    setLocalLeads(leads);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const overId = String(over.id);

    // Determine target stage: either a column id (stage name) or another card's stage
    const targetStage =
      (STAGES as string[]).includes(overId)
        ? (overId as LeadStage)
        : (localLeads.find((l) => l.id === overId)?.stage ?? null);

    if (!targetStage) return;
    const activeStage = localLeads.find((l) => l.id === String(active.id))?.stage;
    if (activeStage === targetStage) return;

    // Optimistic update
    setLocalLeads((prev) =>
      prev.map((l) => (l.id === String(active.id) ? { ...l, stage: targetStage } : l)),
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const leadId = String(active.id);
    setActiveId(null);

    if (!over) return;
    const overId = String(over.id);
    const newStage =
      (STAGES as string[]).includes(overId)
        ? (overId as LeadStage)
        : (localLeads.find((l) => l.id === overId)?.stage ?? null);

    if (!newStage) return;

    // Persist via PATCH — falls back gracefully if backend is unavailable
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
