-- BYTE BACK 4단계: notes 테이블 RLS + 최소 권한
-- 다른 테이블은 건드리지 않습니다.
-- 실행 전/후 결과를 각각 확인할 수 있도록 조회문을 포함합니다.

-- BEFORE: 실제 table grant 확인
select
  'BEFORE' as phase,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'notes'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

select
  'BEFORE' as phase,
  role_name,
  has_table_privilege(role_name, 'public.notes', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.notes', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.notes', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.notes', 'DELETE') as can_delete,
  has_table_privilege(role_name, 'public.notes', 'TRUNCATE') as can_truncate,
  has_table_privilege(role_name, 'public.notes', 'REFERENCES') as can_references,
  has_table_privilege(role_name, 'public.notes', 'TRIGGER') as can_trigger
from (values ('anon'), ('authenticated')) as roles(role_name);

begin;

alter table public.notes enable row level security;

revoke all on table public.notes from public, anon, authenticated;
grant select, insert, update, delete on table public.notes to authenticated;

drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;

create policy notes_select_own
on public.notes
for select
to authenticated
using (auth.uid() = owner_id);

create policy notes_insert_own
on public.notes
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy notes_update_own
on public.notes
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy notes_delete_own
on public.notes
for delete
to authenticated
using (auth.uid() = owner_id);

commit;

-- AFTER: anon은 권한 없음, authenticated는 CRUD 네 개만 남아야 합니다.
select
  'AFTER' as phase,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'notes'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

select
  'AFTER' as phase,
  role_name,
  has_table_privilege(role_name, 'public.notes', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.notes', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.notes', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.notes', 'DELETE') as can_delete,
  has_table_privilege(role_name, 'public.notes', 'TRUNCATE') as can_truncate,
  has_table_privilege(role_name, 'public.notes', 'REFERENCES') as can_references,
  has_table_privilege(role_name, 'public.notes', 'TRIGGER') as can_trigger
from (values ('anon'), ('authenticated')) as roles(role_name);
