/// <reference types="node" />
// Kør med: npm test

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formatTimer, remainingSeconds, spoken } from './cooking.ts';

describe('nedtælling', () => {
  test('skrives som minutter og sekunder, og timer fra en time', () => {
    assert.equal(formatTimer(1200), '20:00');
    assert.equal(formatTimer(65), '01:05');
    assert.equal(formatTimer(3900), '1:05:00');
    assert.equal(formatTimer(0), '00:00');
    assert.equal(formatTimer(-5), '00:00');
  });

  test('tiden tilbage rundes op og går ikke under nul', () => {
    assert.equal(remainingSeconds(10_000, 0), 10);
    assert.equal(remainingSeconds(10_000, 9_500), 1);
    assert.equal(remainingSeconds(10_000, 20_000), 0);
  });

  test('tider siges på dansk', () => {
    assert.equal(spoken(60), '1 minut');
    assert.equal(spoken(1200), '20 minutter');
    assert.equal(spoken(3600), '1 time');
    assert.equal(spoken(5400), '1 time og 30 minutter');
    assert.equal(spoken(7200), '2 timer');
  });
});
