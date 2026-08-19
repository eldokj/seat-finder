"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AllocationSummaryCards } from "./AllocationSummaryCards";
import { ConflictList } from "./ConflictList";
import { ConfirmButton } from "./ConfirmButton";
import { ErrorBanner } from "./ErrorBanner";
import { isValidPickTarget, type PickingKind } from "@/lib/validation/seating-workspace-picking";
import { seatAccessibleLabel, additionalSeatAccessibleLabel } from "@/lib/validation/seating-workspace-accessibility";
import type { SeatingWorkspaceData, SeatingCell } from "@/lib/admin/seating-data-io";
import type { ProposedPlacementView, PreviewResult, ActionResult } from "@/app/admin/(dashboard)/daily-events/[id]/seating/actions";

interface SeatingWorkspaceProps {
  eventId: string;
  eventStatus: string;
  data: SeatingWorkspaceData;
  previewAction: (eventId: string, reshuffle: boolean) => Promise<PreviewResult>;
  confirmAction: (
    eventId: string,
    placements: { seatAllocationId: string; roomId: string; roomSeatId: string | null; seatNo: string | null }[]
  ) => Promise<ActionResult>;
  assignAction: (eventId: string, seatAllocationId: string, roomId: string, roomSeatId: string | null, seatNo: string | null) => Promise<ActionResult>;
  swapAction: (eventId: string, seatAllocationIdA: string, seatAllocationIdB: string) => Promise<ActionResult>;
  unseatAction: (eventId: string, seatAllocationId: string) => Promise<ActionResult>;
  resolveConflictsAction: (eventId: string) => Promise<ActionResult>;
  /** Bound server action (daily-events/actions.ts's publishDailyEventAction,
   * .bind(null, eventId)) — reused as-is, not reimplemented, so the publish
   * guard and audit logging stay in exactly one place. */
  publishAction: (formData: FormData) => Promise<void>;
}

type Selected = { kind: "grid"; roomId: string; roomSeatId: string } | { kind: "additional"; roomId: string; seatNo: string };
type Picking = { kind: PickingKind; seatAllocationId: string; registerNo: string };

const CELL_STYLES: Record<string, string> = {
  emptyAvailable: "border-slate-300 bg-white text-slate-400 hover:bg-slate-50",
  disabled: "border-slate-400 bg-slate-300 text-slate-600",
  gap: "border-dashed border-slate-200 bg-transparent text-slate-200",
  occupiedCompliant: "border-green-300 bg-green-100 text-green-900 hover:bg-green-200",
  occupiedViolation: "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200",
  pickTarget: "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-300 hover:bg-blue-100",
  pickIneligible: "border-slate-200 bg-slate-50 text-slate-300 opacity-50",
};
const HIGHLIGHT_CLASS = "ring-4 ring-yellow-400 ring-offset-2";

function gridDomId(roomSeatId: string) {
  return `seat-grid-${roomSeatId}`;
}
function additionalDomId(roomId: string, seatNo: string) {
  return `seat-add-${roomId}-${seatNo}`;
}


