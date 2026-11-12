import { describe, expect, it } from 'vitest';
import { canUndo, UNDO_WINDOW_MS } from '../../src/domain/undo';

describe('canUndo', () => {
  const wateredAt = new Date('2026-06-15T14:00:00Z');
  const watering = { wateredById: 'alice', wateredAt, undoneAt: null };
  const at = (ms: number) => new Date(wateredAt.getTime() + ms);

  it('has a 10 minute window', () => {
    expect(UNDO_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  it('allows undo at exactly 10:00 after watering', () => {
    expect(canUndo(watering, 'alice', at(10 * 60 * 1000))).toBe(true);
  });

  it('rejects undo at 10:01', () => {
    expect(canUndo(watering, 'alice', at(10 * 60 * 1000 + 1000))).toBe(false);
  });

  it('rejects a different user', () => {
    expect(canUndo(watering, 'bob', at(1000))).toBe(false);
  });

  it('rejects an already undone watering', () => {
    expect(canUndo({ ...watering, undoneAt: at(500) }, 'alice', at(1000))).toBe(false);
  });
});
