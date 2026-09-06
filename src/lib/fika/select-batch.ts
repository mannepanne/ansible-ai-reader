// ABOUT: Pure selection of today's Fika batch: carry forward, then top up oldest + freshest
// ABOUT: The only way an item leaves the rotation is archive (or deletion), by any path

export interface BatchCandidate {
  id: string;
  /** ISO timestamp the item was saved (reader_items.created_at) */
  createdAt: string;
}

export interface PreviousBatchItem {
  itemId: string;
  slot: 1 | 2;
  /** Archived by any path since the batch was built */
  archived: boolean;
  /** Row gone or reader_deleted */
  deleted: boolean;
}

export interface SelectBatchInput {
  /** The most recent batch, whatever its date. Null when there has never been one. */
  previous: { id: string; items: PreviousBatchItem[] } | null;
  /** Eligible items: unread, not deleted, has a summary. Order does not matter. */
  candidates: BatchCandidate[];
  /** Items that were in any batch in the last 14 days (the 14-day exclusion) */
  excludedIds: Set<string>;
  now: Date;
}

export interface SelectedItem {
  itemId: string;
  slot: 1 | 2;
  /** The batch this item was carried forward from, or null if newly selected */
  carriedFrom: string | null;
}

/** Slot 2 prefers something saved within this many days */
export const FRESH_WINDOW_DAYS = 7;

/**
 * Slot 1 is the oldest eligible item (the pile drains). Slot 2 is the newest item saved in the
 * last FRESH_WINDOW_DAYS, else the next-oldest (the email stays interesting). Unarchived items
 * from the previous batch keep their slots, so an ignored Fika is the same Fika tomorrow.
 */
export function selectBatch(input: SelectBatchInput): SelectedItem[] {
  const selected: SelectedItem[] = [];
  const taken = new Set<string>();

  if (input.previous) {
    for (const item of input.previous.items) {
      if (!item.archived && !item.deleted) {
        selected.push({ itemId: item.itemId, slot: item.slot, carriedFrom: input.previous.id });
        taken.add(item.itemId);
      }
    }
  }

  const pool = input.candidates
    .filter((c) => !taken.has(c.id) && !input.excludedIds.has(c.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const hasSlot = (slot: 1 | 2) => selected.some((s) => s.slot === slot);

  if (!hasSlot(1)) {
    const oldest = pool.shift();
    if (oldest) selected.push({ itemId: oldest.id, slot: 1, carriedFrom: null });
  }

  if (!hasSlot(2)) {
    const freshCutoff = new Date(input.now.getTime() - FRESH_WINDOW_DAYS * 86_400_000).toISOString();
    let pick = -1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].createdAt >= freshCutoff) {
        pick = i;
        break;
      }
    }
    if (pick === -1 && pool.length > 0) pick = 0; // no fresh item: next-oldest
    if (pick !== -1) selected.push({ itemId: pool[pick].id, slot: 2, carriedFrom: null });
  }

  return selected.sort((a, b) => a.slot - b.slot);
}
