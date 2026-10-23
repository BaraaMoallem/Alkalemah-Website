import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const plain = html => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const faq = read('faq.html');
const official = 'https://www.toastmasters.org/Find-a-Club/00003029-alkalemah-toastmasters-club';

test('FAQ schema matches all eleven questions and answers in the initial Arabic HTML', () => {
  const schemas = [...faq.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  assert.equal(schemas.length, 1);
  const schema = schemas[0];
  assert.equal(schema['@type'], 'FAQPage');
  assert.equal(schema.inLanguage, 'ar');
  assert.equal(schema.about['@id'], 'https://www.alkalemah.club/#club');
  const entries = [...faq.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)].map(([, content]) => ({
    question: plain(content.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)[1]),
    answer: plain(content.match(/<div class="faq-answer[^"]*">([\s\S]*?)<\/div>/)[1]),
  }));
  assert.equal(entries.length, 11);
  assert.equal(schema.mainEntity.length, entries.length);
  for (const [index, entry] of entries.entries()) {
    assert.equal(schema.mainEntity[index]['@type'], 'Question');
    assert.equal(schema.mainEntity[index].name, entry.question);
    assert.equal(schema.mainEntity[index].acceptedAnswer['@type'], 'Answer');
    assert.equal(schema.mainEntity[index].acceptedAnswer.text, entry.answer);
    assert.ok(entry.answer.length > 50);
  }
  assert.match(entries[4].answer, /لا، يمكنك الحضور مباشرة/);
  assert.match(entries[4].answer, /للاجتماع القادم فقط/);
  assert.match(entries[6].answer, /اختيارية تمامًا/);
  assert.doesNotMatch(faq, /fetch\(|hreflang|\/en\/|التسجيل إلزامي/);
});

test('FAQ has Arabic metadata, unique IDs, valid local links and a safe official profile link', () => {
  assert.match(faq, /<html lang="ar" dir="rtl">/);
  assert.match(faq, /<title>الأسئلة الشائعة \| نادي الكلمة توستماسترز<\/title>/);
  assert.match(faq, /<link rel="canonical" href="https:\/\/www\.alkalemah\.club\/faq\.html">/);
  assert.match(faq, /<meta property="og:url" content="https:\/\/www\.alkalemah\.club\/faq\.html">/);
  const ids = [...faq.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const main = faq.match(/<main\b[\s\S]*?<\/main>/)[0];
  for (const path of ['meetings.html', 'location.html', 'about.html', 'contact.html']) {
    assert.ok(main.includes(`href="${path}"`));
  }
  for (const [, path] of faq.matchAll(/href="([^"#?]+\.html)"/g)) {
    if (!path.startsWith('http')) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
  }
  const officialLinks = [...main.matchAll(/<a\b[^>]+>/g)].filter(([tag]) => tag.includes(official));
  assert.equal(officialLinks.length, 1);
  assert.match(officialLinks[0][0], /target="_blank"/);
  assert.match(officialLinks[0][0], /rel="noopener noreferrer"/);
  assert.equal((faq.match(/aria-current="page"/g) || []).length, 3);
  assert.doesNotMatch(faq, /noindex/i);
});

test('Contact routes FAQs to the new page and every footer and the sitemap includes it', () => {
  const contact = read('contact.html');
  assert.doesNotMatch(contact, /<details\b|<summary\b/);
  assert.match(contact.match(/<main\b[\s\S]*?<\/main>/)[0], /href="faq\.html"/);
  for (const target of ['https://chat.whatsapp.com/', 'https://wa.me/', 'meetings.html',
    'https://www.facebook.com/', 'https://www.instagram.com/', 'https://www.linkedin.com/']) {
    assert.ok(contact.includes(target), target);
  }
  for (const file of ['index.html', 'about.html', 'meetings.html', 'location.html', 'contact.html', 'faq.html']) {
    const footer = read(file).match(/<footer\b[\s\S]*?<\/footer>/)[0];
    assert.match(footer, /href="faq\.html"[^>]*>الأسئلة الشائعة<\/a>/);
  }
  const sitemap = read('public/sitemap.xml');
  assert.equal((sitemap.match(/https:\/\/www\.alkalemah\.club\/faq\.html/g) || []).length, 1);
  assert.doesNotMatch(sitemap, /\/en\//);
});

test('all public pages expose FAQ in ordered desktop and mobile navigation with correct current links', () => {
  const expected = ['/', 'about.html', 'meetings.html', 'location.html', 'faq.html', 'contact.html'];
  for (const file of ['index.html', ...expected.slice(1)]) {
    const page = read(file);
    const desktop = page.match(/<nav aria-label="التنقل الرئيسي"[\s\S]*?<\/nav>/)[0];
    const mobile = page.match(/<div id="mobile-menu"[\s\S]*?<!-- Social links row/)[0];
    const footer = page.match(/<footer\b[\s\S]*?<\/footer>/)[0];
    for (const menu of [desktop, mobile]) {
      assert.deepEqual([...menu.matchAll(/<a href="([^"]+)"/g)].map(match => match[1]), expected, file);
      const active = [...menu.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)];
      assert.equal(active.length, 1, file);
      assert.equal(active[0][1], file === 'index.html' ? '/' : file, file);
      assert.match(menu, /href="faq\.html"[^>]*>الأسئلة الشائعة<\/a>/);
    }
    assert.equal((footer.match(/href="faq\.html"/g) || []).length, 1, file);
  }
});
