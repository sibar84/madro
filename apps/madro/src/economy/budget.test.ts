/// <reference types="node" />
// Kør med: npm test

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { kroner, periodFor, shortDate, spending } from './budget.ts';

describe('budgetperioden', () => {
  test('starter på lønningsdagen', () => {
    assert.deepEqual(periodFor('2026-10-29', 25), { start: '2026-10-25', end: '2026-11-24' });
  });

  test('før lønningsdagen hører datoen til sidste måneds periode', () => {
    assert.deepEqual(periodFor('2026-10-10', 25), { start: '2026-09-25', end: '2026-10-24' });
    assert.deepEqual(periodFor('2026-01-10', 25), { start: '2025-12-25', end: '2026-01-24' });
  });

  test('lønningsdag den 31. bliver sidste dag i en kort måned', () => {
    assert.deepEqual(periodFor('2026-02-28', 31), { start: '2026-02-28', end: '2026-03-30' });
    assert.deepEqual(periodFor('2026-02-27', 31), { start: '2026-01-31', end: '2026-02-27' });
  });

  test('lønningsdag den 1. er en kalendermåned', () => {
    assert.deepEqual(periodFor('2026-10-29', 1), { start: '2026-10-01', end: '2026-10-31' });
  });
});

describe('forbruget', () => {
  const period = { start: '2026-10-25', end: '2026-11-24' };

  test('lægges sammen pr. uge og i alt, uden det der ikke er mad', () => {
    const result = spending(
      [
        { amount: 100, category: 'mejeri', purchased_on: '2026-10-26' },
        { amount: 50.5, category: 'frost', purchased_on: '2026-10-28' },
        { amount: -10, category: 'frost', purchased_on: '2026-10-28' },
        { amount: 40, category: 'ikke_mad', purchased_on: '2026-10-28' },
        { amount: 200, category: 'koed_fisk', purchased_on: '2026-11-03' },
        { amount: 999, category: 'koed_fisk', purchased_on: '2026-10-20' },
        { amount: 999, category: 'koed_fisk', purchased_on: null },
      ],
      period,
    );
    assert.equal(result.total, 340.5);
    assert.deepEqual(result.weeks.slice(0, 3), [
      { weekStart: '2026-10-19', amount: 0 },
      { weekStart: '2026-10-26', amount: 140.5 },
      { weekStart: '2026-11-02', amount: 200 },
    ]);
    assert.equal(result.weeks.at(-1)!.weekStart, '2026-11-23');
  });
});

describe('tekster', () => {
  test('datoer og beløb skrives på dansk', () => {
    assert.equal(shortDate('2026-10-25'), '25. okt.');
    assert.equal(kroner(4500), '4.500 kr.');
    assert.equal(kroner(-1234.6), '-1.235 kr.');
  });
});
