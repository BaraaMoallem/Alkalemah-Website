# نادي الكلمة توستماسترز | Alkalemah Toastmasters Club

[**Live Website (`alkalemah.club`)**](https://www.alkalemah.club/) • [**Official Toastmasters Profile (Club #00003029)**](https://www.toastmasters.org/Find-a-Club/00003029-alkalemah-toastmasters-club)

The official Arabic, RTL multi-page website for **Alkalemah Toastmasters Club (نادي الكلمة توستماسترز)** — the first Arabic public speaking and leadership club in Egypt (chartered June 1, 2000), meeting on the 1st and 3rd Saturday of each month from 6:00 PM to 9:00 PM (Cairo time) in Heliopolis, Cairo.

---

## ✨ Key Features

- **Live Google Calendar Synchronization**:
  - Upcoming meetings, countdown timers, monthly calendar grids, and chronological agendas are automatically populated from the club's Google Calendar (`/api/calendar-events`).
  - Supports structured Arabic meeting descriptions (`محور الاجتماع:`, `نبذة عن الاجتماع:`, `روابط الاجتماع:`) to display meeting themes, summaries, and social media recap links (`Facebook` / `Instagram`) across upcoming and archived meetings.
  - One-click **Add to Google Calendar** and downloadable **`.ics` calendar files** with Cairo timezone (`Africa/Cairo`) support.
- **Server-Side & Build-Time Pre-Rendering (SEO & AI Crawler Ready)**:
  - Vercel Routing Middleware (`middleware.js`) and `/api/render-page` pre-render live upcoming and past meetings directly into the initial HTML response of `/` (`index.html`) and `/meetings.html` with Edge CDN caching (`s-maxage=300, stale-while-revalidate=3600`).
  - `vite.config.ts` also pre-renders static HTML at build time when calendar credentials are provided.
  - Full Schema.org JSON-LD (`EducationalOrganization`, `EventSeries`, `Event`, `Place`, `FAQPage`) plus `public/llms.txt` and `public/robots.txt` rules for Google Search Console and AI search engines (`OAI-SearchBot`, `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`).
- **Guest Registration System**:
  - Accessible, RTL-friendly modal (`src/registration.js`) allowing guests to register for the next upcoming meeting.
  - Server-side validation in `/api/register` verifies against the live Google Calendar that the event is upcoming and active before forwarding to a Google Apps Script webhook (`REGISTRATION_APPS_SCRIPT_URL`).
  - Real-time registration count badge (`/api/registration-count`) and duplicate registration detection per event.
- **Multi-Page Arabic RTL Architecture**:
  - Dedicated pages for Home (`index.html`), About & Pathways (`about.html`), Meetings & Archive (`meetings.html`), Venue & Directions (`location.html`), Frequently Asked Questions (`faq.html`), and Contact (`contact.html`).

---

## 🛠️ Tech Stack & Project Structure

- **Frontend**: Vanilla HTML5 (Arabic RTL), Tailwind CSS v4 (`@tailwindcss/vite`), Vanilla ES Modules (`src/`)
- **Build Tool**: Vite 6 (`vite.config.ts`)
- **Backend / Serverless**: Vercel Functions (`api/`) + Vercel Routing Middleware (`middleware.js`)
- **Testing**: Node.js built-in test runner (`node --test` across `tests/*.test.mjs`)

```text
├── api/
│   ├── calendar-events.js     # Fetches & normalizes upcoming/past events from Google Calendar API
│   ├── render-page.js         # SSR pre-renderer for index.html and meetings.html with Edge caching
│   ├── register.js            # Validates & forwards guest registrations to Google Apps Script
│   └── registration-count.js  # Returns guest registration count for a given eventId
├── public/
│   ├── assets/                # Club photos (.webp), Toastmasters logos, and OpenGraph images
│   ├── llms.txt               # Structured Arabic club summary for AI search engines
│   ├── robots.txt             # Search engine & AI crawler directives
│   └── sitemap.xml            # Canonical XML sitemap
├── server/
│   └── page-templates.js      # Auto-generated built HTML templates consumed by api/render-page.js
├── src/
│   ├── archive.js             # Parses meeting themes, summaries, and social links from descriptions
│   ├── calendar.js            # Client-side calendar rendering, countdowns, .ics & Event JSON-LD
│   ├── prerender.js           # Server/build-time HTML & Event JSON-LD pre-rendering engine
│   ├── registration.js        # Accessible guest registration dialog & form handling
│   └── index.css              # Tailwind CSS v4 theme, RTL typography, and custom styles
├── tests/                     # 41 automated unit & integration tests (calendar, archive, FAQ, SSR, registration)
├── index.html                 # Homepage
├── about.html                 # About the club, Toastmasters International, and Pathways
├── meetings.html              # Upcoming meetings, monthly calendar, and past meetings archive
├── location.html              # Venue details (eSpaces - The Hive Mall, Heliopolis) & transport guide
├── faq.html                   # 11 common guest & membership questions with synced FAQPage JSON-LD
├── contact.html               # WhatsApp community, direct contact, and social channels
├── middleware.js              # Rewrites / and /meetings.html to /api/render-page for SSR pre-rendering
└── vite.config.ts             # Multi-page Vite config + build-time calendar pre-render plugin
```

---

## ⚙️ Environment Variables

Configure the following **server-side** environment variables in Vercel (**Project → Settings → Environment Variables**) for Production, Preview, and Development. Never prefix secrets with `VITE_` or commit them to Git.

| Variable | Required | Description |
| :--- | :---: | :--- |
| `GOOGLE_CALENDAR_ID` | Yes | Public Google Calendar ID (e.g., `...@group.calendar.google.com`) set to `Africa/Cairo` timezone. |
| `GOOGLE_CALENDAR_API_KEY` | Yes | Google Cloud API key restricted to the **Google Calendar API**. |
| `GOOGLE_CALENDAR_EVENT_QUERY` | Optional | Optional search phrase (`q` parameter) to filter events if using a shared calendar. |
| `REGISTRATION_APPS_SCRIPT_URL` | Yes | Deployed Google Apps Script Web App URL (`https://script.google.com/macros/s/.../exec`). |
| `REGISTRATION_WEBHOOK_SECRET` | Yes | Shared secret verified by the Google Apps Script webhook on `register` and `count` actions. |

---

## 📅 Google Calendar Setup & Event Description Format

1. **Create a Public Calendar**:
   - In Google Calendar → **Settings** → select the club calendar → **Access permissions for events** → enable **Make available to public** (`See all event details`).
   - Set the calendar time zone to **Africa/Cairo**.
2. **Event Fields**:
   - Create timed events (not all-day events) with a clear title and location. If the location field is left blank, the website automatically falls back to the club's regular venue (`eSpaces - شارع الثورة (داخل مول The Hive)، مصر الجديدة، القاهرة`).
3. **Structured Event Descriptions (Optional)**:
   - You can enrich both upcoming and past meeting cards by formatting the Google Calendar event description with the following Arabic headings:
     ```text
     محور الاجتماع:
     فن الإقناع والتأثير

     نبذة عن الاجتماع:
     لقاء تدريبي يتضمن خطباً معدة وفقرة خطب ارتجالية وتقييمات عملية للمتحدثين.

     روابط الاجتماع:
     https://www.facebook.com/AlkalemahTMC/posts/...
     https://www.instagram.com/p/...
     ```

---

## 📝 Guest Registration (Google Apps Script) Setup

- The browser only communicates with `/api/register` and `/api/registration-count`; Vercel validates the event against Google Calendar and posts `REGISTRATION_WEBHOOK_SECRET` to `REGISTRATION_APPS_SCRIPT_URL`.
- **Apps Script Contract**:
  - `action: "register"`: Accepts `{ secret, name, phone, email, eventId, eventTitle, eventStart }` (mapped to `الاسم الكامل`, `رقم واتساب`, `البريد الإلكتروني`, `Event ID`, `Meeting Title`, `Meeting Start`) and returns `{ alreadyRegistered: boolean, count: number }`.
  - `action: "count"`: Accepts `{ secret, eventId }` and returns `{ count: number }`.

---

## 🚀 Local Development & Testing

```bash
# Install dependencies
npm install

# Start Vite dev server (static frontend)
npm run dev

# Run the full automated test suite (41 tests)
npm test

# Run TypeScript type-checking
npm run lint

# Build production bundle & generate server/page-templates.js
npm run build
```

> **Note on Serverless API routes locally:** Plain `npm run dev` serves the static frontend without Vercel serverless functions. To test `/api/calendar-events`, `/api/render-page`, and `/api/register` locally end-to-end, run `vercel dev` with your environment variables configured.

---

## 👨‍💻 Author

Designed and developed by **[Baraa Al Moalem](https://www.linkedin.com/in/probaroa/)**.
