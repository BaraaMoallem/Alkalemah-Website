import { readFileSync } from 'node:fs';
import { getCalendarEvents } from './calendar-events.js';
import { prerenderIndexHtml, prerenderMeetingsHtml } from '../src/prerender.js';
import { INDEX_HTML_TEMPLATE, MEETINGS_HTML_TEMPLATE } from '../server/page-templates.js';

function loadTemplate(page) {
  if (page === 'meetings' && MEETINGS_HTML_TEMPLATE) return MEETINGS_HTML_TEMPLATE;
  if (page === 'index' && INDEX_HTML_TEMPLATE) return INDEX_HTML_TEMPLATE;
  const filename = page === 'meetings' ? 'meetings.html' : 'index.html';
  for (const candidate of [`../dist/${filename}`, `../${filename}`]) {
    try {
      return readFileSync(new URL(candidate, import.meta.url), 'utf8');
    } catch {
      // Try next path candidate.
    }
  }
  return '';
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const page = request.query?.page === 'index' ? 'index' : 'meetings';
  const template = loadTemplate(page);
  if (!template) {
    response.setHeader('Cache-Control', 'no-store');
    return response.status(500).send('Page template unavailable');
  }

  response.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!process.env.GOOGLE_CALENDAR_ID || !process.env.GOOGLE_CALENDAR_API_KEY) {
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return response.status(200).send(template);
  }

  try {
    if (page === 'meetings') {
      const [upcomingResult, pastResult] = await Promise.allSettled([
        getCalendarEvents('upcoming'),
        getCalendarEvents('past'),
      ]);
      if (upcomingResult.status === 'rejected' && pastResult.status === 'rejected') {
        throw upcomingResult.reason;
      }
      const upcomingEvents = upcomingResult.status === 'fulfilled' ? upcomingResult.value : [];
      const pastEvents = pastResult.status === 'fulfilled' ? pastResult.value : [];
      const html = prerenderMeetingsHtml(template, { upcomingEvents, pastEvents });
      response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
      return response.status(200).send(html);
    }

    const upcomingEvents = await getCalendarEvents('upcoming');
    const html = prerenderIndexHtml(template, { upcomingEvents });
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    return response.status(200).send(html);
  } catch {
    // Serve the static HTML template gracefully if Google Calendar is temporarily unreachable.
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
    return response.status(200).send(template);
  }
}
