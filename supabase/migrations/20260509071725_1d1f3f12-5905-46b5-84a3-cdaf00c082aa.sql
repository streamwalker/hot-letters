create table public.projects (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Users can view their own project"
  on public.projects for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own project"
  on public.projects for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own project"
  on public.projects for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own project"
  on public.projects for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();