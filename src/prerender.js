import { parseMeetingDescription } from './archive.js';
import {
  eventSchema,
  formatEventDate,
  formatEventTime,
  googleCalendarUrl,
  selectCurrentEvent,
} from './calendar.js';

const COMMUNITY_URL = 'https://chat.whatsapp.com/JutO99rTDXVLIHSwLbWPZO';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function validEvents(events = []) {
  if (!Array.isArray(events)) return [];
  return events.filter(event =>
    event &&
    event.status !== 'cancelled' &&
    Number.isFinite(Date.parse(event.start)) &&
    Number.isFinite(Date.parse(event.end)) &&
    Date.parse(event.end) > Date.parse(event.start)
  );
}

function renderSocialLinksHtml(links, linkClass) {
  if (!links?.length) return '';
  const items = links.map(item => {
    const label = item.platform === 'facebook' ? 'فيسبوك' : 'إنستغرام';
    return `<a href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${label}</a>`;
  }).join('');
  return `<div class="flex flex-wrap gap-3 text-sm font-bold">${items}</div>`;
}

function renderEventDescriptionHtml(event, textClass) {
  if (!event.description?.trim()) return '';
  const details = parseMeetingDescription(event.description);
  if (!details.theme && !details.summary && !details.links.length) {
    return `<p dir="auto" class="${textClass}">${escapeHtml(event.description.trim())}</p>`;
  }
  const parts = [];
  if (details.theme) {
    parts.push(`<p class="${textClass}">محور الاجتماع: ${escapeHtml(details.theme)}</p>`);
  }
  if (details.summary) {
    parts.push(`<p class="${textClass}">${escapeHtml(details.summary)}</p>`);
  }
  const social = renderSocialLinksHtml(details.links, 'underline hover:opacity-80');
  if (social) parts.push(social);
  return `<div class="space-y-2">${parts.join('')}</div>`;
}

function renderEventActionsHtml(event, featured = false) {
  const calendarClass = featured
    ? 'rounded-xl bg-white text-loyal-blue hover:bg-loyal-blue-light px-4 py-2.5'
    : 'rounded-xl bg-loyal-blue hover:bg-loyal-blue-dark text-white px-4 py-2.5';
  const mapClass = featured
    ? 'rounded-xl text-white hover:underline px-2 py-2.5'
    : 'rounded-xl text-loyal-blue hover:underline px-2 py-2.5';
  const mapLink = event.location
    ? `<a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(event.location)}" target="_blank" rel="noopener noreferrer" class="${mapClass}">اعرض هذا المكان على الخريطة</a>`
    : '';
  return `<div class="flex flex-wrap gap-3 pt-3 text-sm font-bold"><a href="${escapeHtml(googleCalendarUrl(event))}" target="_blank" rel="noopener noreferrer" class="${calendarClass}">أضف إلى تقويم Google</a>${mapLink}</div>`;
}

