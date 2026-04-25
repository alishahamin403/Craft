create table if not exists public.users (
  id text primary key,
  email text not null,
  name text not null,
  picture_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id text primary key,
  idempotency_key text,
  prompt text not null,
  user_prompt text,
  model text check (model in ('kling-2.6', 'kling-3.0')),
  status text not null check (status in ('queued', 'in_progress', 'completed', 'failed')),
  format text not null check (format in ('portrait', 'landscape')),
  requested_seconds integer not null,
  submitted_seconds integer,
  source_image_path text not null,
  video_path text,
  thumbnail_path text,
  openai_video_id text,
  error_message text,
  owner_id text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generations_owner_id_created_at_idx
  on public.generations(owner_id, created_at desc);

create index if not exists generations_created_at_idx
  on public.generations(created_at desc);

create unique index if not exists generations_owner_id_idempotency_key_idx
  on public.generations(owner_id, idempotency_key)
  where idempotency_key is not null;

alter table public.users enable row level security;
alter table public.generations enable row level security;

insert into storage.buckets (id, name, public)
values ('craft-media', 'craft-media', false)
on conflict (id) do update set public = false;
