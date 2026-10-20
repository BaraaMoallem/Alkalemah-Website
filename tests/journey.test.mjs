import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, renderHome, renderMeetings } from '../src/calendar.js';

const community = 'https://chat.whatsapp.com/JutO99rTDXVLIHSwLbWPZO';
const official = 'https://www.toastmasters.org/Find-a-Club/00003029-alkalemah-toastmasters-club';

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.classList = { add: (...names) => { this.className = `${this.className || ''} ${names.join(' ')}`; } };
  }
  append(...children) { this.children.push(...children); for (const child of children) child.parent = this; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener() {}
  querySelectorAll(selector) {
    return descendants(this).filter(item => selector === 'button[data-event-date]' &&
      item.tagName === 'button' && item.dataset.eventDate);
  }
}

function descendants(root) {
  return [root, ...root.children.flatMap(descendants)];
}

test('homepage has one event registration path and separate community/About hero links', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const hero = page.split('<!-- Call to Action Buttons -->')[1].split('<!-- Meeting Information Card in Hero -->')[0];
  assert.match(hero, /href="https:\/\/chat\.whatsapp\.com\/JutO99rTDXVLIHSwLbWPZO"/);
  assert.match(hero, /انضم إلى مجتمع واتساب/);
  assert.match(hero, /href="about\.html"[\s\S]*?عن النادي ورسالتنا/);
  assert.doesNotMatch(hero, /wa\.me|شاهد اجتماعنا القادم|احجز/);
  const card = page.split('<!-- Meeting Information Card in Hero -->')[1].split('<!-- Why Al Kalimah Club Section -->')[0];
  assert.match(card, /id="next-meeting"/);
  assert.match(card, /href="location\.html"/);
  assert.doesNotMatch(card, /chat\.whatsapp\.com|wa\.me|احجز/);
  assert.doesNotMatch(page, /احجز مقعدك كضيف عبر الواتساب/);
  const source = readFileSync(new URL('../src/calendar.js', import.meta.url), 'utf8');
  assert.match(source, /root\.append\(registrationCount\(event\), register\)/);
  assert.equal((source.match(/root\.append\(registrationCount\(event\), register\)/g) || []).length, 1);
  assert.equal((page.match(/href="https:\/\/chat\.whatsapp\.com\/JutO99rTDXVLIHSwLbWPZO"/g) || []).length >= 1, true);
  assert.equal(community.startsWith('https://chat.whatsapp.com/'), true);
});