export function renderUpcomingMeetingsHtml(events = [], now = Date.now()) {
  const upcoming = validEvents(events)
    .filter(event => Date.parse(event.start) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  if (!upcoming.length) {
    return [
      '<div class="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8" role="status">',
      '<p class="font-black text-loyal-blue text-xl">لم يتم الإعلان عن موعد الاجتماع القادم بعد</p>',
      '<p class="text-slate-600 mt-2">نعقد اجتماعاتنا عادةً السبت الأول والثالث من كل شهر. تابع هذه الصفحة لمعرفة المواعيد الجديدة.</p>',
      `<a href="${COMMUNITY_URL}" target="_blank" rel="noopener noreferrer" class="inline-flex mt-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 font-bold">انضم إلى مجتمع واتساب</a>`,
      '</div>',
    ].join('');
  }

  const featured = upcoming[0];
  const featuredId = `meeting-${encodeURIComponent(featured.id)}`;
  const featuredHtml = [
    `<article id="${escapeHtml(featuredId)}" class="rounded-3xl bg-gradient-to-br from-loyal-blue to-loyal-blue-dark border-t-4 border-happy-yellow text-white shadow-lg p-6 sm:p-8 space-y-4">`,
    '<p class="inline-block rounded-full bg-white/10 px-3 py-1 text-happy-yellow font-black text-sm">الاجتماع القادم</p>',
    `<h2 dir="auto" class="text-2xl sm:text-3xl font-black heading-font leading-snug">${escapeHtml(featured.title)}</h2>`,
    `<p class="font-bold text-white text-base sm:text-lg"><time datetime="${escapeHtml(featured.start)}">${escapeHtml(formatEventTime(featured))}</time></p>`,
    featured.location ? `<p class="text-white/90">${escapeHtml(featured.location)}</p>` : '',
    renderEventDescriptionHtml(featured, 'text-white/90 whitespace-pre-line leading-relaxed'),
    renderEventActionsHtml(featured, true),
    '</article>',
  ].filter(Boolean).join('');

  if (upcoming.length === 1) return featuredHtml;

  const agendaItems = upcoming.slice(1).map(event => {
    const id = `meeting-${encodeURIComponent(event.id)}`;
    return [
      '<li class="p-4 sm:p-5">',
      `<article id="${escapeHtml(id)}">`,
      `<h3 dir="auto" class="font-black text-loyal-blue text-lg">${escapeHtml(event.title)}</h3>`,
      `<p class="text-slate-700 font-semibold mt-1"><time datetime="${escapeHtml(event.start)}">${escapeHtml(formatEventTime(event))}</time></p>`,
      event.location ? `<p class="text-slate-600 text-sm mt-1">${escapeHtml(event.location)}</p>` : '',
      renderEventActionsHtml(event, false),
      '</article>',
      '</li>',
    ].filter(Boolean).join('');
  }).join('');

  const agendaHtml = [
    '<section class="mt-8">',
    '<h3 class="text-lg font-black text-loyal-blue mb-3">الاجتماعات التالية حسب التاريخ</h3>',
    `<ol class="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-200">${agendaItems}</ol>`,
    '</section>',
  ].join('');

  return `${featuredHtml}${agendaHtml}`;
}

export function renderPastMeetingsHtml(events = [], now = Date.now()) {
  const past = validEvents(events)
    .filter(event => Date.parse(event.end) <= now)
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
    .slice(0, 16);

  if (!past.length) {
    return '<p class="text-slate-600">لا توجد اجتماعات سابقة لعرضها حاليًا.</p>';
  }

  const cards = past.map(event => {
    const details = parseMeetingDescription(event.description);
    const id = `past-meeting-${encodeURIComponent(event.id)}`;
    return [
      `<article id="${escapeHtml(id)}" class="scroll-mt-24 min-w-0 break-words rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">`,
      `<h3 dir="auto" class="text-lg font-black text-loyal-blue leading-snug">${escapeHtml(event.title)}</h3>`,
      `<time datetime="${escapeHtml(event.start)}" class="block text-sm font-semibold text-slate-600">${escapeHtml(formatEventDate(event))}</time>`,
      details.theme ? `<p class="text-sm font-bold text-true-maroon">محور الاجتماع: ${escapeHtml(details.theme)}</p>` : '',
      details.summary ? `<p class="text-sm text-slate-700 whitespace-pre-line leading-relaxed">${escapeHtml(details.summary)}</p>` : '',
      event.location ? `<p class="text-sm text-slate-600">${escapeHtml(event.location)}</p>` : '',
      renderSocialLinksHtml(details.links, 'text-loyal-blue underline hover:text-true-maroon'),
      '</article>',
    ].filter(Boolean).join('');
  }).join('');

  return `<div class="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>`;
}

export function renderHomeNextMeetingHtml(events = [], now = Date.now()) {
  const event = selectCurrentEvent(validEvents(events), now);
  if (!event) {
    return [
      '<p class="font-bold text-loyal-blue">لم يتم الإعلان عن موعد الاجتماع القادم بعد</p>',
      '<p class="text-sm text-slate-600 mt-1">نعقد اجتماعاتنا عادةً السبت الأول والثالث من كل شهر. تابع مجتمع واتساب لمعرفة المواعيد الجديدة.</p>',
    ].join('');
  }
  const details = parseMeetingDescription(event.description);
  return [
    '<p class="text-sm font-bold text-true-maroon">الاجتماع القادم</p>',
    `<p class="font-black text-loyal-blue text-lg mt-1">${escapeHtml(event.title)}</p>`,
    `<p class="text-sm text-slate-700 mt-1"><time datetime="${escapeHtml(event.start)}">${escapeHtml(formatEventTime(event))}</time></p>`,
    details.theme ? `<p class="text-sm font-bold text-true-maroon mt-2">محور الاجتماع: ${escapeHtml(details.theme)}</p>` : '',
    event.location ? `<p class="text-sm text-slate-600 mt-3">${escapeHtml(event.location)}</p>` : '',
  ].filter(Boolean).join('');
}

export function buildEventSchemaScript(upcomingEvents = [], pastEvents = [], now = Date.now()) {
  const upcoming = validEvents(upcomingEvents)
    .filter(event => Date.parse(event.start) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const past = validEvents(pastEvents)
    .filter(event => Date.parse(event.end) <= now)
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
    .slice(0, 16);

  const schemas = [
    ...upcoming.map(event => eventSchema(event, false)),
    ...past.map(event => eventSchema(event, true)),
  ];
  if (!schemas.length) return '';
  return `<script id="calendar-event-schema" type="application/ld+json">${escapeJsonLd(schemas)}</script>`;
}

function injectSchemaIntoHead(html, schemaScript) {
  const withoutExisting = html.replace(
    /\s*<script id="calendar-event-schema" type="application\/ld\+json">[\s\S]*?<\/script>/g,
    ''
  );
  if (!schemaScript) return withoutExisting;
  return withoutExisting.replace('</head>', `  ${schemaScript}\n</head>`);
}

function replaceElementInnerHtml(html, tagName, id, newInner) {
  const openRegex = new RegExp(`<${tagName}\\b[^>]*\\bid="${id}"[^>]*>`, 'i');
  const openMatch = openRegex.exec(html);
  if (!openMatch) return html;
  const contentStart = openMatch.index + openMatch[0].length;
  const tagRegex = new RegExp(`<(\\/?)${tagName}\\b[^>]*>`, 'gi');
  tagRegex.lastIndex = contentStart;
  let depth = 1;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    if (match[1] === '/') {
      depth--;
      if (depth === 0) {
        return html.slice(0, contentStart) + newInner + html.slice(match.index);
      }
    } else if (!match[0].endsWith('/>')) {
      depth++;
    }
  }
  return html;
}

export function prerenderMeetingsHtml(html, { upcomingEvents = [], pastEvents = [], now = Date.now() } = {}) {
  let output = injectSchemaIntoHead(html, buildEventSchemaScript(upcomingEvents, pastEvents, now));
  output = replaceElementInnerHtml(output, 'div', 'meetings-list', renderUpcomingMeetingsHtml(upcomingEvents, now));
  output = replaceElementInnerHtml(output, 'div', 'past-meetings-list', renderPastMeetingsHtml(pastEvents, now));
  return output;
}

export function prerenderIndexHtml(html, { upcomingEvents = [], now = Date.now() } = {}) {
  let output = injectSchemaIntoHead(html, buildEventSchemaScript(upcomingEvents, [], now));
  output = replaceElementInnerHtml(output, 'section', 'next-meeting', renderHomeNextMeetingHtml(upcomingEvents, now));
  return output;
}
