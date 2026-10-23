/// <reference types="node" />
// Kør med: npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { buildList, byAisle, categoryOf, cleanName, isMainIngredient, substituteFor } from './list.ts';

const catalog: { name: string; main_protein: string; ingredients: string[] }[] = JSON.parse(
  readFileSync(new URL('../../../../supabase/catalog/startkatalog.json', import.meta.url), 'utf8'),
);

describe('kategorier', () => {
  test('typiske varer havner i den rigtige gang', () => {
    assert.equal(categoryOf('Kødboller'), 'koed_fisk');
    assert.equal(categoryOf('Burgerboller'), 'broed');
    assert.equal(categoryOf('Hvidløgsdressing'), 'kolonial');
    assert.equal(categoryOf('Hvidløg'), 'frugt_groent');
    assert.equal(categoryOf('Ostetaco-skaller'), 'kolonial');
    assert.equal(categoryOf('Hytteost'), 'mejeri');
    assert.equal(categoryOf('Fiskefingre'), 'frost');
    assert.equal(categoryOf('Laksefilet'), 'koed_fisk');
    assert.equal(categoryOf('Vandmelon'), 'frugt_groent');
    assert.equal(categoryOf('Letmælk'), 'mejeri');
    assert.equal(categoryOf('Rugbrød'), 'broed');
    assert.equal(categoryOf('Bleer str. 4'), 'husholdning');
    assert.equal(categoryOf('Kaffe'), 'drikke');
    assert.equal(categoryOf('Pandekager'), 'broed');
    assert.equal(categoryOf('Kidneybønner'), 'kolonial');
    assert.equal(categoryOf('Grønne bønner'), 'frugt_groent');
  });

  test('en ukendt vare havner i Andet', () => {
    assert.equal(categoryOf('Fødselsdagslys'), 'andet');
  });

  test('alle ingredienser i startkataloget får en gang', () => {
    const unknown = catalog.flatMap((d) => d.ingredients).filter((i) => categoryOf(i) === 'andet');
    assert.deepEqual([...new Set(unknown)], []);
  });
});

describe('listen', () => {
  test('en vare, der bruges flere dage, står der én gang med dagene', () => {
    const list = buildList(
      [
        { weekday: 1, ingredients: ['Ris', 'karry'] },
        { weekday: 4, ingredients: ['ris', 'laks'] },
        { weekday: 3, ingredients: ['Ris'] },
      ],
      [],
    );
    assert.deepEqual(
      list.find((i) => i.name === 'Ris'),
      { name: 'Ris', category: 'kolonial', source: 'plan', note: 'mandag, onsdag og torsdag' },
    );
    assert.equal(list.length, 3);
  });

  test('en fast vare i planen står der én gang som fast vare', () => {
    const list = buildList([{ weekday: 2, ingredients: ['æg'] }], [{ name: 'Æg', category: 'mejeri' }, { name: 'Rugbrød', category: 'broed' }]);
    assert.deepEqual(list, [
      { name: 'Æg', category: 'mejeri', source: 'staple', note: 'tirsdag' },
      { name: 'Rugbrød', category: 'broed', source: 'staple', note: '' },
    ]);
  });

  test('parenteser fjernes fra navnet', () => {
    assert.equal(cleanName('hvidvin (kan udelades)'), 'Hvidvin');
  });

  test('en hel uge fra kataloget giver en liste uden dubletter', () => {
    const days = catalog.slice(0, 7).map((d, i) => ({ weekday: i + 1, ingredients: d.ingredients }));
    const list = buildList(days, []);
    const keys = list.map((i) => i.name.toLowerCase());
    assert.equal(new Set(keys).size, keys.length);
  });

  test('sorteres efter butikkens gange', () => {
    const sorted = byAisle([
      { name: 'Mælk', category: 'mejeri' },
      { name: 'Broccoli', category: 'frugt_groent' },
      { name: 'Agurk', category: 'frugt_groent' },
      { name: 'Is', category: 'frost' },
    ]);
    assert.deepEqual(sorted.map((i) => i.name), ['Agurk', 'Broccoli', 'Mælk', 'Is']);
  });
});

describe('udsolgt', () => {
  test('foreslår en vare med samme rolle', () => {
    assert.equal(substituteFor('Laksefilet'), 'Ørredfilet');
    assert.equal(substituteFor('Røget laks'), 'Røget ørred');
    assert.equal(substituteFor('Hakket oksekød'), 'Hakket svin og kalv');
    assert.equal(substituteFor('Ris'), 'Bulgur');
    assert.equal(substituteFor('Fødselsdagslys'), null);
  });

  test('kender rettens hovedingrediens', () => {
    assert.equal(isMainIngredient('Laksefilet', 'Laks'), true);
    assert.equal(isMainIngredient('Kyllingelår', 'Kylling'), true);
    assert.equal(isMainIngredient('Æg', 'Skinke, æg'), false);
    assert.equal(isMainIngredient('Skinke', 'Skinke, æg'), true);
    assert.equal(isMainIngredient('Broccoli', 'Kylling'), false);
  });
});
