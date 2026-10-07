-- BYTE BACK 4단계: A/B 학습용 소유자 데이터 준비
-- 실행 전 A_EMAIL_HERE / B_EMAIL_HERE만 Supabase Auth의 테스트 계정 이메일로 바꾸세요.
-- 실제 이메일은 GitHub에 커밋하지 않습니다.
--
-- 기존 owner_id가 NULL인 가상 메모가:
--   3건이면 -> 세 건 모두 A에 연결하고 B 시험 메모 한 건을 새로 만듭니다.
--   4건이면 -> 기존 자료를 버리지 않고 세 건은 A, 한 건은 B에 연결합니다.
-- 그 외 개수면 예상하지 않은 DB 상태이므로 중단합니다.

begin;

do $$
declare
  a_id uuid;
  b_id uuid;
  legacy_count integer;
  legacy_ids uuid[];
begin
  select id into a_id
  from auth.users
  where lower(email) = lower('A_EMAIL_HERE')
  limit 1;

  select id into b_id
  from auth.users
  where lower(email) = lower('B_EMAIL_HERE')
  limit 1;

  if a_id is null then
    raise exception 'A_EMAIL_NOT_FOUND';
  end if;
  if b_id is null then
    raise exception 'B_EMAIL_NOT_FOUND';
  end if;
  if a_id = b_id then
    raise exception 'A_AND_B_MUST_BE_DIFFERENT_USERS';
  end if;

  select count(*), array_agg(id order by created_at, id)
  into legacy_count, legacy_ids
  from public.notes
  where owner_id is null;

  if legacy_count not in (3, 4) then
    raise exception 'EXPECTED_3_OR_4_OWNERLESS_NOTES_BUT_FOUND_%', legacy_count;
  end if;

  update public.notes
  set owner_id = a_id
  where id = any(legacy_ids[1:3]);

  if legacy_count = 4 then
    update public.notes
    set owner_id = b_id
    where id = legacy_ids[4];
  else
    insert into public.notes (id, owner_id, title, body)
    values (
      gen_random_uuid(),
      b_id,
      'B 소유권 확인용 가상 메모',
      '4단계 소유권 분리 확인을 위한 공개 가능한 시험 기록'
    );
  end if;
end $$;

-- 적용 결과 확인: 최소 A 3건, B 1건이 보여야 합니다.
select
  case
    when n.owner_id = a.id then 'A'
    when n.owner_id = b.id then 'B'
    else 'OTHER'
  end as owner_label,
  count(*) as note_count
from public.notes n
cross join (select id from auth.users where lower(email)=lower('A_EMAIL_HERE') limit 1) a
cross join (select id from auth.users where lower(email)=lower('B_EMAIL_HERE') limit 1) b
group by owner_label
order by owner_label;

commit;
