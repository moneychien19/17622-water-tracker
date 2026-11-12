/** A watering can be undone by the person who recorded it for 10 minutes (FR-009). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export interface UndoableWatering {
  wateredById: string;
  wateredAt: Date;
  undoneAt: Date | null;
}

export function canUndo(watering: UndoableWatering, userId: string, now: Date): boolean {
  return (
    watering.wateredById === userId &&
    watering.undoneAt === null &&
    now.getTime() - watering.wateredAt.getTime() <= UNDO_WINDOW_MS
  );
}
