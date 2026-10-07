# نادي الكلمة توستماسترز

This is the existing Arabic, RTL, multi-page Vite website. Run `npm install`, then `npm run dev` for static page work, `npm run build` for the production output in `dist`, and `npm run lint` for the existing TypeScript check. Production needs a host that runs the `/api/calendar-events` Vercel function. A static-only host or plain `vite` preview cannot provide live meeting data.

## Calendar setup

1. Create a **dedicated** Google Calendar for Alkalemah meetings. On a computer, open Google Calendar → Settings → the new calendar → **Access permissions for events** → **Make available to public** → **See all event details**. Only put information intended for the public in its title, description, and location. Set the calendar time zone to **Africa/Cairo**.
2. Under **Integrate calendar**, copy the **Calendar ID**, not the “Secret address in iCal format.” The ID usually looks like an email address. Put it in the hosting environment variable `GOOGLE_CALENDAR_ID`.
3. In a Google Cloud project, enable **Google Calendar API** and create an API key. Restrict the key to the Google Calendar API. Put it in the server-side hosting environment variable `GOOGLE_CALENDAR_API_KEY`. Never put it in a `VITE_` variable or commit it. If the hosting provider gives the function a fixed outbound IP, an IP application restriction can also be used.
4. If using an existing calendar that contains unrelated entries, optionally set `GOOGLE_CALENDAR_EVENT_QUERY` to a search phrase included in meeting events. A dedicated calendar is preferable. The query uses Google Calendar's `q` search, so check that it matches every desired event.
5. In Vercel, add these values under **Project → Settings → Environment Variables** for Production and, if testing there, Preview and Development. Redeploy after changing them. The build command is `npm run build`; output directory is `dist`. Vercel serves `api/calendar-events.js` as `/api/calendar-events` alongside the built pages.

Adding, editing, cancelling, or removing a meeting in Google Calendar updates the website automatically. Repeating meetings are expanded into occurrences. The endpoint caches successful responses at the CDN for five minutes, and an open browser tab refetches every five minutes. The homepage counts down to the earliest real event, shows “in progress” from its start until its end, then advances. The normal first and third Saturday schedule and usual venue remain visible as guidance. If the calendar returns no upcoming events, the site says that no next date has been announced; it never invents one. If loading fails, the site instead says the date cannot currently be loaded and points guests to WhatsApp.

Meeting events should have a timed start and end (not an all-day entry), a title, and the actual location. Google Calendar event times include their time-zone offset; the website formats them in Cairo time. The Meetings page features the next meeting with its countdown, shows later meetings in a monthly calendar and chronological agenda, and offers Google Calendar and `.ics` additions. Its community invitation uses the same WhatsApp group link as the rest of the site; direct private contact remains available elsewhere for questions.

## Local testing

- Run `npm run build`, `npm run lint`, and `node --test` for the included calendar and page checks.
- For a live Calendar API test, link the Vercel project, configure Development environment variables, and run `vercel dev`. Open `http://localhost:3000/api/calendar-events` to check that it returns `{ "events": [...] }`, then inspect the homepage and `/meetings.html`. Plain `npm run dev` serves the pages but does not run the serverless function, so it displays the error fallback.
- For failure testing, run the endpoint without the environment variables or block the API request. Empty and timed-event scenarios are covered by the automated mock tests.

Events are represented as JSON-LD in the browser after the calendar loads. Static crawlers may not see those event records, and the shared `meetings.html` URL is not an individual event URL. Full event rich-result eligibility would require stable individual event pages with server-rendered event data; this site does not add a new routing architecture solely for that purpose.