export function SeatingWorkspace({
  eventId,
  eventStatus,
  data,
  previewAction,
  confirmAction,
  assignAction,
  swapAction,
  unseatAction,
  resolveConflictsAction,
  publishAction,
}: SeatingWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [preview, setPreview] = useState<ProposedPlacementView[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [pickedStudentId, setPickedStudentId] = useState("");
  const [highlightedRoomSeatId, setHighlightedRoomSeatId] = useState<string | null>(null);

  const roomLabel = useMemo(() => new Map(data.rooms.map((r) => [r.id, r.roomNumber])), [data.rooms]);

  const violatingCells = useMemo(() => data.cells.filter((c) => c.occupant?.status === "violation"), [data.cells]);

  function closeSelection() {
    setSelected(null);
    setPicking(null);
    setPickedStudentId("");
    setActionError(null);
  }

  function runAction(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setActionError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      closeSelection();
      router.refresh();
    });
  }

  function handleRunAutomatic(reshuffle: boolean) {
    setPreviewError(null);
    startTransition(async () => {
      const result = await previewAction(eventId, reshuffle);
      if (!result.ok) {
        setPreviewError(result.error ?? "Unable to generate a preview.");
        setPreview(null);
        return;
      }
      setPreview(result.placements);
    });
  }

  function handleConfirm() {
    if (!preview) return;
    startTransition(async () => {
      const result = await confirmAction(
        eventId,
        preview.map((p) => ({ seatAllocationId: p.seatAllocationId, roomId: p.roomId, roomSeatId: p.roomSeatId, seatNo: p.seatNo }))
      );
      if (!result.success) {
        setPreviewError(result.error ?? "Unable to confirm the allocation.");
        return;
      }
      setPreview(null);
      router.refresh();
    });
  }

  function handleJumpToSeat(roomSeatId: string) {
    const el = document.getElementById(gridDomId(roomSeatId));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedRoomSeatId(roomSeatId);
    window.setTimeout(() => setHighlightedRoomSeatId((current) => (current === roomSeatId ? null : current)), 2500);
  }

  /** Click target for both grid cells and additional-seat buttons — routed
   * through picking mode (visual Move/Swap target selection) when active,
   * otherwise falls back to the normal "open this seat's action bar". */
  function handleActivate(target: { kind: "grid"; roomId: string; roomSeatId: string; occupant: SeatingCell["occupant"] } | { kind: "additional"; roomId: string; seatNo: string; occupant: SeatingCell["occupant"] }) {
    if (picking) {
      const pickable = target.kind === "grid" ? { cellState: data.cells.find((c) => c.roomSeatId === target.roomSeatId)?.cellState ?? "gap", occupantSeatAllocationId: target.occupant?.seatAllocationId ?? null } : { cellState: "available" as const, occupantSeatAllocationId: target.occupant?.seatAllocationId ?? null };
      if (!isValidPickTarget(picking.kind, picking.seatAllocationId, pickable)) return;

      if (picking.kind === "move") {
        runAction(() => assignAction(eventId, picking.seatAllocationId, target.roomId, target.kind === "grid" ? target.roomSeatId : null, target.kind === "additional" ? target.seatNo : null));
      } else {
        runAction(() => swapAction(eventId, picking.seatAllocationId, target.occupant!.seatAllocationId));
      }
      return;
    }

    if (target.kind === "grid") setSelected({ kind: "grid", roomId: target.roomId, roomSeatId: target.roomSeatId });
    else setSelected({ kind: "additional", roomId: target.roomId, seatNo: target.seatNo });
    setActionError(null);
  }

  const selectedCell = selected?.kind === "grid" ? data.cells.find((c) => c.roomSeatId === selected.roomSeatId) : null;
  const selectedAdditional = selected?.kind === "additional" ? data.additionalSlots.find((s) => s.roomId === selected.roomId && s.seatNo === selected.seatNo) : null;
  const selectedOccupant = selectedCell?.occupant ?? selectedAdditional?.occupant ?? null;

  return (
    <div className="space-y-6">
      <AllocationSummaryCards summary={data.summary} />

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleRunAutomatic(false)}
            disabled={isPending || data.rooms.length === 0}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Run Automatic Allocation
          </button>
          <button
            type="button"
            onClick={() => handleRunAutomatic(true)}
            disabled={isPending || data.rooms.length === 0}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reshuffle &amp; Run
          </button>
          {data.summary.violation > 0 && (
            <button
              type="button"
              onClick={() => runAction(() => resolveConflictsAction(eventId))}
              disabled={isPending}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Resolve Conflicts
            </button>
          )}
        </div>
        {data.rooms.length === 0 && <p className="mt-3 text-sm text-amber-700">No rooms are allocated to this session yet — allocate rooms above first.</p>}
        {previewError && <div className="mt-4"><ErrorBanner message={previewError} /></div>}
      </div>

      {preview && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Preview ({preview.length} placements)</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Discard
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {isPending ? "Confirming…" : "Confirm"}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Register No</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Year/Term</th>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Seat</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((p) => (
                  <tr key={p.seatAllocationId}>
                    <td className="px-3 py-1.5">{p.registerNo}</td>
                    <td className="px-3 py-1.5">{p.fullName}</td>
                    <td className="px-3 py-1.5">{p.courseCode}</td>
                    <td className="px-3 py-1.5">{p.year ?? "—"}/{p.term ?? "—"}</td>
                    <td className="px-3 py-1.5">{p.roomNumber}</td>
                    <td className="px-3 py-1.5">
                      {p.seatLabel}
                      {p.seatKind === "additional" && <span className="ml-1 text-[10px] uppercase text-blue-600">additional</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.status === "violation" ? (
                        <span title={p.violationMessages.join(" ")} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">
                          Violation
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase text-green-800">Compliant</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConflictList violatingCells={violatingCells} roomLabel={roomLabel} onJump={handleJumpToSeat} />

      {actionError && <ErrorBanner message={actionError} />}

      {picking && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-400 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">
            {picking.kind === "move" ? `Click an empty seat to move ${picking.registerNo} there.` : `Click an occupied seat to swap with ${picking.registerNo}.`}
          </p>
          <button type="button" onClick={() => setPicking(null)} className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
            Cancel
          </button>
        </div>
      )}

      {selected && !picking && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
          {selectedOccupant ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedOccupant.registerNo} — {selectedOccupant.fullName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedOccupant.programme ?? "—"} · {selectedOccupant.courseCode} · Year {selectedOccupant.year ?? "—"} Term{" "}
                    {selectedOccupant.term ?? "—"} ·{" "}
                    {selectedOccupant.status === "violation" ? (
                      <span className="font-semibold text-amber-700">Rule violation</span>
                    ) : (
                      <span className="font-semibold text-green-700">Rule compliant</span>
                    )}
                  </p>
                  {selectedOccupant.violationMessages.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700">{selectedOccupant.violationMessages.join(" ")}</p>
                  )}
                </div>
                <button type="button" onClick={closeSelection} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  Close
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => runAction(() => unseatAction(eventId, selectedOccupant.seatAllocationId))}
                  disabled={isPending}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  Unseat
                </button>
                <button
                  type="button"
                  onClick={() => setPicking({ kind: "move", seatAllocationId: selectedOccupant.seatAllocationId, registerNo: selectedOccupant.registerNo })}
                  disabled={isPending}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Move…
                </button>
                <button
                  type="button"
                  onClick={() => setPicking({ kind: "swap", seatAllocationId: selectedOccupant.seatAllocationId, registerNo: selectedOccupant.registerNo })}
                  disabled={isPending}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Swap…
                </button>
              </div>
              <p className="text-xs text-slate-400">Move and Swap select the target seat directly in the grid below.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-700">Empty seat</p>
              <select
                value={pickedStudentId}
                onChange={(e) => setPickedStudentId(e.target.value)}
                disabled={isPending}
                aria-label="Choose an unallocated student to assign to this seat"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              >
                <option value="">Choose an unallocated student…</option>
                {data.unallocated.map((u) => (
                  <option key={u.seatAllocationId} value={u.seatAllocationId}>
                    {u.registerNo} — {u.fullName} ({u.courseCode}, Y{u.year ?? "—"} T{u.term ?? "—"})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending || !pickedStudentId || !selected}
                onClick={() => {
                  if (!selected) return;
                  runAction(() =>
                    assignAction(eventId, pickedStudentId, selected.roomId, selected.kind === "grid" ? selected.roomSeatId : null, selected.kind === "additional" ? selected.seatNo : null)
                  );
                }}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                Assign
              </button>
              <button type="button" onClick={closeSelection} className="ml-auto text-xs font-medium text-slate-400 hover:text-slate-600">
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {eventStatus === "draft" && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Publish</h2>
              <p className="text-sm text-slate-500">
                {data.summary.unallocated > 0
                  ? `${data.summary.unallocated} participant(s) still have no seat — resolve before publishing.`
                  : data.summary.violation > 0
                    ? `${data.summary.violation} rule violation warning(s) remain — you can still publish.`
                    : "All participants are seated and rule compliant."}
              </p>
            </div>
            <form action={publishAction}>
              <ConfirmButton
                type="submit"
                disabled={data.summary.unallocated > 0}
                confirmMessage={
                  data.summary.violation > 0
                    ? `Publish anyway? ${data.summary.violation} rule violation warning(s) remain unresolved. Students will immediately be able to search for their seat.`
                    : "Publish this Daily Exam Session? Students will immediately be able to search for their seat."
                }
                className="rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                Publish
              </ConfirmButton>
            </form>
          </div>
        </div>
      )}

      {data.rooms.map((room) => (
        <div key={room.id} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            {room.roomNumber} <span className="text-sm font-normal text-slate-400">{room.code}</span>
          </h2>

          <RoomGrid
            roomLabel={room.roomNumber}
            cells={data.cells.filter((c) => c.roomId === room.id)}
            selected={selected}
            picking={picking}
            highlightedRoomSeatId={highlightedRoomSeatId}
            onActivate={(roomSeatId, occupant) => handleActivate({ kind: "grid", roomId: room.id, roomSeatId, occupant })}
          />

          {room.additionalSeats > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Additional Seats</p>
              <div className="flex flex-wrap gap-2">
                {data.additionalSlots
                  .filter((s) => s.roomId === room.id)
                  .map((slot) => {
                    const isSelected = selected?.kind === "additional" && selected.roomId === room.id && selected.seatNo === slot.seatNo;
                    const eligible = !picking || isValidPickTarget(picking.kind, picking.seatAllocationId, { cellState: "available", occupantSeatAllocationId: slot.occupant?.seatAllocationId ?? null });
                    let style = slot.occupant ? (slot.occupant.status === "violation" ? CELL_STYLES.occupiedViolation : CELL_STYLES.occupiedCompliant) : CELL_STYLES.emptyAvailable;
                    if (picking) style = eligible ? CELL_STYLES.pickTarget : CELL_STYLES.pickIneligible;
                    return (
                      <button
                        key={slot.seatNo}
                        id={additionalDomId(room.id, slot.seatNo)}
                        type="button"
                        disabled={picking ? !eligible : false}
                        onClick={() => handleActivate({ kind: "additional", roomId: room.id, seatNo: slot.seatNo, occupant: slot.occupant })}
                        aria-label={additionalSeatAccessibleLabel(room.roomNumber, slot.seatNo, slot.occupant)}
                        title={slot.occupant ? `${slot.occupant.registerNo} — ${slot.occupant.fullName}` : undefined}
                        className={`rounded border px-3 py-1.5 text-xs font-semibold transition ${style} ${isSelected ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
                      >
                        {slot.seatNo}
                        {slot.occupant && <span className="ml-1 font-normal">· {slot.occupant.registerNo}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RoomGrid({
  roomLabel,
  cells,
  selected,
  picking,
  highlightedRoomSeatId,
  onActivate,
}: {
  roomLabel: string;
  cells: SeatingCell[];
  selected: Selected | null;
  picking: Picking | null;
  highlightedRoomSeatId: string | null;
  onActivate: (roomSeatId: string, occupant: SeatingCell["occupant"]) => void;
}) {
  if (cells.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">This room has no drawn layout yet.</p>;
  }
  const rows = Math.max(...cells.map((c) => c.rowNumber));
  const columns = Math.max(...cells.map((c) => c.columnNumber));
  const byKey = new Map(cells.map((c) => [`${c.rowNumber}-${c.columnNumber}`, c]));

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1 pb-2">
        {Array.from({ length: rows }, (_, rIdx) => (
          <div key={rIdx} className="flex gap-1">
            {Array.from({ length: columns }, (_, cIdx) => {
              const cell = byKey.get(`${rIdx + 1}-${cIdx + 1}`);
              if (!cell) return null;
              const isSelected = selected?.kind === "grid" && selected.roomSeatId === cell.roomSeatId;
              const isHighlighted = highlightedRoomSeatId === cell.roomSeatId;

              let clickable = cell.cellState !== "gap" && cell.cellState !== "disabled";
              let style = CELL_STYLES.emptyAvailable;
              if (cell.cellState === "gap") style = CELL_STYLES.gap;
              else if (cell.cellState === "disabled") style = CELL_STYLES.disabled;
              else if (cell.occupant) style = cell.occupant.status === "violation" ? CELL_STYLES.occupiedViolation : CELL_STYLES.occupiedCompliant;

              if (picking && clickable) {
                const eligible = isValidPickTarget(picking.kind, picking.seatAllocationId, { cellState: cell.cellState, occupantSeatAllocationId: cell.occupant?.seatAllocationId ?? null });
                style = eligible ? CELL_STYLES.pickTarget : CELL_STYLES.pickIneligible;
                clickable = eligible;
              }

              return (
                <button
                  key={cell.roomSeatId}
                  id={gridDomId(cell.roomSeatId)}
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onActivate(cell.roomSeatId, cell.occupant)}
                  title={cell.occupant ? `${cell.occupant.registerNo} — ${cell.occupant.fullName}` : (cell.seatLabel ?? undefined)}
                  aria-label={seatAccessibleLabel(roomLabel, cell.seatLabel, cell.cellState, cell.occupant)}
                  className={`flex h-8 w-10 flex-none items-center justify-center rounded border text-[9px] font-semibold transition ${style} ${isSelected ? "ring-2 ring-slate-900 ring-offset-1" : ""} ${isHighlighted ? HIGHLIGHT_CLASS : ""} ${!clickable ? "cursor-not-allowed" : ""}`}
                >
                  {cell.occupant ? cell.occupant.registerNo.slice(-4) : cell.cellState === "gap" ? "" : cell.seatLabel}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
