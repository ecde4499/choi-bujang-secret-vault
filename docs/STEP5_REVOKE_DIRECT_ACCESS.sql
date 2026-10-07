-- BYTE BACK 5단계: notes 원본 직접 접근 권한 회수
-- 다른 테이블은 건드리지 않습니다.
-- 서버 함수는 SUPABASE_SECRET_KEY를 사용하므로 기존 로그인·소유자 검사를 유지합니다.

-- BEFORE: PUBLIC / anon / authenticated의 실제 권한 확인
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

revoke all on table public.notes from public, anon, authenticated;

commit;

-- AFTER: PUBLIC / anon / authenticated에 notes 직접 권한이 없어야 합니다.
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

-- 서버 전용 역할은 건드리지 않았는지 읽기 권한만 확인합니다.
select
  'AFTER_SERVER_ROLE_CHECK' as phase,
  has_table_privilege('service_role', 'public.notes', 'SELECT') as service_can_select,
  has_table_privilege('service_role', 'public.notes', 'INSERT') as service_can_insert,
  has_table_privilege('service_role', 'public.notes', 'UPDATE') as service_can_update,
  has_table_privilege('service_role', 'public.notes', 'DELETE') as service_can_delete;
