alter table public.friendships enable row level security;

drop policy if exists "Users can insert their own friendships." on public.friendships;
create policy "Users can insert their own friendships." on public.friendships for insert with check (
  auth.uid() = user_low or auth.uid() = user_high
);

drop policy if exists "Users can view their own friendships." on public.friendships;
create policy "Users can view their own friendships." on public.friendships for select using (
  auth.uid() = user_low or auth.uid() = user_high
);

alter table public.dm_threads enable row level security;

drop policy if exists "Users can insert their own dm_threads." on public.dm_threads;
create policy "Users can insert their own dm_threads." on public.dm_threads for insert with check (
  auth.uid() = user_low or auth.uid() = user_high
);

drop policy if exists "Users can view their own dm_threads." on public.dm_threads;
create policy "Users can view their own dm_threads." on public.dm_threads for select using (
  auth.uid() = user_low or auth.uid() = user_high
);
