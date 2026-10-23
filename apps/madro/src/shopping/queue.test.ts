/// <reference types="node" />
// Kør med: npm test

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { applyAll, enqueue, isNetworkError, newId, type Op, type ShoppingItem } from './queue.ts';

const item = (id: string, name: string, changes: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id,
  name,
  category: 'kolonial',
  source: 'plan',
  note: '',
  checked_at: null,
  checked_by: null,
  sold_out: false,
  replaced_from: null,
  removed_at: null,
  ...changes,
});

describe('køen', () => {
  test('en afkrydsning uden net står stadig, når listen hentes igen', () => {
    const fromServer = [item('1', 'Ris'), item('2', 'Pasta')];
    const queue: Op[] = [{ kind: 'update', id: '1', changes: { checked_at: '2026-10-24T10:00:00Z' } }];
    assert.equal(applyAll(fromServer, queue)[0].checked_at, '2026-10-24T10:00:00Z');
  });

  test('to ændringer af samme vare slås sammen', () => {
    let queue: Op[] = [];
    queue = enqueue(queue, { kind: 'update', id: '1', changes: { checked_at: 'x' } });
    queue = enqueue(queue, { kind: 'update', id: '2', changes: { sold_out: true } });
    queue = enqueue(queue, { kind: 'update', id: '1', changes: { checked_at: null } });
    assert.equal(queue.length, 2);
    assert.deepEqual(queue[1], { kind: 'update', id: '1', changes: { checked_at: null } });
  });

  test('en ny vare tilføjes', () => {
    const list = applyAll([item('1', 'Ris')], [
      { kind: 'add', id: '9', household: 'h', week: '2026-10-26', name: 'Bananer', category: 'frugt_groent' },
    ]);
    assert.deepEqual(list.map((i) => [i.name, i.source]), [['Ris', 'plan'], ['Bananer', 'manual']]);
  });

  test('en fjernet vare kommer frem igen i stedet for at stå der to gange', () => {
    const list = applyAll([item('1', 'Ris', { removed_at: 'x', checked_at: 'y' })], [
      { kind: 'add', id: '9', household: 'h', week: '2026-10-26', name: ' ris', category: 'kolonial' },
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0].removed_at, null);
    assert.equal(list[0].checked_at, null);
  });

  test('nye id er gyldige uuid', () => {
    const id = newId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(newId(), id);
  });

  test('netværksfejl prøves igen, databasefejl gør ikke', () => {
    assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' }), true);
    assert.equal(isNetworkError(new TypeError('Network request failed')), true);
    assert.equal(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' }), false);
    assert.equal(isNetworkError({ message: 'JSON object requested', code: 'PGRST116' }), false);
  });
});
