/// <reference types="node" />
// Regelmotoren testet mod faste testfamilier og det rigtige startkatalog.
// Kør med: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { cannotEat, dislikes, planWeek, swapDay, type Dish, type Person, type PlanInput } from './engine.ts';

const catalog: Dish[] = JSON.parse(
  readFileSync(new URL('../../../../supabase/catalog/startkatalog.json', import.meta.url), 'utf8'),
);
const byId = new Map(catalog.map((d) => [d.id, d]));
function dish(id: string | null): Dish {
  const found = id ? byId.get(id) : undefined;
  if (!found) throw new Error(`Dagen mangler en ret (${id})`);
  return found;
}

function person(name: string, overrides: Partial<Person> = {}): Person {
  return { id: name, display_name: name, birth_year: 1985, allergies: [], dislikes: [], away_days: [], ...overrides };
}

const OCTOBER = '2026-10-26';
const JULY = '2027-07-05';
const DECEMBER = '2026-12-07';

// To voksne, den ene kan ikke lide laks, en femårig og en etårig, travlt tirsdag og torsdag.
const toddlerFamily: Person[] = [
  person('Far', { dislikes: ['laks'] }),
  person('Mor'),
  person('Storebror', { birth_year: 2021 }),
  person('Lillebror', { birth_year: 2025 }),
];

// Et barn med jordnøddeallergi og et med mælkeallergi.
const allergyFamily: Person[] = [
  person('Voksen'),
  person('Barn A', { birth_year: 2018, allergies: ['jordnoedder'] }),
  person('Barn B', { birth_year: 2016, allergies: ['maelk'] }),
];

// Samvær: barnet er hos den anden forælder mandag til onsdag.
const shareFamily: Person[] = [person('Forælder'), person('Barn', { birth_year: 2022, away_days: [1, 2, 3] })];

const base = (overrides: Partial<PlanInput>): PlanInput => ({
  weekStart: OCTOBER,
  dishes: catalog,
  persons: toddlerFamily,
  busyDays: [],
  ...overrides,
});

describe('startkataloget', () => {
  test('har alle 117 retter med gyldige felter', () => {
    assert.equal(catalog.length, 117);
    for (const d of catalog) {
      assert.ok(['hurtig', 'mellem', 'lang'].includes(d.effort), d.name);
      assert.ok(d.months.length > 0, d.name);
      assert.ok(d.protein_tags.length > 0, d.name);
    }
  });

  test('peanutretter er markeret med jordnødder', () => {
    for (const name of ['Wokret med ris og peanuts', 'Kung pao chicken', 'Pad thai med kylling og gulerødder']) {
      assert.ok(catalog.find((d) => d.name === name)?.allergens.includes('jordnoedder'), name);
    }
  });
});