test('no upcoming event and calendar failure show distinct safe states without registration', async () => {
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const root = new Element('section');
  const head = new Element('head');
  globalThis.document = {
    head,
    createElement: tag => new Element(tag),
    querySelector: selector => selector === '#next-meeting' ? root
      : selector === '#calendar-event-schema' ? head.children.find(item => item.id === 'calendar-event-schema') : null,
    querySelectorAll: selector => selector === '[data-registration-count]'
      ? descendants(root).filter(item => item.dataset.registrationCount) : [],
  };
  try {
    renderHome(root, []);
    assert.match(descendants(root).map(item => item.textContent || '').join(' '), /لم يتم الإعلان عن موعد الاجتماع القادم/);
    assert.equal(descendants(root).filter(item => item.textContent === 'سجل حضورك').length, 0);
    globalThis.fetch = async () => { throw new Error('private calendar failure'); };
    await init();
    assert.match(descendants(root).map(item => item.textContent || '').join(' '), /تعذر تحميل مواعيد الاجتماعات/);
    assert.equal(descendants(root).filter(item => item.textContent === 'سجل حضورك').length, 0);
  } finally {
    clearInterval(root._countdownInterval);
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

test('an upcoming event renders one registration button and its real calendar details', async () => {
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const root = new Element('section');
  const head = new Element('head');
  globalThis.document = {
    head,
    createElement: tag => new Element(tag),
    querySelector: selector => selector === '#calendar-event-schema'
      ? head.children.find(item => item.id === 'calendar-event-schema') : null,
    querySelectorAll: selector => selector === '[data-registration-count]'
      ? descendants(root).filter(item => item.dataset.registrationCount) : [],
  };
  globalThis.fetch = async url => {
    assert.match(url, /^\/api\/registration-count\?eventId=real_event$/);
    return { ok: true, json: async () => ({ eventId: 'real_event', count: 0 }) };
  };
  try {
    const event = { id: 'real_event', title: 'عنوان الاجتماع من التقويم',
      start: '2030-01-01T19:00:00+02:00', end: '2030-01-01T22:00:00+02:00',
      location: 'مكان الاجتماع', status: 'confirmed' };
    renderHome(root, [event]);
    await new Promise(resolve => setImmediate(resolve));
    const items = descendants(root);
    assert.equal(items.filter(item => item.textContent === 'سجل حضورك').length, 1);
    for (const text of ['الاجتماع القادم', event.title, 'مكان الاجتماع', 'التسجيل مفتوح الآن']) {
      assert.ok(items.some(item => item.textContent === text), text);
    }
    assert.ok(items.some(item => item.textContent?.includes('القاهرة')));
    assert.ok(items.some(item => item.textContent?.includes('أيام')));
    assert.equal(items.filter(item => item.href?.includes('whatsapp')).length, 0);
    const eventSchema = JSON.parse(head.children.find(item => item.id === 'calendar-event-schema').textContent);
    assert.equal(eventSchema[0].organizer['@id'], 'https://www.alkalemah.club/#club');
  } finally {
    clearInterval(root._countdownInterval);
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

test('three upcoming meetings show registration and count only for the first; the next opens when it starts', async () => {
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const root = new Element('div');
  const head = new Element('head');
  const events = [1, 2, 3].map(day => ({ id: `future_${day}`, title: `اجتماع ${day}`,
    start: `2030-01-0${day}T19:00:00+02:00`, end: `2030-01-0${day}T22:00:00+02:00`,
    status: 'confirmed' }));
  globalThis.document = {
    head,
    createElement: tag => new Element(tag),
    querySelector: selector => selector === '#calendar-event-schema'
      ? head.children.find(item => item.id === 'calendar-event-schema') : null,
    querySelectorAll: () => [],
  };
  const countIds = [];
  globalThis.fetch = async url => {
    countIds.push(new URL(url, 'https://example.com').searchParams.get('eventId'));
    return { ok: true, json: async () => ({ eventId: countIds.at(-1), count: 0 }) };
  };
  try {
    renderMeetings(root, events);
    assert.equal(descendants(root).filter(item => item.textContent === 'سجل حضورك').length, 1);
    assert.equal(descendants(root).filter(item => item.dataset.registrationCount).length, 1);
    assert.deepEqual(countIds, ['future_1']);
    const afterStart = [{ ...events[0], start: '2020-01-01T19:00:00+02:00',
      end: '2020-01-01T22:00:00+02:00' }, ...events.slice(1)];
    renderMeetings(root, afterStart);
    assert.equal(descendants(root).filter(item => item.textContent === 'سجل حضورك').length, 1);
    assert.deepEqual(countIds, ['future_1', 'future_2']);
    assert.ok(descendants(root).some(item => item.dataset.registrationCount === 'future_2'));
    renderMeetings(root, []);
    assert.equal(descendants(root).filter(item => item.textContent === 'سجل حضورك').length, 0);
  } finally {
    clearInterval(root._meetingsCountdown);
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

test('archive failure leaves upcoming meetings usable and gives a separate friendly state', async () => {
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const meetings = new Element('div');
  const archive = new Element('div');
  const head = new Element('head');
  globalThis.document = {
    head,
    createElement: tag => new Element(tag),
    querySelector: selector => ({ '#meetings-list': meetings, '#past-meetings-list': archive,
      '#calendar-event-schema': head.children.find(item => item.id === 'calendar-event-schema') })[selector] || null,
  };
  globalThis.fetch = async url => url.includes('scope=past')
    ? { ok: false } : { ok: true, json: async () => ({ events: [] }) };
  try {
    await init();
    assert.ok(descendants(meetings).some(item => item.textContent?.includes('لم يتم الإعلان')));
    assert.ok(descendants(archive).some(item => item.textContent?.includes('تعذر تحميل الاجتماعات السابقة')));
    assert.equal(descendants(meetings).some(item => item.textContent === 'سجل حضورك'), false);
  } finally {
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

test('shared metadata renders in upcoming and archive views without rebuilding unchanged results', async () => {
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const meetings = new Element('div');
  const archive = new Element('div');
  const head = new Element('head');
  const upcoming = [1, 2].map(day => ({ id: `future_${day}`, title: `اجتماع ${day}`,
    start: `2030-01-0${day}T19:00:00+02:00`, end: `2030-01-0${day}T22:00:00+02:00`,
    description: 'محور الاجتماع: التواصل الفعال', status: 'confirmed' }));
  const past = { id: 'past', title: 'اجتماع سابق', start: '2026-01-01T19:00:00+02:00',
    end: '2026-01-01T22:00:00+02:00', status: 'confirmed',
    description: 'محور الاجتماع:\nفن الإقناع\nنبذة عن الاجتماع:\nسطر أول\nسطر ثان\nروابط الاجتماع:\nhttps://facebook.com/example\nhttps://instagram.com/example' };
  globalThis.document = {
    head,
    createElement: tag => new Element(tag),
    querySelector: selector => ({ '#meetings-list': meetings, '#past-meetings-list': archive,
      '#calendar-event-schema': head.children.find(item => item.id === 'calendar-event-schema') })[selector] || null,
    querySelectorAll: () => [],
  };
  globalThis.fetch = async url => ({ ok: true, json: async () => url.includes('scope=past')
    ? { events: [{ ...past }] } : url.includes('registration-count')
      ? { eventId: 'future_1', count: 0 } : { events: upcoming.map(event => ({ ...event })) } });
  try {
    await init();
    const texts = root => descendants(root).map(item => item.textContent || '');
    assert.ok(texts(meetings).includes('محور الاجتماع: التواصل الفعال'));
    assert.equal(texts(meetings).filter(text => text === 'سجل حضورك').length, 1);
    for (const expected of ['محور الاجتماع: فن الإقناع', 'سطر أول\nسطر ثان', 'فيسبوك', 'إنستغرام']) {
      assert.ok(texts(archive).includes(expected), expected);
    }
    assert.equal(texts(archive).includes('سجل حضورك'), false);
    const firstGrid = archive.children[0];
    const firstFeatured = meetings.children[0];
    await init();
    assert.equal(archive.children[0], firstGrid);
    assert.equal(meetings.children[0], firstFeatured);
    past.description = 'محور الاجتماع: موضوع جديد';
    await init();
    assert.notEqual(archive.children[0], firstGrid);
    assert.ok(texts(archive).includes('محور الاجتماع: موضوع جديد'));
  } finally {
    clearInterval(meetings._meetingsCountdown);
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

test('the single organization entity retains verified identifiers and official profiles', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const schemas = [...page.matchAll(/<script\s+type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map(match => JSON.parse(match[1]));
  const organizations = schemas.filter(item => item['@type'] === 'EducationalOrganization');
  assert.equal(organizations.length, 1);
  const entity = organizations[0];
  assert.equal(entity['@id'], 'https://www.alkalemah.club/#club');
  assert.equal(entity.name, 'نادي الكلمة توستماسترز');
  assert.equal(entity.alternateName, 'Alkalemah Toastmasters Club');
  assert.equal(entity.identifier.value, '00003029');
  for (const profile of [official, 'https://www.facebook.com/AlkalemahTMC',
    'https://www.instagram.com/alkalemahtmc/', 'https://www.linkedin.com/company/toastmastersbelarabiclub']) {
    assert.ok(entity.sameAs.includes(profile), profile);
  }
  const about = readFileSync(new URL('../about.html', import.meta.url), 'utf8');
  assert.match(about, /نادٍ رسمي ضمن Toastmasters International/);
  assert.match(about, /الصفحة الرسمية للنادي على موقع Toastmasters International/);
  for (const filename of ['index.html', 'about.html', 'meetings.html', 'location.html', 'contact.html']) {
    const html = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(official.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /ملف النادي الرسمي لدى Toastmasters International/);
  }
});
