import { getUpcomingEvents } from './calendar-events.js';
import { askAppsScript, cacheCount, cleanText, invalidateCount, limitRequest,
  RegistrationBackendError, validCount, validEventId } from '../server/registration.js';

const allowedFields = new Set(['name', 'phone', 'email', 'eventId', 'eventTitle', 'eventStart']);

function logRegistration(code, httpStatus, details = {}) {
  // Keep diagnostics categorical. Never log request bodies, upstream URLs or raw exceptions.
  console.warn('[registration]', { code, httpStatus, ...details });
}

function fail(response, httpStatus, code, details = {}) {
  logRegistration(code, httpStatus, details);
  return response.status(httpStatus).json({ ok: false, code });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return fail(response, 405, 'METHOD_NOT_ALLOWED');
  }
  response.setHeader('Cache-Control', 'no-store');
  if (limitRequest(request, 'register')) return fail(response, 429, 'RATE_LIMITED');
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] || '')) {
    return fail(response, 415, 'INVALID_SUBMISSION');
  }
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      JSON.stringify(body).length > 4096 || Object.keys(body).some(key => !allowedFields.has(key))) {
    return fail(response, 400, 'INVALID_SUBMISSION');
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
    return fail(response, 400, 'INVALID_SUBMISSION');
  }

  if (!process.env.GOOGLE_CALENDAR_ID || !process.env.GOOGLE_CALENDAR_API_KEY) {
    return fail(response, 503, 'REGISTRATION_CONFIG_MISSING', { dependency: 'calendar' });
  }
  let event;
  try {
    event = (await getUpcomingEvents()).find(item => item.id === eventId);
  } catch {
    return fail(response, 502, 'CALENDAR_UNAVAILABLE');
  }
  if (!event) return fail(response, 404, 'INVALID_EVENT');

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
      } catch (error) {
        // The registration succeeded; a failed count must not invite an accidental retry.
        const code = error instanceof RegistrationBackendError ? error.code : 'REGISTRATION_BACKEND_UNAVAILABLE';
        const upstreamStatus = error instanceof RegistrationBackendError ? error.upstreamStatus : undefined;
        logRegistration('COUNT_' + code, 200, upstreamStatus ? { upstreamStatus } : {});
      }
    }
    if (count !== null) cacheCount(eventId, count);
    if (alreadyRegistered) logRegistration('DUPLICATE_REGISTRATION', 200);
    return response.status(200).json({ ok: true, code: alreadyRegistered ? 'ALREADY_REGISTERED' : 'REGISTERED',
      alreadyRegistered, count });
  } catch (error) {
    const code = error instanceof RegistrationBackendError ? error.code : 'REGISTRATION_BACKEND_UNAVAILABLE';
    const upstreamStatus = error instanceof RegistrationBackendError ? error.upstreamStatus : undefined;
    const httpStatus = code === 'REGISTRATION_CONFIG_MISSING' ? 503 : 502;
    return fail(response, httpStatus, code, { dependency: 'apps_script',
      ...(upstreamStatus ? { upstreamStatus } : {}) });
  }
}
