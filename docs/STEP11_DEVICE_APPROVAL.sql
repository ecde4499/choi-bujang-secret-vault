-- BYTE BACK 11단계: 서버 확인용 기기 등록 요청/승인/단기 증명 저장소
-- 메모 본문, 로그인 토큰, 기기 개인키는 저장하지 않습니다.
-- WebAuthn 개인키는 브라우저 저장소가 아니라 인증기(플랫폼 인증기/보안키)에 남습니다.
-- 승인 요청은 pending만 만들며, 아래 SQL의 정확한 요청 코드 한 건을 운영자가 별도로 승인해야 합니다.

begin;

create table if not exists public.vault_device_credentials (
  credential_id text primary key,
  owner_id uuid not null,
  public_key_spki text not null,
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'revoked')),
  request_code text not null unique check (request_code ~ '^[a-f0-9]{12}$'),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  last_used_at timestamptz
);

create table if not exists public.vault_device_challenges (
  id uuid primary key,
  owner_id uuid not null,
  kind text not null check (kind in ('registration', 'assertion')),
  challenge text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_device_grants (
  id uuid primary key,
  owner_id uuid not null,
  credential_id text not null references public.vault_device_credentials(credential_id),
  token_sha256 text not null unique check (token_sha256 ~ '^[a-f0-9]{64}$'),
  session_sha256 text not null check (session_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.vault_device_credentials enable row level security;
alter table public.vault_device_challenges enable row level security;
alter table public.vault_device_grants enable row level security;

revoke all on table public.vault_device_credentials from public, anon, authenticated;
revoke all on table public.vault_device_challenges from public, anon, authenticated;
revoke all on table public.vault_device_grants from public, anon, authenticated;

grant select, insert, update on table public.vault_device_credentials to service_role;
grant select, insert, delete on table public.vault_device_challenges to service_role;
grant select, insert, delete on table public.vault_device_grants to service_role;

commit;

-- 승인 대기 요청은 본문/사용자 정보 없이 요청 코드와 상태만 확인합니다.
select request_code, status, requested_at
from public.vault_device_credentials
where status = 'pending'
order by requested_at desc;

-- 화면에 표시된 정확한 요청 코드 한 건만 검토 뒤 별도로 승인합니다.
-- 절대로 모든 pending 행을 한꺼번에 승인하지 마세요.
--
-- update public.vault_device_credentials
-- set status = 'approved', approved_at = now()
-- where request_code = 'REPLACE_REQUEST_CODE'
--   and status = 'pending';
--
-- 회수할 때는 같은 방식으로 정확한 한 건만 status = 'revoked'로 바꿉니다.
