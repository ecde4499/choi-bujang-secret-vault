-- 10단계 비공개 가상 메모 사본과 단건 복원 함수.
-- 실행 전 검토하세요. 현재 notes의 사본을 DB 안에만 만들며 메모 본문을 출력하지 않습니다.
-- 복원 확인은 시험 계정 B가 소유한 가상 메모 한 건으로만 수행하세요.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.notes_backup (
  id uuid primary key,
  owner_id uuid not null,
  title text not null,
  body text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null default now()
);

create table if not exists public.notes_restore_audit (
  id bigint generated always as identity primary key,
  note_id uuid not null,
  actor_id uuid not null,
  result text not null,
  before_sha256 text,
  after_sha256 text,
  restored_at timestamptz not null default now()
);

alter table public.notes_backup enable row level security;
alter table public.notes_restore_audit enable row level security;

revoke all on table public.notes_backup from public, anon, authenticated, service_role;
revoke all on table public.notes_restore_audit from public, anon, authenticated, service_role;

-- 기존 사본은 덮어쓰지 않습니다. 침해 전 기준으로 잡을 현재 가상 메모만 최초 1회 저장합니다.
insert into public.notes_backup (id, owner_id, title, body, content_sha256)
select id, owner_id, title, body,
  encode(extensions.digest(convert_to(title || E'\n' || body, 'UTF8'), 'sha256'), 'hex')
from public.notes
where owner_id is not null
on conflict (id) do nothing;

create or replace function public.restore_verified_note_backup(
  p_note_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  b public.notes_backup%rowtype;
  n public.notes%rowtype;
  expected_sha text;
  before_sha text;
  after_sha text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_note_id::text, 0));

  select * into b
  from public.notes_backup
  where id = p_note_id and owner_id = p_actor_id;

  if not found then
    raise exception 'backup_not_found';
  end if;

  expected_sha := encode(
    extensions.digest(convert_to(b.title || E'\n' || b.body, 'UTF8'), 'sha256'),
    'hex'
  );
  if expected_sha is distinct from b.content_sha256 then
    raise exception 'backup_verification_failed';
  end if;

  select * into n
  from public.notes
  where id = p_note_id
  for update;

  if found and n.owner_id is distinct from p_actor_id then
    raise exception 'owner_mismatch';
  end if;

  if found then
    before_sha := encode(
      extensions.digest(convert_to(n.title || E'\n' || n.body, 'UTF8'), 'sha256'),
      'hex'
    );
  end if;

  insert into public.notes (id, owner_id, title, body)
  values (b.id, b.owner_id, b.title, b.body)
  on conflict (id) do update
    set title = excluded.title,
        body = excluded.body
    where notes.owner_id = excluded.owner_id
  returning * into n;

  if not found or n.id is distinct from b.id or n.owner_id is distinct from b.owner_id then
    raise exception 'restore_verification_failed';
  end if;

  after_sha := encode(
    extensions.digest(convert_to(n.title || E'\n' || n.body, 'UTF8'), 'sha256'),
    'hex'
  );
  if after_sha is distinct from expected_sha then
    raise exception 'restore_verification_failed';
  end if;

  insert into public.notes_restore_audit (
    note_id, actor_id, result, before_sha256, after_sha256
  ) values (
    p_note_id, p_actor_id, 'restored', before_sha, after_sha
  );

  return jsonb_build_object(
    'id', p_note_id,
    'restored', true,
    'contentSha256', after_sha
  );
end
$$;

revoke all on function public.restore_verified_note_backup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_verified_note_backup(uuid, uuid)
  to service_role;

commit;

-- 확인용 읽기: 본문 없이 사본/감사 건수만 봅니다.
select count(*) as backup_rows from public.notes_backup;
select count(*) as audit_rows from public.notes_restore_audit;
