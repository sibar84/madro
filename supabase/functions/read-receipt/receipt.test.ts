// Kør med: deno test supabase/functions/read-receipt
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { toRows } from './receipt.ts';

Deno.test('linjer under 90 % sikkerhed havner i indbakken', () => {
  const rows = toRows({
    store: ' Netto ',
    purchased_on: '2026-10-28',
    total: 34.951,
    lines: [
      { text: 'LETMÆLK', amount: 12.95, category: 'mejeri', confidence: 0.98 },
      { text: 'GR. BL. 400G', amount: 22, category: 'frost', confidence: 0.6 },
    ],
  });
  assertEquals(rows.store, 'Netto');
  assertEquals(rows.total, 34.95);
  assertEquals(rows.lines.map((l) => [l.position, l.certain]), [[1, true], [2, false]]);
});

Deno.test('en ukendt kategori bliver Andet og skal tjekkes', () => {
  const rows = toRows({
    store: '',
    purchased_on: null,
    total: null,
    lines: [{ text: 'SLIK', amount: 10, category: 'slik', confidence: 1 }],
  });
  assertEquals(rows.lines[0].category, 'andet');
  assertEquals(rows.lines[0].certain, false);
});

Deno.test('en dato, der ikke kan læses, gemmes ikke', () => {
  assertEquals(toRows({ store: '', purchased_on: '28/10', total: null, lines: [] }).purchased_on, null);
  assertEquals(toRows({ store: '', purchased_on: '2026-13-45', total: null, lines: [] }).purchased_on, null);
});

Deno.test('tomme linjer og urimelige beløb springes over, rabatter beholdes', () => {
  const rows = toRows({
    store: 'Rema 1000',
    purchased_on: '2026-10-28',
    total: 20,
    lines: [
      { text: ' ', amount: 1, category: 'andet', confidence: 1 },
      { text: 'KAFFE', amount: 40, category: 'drikke', confidence: 0.95 },
      { text: 'RABAT KAFFE', amount: -20, category: 'drikke', confidence: 0.95 },
      { text: 'FEJL', amount: 1e9, category: 'andet', confidence: 1 },
    ],
  });
  assertEquals(rows.lines.map((l) => [l.text, l.amount]), [['KAFFE', 40], ['RABAT KAFFE', -20]]);
});
