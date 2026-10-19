// Shared server-only registration helpers. No registration records are stored here.
const countCache = new Map();
const rateBuckets = new Map();

export function cleanText(value, maxLength, required = false) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s+/gu, ' ');
  if (cleaned.length > maxLength || (required && !cleaned) || /[\u0000-\u001f\u007f<>]/u.test(cleaned)) return null;
  return cleaned;
}

export function validEventId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 256 &&
    /^[A-Za-z0-9_@.\-]+$/u.test(value);
}

export function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function limitRequest(request, kind) {
  const now = Date.now();
  // Best effort within one warm Vercel instance; Apps Script must enforce duplicates.
  const ip = String(request.headers?.['x-vercel-forwarded-for'] || request.headers?.['x-forwarded-for'] ||
    request.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 64);
  const key = `${kind}:${ip}`;
  const windowMs = 60_000;
  const max = kind === 'register' ? 6 : 90;
  if (rateBuckets.size > 1000) {
    for (const [bucketKey, bucket] of rateBuckets) if (bucket.until <= now) rateBuckets.delete(bucketKey);
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.until <= now) {
    rateBuckets.set(key, { used: 1, until: now + windowMs });
    return false;
  }
  bucket.used += 1;
  return bucket.used > max;
}

export function readCachedCount(eventId) {
  const entry = countCache.get(eventId);
  if (!entry || entry.until <= Date.now()) {
    countCache.delete(eventId);
    return null;
  }
  return entry.count;
}

export function cacheCount(eventId, count) {
  if (validCount(count)) countCache.set(eventId, { count, until: Date.now() + 10_000 });
}

export function invalidateCount(eventId) {
  countCache.delete(eventId);
}

export class RegistrationBackendError extends Error {
  constructor(code, upstreamStatus) {
    super(code);
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export async function askAppsScript(payload) {
  const endpoint = process.env.REGISTRATION_APPS_SCRIPT_URL;
  const secret = process.env.REGISTRATION_WEBHOOK_SECRET;
  if (!endpoint || !secret) throw new RegistrationBackendError('REGISTRATION_CONFIG_MISSING');
  let url;
  try { url = new URL(endpoint); } catch { throw new RegistrationBackendError('REGISTRATION_CONFIG_MISSING'); }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com') {
    throw new RegistrationBackendError('REGISTRATION_CONFIG_MISSING');
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret }),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
  } catch {
    throw new RegistrationBackendError('REGISTRATION_BACKEND_UNAVAILABLE');
  }
  let data;
  try {
    data = await upstream.json();
  } catch {
    throw new RegistrationBackendError(upstream.ok ? 'REGISTRATION_BACKEND_INVALID_RESPONSE'
      : 'REGISTRATION_BACKEND_REJECTED', upstream.status);
  }
  if (!upstream.ok && !(payload.action === 'register' && data?.alreadyRegistered === true)) {
    throw new RegistrationBackendError('REGISTRATION_BACKEND_REJECTED', upstream.status);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RegistrationBackendError('REGISTRATION_BACKEND_INVALID_RESPONSE', upstream.status);
  }
  if (data.alreadyRegistered !== true && (data.success === false || data.ok === false || data.error)) {
    throw new RegistrationBackendError('REGISTRATION_BACKEND_REJECTED', upstream.status);
  }
  if (payload.action === 'register' && data.alreadyRegistered !== true && data.success !== true &&
      data.ok !== true && !validCount(data.count)) {
    throw new RegistrationBackendError('REGISTRATION_BACKEND_INVALID_RESPONSE', upstream.status);
  }
  if (payload.action === 'count' && !validCount(data.count)) {
    throw new RegistrationBackendError('REGISTRATION_BACKEND_INVALID_RESPONSE', upstream.status);
  }
  return data;
}
