const ZONE = 'Africa/Cairo';
const CLUB_URL = 'https://www.alkalemah.club/';
const COMMUNITY_URL = 'https://chat.whatsapp.com/JutO99rTDXVLIHSwLbWPZO';
const WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

export function selectCurrentEvent(events, now = Date.now()) {
  return events.filter(event => Date.parse(event.end) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] || null;
}

export function formatEventTime(event) {
  const date = new Date(event.start);
  const dateText = new Intl.DateTimeFormat('ar-EG', {
    timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
  return `${dateText}، ${formatClockRange(event)}`;
}

function formatClockRange(event) {
  const time = value => new Intl.DateTimeFormat('ar-EG', {
    timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(value));
  return `من ${time(event.start)} إلى ${time(event.end)} بتوقيت القاهرة`;
}

export function cairoDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}`;
}

// Saturday-first rows, with empty cells before/after the current month.
export function calendarMonthDays(year, month) {
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 1) % 7;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= length ? day : null;
  });
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

function eventActions(event, featured = false, includeCommunity = true) {
  const actions = document.createElement('div');
  actions.className = 'flex flex-wrap gap-3 pt-3 text-sm font-bold';
  if (includeCommunity) actions.append(link('انضم إلى مجتمع واتساب', COMMUNITY_URL,
    'rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5', true));
  actions.append(link('أضف إلى تقويم Google', googleCalendarUrl(event),
    featured ? 'rounded-xl bg-white text-loyal-blue hover:bg-loyal-blue-light px-4 py-2.5'
      : 'rounded-xl bg-loyal-blue hover:bg-loyal-blue-dark text-white px-4 py-2.5', true));
  const ics = document.createElement('button');
  ics.type = 'button';
  ics.textContent = 'أضف إلى تقويمك (.ics)';
  ics.className = featured
    ? 'rounded-xl bg-happy-yellow text-loyal-blue hover:bg-happy-yellow-dark px-4 py-2.5'
    : 'rounded-xl border border-loyal-blue text-loyal-blue hover:bg-loyal-blue-light px-4 py-2.5';
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
    featured ? 'rounded-xl text-white hover:underline px-2 py-2.5'
      : 'rounded-xl text-loyal-blue hover:underline px-2 py-2.5', true));
  return actions;
}

function eventTitle(event, className) {
  const title = document.createElement('h3');
  title.textContent = event.title;
  title.className = className;
  title.dir = 'auto';
  return title;
}

function eventDescription(event, className) {
  if (!event.description?.trim()) return null;
  const description = paragraph(event.description.trim(), className);
  description.dir = 'auto';
  return description;
}

function renderFeaturedEvent(event, root, events) {
  const article = document.createElement('article');
  article.className = 'rounded-3xl bg-gradient-to-br from-loyal-blue to-loyal-blue-dark border-t-4 border-happy-yellow text-white shadow-lg p-6 sm:p-8 space-y-4';
  const label = paragraph('الاجتماع القادم', 'inline-block rounded-full bg-white/10 px-3 py-1 text-happy-yellow font-black text-sm');
  const title = document.createElement('h2');
  title.textContent = event.title;
  title.dir = 'auto';
  title.className = 'text-2xl sm:text-3xl font-black heading-font leading-snug';
  article.append(label, title, paragraph(formatEventTime(event), 'font-bold text-white text-base sm:text-lg'));
  if (event.location) article.append(paragraph(event.location, 'text-white/90'));
  const description = eventDescription(event, 'text-white/90 whitespace-pre-line leading-relaxed');
  if (description) article.append(description);
  const timer = document.createElement('div');
  timer.className = 'rounded-2xl bg-white/10 border border-white/20 p-4 min-h-20';
  const countdown = paragraph('', 'text-lg sm:text-xl font-black text-happy-yellow tabular-nums');
  countdown.setAttribute('aria-hidden', 'true');
  const ongoing = paragraph('', 'text-lg font-black text-happy-yellow');
  ongoing.setAttribute('aria-live', 'polite');
  timer.append(countdown, ongoing);
  article.append(timer, eventActions(event, true));

  const refresh = () => {
    if (Date.now() >= Date.parse(event.end)) { renderMeetings(root, events); return; }
    if (Date.now() >= Date.parse(event.start)) {
      countdown.textContent = '';
      ongoing.textContent = 'جارٍ الآن';
    } else {
      ongoing.textContent = '';
      countdown.textContent = countdownText(event);
    }
  };
  root._meetingsCountdown = setInterval(refresh, 30000);
  queueMicrotask(refresh);
  return article;
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('ar-EG', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function fullDateLabel(dateKey) {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function stepMonth(monthKey, change) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + change, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function renderAgenda(events) {
  const section = document.createElement('section');
  section.className = 'mt-8';
  const heading = document.createElement('h3');
  heading.className = 'text-lg font-black text-loyal-blue mb-3';
  heading.textContent = 'الاجتماعات التالية حسب التاريخ';
  const list = document.createElement('ol');
  list.className = 'rounded-2xl border border-slate-200 bg-white divide-y divide-slate-200';
  for (const event of events) {
    const item = document.createElement('li');
    item.className = 'p-4 sm:p-5';
    const article = document.createElement('article');
    article.append(eventTitle(event, 'font-black text-loyal-blue text-lg'),
      paragraph(formatEventTime(event), 'text-slate-700 font-semibold mt-1'));
    if (event.location) article.append(paragraph(event.location, 'text-slate-600 text-sm mt-1'));
    article.append(eventActions(event, false, false));
    item.append(article);
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function renderCalendar(events, root) {
  const byDate = new Map();
  for (const event of events) {
    const key = cairoDateKey(event.start);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(event);
  }
  const dates = [...byDate.keys()].sort();
  const firstMonth = dates[0].slice(0, 7);
  const lastMonth = dates.at(-1).slice(0, 7);
  let visibleMonth = root._calendarMonth;
  if (!visibleMonth || visibleMonth < firstMonth || visibleMonth > lastMonth) visibleMonth = firstMonth;
  let selectedDate = root._selectedCalendarDate;

  const section = document.createElement('section');
  section.className = 'mt-10';
  const heading = document.createElement('h2');
  heading.textContent = 'تقويم الاجتماعات القادمة';
  heading.className = 'text-2xl font-black heading-font text-loyal-blue mb-5';
  const layout = document.createElement('div');
  layout.className = 'grid gap-5 lg:grid-cols-2';
  const calendar = document.createElement('div');
  calendar.className = 'rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-5';
  const controls = document.createElement('div');
  controls.className = 'flex items-center justify-between gap-3 mb-5';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = 'الشهر السابق';
  previous.className = 'text-sm font-bold text-loyal-blue disabled:text-slate-400 disabled:cursor-not-allowed hover:underline';
  const title = document.createElement('h3');
  title.className = 'font-black text-loyal-blue text-lg text-center';
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'الشهر التالي';
  next.className = previous.className;
  controls.append(previous, title, next);
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-7 gap-1 sm:gap-1.5 text-center';
  calendar.append(controls, grid);
  const detail = document.createElement('div');
  detail.className = 'rounded-2xl border border-loyal-blue/15 bg-loyal-blue-light p-5 sm:p-6';
  detail.setAttribute('aria-live', 'polite');
  layout.append(calendar, detail);
  section.append(heading, layout, renderAgenda(events));

  function paintDetails() {
    detail.replaceChildren();
    if (!selectedDate) {
      detail.append(paragraph('لا توجد اجتماعات مجدولة في هذا الشهر.', 'font-bold text-loyal-blue'));
      return;
    }
    const dateHeading = document.createElement('h3');
    dateHeading.className = 'font-black text-loyal-blue text-lg mb-3';
    dateHeading.textContent = fullDateLabel(selectedDate);
    detail.append(dateHeading);
    for (const event of byDate.get(selectedDate)) {
      const article = document.createElement('article');
      article.className = 'border-t border-loyal-blue/15 py-3';
      article.append(eventTitle(event, 'font-black text-loyal-blue text-lg'),
        paragraph(formatClockRange(event), 'font-semibold text-slate-700 mt-1'));
      if (event.location) article.append(paragraph(event.location, 'text-slate-600 mt-1'));
      const description = eventDescription(event, 'text-slate-600 whitespace-pre-line mt-2');
      if (description) article.append(description);
      article.append(eventActions(event));
      detail.append(article);
    }
  }

  function paintSelection() {
    for (const button of grid.querySelectorAll('button[data-event-date]')) {
      const active = button.dataset.eventDate === selectedDate;
      button.setAttribute('aria-pressed', String(active));
      button.className = active
        ? 'min-h-14 rounded-xl bg-loyal-blue text-white font-black flex flex-col items-center justify-center'
        : 'min-h-14 rounded-xl bg-loyal-blue-light text-loyal-blue hover:bg-slate-200 font-bold flex flex-col items-center justify-center';
    }
  }

  function paintMonth() {
    root._calendarMonth = visibleMonth;
    const monthDates = dates.filter(date => date.startsWith(visibleMonth));
    if (!monthDates.includes(selectedDate)) selectedDate = monthDates[0] || null;
    root._selectedCalendarDate = selectedDate;
    title.textContent = monthLabel(visibleMonth);
    previous.disabled = visibleMonth <= firstMonth;
    next.disabled = visibleMonth >= lastMonth;
    grid.replaceChildren();
    for (const dayName of WEEKDAYS) {
      const label = document.createElement('span');
      label.textContent = dayName;
      label.className = 'text-[10px] sm:text-xs font-bold text-slate-600 pb-2';
      grid.append(label);
    }
    const [year, month] = visibleMonth.split('-').map(Number);
    for (const day of calendarMonthDays(year, month)) {
      if (!day) {
        const blank = document.createElement('span');
        blank.setAttribute('aria-hidden', 'true');
        grid.append(blank);
        continue;
      }
      const key = `${visibleMonth}-${String(day).padStart(2, '0')}`;
      const matching = byDate.get(key);
      if (!matching) {
        const number = document.createElement('span');
        number.textContent = new Intl.NumberFormat('ar-EG').format(day);
        number.className = 'min-h-14 flex items-center justify-center text-slate-500';
        grid.append(number);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.eventDate = key;
      const count = matching.length === 1 ? 'اجتماع واحد'
        : matching.length === 2 ? 'اجتماعان' : `${matching.length} اجتماعات`;
      button.setAttribute('aria-label', `${fullDateLabel(key)}، ${count}، ${matching.map(event => event.title).join('، ')}`);
      const dayNumber = document.createElement('span');
      dayNumber.textContent = new Intl.NumberFormat('ar-EG').format(day);
      const marker = document.createElement('span');
      marker.textContent = matching.length === 1 ? '●' : new Intl.NumberFormat('ar-EG').format(matching.length);
      marker.className = 'text-xs leading-none';
      button.append(dayNumber, marker);
      button.addEventListener('click', () => {
        selectedDate = key;
        root._selectedCalendarDate = key;
        paintSelection();
        paintDetails();
      });
      grid.append(button);
    }
    paintSelection();
    paintDetails();
  }

  previous.addEventListener('click', () => { visibleMonth = stepMonth(visibleMonth, -1); paintMonth(); });
  next.addEventListener('click', () => { visibleMonth = stepMonth(visibleMonth, 1); paintMonth(); });
  paintMonth();
  return section;
}

function renderMeetings(root, events) {
  clearInterval(root._meetingsCountdown);
  root.replaceChildren();
  const upcoming = events.filter(event => Date.parse(event.end) > Date.now())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (!upcoming.length) {
    const empty = document.createElement('div');
    empty.className = 'rounded-2xl bg-white border border-slate-200 p-6 sm:p-8';
    empty.setAttribute('role', 'status');
    empty.append(paragraph('لم يتم الإعلان عن موعد الاجتماع القادم بعد', 'font-black text-loyal-blue text-xl'),
      paragraph('نعقد اجتماعاتنا عادةً السبت الأول والثالث من كل شهر. تابع هذه الصفحة لمعرفة المواعيد الجديدة.', 'text-slate-600 mt-2'),
      link('انضم إلى مجتمع واتساب', COMMUNITY_URL,
        'inline-flex mt-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 font-bold', true));
    root.append(empty);
    updateEventSchema([]);
    return;
  }
  root.append(renderFeaturedEvent(upcoming[0], root, events));
  if (upcoming.length > 1) root.append(renderCalendar(upcoming.slice(1), root));
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
    if (meetings) {
      clearInterval(meetings._meetingsCountdown);
      const error = paragraph(message, 'text-slate-700');
      error.setAttribute('role', 'status');
      meetings.replaceChildren(error,
        link('انضم إلى مجتمع واتساب', COMMUNITY_URL,
          'inline-flex mt-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 font-bold', true));
    }
    updateEventSchema([]);
  }
}

if (typeof document !== 'undefined') {
  init();
  // Open tabs also pick up edited or cancelled events without a page reload.
  setInterval(init, 300000);
}
