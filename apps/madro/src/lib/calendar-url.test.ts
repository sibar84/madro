import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calendarUrl } from './calendar-url.ts';

test('webcal bliver til https, og mellemrum fjernes', () => {
  assert.equal(calendarUrl('  webcal://p01-calendars.icloud.com/published/2/abc  '), 'https://p01-calendars.icloud.com/published/2/abc');
  assert.equal(calendarUrl('https://calendar.google.com/calendar/ical/x/private-y/basic.ics'), 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics');
});

test('andet end almindeligt https afvises', () => {
  for (const bad of ['', 'kalender', 'http://a.dk/x.ics', 'ftp://a.dk/x', 'https://bruger:kode@a.dk/x', 'https://localhost/x']) {
    assert.equal(calendarUrl(bad), null, bad);
  }
});
