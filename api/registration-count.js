import { askAppsScript, cacheCount, limitRequest, readCachedCount, validCount, validEventId } from '../server/registration.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  response.setHeader('Cache-Control', 'no-store');
  const eventId = request.query?.eventId;
  if (!validEventId(eventId)) return response.status(400).json({ error: 'Invalid event ID' });
  if (limitRequest(request, 'count')) return response.status(429).json({ error: 'Too many requests' });
  const cached = readCachedCount(eventId);
  if (cached !== null) return response.status(200).json({ eventId, count: cached });
  try {
    const result = await askAppsScript({ action: 'count', eventId });
    if (!validCount(result.count)) throw new Error('invalid-count');
    cacheCount(eventId, result.count);
    return response.status(200).json({ eventId, count: result.count });
  } catch {
    return response.status(502).json({ error: 'Registration count is temporarily unavailable' });
  }
}
