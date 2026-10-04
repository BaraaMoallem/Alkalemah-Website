// Vercel serves files in /api as serverless functions. Keep the Google key on the server.
export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!calendarId || !apiKey) {
    return response.status(503).json({ error: 'Calendar is not configured' });
  }

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('timeMin', new Date().toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('showDeleted', 'false');
  url.searchParams.set('maxResults', '20');
  url.searchParams.set('fields', 'items(id,summary,description,start,end,location,htmlLink,status),timeZone');
  // For a shared calendar, set a Google Calendar search query. A dedicated club calendar needs none.
  if (process.env.GOOGLE_CALENDAR_EVENT_QUERY) {
    url.searchParams.set('q', process.env.GOOGLE_CALENDAR_EVENT_QUERY);
  }

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error(`Google Calendar returned ${upstream.status}`);
    const data = await upstream.json();
    const events = (data.items || [])
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
      .filter(event => Date.parse(event.end) > Date.now());

    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=60');
    return response.status(200).json({ events });
  } catch {
    // Do not disclose the API key or upstream URL to visitors.
    response.setHeader('Cache-Control', 'no-store');
    return response.status(502).json({ error: 'Calendar is temporarily unavailable' });
  }
}
