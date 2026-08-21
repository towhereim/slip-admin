-- =============================================================================
-- [참조 사본 / REFERENCE] admin_audit_logs 마이그레이션 — SPEC-ADMIN-SECAUDIT-001 (M1)
-- =============================================================================
-- ⭐ 정식(단일 출처) 마이그레이션은 공유 DB 스키마 소유 레포인 SLIP 모바일 앱에 있습니다:
--       slip/supabase/migrations/20260713000400_admin_audit_logs.sql
--    이 파일은 SPEC 참조용 사본이며, 위 정식 파일과 내용을 일치시킵니다(분기 시 정식 파일 우선).
--
-- 목적: 관리자 웹앱(slip-admin) 전용 감사 로그 테이블 + 불변성(append-only) 강제.
--
-- ⚠️  아직 적용하지 마세요. 대상 DB는 SLIP 모바일 앱과 "공유하는 프로덕션 Supabase" 입니다.
--     slip 레포의 `supabase db push`(또는 프로덕션 적용) 전 staging 검증을 거치세요(SPEC 9장).
--
-- 조율 확인 항목(체크리스트):
--   [ ] 테이블명 `admin_audit_logs` 네이밍 충돌 없음
--   [ ] 불변성 트리거/권한 회수가 다른 서비스의 쓰기 경로에 side effect 없음
--   [ ] RLS 정책(모바일 런타임 접근 차단) 합의
--   [ ] 롤백 절차 승인
--   [ ] 적용 후 `.moai/project/db/`(schema.md·migrations.md·erd.mmd) 갱신
--
-- 근거 요구사항: REQ-AUDIT-001(테이블), REQ-AUDIT-005(불변성), §8(스키마), §9(조율)
-- 대상 엔진: PostgreSQL 15+ (Supabase). gen_random_uuid()는 pgcrypto/pg 13+ 기본 제공.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) 테이블 (SPEC §8 스키마)
-- -----------------------------------------------------------------------------
-- 참고: 정합화(의도→종결)는 기존 행을 UPDATE 하지 않고, correlationId 로 연결된
--       "별도 INSERT 행"(outcome='intent' → outcome='completed'|'failed')으로 표현한다.
--       따라서 이 테이블은 INSERT-only 로만 사용되며 UPDATE/DELETE 는 트리거로 금지된다.
create table if not exists public.admin_audit_logs (
  id           uuid        primary key default gen_random_uuid(),
  actor_email  text        not null,                       -- 행위자(세션 이메일). 자기주장 기반(REQ-ATTR-004)
  action       text        not null,                       -- 통제 어휘: ocr.verify / pii.reveal / pii.export.masked / pii.export.unmasked ...
  target_type  text        not null,                       -- 예: ocr_capture / profile / export
  target_id    text        null,                           -- 대상 미특정 행위는 null
  metadata     jsonb       not null default '{}'::jsonb,   -- 비식별 맥락만. 원값 PII 금지(REQ-AUDIT-010). correlationId 포함 가능
  outcome      text        not null default 'completed'
               check (outcome in ('intent', 'completed', 'failed')),
  created_at   timestamptz not null default now()
);

comment on table  public.admin_audit_logs is
  '관리자 웹앱 감사 로그(append-only). SPEC-ADMIN-SECAUDIT-001. 모바일 런타임 접근 금지.';
comment on column public.admin_audit_logs.metadata is
  '비식별 맥락(JSON). 은행 PII 원값/복호화값 저장 금지(REQ-AUDIT-010). correlationId(uuid)로 intent↔종결 연결.';
comment on column public.admin_audit_logs.outcome is
  'intent(파괴적/PII 의도 선기록) / completed(정상 종결) / failed(행위 실패). 비파괴 행위는 completed 단건.';

-- -----------------------------------------------------------------------------
-- 2) 인덱스 (REQ-AUDIT-007 필터·정합화 지원)
-- -----------------------------------------------------------------------------
create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_email_idx
  on public.admin_audit_logs (actor_email);
create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action);
create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs (target_type, target_id);
create index if not exists admin_audit_logs_outcome_idx
  on public.admin_audit_logs (outcome);

