import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eventSchema } from '../src/calendar.js';
import { prerenderIndexHtml, prerenderMeetingsHtml } from '../src/prerender.js';
import renderPageHandler from '../api/render-page.js';

const upcomingEvent = {
  id: 'evt_upcoming_1',
  title: 'الاجتماع الخامس والأربعون',
  description: 'محور الاجتماع: الذكاء العاطفي\nنبذة عن الاجتماع:\nتطبيقات عملية في التواصل والقيادة.',
  start: '2030-05-03T19:00:00+03:00',
  end: '2030-05-03T22:00:00+03:00',
  location: 'eSpaces - شارع الثورة، مصر الجديدة',
  status: 'confirmed',
};

const secondUpcomingEvent = {
  id: 'evt_upcoming_2',
  title: 'الاجتماع السادس والأربعون',
  description: '',
  start: '2030-05-17T19:00:00+03:00',
  end: '2030-05-17T22:00:00+03:00',
  location: '',
  status: 'confirmed',
};

const pastEvent = {
  id: 'evt_past_1',
  title: 'الاجتماع الرابع والأربعون',
  description: 'محور الاجتماع: فن الإقناع\nنبذة عن الاجتماع:\nلقاء تفاعلي مميز.\nرابط الاجتماع:\nhttps://www.facebook.com/AlkalemahTMC/posts/101',
  start: '2026-04-04T19:00:00+02:00',
  end: '2026-04-04T22:00:00+02:00',
  location: 'eSpaces - شارع الثورة',
  status: 'confirmed',
};

