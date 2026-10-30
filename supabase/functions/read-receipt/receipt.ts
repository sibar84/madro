// Det, Claude skal læse fra en kvittering, og hvordan svaret bliver til linjer i databasen.
// Filen importerer intet, så den kan testes med `deno test`.

export const CATEGORIES = [
  'frugt_groent',
  'broed',
  'koed_fisk',
  'mejeri',
  'kolonial',
  'frost',
  'drikke',
  'husholdning',
  'andet',
  'ikke_mad',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Under denne sikkerhed havner linjen i indbakken, så en i familien vælger kategorien. */
export const CERTAIN = 0.9;

export const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string', description: 'Butikkens navn, fx "Netto" eller "Rema 1000". Tom, hvis det ikke kan læses.' },
    purchased_on: {
      type: ['string', 'null'],
      description: 'Købsdatoen som YYYY-MM-DD, eller null hvis den ikke kan læses.',
    },
    total: { type: ['number', 'null'], description: 'Beløbet i alt i kroner, eller null hvis det ikke kan læses.' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Linjen som den står på kvitteringen.' },
          amount: { type: 'number', description: 'Beløbet i kroner. Rabatter er negative.' },
          category: { type: 'string', enum: [...CATEGORIES] },
          confidence: { type: 'number', description: 'Hvor sikker du er på kategorien, fra 0 til 1.' },
        },
        required: ['text', 'amount', 'category', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['store', 'purchased_on', 'total', 'lines'],
  additionalProperties: false,
} as const;

export const INSTRUCTIONS = `Du læser danske kvitteringer fra dagligvarebutikker for en families madbudget.

Returnér hver varelinje med beløbet i kroner. En rabat eller et pant-retur er sin egen linje med negativt beløb og samme kategori som varen, den hører til. Medtag ikke linjer for i alt, moms, betalingskort, byttepenge eller bonus.

Kategorierne er butikkens gange: frugt_groent, broed, koed_fisk (også pålæg og andet på køl), mejeri (også æg), kolonial, frost, drikke, husholdning (rengøring, bleer, toiletpapir) og andet. Brug ikke_mad for alt, der ikke er mad eller husholdning, fx blade, legetøj, tøj og gavekort.

Sæt confidence lavt, når en forkortelse kan betyde flere ting, eller når teksten er svær at læse. Gæt aldrig en butik, dato eller total, du ikke kan se: brug en tom tekst eller null.`;

export type ReadReceipt = {
  store: string;
  purchased_on: string | null;
  total: number | null;
  lines: { text: string; amount: number; category: string; confidence: number }[];
};

export type LineRow = {
  position: number;
  text: string;
  amount: number;
  category: Category;
  certain: boolean;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Gør Claudes svar klar til databasen og afviser det, der ikke giver mening. */
export function toRows(read: ReadReceipt): { store: string; purchased_on: string | null; total: number | null; lines: LineRow[] } {
  const date = read.purchased_on && /^\d{4}-\d{2}-\d{2}$/.test(read.purchased_on) && !Number.isNaN(Date.parse(read.purchased_on))
    ? read.purchased_on
    : null;
  const lines = read.lines
    .filter((l) => l.text.trim() && Number.isFinite(l.amount) && Math.abs(l.amount) < 100_000)
    .slice(0, 200)
    .map((l, i): LineRow => {
      const known = (CATEGORIES as readonly string[]).includes(l.category);
      return {
        position: i + 1,
        text: l.text.trim().slice(0, 120),
        amount: round(l.amount),
        category: known ? (l.category as Category) : 'andet',
        certain: known && l.confidence >= CERTAIN,
      };
    });
  const total = read.total !== null && Number.isFinite(read.total) ? round(read.total) : null;
  return { store: read.store.trim().slice(0, 80), purchased_on: date, total, lines };
}
