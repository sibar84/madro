import { assertEquals } from 'jsr:@std/assert@1';

import { busyDays, parseEvents } from './ical.ts';

const cal = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.map((e) => `BEGIN:VEVENT\nUID:${e.split('\n')[0]}\n${e.split('\n').slice(1).join('\n')}\nEND:VEVENT`), 'END:VCALENDAR'].join('\r\n');

// Mandag den 2. november 2026
const WEEK = '2026-11-02';

Deno.test('en aftale om aftenen gør dagen travl, en om formiddagen gør ikke', () => {
  const text = cal(
    'a\nDTSTART:20261103T170000\nDTEND:20261103T190000', // tirsdag
    'b\nDTSTART:20261104T090000\nDTEND:20261104T110000', // onsdag formiddag
  );
  assertEquals(busyDays(text, WEEK), [2]);
});

Deno.test('tider i UTC omregnes til dansk tid (vintertid er en time frem)', () => {
  // 15:30 UTC = 16:30 dansk tid om vinteren
  assertEquals(busyDays(cal('a\nDTSTART:20261105T153000Z\nDTEND:20261105T160000Z'), WEEK), [4]);
  // 14:30 UTC = 15:30, og slutter 15:45: ikke aften
  assertEquals(busyDays(cal('b\nDTSTART:20261105T143000Z\nDTEND:20261105T144500Z'), WEEK), []);
});

Deno.test('sommertid: 14:30 UTC er 16:30 dansk tid', () => {
  assertEquals(busyDays(cal('a\nDTSTART:20260706T143000Z\nDTEND:20260706T150000Z'), '2026-07-06'), [1]);
});

Deno.test('heldagsaftaler, aflyste og ledige aftaler tæller ikke', () => {
  const text = cal(
    'a\nDTSTART;VALUE=DATE:20261103\nDTEND;VALUE=DATE:20261104',
    'b\nDTSTART:20261103T180000\nDTEND:20261103T190000\nSTATUS:CANCELLED',
    'c\nDTSTART:20261104T180000\nDTEND:20261104T190000\nTRANSP:TRANSPARENT',
  );
  assertEquals(busyDays(text, WEEK), []);
});

Deno.test('en aftale over midnat rører ved begge dage', () => {
  assertEquals(busyDays(cal('a\nDTSTART:20261106T200000\nDTEND:20261107T020000'), WEEK), [5]);
  assertEquals(busyDays(cal('a\nDTSTART:20261106T180000\nDTEND:20261107T170000'), WEEK), [5, 6]);
});

Deno.test('aftaler uden slut varer en time, og varighed læses', () => {
  assertEquals(busyDays(cal('a\nDTSTART:20261103T200000'), WEEK), [2]);
  assertEquals(busyDays(cal('a\nDTSTART:20261103T150000\nDURATION:PT2H'), WEEK), [2]);
});

Deno.test('ugentlig gentagelse på bestemte dage, med udeladte dage', () => {
  const text = cal(
    'a\nDTSTART:20261012T180000\nDTEND:20261012T193000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\nEXDATE:20261104T180000',
  );
  assertEquals(busyDays(text, WEEK), [1]);
  assertEquals(busyDays(text, '2026-11-09'), [1, 3]);
  assertEquals(busyDays(text, '2026-10-05'), []); // før den første
});

Deno.test('gentagelse hvert andet uge, og ophør', () => {
  const every2 = cal('a\nDTSTART:20261026T180000\nDTEND:20261026T190000\nRRULE:FREQ=WEEKLY;INTERVAL=2');
  assertEquals(busyDays(every2, WEEK), []);
  assertEquals(busyDays(every2, '2026-11-09'), [1]);
  const ended = cal('a\nDTSTART:20261012T180000\nDTEND:20261012T190000\nRRULE:FREQ=WEEKLY;COUNT=3');
  assertEquals(busyDays(ended, '2026-10-26'), [1]); // tredje gang
  assertEquals(busyDays(ended, WEEK), []);
  const until = cal('a\nDTSTART:20261012T180000\nDTEND:20261012T190000\nRRULE:FREQ=WEEKLY;UNTIL=20261101T000000Z');
  assertEquals(busyDays(until, WEEK), []);
});

Deno.test('daglig, månedlig og årlig gentagelse', () => {
  assertEquals(
    busyDays(cal('a\nDTSTART:20261101T170000\nDTEND:20261101T180000\nRRULE:FREQ=DAILY;INTERVAL=3'), WEEK),
    [3, 6], // 4. og 7. november
  );
  assertEquals(busyDays(cal('a\nDTSTART:20260805T180000\nDTEND:20260805T190000\nRRULE:FREQ=MONTHLY'), WEEK), [4]);
  assertEquals(busyDays(cal('a\nDTSTART:20240106T180000\nDTEND:20240106T190000\nRRULE:FREQ=YEARLY'), WEEK), []);
});

Deno.test('en flyttet enkeltaftale erstatter den oprindelige', () => {
  const text = cal(
    'a\nDTSTART:20261012T180000\nDTEND:20261012T190000\nRRULE:FREQ=WEEKLY;BYDAY=MO',
    'a\nRECURRENCE-ID:20261102T180000\nDTSTART:20261103T100000\nDTEND:20261103T110000',
  );
  assertEquals(busyDays(text, WEEK), []);
});

Deno.test('brudte linjer samles, og alarmer inde i aftalen forstyrrer ikke', () => {
  const text = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:x',
    'SUMMARY:Træning',
    'DTSTART:2026110',
    ' 3T180000',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'DTEND:20261103T190000',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
  assertEquals(parseEvents(text).length, 1);
  assertEquals(busyDays(text, WEEK), [2]);
});

Deno.test('tom eller ulæselig tekst giver ingen travle dage', () => {
  assertEquals(busyDays('', WEEK), []);
  assertEquals(busyDays('ikke en kalender', WEEK), []);
});
