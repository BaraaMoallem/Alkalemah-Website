import { getUpcomingEvents } from './calendar-events.js';
import { askAppsScript, cacheCount, cleanText, invalidateCount, limitRequest, validCount, validEventId } from '../server/registration.js';

const allowedFields = new Set(['name', 'phone', 'email', 'eventId', 'eventTitle', 'eventStart']);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  response.setHeader('Cache-Control', 'no-store');
  if (limitRequest(request, 'register')) return response.status(429).json({ error: 'Too many requests' });
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] || '')) {
    return response.status(415).json({ error: 'JSON required' });
  }
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      JSON.stringify(body).length > 4096 || Object.keys(body).some(key => !allowedFields.has(key))) {
    return response.status(400).json({ error: 'Invalid registration' });
  }
  const name = cleanText(body.name, 120, true);
  const phone = cleanText(body.phone, 32, true);
  const email = body.email === undefined || body.email === '' ? '' : cleanText(body.email, 254);
  const eventTitle = cleanText(body.eventTitle, 250, true);
  const eventStart = cleanText(body.eventStart, 64, true);
  const eventId = body.eventId;
  if (!name || !phone || email === null || !eventTitle || !eventStart || !validEventId(eventId) ||
      !/^[+\d][\d\s().-]{6,31}$/u.test(phone) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(eventStart) ||
      !Number.isFinite(Date.parse(eventStart))) {
    return response.status(400).json({ error: 'Invalid registration' });
  }

  let event;
  try {
    event = (await getUpcomingEvents()).find(item => item.id === eventId);
  } catch {
    return response.status(502).json({ error: 'Calendar is temporarily unavailable' });
  }
  if (!event) return response.status(404).json({ error: 'Meeting is no longer available' });

  try {
    // The live calendar is canonical, even if the page still has an older title or time.
    const result = await askAppsScript({
      action: 'register', name, phone, email, eventId,
      eventTitle: event.title, eventStart: event.start,
    });
    invalidateCount(eventId);
    const alreadyRegistered = result.alreadyRegistered === true;
    let count = validCount(result.count) ? result.count : null;
    if (count === null) {
      try {
        const countResult = await askAppsScript({ action: 'count', eventId });
        if (validCount(countResult.count)) count = countResult.count;
      } catch { /* The registration succeeded; do not invite an accidental retry. */ }
    }
    if (count !== null) cacheCount(eventId, count);
    return response.status(200).json({ alreadyRegistered, count });
  } catch {
    return response.status(502).json({ error: 'Registration is temporarily unavailable' });
  }
}