test('eventSchema includes all Google Search Console required and recommended Event fields', () => {
  const schemaWithLocation = eventSchema(upcomingEvent, false);
  assert.equal(schemaWithLocation['@context'], 'https://schema.org');
  assert.equal(schemaWithLocation['@type'], 'Event');
  assert.equal(schemaWithLocation.name, upcomingEvent.title);
  assert.equal(schemaWithLocation.startDate, upcomingEvent.start);
  assert.equal(schemaWithLocation.endDate, upcomingEvent.end);
  assert.equal(schemaWithLocation.eventStatus, 'https://schema.org/EventScheduled');
  assert.equal(schemaWithLocation.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.ok(Array.isArray(schemaWithLocation.image) && schemaWithLocation.image.length >= 1);
  assert.equal(schemaWithLocation.location['@type'], 'Place');
  assert.equal(schemaWithLocation.location.name, upcomingEvent.location);
  assert.equal(schemaWithLocation.location.address['@type'], 'PostalAddress');
  assert.equal(schemaWithLocation.location.address.addressLocality, 'مصر الجديدة');
  assert.equal(schemaWithLocation.location.address.addressRegion, 'القاهرة');
  assert.equal(schemaWithLocation.location.address.addressCountry, 'EG');
  assert.equal(schemaWithLocation.organizer.name, 'نادي الكلمة توستماسترز');
  assert.equal(schemaWithLocation.organizer['@id'], 'https://www.alkalemah.club/#club');
  assert.equal(schemaWithLocation.performer.name, 'نادي الكلمة توستماسترز');
  assert.equal(schemaWithLocation.offers['@type'], 'Offer');
  assert.equal(schemaWithLocation.offers.priceCurrency, 'EGP');
  assert.equal(schemaWithLocation.offers.availability, 'https://schema.org/InStock');
  assert.equal(schemaWithLocation.url, 'https://www.alkalemah.club/meetings.html#meeting-evt_upcoming_1');
  assert.match(schemaWithLocation.description, /محور الاجتماع: الذكاء العاطفي/);

  // Fallback location and description when calendar fields are blank:
  const schemaWithoutLocation = eventSchema(secondUpcomingEvent, false);
  assert.equal(schemaWithoutLocation.location['@type'], 'Place');
  assert.equal(schemaWithoutLocation.location.address['@type'], 'PostalAddress');
  assert.equal(schemaWithoutLocation.location.address.addressCountry, 'EG');
  assert.ok(schemaWithoutLocation.description.length > 20);
});

test('meetings.html and location.html include valid static JSON-LD structured data in initial HTML', () => {
  const meetingsHtml = readFileSync(new URL('../meetings.html', import.meta.url), 'utf8');
  const meetingsSchemas = [...meetingsHtml.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  assert.ok(meetingsSchemas.some(item => item['@type'] === 'EducationalOrganization' && item['@id'] === 'https://www.alkalemah.club/#club'));
  const series = meetingsSchemas.find(item => item['@type'] === 'EventSeries');
  assert.ok(series);
  assert.equal(series.location.address['@type'], 'PostalAddress');
  assert.equal(series.eventSchedule['@type'], 'Schedule');
  assert.equal(series.eventSchedule.scheduleTimezone, 'Africa/Cairo');

  const locationHtml = readFileSync(new URL('../location.html', import.meta.url), 'utf8');
  const locationSchemas = [...locationHtml.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const place = locationSchemas.find(item => item['@type'] === 'Place');
  assert.ok(place);
  assert.equal(place.address['@type'], 'PostalAddress');
  assert.equal(place.geo['@type'], 'GeoCoordinates');
});

test('prerenderMeetingsHtml and prerenderIndexHtml inject crawlable HTML and Event JSON-LD idempotently', () => {
  const meetingsTemplate = readFileSync(new URL('../meetings.html', import.meta.url), 'utf8');
  const indexTemplate = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const now = Date.parse('2030-01-01T00:00:00Z');

  const once = prerenderMeetingsHtml(meetingsTemplate, {
    upcomingEvents: [upcomingEvent, secondUpcomingEvent],
    pastEvents: [pastEvent],
    now,
  });
  // Calling a second time on already pre-rendered HTML must cleanly replace without nesting leftovers:
  const twice = prerenderMeetingsHtml(once, {
    upcomingEvents: [upcomingEvent, secondUpcomingEvent],
    pastEvents: [pastEvent],
    now,
  });
  assert.equal(once, twice);
  assert.doesNotMatch(twice, /جارٍ تحميل الاجتماعات القادمة/);
  assert.doesNotMatch(twice, /جارٍ تحميل الاجتماعات السابقة/);
  assert.match(twice, /id="meeting-evt_upcoming_1"/);
  assert.match(twice, /id="meeting-evt_upcoming_2"/);
  assert.match(twice, /id="past-meeting-evt_past_1"/);
  assert.match(twice, /الاجتماع الخامس والأربعون/);
  assert.match(twice, /محور الاجتماع: الذكاء العاطفي/);
  assert.match(twice, /محور الاجتماع: فن الإقناع/);

  const schemaMatch = twice.match(/<script id="calendar-event-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(schemaMatch);
  const eventsSchema = JSON.parse(schemaMatch[1]);
  assert.equal(eventsSchema.length, 3);
  assert.equal(eventsSchema[0].name, upcomingEvent.title);
  assert.equal(eventsSchema[2].name, pastEvent.title);

  const prerenderedIndex = prerenderIndexHtml(indexTemplate, {
    upcomingEvents: [upcomingEvent],
    now,
  });
  assert.doesNotMatch(prerenderedIndex, /جارٍ تحميل موعد الاجتماع القادم/);
  assert.match(prerenderedIndex, /الاجتماع الخامس والأربعون/);
  assert.match(prerenderedIndex, /<script id="calendar-event-schema" type="application\/ld\+json">/);
});

test('render-page API endpoint serves pre-rendered HTML with Edge cache headers and falls back gracefully', async () => {
  const originalFetch = globalThis.fetch;
  const oldId = process.env.GOOGLE_CALENDAR_ID;
  const oldKey = process.env.GOOGLE_CALENDAR_API_KEY;
  process.env.GOOGLE_CALENDAR_ID = 'club@example.com';
  process.env.GOOGLE_CALENDAR_API_KEY = 'test-key';

  globalThis.fetch = async url => {
    const isPast = url.searchParams.get('timeMax');
    return {
      ok: true,
      json: async () => ({
        items: isPast
          ? [{
              id: pastEvent.id,
              summary: pastEvent.title,
              description: pastEvent.description,
              location: pastEvent.location,
              start: { dateTime: pastEvent.start },
              end: { dateTime: pastEvent.end },
            }]
          : [{
              id: upcomingEvent.id,
              summary: upcomingEvent.title,
              description: upcomingEvent.description,
              location: upcomingEvent.location,
              start: { dateTime: upcomingEvent.start },
              end: { dateTime: upcomingEvent.end },
            }],
      }),
    };
  };

  function mockRes() {
    return {
      code: 200,
      headers: {},
      body: '',
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      send(b) { this.body = b; return this; },
      json(b) { this.body = b; return this; },
    };
  }

  try {
    const res = mockRes();
    await renderPageHandler({ method: 'GET', query: { page: 'meetings' } }, res);
    assert.equal(res.code, 200);
    assert.match(res.headers['Content-Type'], /text\/html/);
    assert.match(res.headers['Cache-Control'], /s-maxage=300/);
    assert.match(res.body, /الاجتماع الخامس والأربعون/);
    assert.match(res.body, /id="calendar-event-schema"/);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.GOOGLE_CALENDAR_ID;
    else process.env.GOOGLE_CALENDAR_ID = oldId;
    if (oldKey === undefined) delete process.env.GOOGLE_CALENDAR_API_KEY;
    else process.env.GOOGLE_CALENDAR_API_KEY = oldKey;
  }
});
