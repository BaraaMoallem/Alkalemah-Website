const ZONE = 'Africa/Cairo';
const CLUB_URL = 'https://www.alkalemah.club/';
const BOOKING_URL = 'https://wa.me/201149861291?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%D8%8C%20%D8%A3%D9%88%D8%AF%20%D8%AD%D8%AC%D8%B2%20%D8%AD%D8%B6%D9%88%D8%B1%20%D8%A7%D9%84%D8%A7%D8%AC%D8%AA%D9%85%D8%A7%D8%B9%20%D8%A7%D9%84%D9%82%D8%A7%D8%AF%D9%85%20%D9%83%D8%B6%D9%8A%D9%81.';

export function selectCurrentEvent(events, now = Date.now()) {
  return events.filter(event => Date.parse(event.end) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] || null;
}

export function formatEventTime(event) {
  const date = new Date(event.start);
  const dateText = new Intl.DateTimeFormat('ar-EG', {
    timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
  const time = value => new Intl.DateTimeFormat('ar-EG', {
    timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(value));
  return `${dateText}، من ${time(event.start)} إلى ${time(event.end)} بتوقيت القاهرة`;
}

function utcStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(event) {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', event.title);
  url.searchParams.set('dates', `${utcStamp(event.start)}/${utcStamp(event.end)}`);
  url.searchParams.set('details', event.description || 'نادي الكلمة توستماسترز');
  if (event.location) url.searchParams.set('location', event.location);
  return url.href;
}

function icsEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function icsContent(event, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alkalemah Toastmasters Club//Meetings//AR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${icsEscape(event.id)}@alkalemah.club`, `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(event.start)}`, `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape(event.description || 'نادي الكلمة توستماسترز')}`,
    `LOCATION:${icsEscape(event.location || '')}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  // RFC 5545 content lines are folded at 75 octets, including Arabic UTF-8 text.
  const encoder = new TextEncoder();
  return lines.map(line => {
    let output = '', bytes = 0;
    for (const character of line) {
      const length = encoder.encode(character).length;
      if (bytes + length > 75) { output += '\r\n '; bytes = 1; }
      output += character;
      bytes += length;
    }
    return output;
  }).join('\r\n') + '\r\n';
}

function link(label, href, className, external = false) {
  const anchor = document.createElement('a');
  anchor.textContent = label;
  anchor.href = href;
  anchor.className = className;
  if (external) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  return anchor;
}

function paragraph(text, className = '') {
  const element = document.createElement('p');
  element.textContent = text;
  element.className = className;
  return element;
}

export function countdownText(event, now = Date.now()) {
  const start = Date.parse(event.start), end = Date.parse(event.end);
  if (now >= end) return '';
  if (now >= start) return 'الاجتماع جارٍ الآن';
  const totalMinutes = Math.ceil((start - now) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days} أيام : ${String(hours).padStart(2, '0')} ساعات : ${String(minutes).padStart(2, '0')} دقيقة`;
}

function eventSchema(event) {
  const place = event.location ? {
    '@type': 'Place', name: event.location,
  } : undefined;
  return {
    '@context': 'https://schema.org', '@type': 'Event', name: event.title,
    startDate: event.start, endDate: event.end,
    eventStatus: 'https://schema.org/EventScheduled',
    ...(event.description ? { description: event.description } : {}),
    ...(place ? { location: place } : {}),
    organizer: { '@type': 'EducationalOrganization', '@id': `${CLUB_URL}#club` },
    url: `${CLUB_URL}meetings.html`,
  };
}

function updateEventSchema(events) {
  document.querySelector('#calendar-event-schema')?.remove();
  if (!events.length) return;
  const script = document.createElement('script');
  script.id = 'calendar-event-schema';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(events.map(eventSchema));
  document.head.append(script);
}

async function getEvents() {
  const response = await fetch('/api/calendar-events', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Calendar unavailable');
  const data = await response.json();
  if (!Array.isArray(data.events)) throw new Error('Invalid calendar response');
  return data.events.filter(event => event && Number.isFinite(Date.parse(event.start)) &&
    Number.isFinite(Date.parse(event.end)) && Date.parse(event.end) > Date.parse(event.start));
}

function renderHome(root, events) {
  clearInterval(root._countdownInterval);
  updateEventSchema(events.filter(item => Date.parse(item.end) > Date.now()));
  root.replaceChildren();
  const event = selectCurrentEvent(events);
  if (!event) {
    root.append(paragraph('لم يتم الإعلان عن موعد الاجتماع القادم بعد', 'font-bold text-loyal-blue'),
      paragraph('نعقد اجتماعاتنا عادةً السبت الأول والثالث من كل شهر.', 'text-sm text-slate-600 mt-1'));
    return;
  }
  root.append(paragraph('الاجتماع القادم', 'text-sm font-bold text-true-maroon'),
    paragraph(event.title, 'font-black text-loyal-blue text-lg mt-1'),
    paragraph(formatEventTime(event), 'text-sm text-slate-700 mt-1'));
  if (event.location) root.append(paragraph(event.location, 'text-sm text-slate-600 mt-1'));
  const countdown = paragraph('', 'text-base font-black text-loyal-blue mt-2 tabular-nums');
  countdown.setAttribute('aria-hidden', 'true');
  root.append(countdown);
  const refresh = () => {
    if (Date.now() >= Date.parse(event.end)) { renderHome(root, events); return; }
    countdown.textContent = countdownText(event);
  };
  refresh();
  root._countdownInterval = setInterval(refresh, 30000);
}

function renderMeetingCard(event) {
  const article = document.createElement('article');
  article.className = 'rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-3';
  const title = paragraph(event.title, 'text-xl font-black text-loyal-blue heading-font');
  title.dir = 'auto';
  article.append(title, paragraph(formatEventTime(event), 'font-bold text-slate-700'));
  if (Date.now() >= Date.parse(event.start)) {
    article.append(paragraph('الاجتماع جارٍ الآن', 'font-bold text-emerald-700'));
  }
  if (event.location) article.append(paragraph(event.location, 'text-slate-600'));
  if (event.description) {
    const description = paragraph(event.description, 'text-slate-600 whitespace-pre-line line-clamp-4');
    description.dir = 'auto';
    article.append(description);
  }
  const actions = document.createElement('div');
  actions.className = 'flex flex-wrap gap-3 pt-2 text-sm font-bold';
  actions.append(link('احجز حضورك كضيف عبر واتساب', BOOKING_URL,
    'rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5', true),
  link('أضف إلى تقويم Google', googleCalendarUrl(event),
    'rounded-xl bg-loyal-blue hover:bg-loyal-blue-dark text-white px-4 py-2.5', true));
  const ics = document.createElement('button');
  ics.type = 'button';
  ics.textContent = 'أضف إلى تقويمك (.ics)';
  ics.className = 'rounded-xl border border-loyal-blue text-loyal-blue hover:bg-loyal-blue-light px-4 py-2.5';
  ics.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([icsContent(event)], { type: 'text/calendar;charset=utf-8' }));
    const download = link('تحميل موعد الاجتماع', url, '');
    download.download = 'alkalemah-meeting.ics';
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  actions.append(ics);
  if (event.location) actions.append(link('اعرض هذا المكان على الخريطة',
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`,
    'rounded-xl text-loyal-blue hover:underline px-2 py-2.5', true));
  article.append(actions);
  return article;
}

function renderMeetings(root, events) {
  root.replaceChildren();
  const upcoming = events.filter(event => Date.parse(event.end) > Date.now())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (!upcoming.length) {
    root.append(paragraph('لم يتم الإعلان عن موعد الاجتماع القادم بعد', 'font-black text-loyal-blue text-xl'),
      paragraph('نعقد اجتماعاتنا عادةً السبت الأول والثالث من كل شهر. تابع هذه الصفحة أو تواصل معنا قبل الزيارة.', 'text-slate-600 mt-2'));
    updateEventSchema([]);
    return;
  }
  root.append(...upcoming.map(renderMeetingCard));
  updateEventSchema(upcoming);
}

async function init() {
  const home = document.querySelector('#next-meeting');
  const meetings = document.querySelector('#meetings-list');
  if (!home && !meetings) return;
  try {
    const events = await getEvents();
    if (home) renderHome(home, events);
    if (meetings) renderMeetings(meetings, events);
  } catch {
    const message = 'تعذر تحميل مواعيد الاجتماعات حالياً. نعقد اجتماعاتنا عادةً السبت الأول والثالث من كل شهر. يرجى التأكد من الموعد عبر واتساب.';
    if (home) home.replaceChildren(paragraph(message, 'text-sm text-slate-700'));
    if (meetings) meetings.replaceChildren(paragraph(message, 'text-slate-700'));
    updateEventSchema([]);
  }
}

if (typeof document !== 'undefined') {
  init();
  // Open tabs also pick up edited or cancelled events without a page reload.
  setInterval(init, 300000);
}