describe('ugeplan for en småbørnsfamilie', () => {
  const input = base({ busyDays: [2, 4] });
  const plan = planWeek(input);

  test('har en ret hver dag', () => {
    assert.equal(plan.length, 7);
    assert.deepEqual(plan.map((d) => d.date), [
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
    for (const day of plan) dish(day.dishId);
  });

  test('gentager ingen ret', () => {
    assert.equal(new Set(plan.map((d) => d.dishId)).size, 7);
  });

  test('travle dage får en hurtig ret og en begrundelse', () => {
    for (const day of plan.filter((d) => d.weekday === 2 || d.weekday === 4)) {
      assert.equal(dish(day.dishId).effort, 'hurtig', day.date);
      assert.ok(day.reasons.includes('travl_dag'), day.date);
    }
  });

  test('lange retter kun fredag til søndag', () => {
    for (const day of plan.filter((d) => d.weekday <= 4)) assert.notEqual(dish(day.dishId).effort, 'lang', day.date);
  });

  test('ingen laks, når den der ikke kan lide laks spiser med', () => {
    for (const day of plan) assert.ok(!dislikes(toddlerFamily[0], dish(day.dishId)), day.date);
  });

  test('ikke samme protein to dage i træk', () => {
    for (let i = 1; i < plan.length; i++) {
      assert.notEqual(dish(plan[i].dishId).protein_tags[0], dish(plan[i - 1].dishId).protein_tags[0], plan[i].date);
    }
  });

  test('højst én ret om ugen, som børnene kun delvist kan lide', () => {
    assert.ok(plan.filter((d) => dish(d.dishId).kid_friendly === 'delvist').length <= 1);
  });

  test('alle spiser med, og begrundelserne er få', () => {
    for (const day of plan) {
      assert.equal(day.eaters.length, 4);
      assert.ok(day.reasons.length <= 3, day.date);
    }
  });

  test('samme input giver samme plan', () => {
    assert.deepEqual(planWeek(input), plan);
  });

  test('en anden uge giver en anden plan', () => {
    const next = planWeek(base({ weekStart: '2026-11-02', busyDays: [2, 4] }));
    assert.notDeepEqual(next.map((d) => d.dishId), plan.map((d) => d.dishId));
  });

  test('retter fra de seneste uger kommer ikke igen', () => {
    const next = planWeek(base({ busyDays: [2, 4], recentDishIds: plan.map((d) => d.dishId!) }));
    const repeated = next.filter((d) => plan.some((p) => p.dishId === d.dishId));
    assert.equal(repeated.length, 0);
  });
});

describe('årstider', () => {
  test('ingen julemad om sommeren', () => {
    const plan = planWeek(base({ weekStart: JULY }));
    for (const day of plan) assert.ok(dish(day.dishId).months.includes(7), day.date);
  });

  test('ingen sommerretter i december', () => {
    const plan = planWeek(base({ weekStart: DECEMBER }));
    for (const day of plan) assert.ok(dish(day.dishId).months.includes(12), day.date);
  });

  test('ugen kan krydse et månedsskifte', () => {
    const plan = planWeek(base({ weekStart: '2026-08-31' }));
    for (const day of plan) assert.ok(dish(day.dishId).months.includes(Number(day.date.slice(5, 7))), day.date);
  });
});

describe('allergier', () => {
  const plan = planWeek(base({ persons: allergyFamily }));

  test('ingen ret med et allergen, nogen ved bordet ikke tåler', () => {
    for (const day of plan) {
      for (const p of allergyFamily) assert.ok(!cannotEat(p, dish(day.dishId)), `${day.date} ${p.display_name}`);
    }
  });

  test('hensyn nævnes kun, når det ændrede valget', () => {
    const free = planWeek(base({ persons: [person('Voksen'), person('Barn', { birth_year: 2018 })] }));
    assert.ok(free.every((d) => !d.reasons.includes('hensyn')));
  });
});

describe('samvær', () => {
  const plan = planWeek(base({ persons: shareFamily }));

  test('barnet spiser kun med torsdag til søndag', () => {
    for (const day of plan) {
      assert.deepEqual(day.eaters, day.weekday <= 3 ? ['Forælder'] : ['Forælder', 'Barn'], day.date);
    }
  });

  test('en uge uden nogen hjemme giver tomme dage', () => {
    const empty = planWeek(base({ persons: [person('Ude', { away_days: [1, 2, 3, 4, 5, 6, 7] })] }));
    assert.ok(empty.every((d) => d.dishId === null && d.reasons[0] === 'ingen_hjemme'));
  });
});

describe('en person alene', () => {
  test('får en hel uge', () => {
    const plan = planWeek(base({ persons: [person('Solo')] }));
    assert.equal(plan.filter((d) => d.dishId).length, 7);
  });
});

describe('byt ret', () => {
  const input = base({ busyDays: [2, 4] });
  const plan = planWeek(input);

  test('giver en ny ret, der ikke allerede er i ugen', () => {
    const swapped = swapDay(input, plan, '2026-10-27');
    const day = swapped[1];
    assert.notEqual(day.dishId, plan[1].dishId);
    assert.ok(!plan.some((d) => d.dishId === day.dishId));
    assert.equal(dish(day.dishId).effort, 'hurtig');
    assert.deepEqual(swapped.filter((_, i) => i !== 1), plan.filter((_, i) => i !== 1));
  });

  test('flere byt i træk giver nye forslag', () => {
    let current = plan;
    const seen = new Set(plan.map((d) => d.dishId));
    for (let attempt = 1; attempt <= 5; attempt++) {
      current = swapDay(input, current, '2026-10-28', attempt);
      assert.ok(!seen.has(current[2].dishId), `byt ${attempt}`);
      seen.add(current[2].dishId);
    }
  });

  test('respekterer stadig hensyn', () => {
    const swapped = swapDay(input, plan, '2026-10-30');
    assert.ok(!dislikes(toddlerFamily[0], dish(swapped[4].dishId)));
  });
});
