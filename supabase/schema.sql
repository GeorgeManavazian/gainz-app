create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  logged_at timestamptz not null default now(),
  food_name text not null,
  grams numeric not null check (grams > 0),
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  fdc_id text,
  synced_to_vault boolean not null default false
);

create table if not exists lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  logged_at timestamptz not null default now(),
  exercise text not null,
  sets integer not null check (sets > 0),
  reps integer not null check (reps > 0),
  weight numeric not null,
  notes text,
  synced_to_vault boolean not null default false
);

alter table meals enable row level security;
alter table lifts enable row level security;

create policy "own meals" on meals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own lifts" on lifts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table meals;
alter publication supabase_realtime add table lifts;
