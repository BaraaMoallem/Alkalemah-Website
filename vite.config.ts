import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

function prerenderCalendarPlugin(): Plugin {
  return {
    name: 'prerender-calendar-pages',
    apply: 'build',
    async closeBundle() {
      const distDir = resolve(process.cwd(), 'dist');
      const indexPath = resolve(distDir, 'index.html');
      const meetingsPath = resolve(distDir, 'meetings.html');
      let indexHtml = readFileSync(indexPath, 'utf8');
      let meetingsHtml = readFileSync(meetingsPath, 'utf8');

      if (process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_CALENDAR_API_KEY) {
        try {
          const { getCalendarEvents } = await import('./api/calendar-events.js');
          const { prerenderIndexHtml, prerenderMeetingsHtml } = await import('./src/prerender.js');
          const [upcomingResult, pastResult] = await Promise.allSettled([
            getCalendarEvents('upcoming'),
            getCalendarEvents('past'),
          ]);
          const upcomingEvents = upcomingResult.status === 'fulfilled' ? upcomingResult.value : [];
          const pastEvents = pastResult.status === 'fulfilled' ? pastResult.value : [];
          if (upcomingResult.status === 'fulfilled' || pastResult.status === 'fulfilled') {
            indexHtml = prerenderIndexHtml(indexHtml, { upcomingEvents });
            meetingsHtml = prerenderMeetingsHtml(meetingsHtml, { upcomingEvents, pastEvents });
            writeFileSync(indexPath, indexHtml, 'utf8');
            writeFileSync(meetingsPath, meetingsHtml, 'utf8');
          }
        } catch {
          // Keep the static HTML output if the calendar API is unreachable during build.
        }
      }

      const templatesPath = resolve(process.cwd(), 'server/page-templates.js');
      writeFileSync(
        templatesPath,
        [
          '// Auto-updated during `npm run build` with the Vite-bundled HTML templates.',
          `export const INDEX_HTML_TEMPLATE = ${JSON.stringify(indexHtml)};`,
          `export const MEETINGS_HTML_TEMPLATE = ${JSON.stringify(meetingsHtml)};`,
          '',
        ].join('\n'),
        'utf8'
      );
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), prerenderCalendarPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        meetings: 'meetings.html',
        location: 'location.html',
        contact: 'contact.html',
        faq: 'faq.html',
      },
    },
  },
});
