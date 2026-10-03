-- Rozvrh database setup
-- Run this complete script in the Supabase SQL Editor.
-- day uses ISO-style numbering: 1 = Monday, 7 = Sunday.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9_]{3,24}$'
  ),
  constraint profiles_display_name_length check (
    length(trim(display_name)) between 1 and 40
  )
);

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username);

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_username text;
  requested_display_name text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if requested_username = '' then
    requested_username :=
      'student_' || substr(replace(new.id::text, '-', ''), 1, 16);
  end if;

  requested_display_name :=
    trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if requested_display_name = '' then
    requested_display_name := 'Student';
  end if;

  insert into public.profiles (user_id, username, display_name)
  values (new.id, requested_username, requested_display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

insert into public.profiles (user_id, username, display_name)
select
  users.id,
  'student_' || substr(replace(users.id::text, '-', ''), 1, 16),
  'Student'
from auth.users as users
on conflict (user_id) do nothing;

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  day smallint not null check (day between 1 and 7),
  start_time time without time zone not null,
  end_time time without time zone not null,
  room text,
  type text not null check (length(trim(type)) > 0),
  created_at timestamptz not null default now(),
  constraint schedule_items_end_after_start check (end_time > start_time)
);

create index if not exists schedule_items_user_day_time_idx
  on public.schedule_items (user_id, day, start_time);

alter table public.schedule_items enable row level security;

drop policy if exists schedule_items_insert_own
  on public.schedule_items;
create policy schedule_items_insert_own
  on public.schedule_items
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists schedule_items_update_own
  on public.schedule_items;
create policy schedule_items_update_own
  on public.schedule_items
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists schedule_items_delete_own
  on public.schedule_items;
create policy schedule_items_delete_own
  on public.schedule_items
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint friendships_no_self_link check (user_id <> friend_id),
  constraint friendships_accepted_timestamp check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

drop index if exists public.friendships_unique_pair_idx;
create unique index friendships_unique_pair_idx
  on public.friendships (
    least(user_id, friend_id),
    greatest(user_id, friend_id)
  )
  where status in ('pending', 'accepted');

create index if not exists friendships_user_status_idx
  on public.friendships (user_id, status);
create index if not exists friendships_friend_status_idx
  on public.friendships (friend_id, status);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_participant
  on public.friendships;
create policy friendships_select_participant
  on public.friendships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or friend_id = (select auth.uid())
  );

drop policy if exists friendships_insert_own_request
  on public.friendships;
create policy friendships_insert_own_request
  on public.friendships
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and user_id <> friend_id
    and status = 'pending'
    and accepted_at is null
  );

create or replace function public.guard_friendship_response()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.friend_id is distinct from old.friend_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Friendship participants and identity cannot be changed.';
  end if;

  if old.status <> 'pending'
    or new.status not in ('accepted', 'declined') then
    raise exception 'Only a pending friendship can be accepted or declined.';
  end if;

  if new.status = 'accepted' then
    new.accepted_at := now();
  else
    new.accepted_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_guard_response
  on public.friendships;
create trigger friendships_guard_response
  before update on public.friendships
  for each row execute function public.guard_friendship_response();

drop policy if exists friendships_respond_to_received_request
  on public.friendships;
create policy friendships_respond_to_received_request
  on public.friendships
  for update
  to authenticated
  using (
    friend_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    friend_id = (select auth.uid())
    and status in ('accepted', 'declined')
  );

drop policy if exists friendships_delete_participant
  on public.friendships;
create policy friendships_delete_participant
  on public.friendships
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or friend_id = (select auth.uid())
  );

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self_or_relationship
  on public.profiles;
create policy profiles_select_self_or_relationship
  on public.profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.friendships as f
      where f.status in ('pending', 'accepted')
        and (
          (f.user_id = (select auth.uid()) and f.friend_id = profiles.user_id)
          or
          (f.friend_id = (select auth.uid()) and f.user_id = profiles.user_id)
        )
    )
  );

drop policy if exists profiles_update_own
  on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, display_name) on public.profiles to authenticated;

create or replace function public.search_profiles(search_username text)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name
  from public.profiles as p
  where auth.uid() is not null
    and p.user_id <> auth.uid()
    and p.username = lower(trim(coalesce(search_username, '')))
    and lower(trim(coalesce(search_username, ''))) ~ '^[a-z0-9_]{3,24}$'
  limit 1;
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and lower(trim(coalesce(candidate, ''))) ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1
      from public.profiles as p
      where p.username = lower(trim(coalesce(candidate, '')))
        and p.user_id <> auth.uid()
    );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to authenticated;

drop policy if exists schedule_items_select_own_or_accepted_friends
  on public.schedule_items;
create policy schedule_items_select_own_or_accepted_friends
  on public.schedule_items
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.friendships as f
      where f.status = 'accepted'
        and f.accepted_at is not null
        and (
          (f.user_id = (select auth.uid()) and f.friend_id = schedule_items.user_id)
          or
          (f.friend_id = (select auth.uid()) and f.user_id = schedule_items.user_id)
        )
    )
  );

grant select, insert, update, delete
  on public.schedule_items to authenticated;
grant select, insert, update, delete
  on public.friendships to authenticated;