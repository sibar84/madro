/**
 * Ændringer på indkøbslisten, der venter på at blive sendt.
 *
 * I butikken er nettet ofte dårligt. Hver ændring vises med det samme og lægges
 * i en kø, som sendes, når der er forbindelse. Når listen hentes igen, lægges
 * de ventende ændringer oven på, så intet hopper tilbage.
 *
 * Filen må ikke importere andre filer, så testene kan køre direkte i Node.
 */

export type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  source: 'plan' | 'staple' | 'manual';
  note: string;
  checked_at: string | null;
  checked_by: string | null;
  sold_out: boolean;
  replaced_from: string | null;
  removed_at: string | null;
};

export type ItemChanges = Partial<
  Pick<ShoppingItem, 'name' | 'category' | 'checked_at' | 'sold_out' | 'replaced_from' | 'removed_at'>
>;

export type Op =
  | { kind: 'add'; id: string; household: string; week: string; name: string; category: string }
  | { kind: 'update'; id: string; changes: ItemChanges };

const keyOf = (name: string) => name.trim().toLowerCase();

/** Listen, som den ser ud, når ændringen er sendt. */
export function applyOp(items: ShoppingItem[], op: Op): ShoppingItem[] {
  if (op.kind === 'update') {
    return items.map((item) => (item.id === op.id ? { ...item, ...op.changes } : item));
  }
  // En vare, der allerede er på listen, kommer frem igen i stedet for at stå der to gange.
  const existing = items.find((item) => keyOf(item.name) === keyOf(op.name));
  if (existing) {
    return items.map((item) =>
      item === existing ? { ...item, removed_at: null, checked_at: null, sold_out: false } : item,
    );
  }
  return [
    ...items,
    {
      id: op.id,
      name: op.name,
      category: op.category,
      source: 'manual',
      note: '',
      checked_at: null,
      checked_by: null,
      sold_out: false,
      replaced_from: null,
      removed_at: null,
    },
  ];
}

export const applyAll = (items: ShoppingItem[], ops: Op[]) => ops.reduce(applyOp, items);

/** Lægger en ændring i køen. To ændringer af samme vare slås sammen. */
export function enqueue(queue: Op[], op: Op): Op[] {
  if (op.kind === 'update') {
    const i = queue.findIndex((q) => q.kind === 'update' && q.id === op.id);
    if (i >= 0) {
      const merged = queue[i] as Extract<Op, { kind: 'update' }>;
      return [...queue.slice(0, i), ...queue.slice(i + 1), { ...op, changes: { ...merged.changes, ...op.changes } }];
    }
  }
  return [...queue, op];
}

/** Et id, appen kan give en ny vare, før den er gemt. */
export function newId(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * Er fejlen et netværksproblem? Så bliver ændringen i køen og prøves igen.
 * Fejl fra databasen har en kode (fx 42501 eller PGRST116) og prøves ikke igen.
 */
export function isNetworkError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (err?.code && /^(\w{5}|PGRST\d+)$/.test(err.code)) return false;
  return /fetch|network|timeout|offline|abort/i.test(err?.message ?? '') || !err?.code;
}
