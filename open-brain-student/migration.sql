-- Run this ONE TIME in your Supabase SQL editor.
-- How to get there: supabase.com → your project → SQL Editor → New query → paste everything below → click Run

create table if not exists thoughts (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- SECURITY — READ THIS, IT IS NOT WHAT YOU MIGHT ASSUME
--
-- Row Level Security is switched on below, and then immediately told to allow
-- everything. That means: RIGHT NOW, ANYONE WHO HAS YOUR PROJECT URL AND PUBLIC
-- KEY CAN READ, CHANGE AND DELETE EVERYTHING IN THIS TABLE.
--
-- Both of those values sit in config.js, which is public on your GitHub and
-- served by your live website. So this is not theoretical.
--
-- This is deliberate, and it is temporary. Your brain is empty today, and
-- adding logins before you have anything to protect would be three extra steps
-- between you and seeing your first thought appear. In Level 2 you will add
-- proper logins and see this hole close.
--
-- Until then: DO NOT PUT ANYTHING PRIVATE IN HERE. Type "hello world", not your
-- diary.
--
-- Almost every real security incident starts exactly like this — a permissive
-- rule added to get something working, meant to be temporary, then forgotten.
-- Level 2 is where you do the thing most people never get around to.
-- ---------------------------------------------------------------------------
alter table thoughts enable row level security;

create policy "temporary_open_access" on thoughts
  for all
  to anon
  using (true)
  with check (true);
