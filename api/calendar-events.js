// Vercel serves files in /api as serverless functions. Keep the Google key on the server.
export async function getCalendarEvents(scope = 'upcoming') {
  if (scope !== 'upcoming' && scope !== 'past') throw new Error('Invalid calendar scope');
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!calendarId || !apiKey) throw new Error('Calendar is not configured');

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('key', apiKey);
  const now = Date.now();
  if (scope === 'past') {
    const lookback = new Date(now);
    lookback.setUTCMonth(lookback.getUTCMonth() - 18);
    url.searchParams.set('timeMin', lookback.toISOString());
    url.searchParams.set('timeMax', new Date(now).toISOString());
  } else {
    url.searchParams.set('timeMin', new Date(now).toISOString());
  }
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('showDeleted', 'false');
  url.searchParams.set('maxResults', scope === 'past' ? '250' : '20');
  url.searchParams.set('fields', 'items(id,summary,description,start,end,location,htmlLink,status),nextPageToken,timeZone');
  // For a shared calendar, set a Google Calendar search query. A dedicated club calendar needs none.
  if (process.env.GOOGLE_CALENDAR_EVENT_QUERY) {
    url.searchParams.set('q', process.env.GOOGLE_CALENDAR_EVENT_QUERY);
  }

  const items = [];
  for (let page = 0; page < (scope === 'past' ? 4 : 1); page++) {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!upstream.ok) throw new Error(`Google Calendar returned ${upstream.status}`);
    const data = await upstream.json();
    if (Array.isArray(data.items)) items.push(...data.items);
    if (!data.nextPageToken) break;
    url.searchParams.set('pageToken', data.nextPageToken);
  }
  const events = items
    .filter(event => event.status !== 'cancelled' && event.start?.dateTime && event.end?.dateTime)
    .map(event => ({
      id: event.id,
      title: event.summary || 'اجتماع نادي الكلمة توستماسترز',
      description: event.description || '',
      start: event.start.dateTime,
      end: event.end.dateTime,
      location: event.location || '',
      htmlLink: event.htmlLink || '',
      status: event.status || 'confirmed',
    }))
    .filter(event => Number.isFinite(Date.parse(event.start)) && Number.isFinite(Date.parse(event.end)) &&
      Date.parse(event.end) > Date.parse(event.start) &&
      (scope === 'past' ? Date.parse(event.end) <= now : Date.parse(event.end) > now));

  return scope === 'past'
    ? events.sort((a, b) => Date.parse(b.start) - Date.parse(a.start)).slice(0, 16)
    : events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function getUpcomingEvents() { return getCalendarEvents('upcoming'); }

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const scope = request.query?.scope || 'upcoming';
  if (scope !== 'upcoming' && scope !== 'past') {
    return response.status(400).json({ error: 'Invalid calendar scope' });
  }
  if (!process.env.GOOGLE_CALENDAR_ID || !process.env.GOOGLE_CALENDAR_API_KEY) {
    return response.status(503).json({ error: 'Calendar is not configured' });
  }
  try {
    const events = await getCalendarEvents(scope);
    response.setHeader('Cache-Control', scope === 'past'
      ? 'public, max-age=0, s-maxage=1800, stale-while-revalidate=300'
      : 'public, max-age=0, s-maxage=60, stale-while-revalidate=30');
    return response.status(200).json({ events });
  } catch {
    // Do not disclose the API key or upstream URL to visitors.
    response.setHeader('Cache-Control', 'no-store');
    return response.status(502).json({ error: 'Calendar is temporarily unavailable' });
  }
}
