-- Append-only log of what has been applied to the live Supabase project.
-- Apply NEW blocks individually in the SQL editor: `create policy` and
-- `alter publication … add table` are not idempotent and will error if re-run.

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

create table if not exists profiles (
  id uuid primary key references auth.users(id) default auth.uid(),
  sex text not null check (sex in ('male','female')),
  birth_date date not null,
  height_in numeric not null check (height_in > 0),
  weight_lb numeric not null check (weight_lb > 0),
  activity text not null check (activity in ('sedentary','light','moderate','active','very')),
  phase text not null check (phase in ('cut','maintain','bulk')),
  rate_lb_per_wk numeric not null default 0 check (rate_lb_per_wk >= 0),
  protein_g_per_lb numeric check (protein_g_per_lb between 0.8 and 1.5),
  tdee_override integer check (tdee_override > 0),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile" on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

create table if not exists weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  weight_lb numeric not null check (weight_lb > 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table weigh_ins enable row level security;

create policy "own weigh_ins" on weigh_ins for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table profiles add column if not exists last_adjusted_at timestamptz;

-- Sub-project 3: workouts (paste this block only — the blocks above already exist)
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  muscle_groups text[] not null default '{}'
);

alter table workouts enable row level security;

create policy "own workouts" on workouts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table lifts add column if not exists workout_id uuid references workouts(id);
create index if not exists lifts_workout_id_idx on lifts (workout_id);

-- Sub-project 4a: meal patterns (2026-09-01). Paste this block once.
create table if not exists meal_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  items jsonb not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0
);
alter table meal_patterns enable row level security;
create policy "own meal_patterns" on meal_patterns for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sub-project 4b: manual macro lines log servings, not grams (2026-09-08). Paste once.
alter table meals add column if not exists unit text not null default 'g';
