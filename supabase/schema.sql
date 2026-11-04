-- 단어짱 클라우드 저장용 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 전체 붙여넣고 Run

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,   -- 단어장·진도·오답노트 전체
  updated_at timestamptz not null default now()    -- 기기 간 충돌 확인용
);

-- 저장할 때마다 서버 시각으로 updated_at 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before insert or update on public.user_data
  for each row execute function public.touch_updated_at();

-- 보안: 각자 자기 데이터만 읽고 쓸 수 있음 (Row Level Security)
alter table public.user_data enable row level security;

drop policy if exists "own data select" on public.user_data;
drop policy if exists "own data insert" on public.user_data;
drop policy if exists "own data update" on public.user_data;
drop policy if exists "own data delete" on public.user_data;

create policy "own data select" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own data insert" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own data update" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own data delete" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_data to authenticated;
revoke all on public.user_data from anon;