-- (선택 / run 단계 결정) correlationId 조회 최적화. metadata.correlationId 로 정합화 조회가
-- 빈번하면 아래 표현식 인덱스를 활성화한다. §13.2 참고.
-- create index if not exists admin_audit_logs_correlation_idx
--   on public.admin_audit_logs ((metadata ->> 'correlationId'));

-- -----------------------------------------------------------------------------
-- 3) 불변성(append-only) 강제 — REQ-AUDIT-005 (D2)
--    [필수] BEFORE UPDATE OR DELETE 트리거로 예외 발생. 역할 무관(service_role 포함) 발동.
-- -----------------------------------------------------------------------------
create or replace function public.admin_audit_logs_block_mutation()
  returns trigger
  language plpgsql
as $$
begin
  raise exception
    'admin_audit_logs is append-only: % is not permitted (SPEC-ADMIN-SECAUDIT-001 REQ-AUDIT-005)',
    tg_op
    using errcode = 'insufficient_privilege';
  return null; -- 도달하지 않음
end;
$$;

drop trigger if exists admin_audit_logs_no_update_delete on public.admin_audit_logs;
create trigger admin_audit_logs_no_update_delete
  before update or delete on public.admin_audit_logs
  for each row execute function public.admin_audit_logs_block_mutation();

-- -----------------------------------------------------------------------------
-- 4) 권한 회수(방어적, REQ-AUDIT-005 권장) — 앱이 쓰는 역할의 UPDATE/DELETE 차단
--    트리거가 1차 보증이지만, GRANT 수준에서도 이중으로 막는다.
--    ⚠️ service_role 은 Supabase에서 광범위 권한을 가지므로 명시적 REVOKE 필요.
-- -----------------------------------------------------------------------------
revoke update, delete, truncate on public.admin_audit_logs from anon, authenticated, service_role;

-- INSERT/SELECT 는 서버(service_role)만 사용. anon/authenticated(모바일 런타임)는 접근 불가.
revoke all     on public.admin_audit_logs from anon, authenticated;
grant  select, insert on public.admin_audit_logs to service_role;

-- -----------------------------------------------------------------------------
-- 5) RLS — 모바일 런타임(anon/authenticated) 접근 차단, 관리자 서버(service_role)만 우회
--    (범위 격리, §9). 정책을 두지 않으면 RLS 활성 시 anon/authenticated 는 전면 차단되고
--    service_role 은 RLS 를 우회한다.
-- -----------------------------------------------------------------------------
alter table public.admin_audit_logs enable row level security;
-- (의도적으로 anon/authenticated 대상 정책을 만들지 않는다 → 접근 없음)

commit;

-- =============================================================================
-- 롤백 절차 (조율 승인 후에만 사용)
-- =============================================================================
-- begin;
--   drop trigger  if exists admin_audit_logs_no_update_delete on public.admin_audit_logs;
--   drop function if exists public.admin_audit_logs_block_mutation();
--   drop table    if exists public.admin_audit_logs;   -- ⚠️ 감사 데이터 소실. 신중히.
-- commit;

-- =============================================================================
-- 적용 후 검증 (AC-AUDIT-4 — UPDATE/DELETE 가 DB 오류로 거부되어야 함)
-- =============================================================================
-- 1) 정상 INSERT 는 성공해야 한다:
--    insert into public.admin_audit_logs (actor_email, action, target_type, outcome)
--    values ('towhereim@gmail.com', 'ocr.verify', 'ocr_capture', 'completed');
--
-- 2) UPDATE 는 반드시 예외로 실패해야 한다(트리거):
--    update public.admin_audit_logs set outcome = 'failed' where actor_email = 'towhereim@gmail.com';
--    -- 기대: ERROR  admin_audit_logs is append-only: UPDATE is not permitted ...
--
-- 3) DELETE 는 반드시 예외로 실패해야 한다(트리거):
--    delete from public.admin_audit_logs where actor_email = 'towhereim@gmail.com';
--    -- 기대: ERROR  admin_audit_logs is append-only: DELETE is not permitted ...
--
-- 4) (선택) 검증용 INSERT 정리는 불가(DELETE 금지). 검증은 별도 staging DB 권장.
-- =============================================================================
