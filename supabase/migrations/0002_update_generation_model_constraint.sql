alter table public.generations
  drop constraint if exists generations_model_check;

alter table public.generations
  add constraint generations_model_check
  check (model in (
    'minimax-hailuo-fast',
    'pixverse-v6',
    'kling-2.6',
    'ltx-2',
    'wan-2.7',
    'sora-2',
    'veo-3.1-fast',
    'kling-3.0',
    'veo-3.1',
    'kling-v3-4k'
  ));
