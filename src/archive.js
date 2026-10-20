const headingPattern = /^\s*(محور\s+الاجتماع|نبذة\s+عن\s+الاجتماع|(?:رابط|روابط)\s+الاجتماع)\s*(?:[:：﹕؛]\s*(.*))?\s*$/u;
const urlPattern = /https?:\/\/[^\s<>"']+|(?<![\w.-])(?:www\.)?(?:facebook|instagram)\.com(?![.\w-])(?:\/[^\s<>"']*)?/giu;

function socialLinks(text) {
  const links = [];
  const seen = new Set();
  for (const match of text.matchAll(urlPattern)) {
    const raw = match[0].replace(/[.,،؛)\]]+$/u, '');
    try {
      const url = new URL(/^https?:\/\//iu.test(raw) ? raw : `https://${raw}`);
      const host = url.hostname.toLowerCase();
      const platform = host === 'facebook.com' || host.endsWith('.facebook.com') ? 'facebook'
        : host === 'instagram.com' || host.endsWith('.instagram.com') ? 'instagram' : null;
      if (!platform || seen.has(url.href)) continue;
      seen.add(url.href);
      links.push({ platform, href: url.href });
    } catch { /* A malformed optional link does not hide the meeting. */ }
  }
  return links;
}

export function parseMeetingDescription(description) {
  const fields = { theme: [], summary: [], links: [] };
  if (typeof description !== 'string') return { theme: '', summary: '', links: [] };
  let section = null;
  for (const line of description.split(/\r?\n/u)) {
    const heading = line.match(headingPattern);
    if (heading) {
      section = heading[1].startsWith('محور') ? 'theme'
        : heading[1].startsWith('نبذة') ? 'summary' : 'links';
      if (heading[2]?.trim()) fields[section].push(heading[2].trim());
    } else if (section) {
      fields[section].push(line.trim());
    }
  }
  return {
    theme: fields.theme.join(' ').trim(),
    summary: fields.summary.join('\n').trim(),
    links: socialLinks(fields.links.join(' ')),
  };
}
