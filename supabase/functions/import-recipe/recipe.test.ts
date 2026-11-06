import { assert, assertEquals } from 'jsr:@std/assert@1';

import { fromJsonLd, isPrivateAddress, pageText, safeUrl, timerOf, toRecipe } from './recipe.ts';

const page = (json: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;

Deno.test('opskriften læses fra strukturerede data, også i en graf', () => {
  const recipe = fromJsonLd(
    page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Sitet' },
        {
          '@type': ['Recipe'],
          name: 'Boller i karry &amp; ris',
          recipeYield: ['4', '4 personer'],
          recipeIngredient: ['500 g hakket svinekød', '2 dl fløde'],
          recipeInstructions: [
            { '@type': 'HowToStep', text: 'Rør farsen sammen.' },
            { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Kog i 20-25 minutter.' }] },
          ],
        },
      ],
    }),
  );
  assertEquals(recipe?.title, 'Boller i karry & ris');
  assertEquals(recipe?.servings, 4);
  assertEquals(recipe?.ingredients.length, 2);
  assertEquals(recipe?.steps, [
    { text: 'Rør farsen sammen.', timer_seconds: null },
    { text: 'Kog i 20-25 minutter.', timer_seconds: 25 * 60 },
  ]);
});

Deno.test('trin i én tekst deles op efter linjer', () => {
  const recipe = toRecipe('Suppe', 2, ['vand'], 'Kog vandet.\nTilsæt salt.');
  assertEquals(recipe?.steps.map((s) => s.text), ['Kog vandet.', 'Tilsæt salt.']);
});

Deno.test('en side uden opskrift eller med en halv opskrift giver ingenting', () => {
  assertEquals(fromJsonLd('<html>ingenting</html>'), null);
  assertEquals(fromJsonLd(page({ '@type': 'Recipe', name: 'Uden trin', recipeIngredient: ['x'] })), null);
  assertEquals(fromJsonLd('<script type="application/ld+json">{ødelagt</script>'), null);
});

Deno.test('tider i trin', () => {
  assertEquals(timerOf('Bag i 1 time'), 3600);
  assertEquals(timerOf('Lad hvile 10 min.'), 600);
  assertEquals(timerOf('Steg 2 timer'), 7200);
  assertEquals(timerOf('Bag i 45 minutter ved 200 grader'), 2700);
  assertEquals(timerOf('Smag til med salt'), null);
  assertEquals(timerOf('Vend efter 30 sekunder'), null);
});

Deno.test('kun almindelige https-adresser slipper igennem', () => {
  assert(safeUrl('https://www.dk-kogebogen.dk/opskrift/1'));
  for (const bad of ['http://eksempel.dk', 'https://localhost/x', 'https://127.0.0.1/', 'https://10.0.0.1/', 'https://[::1]/', 'https://intern/x', 'https://a.local/', 'https://u:p@eksempel.dk/', 'https://eksempel.dk:8443/', 'ikke en adresse']) {
    assertEquals(safeUrl(bad), null, bad);
  }
});

Deno.test('private adresser genkendes', () => {
  for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', 'fd00::1']) assert(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1']) assert(!isPrivateAddress(ip), ip);
});

Deno.test('sidetekst uden scripts', () => {
  assertEquals(pageText('<body><script>x()</script><p>Hej &amp; velkommen</p></body>'), 'Hej & velkommen');
});
