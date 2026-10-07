import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import handler from '../api/calendar-events.js';
import { selectCurrentEvent, countdownText, formatEventTime, googleCalendarUrl, icsContent,
  cairoDateKey, calendarMonthDays } from '../src/calendar.js';

const first = {
  id: 'first', title: 'Alkalemah meeting', description: 'Guests welcome',
  start: '2026-10-03T19:00:00+03:00', end: '2026-10-03T22:00:00+03:00',
  location: 'eSpaces, Heliopolis', status: 'confirmed',
};
const second = {
  ...first, id: 'second', title: 'الاجتماع الثاني',
  start: '2026-10-17T19:00:00+03:00', end: '2026-10-17T22:00:00+03:00',
};

test('selects an ongoing meeting and advances after it ends; never invents an empty date', () => {
  assert.equal(selectCurrentEvent([second, first], Date.parse('2026-10-03T18:00:00+03:00'))?.id, 'first');
  assert.equal(selectCurrentEvent([second, first], Date.parse('2026-10-03T20:00:00+03:00'))?.id, 'first');
  assert.equal(countdownText(first, Date.parse('2026-10-03T20:00:00+03:00')), 'الاجتماع جارٍ الآن');
  assert.equal(selectCurrentEvent([second, first], Date.parse(first.end))?.id, 'second');
  assert.equal(selectCurrentEvent([], Date.now()), null);
});

test('formats Cairo time independently of the viewer and makes real calendar files/links', () => {
  assert.match(formatEventTime(first), /القاهرة/);
  const url = new URL(googleCalendarUrl(first));
  assert.equal(url.searchParams.get('dates'), '20261003T160000Z/20261003T190000Z');
  assert.equal(url.searchParams.get('text'), first.title);
  assert.equal(url.searchParams.get('location'), first.location);
  assert.equal(url.searchParams.get('details'), first.description);
  const ics = icsContent(first, new Date('2026-09-01T00:00:00Z'));
  assert.match(ics, /DTSTART:20261003T160000Z/);
  assert.match(ics, /DTEND:20261003T190000Z/);
  assert.match(ics, /BEGIN:VEVENT\r\n/);
});

test('Cairo dates determine the correct Saturday-first calendar weeks', () => {
  assert.equal(cairoDateKey('2027-01-31T22:30:00Z'), '2027-02-01');
  const october = calendarMonthDays(2026, 10);
  assert.deepEqual(october.slice(0, 7), [null, null, null, null, null, 1, 2]);
  assert.equal(october.filter(Boolean).length, 31);
  assert.equal(october.length % 7, 0);
  assert.equal(calendarMonthDays(2028, 2).filter(Boolean).length, 29);
});

test('meeting UI uses the community invitation without embedding a private booking link', () => {
  const source = readFileSync(new URL('../src/calendar.js', import.meta.url), 'utf8');
  assert.match(source, /const COMMUNITY_URL = 'https:\/\/chat\.whatsapp\.com\//);
  assert.match(source, /انضم إلى مجتمع واتساب/);
  assert.doesNotMatch(source, /wa\.me\//);
  const page = readFileSync(new URL('../meetings.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /احجز حضورك كضيف/);
});

function responseMock() {
  return {
    code: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function withApiMock(fetchMock, action) {
  const originalFetch = globalThis.fetch;
  const oldId = process.env.GOOGLE_CALENDAR_ID;
  const oldKey = process.env.GOOGLE_CALENDAR_API_KEY;
  process.env.GOOGLE_CALENDAR_ID = 'public-calendar@example.com';
  process.env.GOOGLE_CALENDAR_API_KEY = 'mock-key';
  globalThis.fetch = fetchMock;
  try { await action(); }
  finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.GOOGLE_CALENDAR_ID;
    else process.env.GOOGLE_CALENDAR_ID = oldId;
    if (oldKey === undefined) delete process.env.GOOGLE_CALENDAR_API_KEY;
    else process.env.GOOGLE_CALENDAR_API_KEY = oldKey;
  }
}

test('API normalizes timed public events and excludes cancelled and all-day entries', async () => {
  await withApiMock(async url => {
    assert.equal(url.searchParams.get('singleEvents'), 'true');
    assert.equal(url.searchParams.get('orderBy'), 'startTime');
    assert.equal(url.searchParams.get('showDeleted'), 'false');
    return { ok: true, json: async () => ({ items: [
      { id: 'a', summary: 'One', start: { dateTime: '2030-01-01T19:00:00+02:00' }, end: { dateTime: '2030-01-01T22:00:00+02:00' } },
      { id: 'b', summary: 'Two', start: { dateTime: '2030-01-15T19:00:00+02:00' }, end: { dateTime: '2030-01-15T22:00:00+02:00' } },
      { id: 'c', status: 'cancelled', start: { dateTime: '2030-01-20T19:00:00+02:00' }, end: { dateTime: '2030-01-20T22:00:00+02:00' } },
      { id: 'd', start: { date: '2030-01-25' }, end: { date: '2030-01-26' } },
    ] }) };
  }, async () => {
    const response = responseMock();
    await handler({ method: 'GET' }, response);
    assert.equal(response.code, 200);
    assert.deepEqual(response.body.events.map(event => event.id), ['a', 'b']);
    assert.match(response.headers['Cache-Control'], /s-maxage=300/);
  });
});

test('API distinguishes no events from upstream failure', async () => {
  await withApiMock(async () => ({ ok: true, json: async () => ({ items: [] }) }), async () => {
    const response = responseMock();
    await handler({ method: 'GET' }, response);
    assert.equal(response.code, 200);
    assert.deepEqual(response.body.events, []);
  });
  await withApiMock(async () => { throw new Error('network'); }, async () => {
    const response = responseMock();
    await handler({ method: 'GET' }, response);
    assert.equal(response.code, 502);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.ok(!JSON.stringify(response.body).includes('mock-key'));
  });
});

test('all public pages have meeting links in desktop, mobile, footer and one current page link per nav', () => {
  for (const filename of ['index.html', 'about.html', 'meetings.html', 'location.html', 'contact.html']) {
    const page = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
    assert.equal((page.match(/href="meetings.html"/g) || []).length >= 3, true, filename);
    assert.equal((page.match(/aria-current="page"/g) || []).length, 3, filename);
    assert.match(page, /<html lang="ar" dir="rtl">/);
    assert.match(page, /rel="canonical"/);
    assert.doesNotMatch(page, /noindex|nofollow/i);
    for (const match of page.matchAll(/href="([^"#?]+\.html)"/g)) {
      if (match[1].startsWith('http')) continue;
      assert.ok(existsSync(new URL(`../${match[1]}`, import.meta.url)), `${filename}: ${match[1]}`);
    }
  }
  const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of homepage.matchAll(/<script\s+type="application\/ld\+json">(.*?)<\/script>/gs)) {
    assert.doesNotThrow(() => JSON.parse(match[1]));
  }
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const filename of ['about.html', 'meetings.html', 'location.html', 'contact.html']) {
    assert.ok(sitemap.includes(`https://www.alkalemah.club/${filename}`));
  }
});
