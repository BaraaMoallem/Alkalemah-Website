import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeetingDescription } from '../src/archive.js';
import { renderArchive } from '../src/calendar.js';

const facebook = 'https://www.facebook.com/alkalemah/posts/123';
const instagram = 'https://instagram.com/p/abc';

test('optional Calendar description headings accept practical spacing and multiline values', () => {
  const perfect = parseMeetingDescription(`محور الاجتماع:\nفن الإقناع\n\nنبذة عن الاجتماع:\nبدأ الاجتماع بكلمة ترحيبية.\nثم قُدمت ثلاث خطب معدة.\nواختُتم اللقاء بالتقييمات.\n\nرابط الاجتماع:\n${facebook}\n${instagram}`);
  assert.equal(perfect.theme, 'فن الإقناع');
  assert.equal(perfect.summary, 'بدأ الاجتماع بكلمة ترحيبية.\nثم قُدمت ثلاث خطب معدة.\nواختُتم اللقاء بالتقييمات.');
  assert.deepEqual(perfect.links.map(item => item.platform), ['facebook', 'instagram']);

  const sameLine = parseMeetingDescription(`  محور الاجتماع : فن الإقناع\nنبذة عن الاجتماع: لقاء تدريبي.\nروابط الاجتماع: ${facebook} ${instagram}`);
  assert.equal(sameLine.theme, 'فن الإقناع');
  assert.equal(sameLine.summary, 'لقاء تدريبي.');
  assert.equal(sameLine.links.length, 2);

  const noColon = parseMeetingDescription(' محور الاجتماع \n\nفن الإقناع\nنبذة عن الاجتماع\nسطر أول.\nسطر ثان.');
  assert.equal(noColon.theme, 'فن الإقناع');
  assert.equal(noColon.summary, 'سطر أول.\nسطر ثان.');
  assert.deepEqual(noColon.links, []);
  assert.equal(parseMeetingDescription('نبذة عن الاجتماع： ملخص واضح.').summary, 'ملخص واضح.');
});

test('social links are optional, platform restricted, safe and independent', () => {
  assert.deepEqual(parseMeetingDescription(`رابط الاجتماع:\n${facebook}`).links.map(item => item.platform), ['facebook']);
  assert.deepEqual(parseMeetingDescription(`روابط الاجتماع: ${instagram}`).links.map(item => item.platform), ['instagram']);
  assert.deepEqual(parseMeetingDescription('رابط الاجتماع: www.facebook.com/alkalemah instagram.com/p/abc').links.map(item => item.platform), ['facebook', 'instagram']);
  assert.deepEqual(parseMeetingDescription(`رابط الاجتماع:\n${facebook}\n${instagram}`).links.map(item => item.platform), ['facebook', 'instagram']);
  assert.deepEqual(parseMeetingDescription('رابط الاجتماع: https://facebook.com.evil.example/post https://other.example').links, []);
  assert.deepEqual(parseMeetingDescription('رابط الاجتماع: notfacebook.com/alkalemah').links, []);
  assert.deepEqual(parseMeetingDescription('نص عادي عن محور الاجتماع وروابط الاجتماع.').links, []);
});

test('missing and malformed descriptions never invent archive metadata', () => {
  assert.deepEqual(parseMeetingDescription(''), { theme: '', summary: '', links: [] });
  assert.deepEqual(parseMeetingDescription(undefined), { theme: '', summary: '', links: [] });
  assert.deepEqual(parseMeetingDescription('ملاحظات حرة دون عناوين منظمة.'), { theme: '', summary: '', links: [] });
  assert.equal(parseMeetingDescription('محور الاجتماع: فن الإقناع').theme, 'فن الإقناع');
  assert.equal(parseMeetingDescription('نبذة عن الاجتماع: لقاء تدريبي.').summary, 'لقاء تدريبي.');
});

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.dataset = {}; }
  append(...children) { this.children.push(...children); for (const child of children) child.parent = this; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  setAttribute(name, value) { this[name] = value; }
}
function descendants(root) { return [root, ...root.children.flatMap(descendants)]; }

test('archive renders newest first with semantic titles and dates, omitting absent fields and registration', () => {
  const oldDocument = globalThis.document;
  const head = new Element('head');
  const root = new Element('div');
  globalThis.document = {
    head,
    createElement: tag => new Element(tag),
    querySelector: selector => selector === '#calendar-event-schema'
      ? head.children.find(item => item.id === 'calendar-event-schema') : null,
  };
  const older = { id: 'old', title: 'اجتماع قديم', start: '2025-12-01T19:00:00+02:00',
    end: '2025-12-01T22:00:00+02:00', description: '' };
  const newer = { id: 'new', title: 'اجتماع جديد', start: '2026-01-01T19:00:00+02:00',
    end: '2026-01-01T22:00:00+02:00', location: 'القاهرة',
    description: `محور الاجتماع: فن الإقناع\nنبذة عن الاجتماع:\nتدريب عملي.\nرابط الاجتماع: ${facebook}` };
  try {
    renderArchive(root, [older, newer, { ...older, id: 'cancelled', status: 'cancelled' }]);
    const cards = root.children[0].children;
    assert.equal(cards.length, 2);
    assert.equal(cards[0].id, 'past-meeting-new');
    assert.equal(cards[0].children[0].tagName, 'h3');
    assert.equal(cards[0].children[1].tagName, 'time');
    assert.equal(cards[0].children[1].dateTime, newer.start);
    assert.equal(cards[1].children.length, 2);
    const items = descendants(root);
    assert.ok(items.some(item => item.textContent === 'محور الاجتماع: فن الإقناع'));
    assert.ok(items.some(item => item.textContent === 'تدريب عملي.'));
    assert.ok(items.some(item => item.textContent === 'القاهرة'));
    assert.equal(items.some(item => item.textContent === 'سجل حضورك'), false);
    const social = items.find(item => item.tagName === 'a');
    assert.equal(social.target, '_blank');
    assert.equal(social.rel, 'noopener noreferrer');
    const schema = JSON.parse(head.children[0].textContent);
    assert.equal(schema.length, 2);
    assert.equal(schema[0].eventStatus, 'https://schema.org/EventScheduled');
    assert.equal(schema[0].description, 'تدريب عملي.');
    assert.equal(schema[1].description, undefined);
  } finally { globalThis.document = oldDocument; }
});
