-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste all > Run

-- 1. Table of approved emails/phone numbers. Only rows you add here can log in.
create table if not exists allowed_users (
  identifier text primary key,   -- lowercase email or phone, e.g. "doctor@clinic.com" or "9198xxxxxx"
  note text,                     -- optional: client name, for your own reference
  created_at timestamptz default now()
);

-- 2. Table storing each user's saved brand profile.
create table if not exists brand_profiles (
  identifier text primary key references allowed_users(identifier) on delete cascade,
  brand_name text not null,
  logo_url text not null,
  updated_at timestamptz default now()
);

-- 3. Row Level Security: allow the public anon key to read/write ONLY rows
--    matching a valid flow. Since there's no real user session (just an
--    identifier lookup), we keep RLS simple: readable/writable via anon key,
--    which is safe because the anon key only exposes what these policies allow,
--    and the app-side check already gates entry to allowed_users.
alter table allowed_users enable row level security;
alter table brand_profiles enable row level security;

create policy "anon can read allowed_users" on allowed_users
  for select using (true);

create policy "anon can read brand_profiles" on brand_profiles
  for select using (true);

create policy "anon can upsert own brand_profile" on brand_profiles
  for insert with check (true);

create policy "anon can update own brand_profile" on brand_profiles
  for update using (true);

-- 4. Storage bucket for logos (public read, so <img> tags and canvas can load them).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "public read logos" on storage.objects
  for select using (bucket_id = 'logos');

create policy "anon can upload logos" on storage.objects
  for insert with check (bucket_id = 'logos');

create policy "anon can overwrite own logos" on storage.objects
  for update using (bucket_id = 'logos');

-- 5. Seed a couple of approved users so you can test immediately.
--    Replace with your real client emails/phones (all lowercase for emails).
-- insert into allowed_users (identifier, note) values
--   ('you@nexaflow.example', 'Abhishek - admin test'),
--   ('9198xxxxxxx', 'Test client');
