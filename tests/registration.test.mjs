import test from 'node:test';
import assert from 'node:assert/strict';
import register from '../api/register.js';
import registrationCount from '../api/registration-count.js';

const meetings = [
  { id: 'meeting_a', summary: 'First meeting', start: { dateTime: '2030-01-01T19:00:00+02:00' }, end: { dateTime: '2030-01-01T22:00:00+02:00' } },
  { id: 'meeting_b', summary: 'Second meeting', start: { dateTime: '2030-01-15T19:00:00+02:00' }, end: { dateTime: '2030-01-15T22:00:00+02:00' } },
];

function responseMock() {
  return {
    code: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

let requestNumber = 0;
function request(method, body, query) {
  return { method, body, query, headers: {
    'x-vercel-forwarded-for': `test-${++requestNumber}`, 'content-type': 'application/json',
  } };
}

const registration = {
  name: 'Guest Name', phone: '+201234567890', email: '', eventId: 'meeting_a',
  eventTitle: 'Old browser title', eventStart: '2030-01-01T18:00:00+02:00',
};

async function withBackend(appsScript, action, calendarItems = meetings) {
  const originalFetch = globalThis.fetch;
  const saved = Object.fromEntries(['GOOGLE_CALENDAR_ID', 'GOOGLE_CALENDAR_API_KEY',
    'REGISTRATION_APPS_SCRIPT_URL', 'REGISTRATION_WEBHOOK_SECRET'].map(key => [key, process.env[key]]));
  process.env.GOOGLE_CALENDAR_ID = 'club@example.com';
  process.env.GOOGLE_CALENDAR_API_KEY = 'calendar-key-for-test';
  process.env.REGISTRATION_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test/exec';
  process.env.REGISTRATION_WEBHOOK_SECRET = 'webhook-secret-for-test';
  globalThis.fetch = async (url, options) => {
    if (url.hostname === 'www.googleapis.com') {
      return { ok: true, json: async () => ({ items: calendarItems }) };
    }
    assert.equal(url.hostname, 'script.google.com');
    assert.equal(options.method, 'POST');
    return appsScript(JSON.parse(options.body));
  };
  try { await action(); }
  finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('registers once per phone and event; a different event accepts the same phone; forwards verified calendar details', async () => {
  const records = new Map();
  await withBackend(async payload => {
    assert.equal(payload.secret, 'webhook-secret-for-test');
    const key = `${payload.eventId}:${payload.phone}`;
    if (payload.action === 'register') {
      assert.equal(payload.eventTitle, meetings.find(item => item.id === payload.eventId).summary);
      assert.equal(payload.eventStart, meetings.find(item => item.id === payload.eventId).start.dateTime);
      const duplicate = records.has(key);
      records.set(key, payload);
      return { ok: true, json: async () => ({ alreadyRegistered: duplicate, count: [...records.keys()].filter(item => item.startsWith(`${payload.eventId}:`)).length }) };
    }
    return { ok: true, json: async () => ({ count: [...records.keys()].filter(item => item.startsWith(`${payload.eventId}:`)).length }) };
  }, async () => {
    const first = responseMock();
    await register(request('POST', registration), first);
    assert.equal(first.code, 200);
    assert.deepEqual(first.body, { alreadyRegistered: false, count: 1 });
    const duplicate = responseMock();
    await register(request('POST', registration), duplicate);
    assert.deepEqual(duplicate.body, { alreadyRegistered: true, count: 1 });
    const second = responseMock();
    await register(request('POST', { ...registration, eventId: 'meeting_b' }), second);
    assert.deepEqual(second.body, { alreadyRegistered: false, count: 1 });
    assert.equal(records.size, 2);
  });
});

test('rejects missing fields, extras, invalid event IDs and cancelled meetings without contacting Apps Script', async () => {
  let calls = 0;
  await withBackend(async () => { calls++; throw new Error('must not be called'); }, async () => {
    for (const body of [
      { ...registration, name: '' },
      { ...registration, phone: '' },
      { ...registration, eventTitle: '' },
      { ...registration, eventStart: '' },
      { ...registration, eventId: '../../other' },
      { ...registration, extra: 'injected' },
      { ...registration, eventId: 'missing_event' },
    ]) {
      const response = responseMock();
      await register(request('POST', body), response);
      assert.equal(response.code, body.eventId === 'missing_event' ? 404 : 400);
      assert.equal(response.headers['Cache-Control'], 'no-store');
    }
    assert.equal(calls, 0);
  });
  await withBackend(async () => { calls++; throw new Error('must not be called'); }, async () => {
    const response = responseMock();
    await register(request('POST', registration), response);
    assert.equal(response.code, 404);
    assert.equal(calls, 0);
  }, [{ ...meetings[0], status: 'cancelled' }]);
});

test('returns a clean upstream error and never exposes credentials or contact details', async () => {
  await withBackend(async () => { throw new Error('private upstream failure'); }, async () => {
    const response = responseMock();
    await register(request('POST', registration), response);
    assert.equal(response.code, 502);
    assert.equal(response.body.error, 'Registration is temporarily unavailable');
    assert.doesNotMatch(JSON.stringify(response.body), /webhook-secret|Guest Name|201234567890|script.google/);
  });
});

test('count endpoint exposes only zero or positive integer and refreshes after registration', async () => {
  let count = 0;
  let countCalls = 0;
  const eventId = 'meeting_zero';
  const meeting = { ...meetings[0], id: eventId };
  await withBackend(async payload => {
    if (payload.action === 'register') {
      count = 14;
      return { ok: true, json: async () => ({ success: true, count }) };
    }
    countCalls++;
    return { ok: true, json: async () => ({ count, records: [{ name: 'private', phone: 'private' }] }) };
  }, async () => {
    const zero = responseMock();
    await registrationCount(request('GET', null, { eventId }), zero);
    assert.deepEqual(zero.body, { eventId, count: 0 });
    const cached = responseMock();
    await registrationCount(request('GET', null, { eventId }), cached);
    assert.equal(countCalls, 1);
    const saved = responseMock();
    await register(request('POST', { ...registration, eventId }), saved);
    assert.equal(saved.body.count, 14);
    const refreshed = responseMock();
    await registrationCount(request('GET', null, { eventId }), refreshed);
    assert.deepEqual(refreshed.body, { eventId, count: 14 });
    assert.equal(countCalls, 1);
    assert.equal(refreshed.headers['Cache-Control'], 'no-store');
  }, [meeting]);
});

test('count rejects malformed upstream data and invalid IDs', async () => {
  await withBackend(async () => ({ ok: true, json: async () => ({ count: -2 }) }), async () => {
    const invalid = responseMock();
    await registrationCount(request('GET', null, { eventId: '../secret' }), invalid);
    assert.equal(invalid.code, 400);
    const malformed = responseMock();
    await registrationCount(request('GET', null, { eventId: 'never_cached' }), malformed);
    assert.equal(malformed.code, 502);
  });
});

test('count handles an unavailable Apps Script without exposing upstream details', async () => {
  await withBackend(async () => { throw new Error('secret upstream failure'); }, async () => {
    const response = responseMock();
    await registrationCount(request('GET', null, { eventId: 'count_unavailable' }), response);
    assert.equal(response.code, 502);
    assert.deepEqual(response.body, { error: 'Registration count is temporarily unavailable' });
  });
});

test('registration requires JSON and applies a per-instance request limit', async () => {
  await withBackend(async () => ({ ok: true, json: async () => ({ success: true, count: 1 }) }), async () => {
    const wrongType = request('POST', registration);
    wrongType.headers['content-type'] = 'application/x-www-form-urlencoded';
    const rejected = responseMock();
    await register(wrongType, rejected);
    assert.equal(rejected.code, 415);
    const sameIp = request('POST', { ...registration, name: '' });
    sameIp.headers['x-vercel-forwarded-for'] = 'rate-limit-test';
    for (let i = 0; i < 6; i++) await register(sameIp, responseMock());
    const limited = responseMock();
    await register(sameIp, limited);
    assert.equal(limited.code, 429);
  });
});
