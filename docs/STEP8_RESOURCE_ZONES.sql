-- 8단계 검토용: 기존 notes 자료와 권한은 변경하지 않습니다.
-- 실행하면 공지와 강사 권한을 위한 새 빈 테이블만 준비합니다.
begin;

create table if not exists public.vault_instructors (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.vault_notices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  body text not null
);

alter table public.vault_instructors enable row level security;
alter table public.vault_notices enable row level security;

revoke all on table public.vault_instructors, public.vault_notices from PUBLIC, anon, authenticated;
revoke all on table public.vault_instructors, public.vault_notices from service_role;

grant select on table public.vault_instructors to service_role;
grant select, update on table public.vault_notices to service_role;

commit;

-- 이 파일은 강사나 공지를 자동 생성하지 않습니다.
-- 강사 권한은 검증한 Auth 사용자 UUID만 SQL Editor에서 vault_instructors에 직접 등록하세요.
-- 공지 owner_id도 같은 검증된 강사 UUID로만 넣고, 클라이언트의 role/owner_id 값은 사용하지 마세요.

-- 실행 후 확인: 두 새 테이블 모두 RLS가 켜져 있어야 합니다.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('vault_instructors', 'vault_notices')
order by c.relname;

-- anon/authenticated는 직접 권한이 없어야 하고,
-- service_role은 API가 필요한 최소 권한만 확인합니다.
select role_name, table_name,
  has_table_privilege(role_name, 'public.' || table_name, 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.' || table_name, 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.' || table_name, 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.' || table_name, 'DELETE') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
cross join (values ('vault_instructors'), ('vault_notices')) as tables(table_name)
order by table_name, role_name;
