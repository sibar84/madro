/// <reference types="node" />
// Kør med: npm test

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { clock, reminders, startTime } from './timing.ts';

describe('tidsplanen', () => {
  test('man går i gang, så maden er klar til spisetid', () => {
    assert.equal(startTime('17:30', 'hurtig'), '17:05');
    assert.equal(startTime('17:30:00', 'mellem'), '16:45');
    assert.equal(startTime('18:00', 'lang'), '16:30');
  });

  test('klokkeslæt skrives med punktum', () => {
    assert.equal(clock('17:30:00'), '17.30');
  });
});

describe('påmindelser', () => {
  test('kun for dage og tider, der ikke er gået', () => {
    const now = new Date(2026, 9, 29, 16, 50);
    const list = reminders(
      [
        { date: '2026-10-28', dish: 'Lasagne', effort: 'lang' },
        { date: '2026-10-29', dish: 'Boller i karry', effort: 'mellem' },
        { date: '2026-10-29', dish: 'Tacos', effort: 'hurtig' },
        { date: '2026-10-30', dish: 'Fiskefrikadeller', effort: 'hurtig' },
      ],
      '17:30',
      now,
    );
    assert.deepEqual(
      list.map((r) => [r.id, r.at.getHours(), r.at.getMinutes()]),
      [
        ['madro-2026-10-29', 17, 5],
        ['madro-2026-10-30', 17, 5],
      ],
    );
    assert.equal(list[1].title, 'Gå i gang med fiskefrikadeller');
    assert.equal(list[1].body, 'Så er maden klar kl. 17.30.');
  });
});
