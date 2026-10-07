-- BYTE BACK 3단계 DB 스키마 전환
-- 가상 메모 본문이나 비밀값은 이 파일에 넣지 않습니다.
-- 기존 2단계 notes 행은 보존하면서 id를 UUID로 바꾸고 content를 body로 바꿉니다.

begin;

create extension if not exists pgcrypto;

alter table public.notes
  add column if not exists owner_id uuid,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'content'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'body'
  ) then
    alter table public.notes rename column content to body;
  end if;
end $$;

do $$
declare
  id_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'notes' and column_name = 'id';

  if id_type is distinct from 'uuid' then
    alter table public.notes add column if not exists id_step3 uuid default gen_random_uuid();
    update public.notes set id_step3 = gen_random_uuid() where id_step3 is null;
    alter table public.notes alter column id_step3 set not null;
    alter table public.notes drop constraint if exists notes_pkey;
    alter table public.notes drop column if exists id;
    alter table public.notes rename column id_step3 to id;
    alter table public.notes add primary key (id);
  end if;
end $$;

alter table public.notes alter column id set default gen_random_uuid();
alter table public.notes alter column body set not null;
alter table public.notes drop constraint if exists notes_title_key;

alter table public.notes enable row level security;
revoke all privileges on table public.notes from anon, authenticated;
grant select, insert, update, delete on table public.notes to service_role;

commit;
