# NexaFlow Watermark Tool

Production-ready rebuild of the watermark/logo branding tool. Access-gated,
Supabase-backed, installable as a PWA, full-resolution export.

## What was fixed from the prototype

- **"Save profile & continue" did nothing** — the prototype used Claude's
  in-browser `window.storage`, which only exists inside Claude's own artifact
  sandbox. It can't work once deployed. Replaced with real Supabase tables +
  storage.
- **Input text invisible / block too wide** — caused by CSS bleeding in from
  the sandbox preview page. `globals.css` now explicitly sets input text
  color and background so this can't happen again, and long values (emails,
  filenames) are truncated with `truncate`/`min-w-0` instead of stretching
  the layout.
- **Logo can't be resized** — added a Size slider (5–45% of image width) plus
  drag-to-reposition directly on the preview (click/tap and drag the logo).
- **No way to show just watermark or just logo** — added independent
  "Text watermark" / "Logo" toggles; either can be switched off.
- **Quality loss** — the old canvas always rendered at a fixed 1000px width.
  Export now renders at the **original uploaded image's resolution**, and
  downloads use `canvas.toBlob` at PNG quality 1.0 (lossless).
- **Speed** — image decode runs in `FileReader` + `Image.onload` with a
  loading spinner, so the UI never appears frozen during upload/processing.
- **Access control** — login now checks a `allowed_users` table in Supabase.
  If the email/phone typed in isn't already a row in that table, the app
  refuses to continue. There is no self-signup path — you (the admin) add
  people via the Supabase table editor or SQL.
- **Installable as an app (PWA)** — added `manifest.json`, a service worker,
  and an in-app "Install NexaFlow" prompt that appears when the browser
  supports it (Chrome/Edge/Android; iOS Safari uses native "Add to Home
  Screen" via the Share sheet instead — there's no JS API for that on iOS).

## 1. Create the Supabase project

1. Go to https://supabase.com → New project. Pick any name/region, set a DB
   password (you won't need it directly).
2. Once it's ready, open **SQL Editor** → New query → paste the entire
   contents of `supabase-setup.sql` from this folder → Run.
   This creates the `allowed_users` and `brand_profiles` tables, sets up
   permissions, and creates a public `logos` storage bucket.
3. Add your first approved client: **Table Editor → allowed_users → Insert
   row**. Put their email (all lowercase) or phone number in `identifier`.
   Repeat for every client/staff member who should have access.
4. Get your API keys: **Project Settings → API**. Copy:
   - `Project URL`
   - `anon public` key

## 2. Configure the app

1. In this project folder, copy `.env.local.example` to `.env.local`:
   ```
   cp .env.local.example .env.local
   ```
2. Open `.env.local` and paste in your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

## 3. Run it locally (optional, to test before deploying)

```
npm install
npm run dev
```
Open http://localhost:3000 — try logging in with the identifier you added to
`allowed_users`.
  

  DONE till here... 
  
## 4. Deploy to Vercel

1. Push this folder to a GitHub repo (or use `vercel` CLI directly from this
   folder — either works).
2. Go to https://vercel.com → Add New Project → import the repo (or run
   `vercel` in this folder and follow the prompts).
3. When Vercel asks for environment variables, add the same two from
   `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Vercel gives you a `https://your-app.vercel.app` URL.
5. Visit it on your phone — after a few seconds of use, Chrome/Edge on
   Android will show the "Install NexaFlow" prompt (or use the browser's
   own "Install app" menu option). On iPhone, use Safari's Share button →
   "Add to Home Screen".

## 5. Managing access afterward

To add or remove a client, go to **Supabase → Table Editor →
allowed_users** and insert/delete rows — no redeploy needed, it's checked
live. Deleting a row also removes their saved brand profile automatically
(via the foreign key `on delete cascade`).

## 6. Replacing icons (optional)

`public/icons/icon-192.png` and `icon-512.png` are placeholder NexaFlow "N"
icons. Swap them with your real logo (same filenames, same sizes) any time —
no code changes needed.

## Notes on the access model

The anon Supabase key is meant to be public (it's what ships in every
Supabase JS app) — real protection comes from the Row Level Security
policies in `supabase-setup.sql`, plus the app's own check that blocks
unrecognized identifiers before showing the tool. This is intentionally
lightweight (no password / OTP) to match "if their email or phone is on the
list, they're in" — if you later want OTP verification (SMS/email code)
instead of a plain allow-list, Supabase Auth can layer on top of the same
tables; ask and I can wire that in.
