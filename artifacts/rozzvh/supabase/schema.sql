-- Rozvrh database setup
-- Run this complete script in the Supabase SQL Editor.
-- day uses ISO-style numbering: 1 = Monday, 7 = Sunday.

create extension if not exists pgcrypto;

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

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (
    least(user_id, friend_id),
    greatest(user_id, friend_id)
  );

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
grant select, insert, update
  on public.friendships to authenticated;