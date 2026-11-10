import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanName, daysLeft, expiryLabel, inDays, sortPantry, useFirst, type PantryItem } from './pantry.ts';

const TODAY = '2026-11-10';
const item = (name: string, expires_on: string | null, place: PantryItem['place'] = 'koleskab'): PantryItem => ({
  id: name,
  name,
  place,
  expires_on,
});

test('datoer regnes uden tidszoner, også over måneds- og årsskifte', () => {
  assert.equal(inDays('2026-11-10', 0), '2026-11-10');
  assert.equal(inDays('2026-11-29', 3), '2026-12-02');
  assert.equal(inDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysLeft(item('a', '2026-11-12'), TODAY), 2);
  assert.equal(daysLeft(item('a', '2026-11-09'), TODAY), -1);
  assert.equal(daysLeft(item('a', null), TODAY), null);
});

test('teksten siger, hvornår varen skal bruges', () => {
  assert.equal(expiryLabel(item('a', '2026-11-07'), TODAY), 'Udløb for 3 dage siden');
  assert.equal(expiryLabel(item('a', '2026-11-09'), TODAY), 'Udløb i går');
  assert.equal(expiryLabel(item('a', '2026-11-10'), TODAY), 'Brug i dag');
  assert.equal(expiryLabel(item('a', '2026-11-11'), TODAY), 'Brug i morgen');
  assert.equal(expiryLabel(item('a', '2026-11-17'), TODAY), 'Holder 7 dage');
  assert.equal(expiryLabel(item('a', null), TODAY), 'Ingen dato');
});

test('det, der skal bruges først, står øverst, og varer uden dato nederst', () => {
  const sorted = sortPantry([item('Ris', null), item('Mælk', '2026-11-14'), item('Æg', '2026-11-11'), item('Agurk', '2026-11-11')], TODAY);
  assert.deepEqual(sorted.map((i) => i.name), ['Agurk', 'Æg', 'Mælk', 'Ris']);
});

test('brug først tager køleskab og skab inden for to dage, men ikke fryseren', () => {
  const list = [
    item('Hakket oksekød', '2026-11-11'),
    item('Gammel fløde', '2026-11-08'),
    item('Ærter', '2026-11-10', 'fryser'),
    item('Mælk', '2026-11-20'),
    item('Mel', null, 'skab'),
  ];
  assert.deepEqual(useFirst(list, TODAY).map((i) => i.name), ['Gammel fløde', 'Hakket oksekød']);
});

test('navne renses', () => {
  assert.equal(cleanName('  hakket   oksekød '), 'hakket oksekød');
  assert.equal(cleanName('x'.repeat(100)).length, 80);
});
