---
id: SPEC-ADMIN-SECAUDIT-001
version: 0.2.0
status: draft
created: 2026-07-13
updated: 2026-07-13
author: shlim
priority: high
---

# 수용 기준 (Acceptance Criteria) — SPEC-ADMIN-SECAUDIT-001

Given-When-Then 시나리오. 각 시나리오는 spec.md의 요구 ID에 매핑된다.
v0.2.0: 감사(audit.md) 결정 D1/D2/D3 반영 — 순서 정책 양 경로 검증(AC-AUDIT-5), DB 불변성(AC-AUDIT-4), metadata PII 금지, 신규 요구 AC 추가.

## R1 — 관리자 신원 및 행위자 귀속

### AC-ATTR-1 (REQ-ATTR-001, REQ-ATTR-002)
- Given: 허용목록 관리자 `a@slip.kr`가 유효한 `admin_session`으로 로그인한 상태
- When: 감사 대상 서버 액션을 실행한다
- Then: 생성된 감사 로그 항목의 `actor_email`이 `a@slip.kr`이며, 값은 클라이언트 입력이 아닌 세션 JWT에서 취득된다

### AC-ATTR-2 (REQ-ATTR-003)
- Given: 세션 쿠키가 없거나 만료/위조된 상태
- When: 감사 대상 서버 액션을 호출한다
- Then: 행위는 상태 변경 없이 거부되고, `actor_email="unknown"` 등 자리표시자 감사 항목이 생성되지 않는다

### AC-ATTR-3 (REQ-ATTR-004)
- Given: 모든 관리자가 공유 `ADMIN_PASSWORD`를 사용하는 환경
- When: `/audit` 페이지 또는 운영 문서를 확인한다
- Then: "행위자는 세션 이메일 기준이며 공유 비밀번호 환경에서 강한 신원 증명이 아님"이라는 한계와 명시적 위험 수용이 문서화되어 있다(단일 `AUTH_SECRET` 위조 위험 언급 포함)

### AC-ATTR-4 (REQ-ATTR-005) — 문서 존재 검증(비기능)
- Given: 완성된 SPEC/운영 문서
- When: spec.md §10(권장 후속 강화)를 확인한다
- Then: 관리자별 개별 자격증명/SSO 항목이 비차단 후속 경로로 명시되어 있고, 본 SPEC의 기능 완료 조건이 아님이 적혀 있다
- 참고: 본 AC는 문서 존재로만 검증되는 documentation-only 항목이다. §10의 다른 후속 강화 항목(AUTH_SECRET 로테이션, 이상 탐지)도 동일하게 비기능·문서 전용이며 본 SPEC의 기능 게이트가 아니다.

## R2 — 감사 로그

### AC-AUDIT-1 (REQ-AUDIT-001, 8장 스키마)
- Given: 공유 프로덕션 마이그레이션이 팀 조율 후 적용된 상태
- When: `admin_audit_logs` 스키마를 확인한다
- Then: `id, actor_email, action, target_type, target_id, metadata, outcome, created_at` 컬럼이 존재하고 `outcome`이 (`intent`,`completed`,`failed`) CHECK를 가지며 제약이 8장과 일치한다

### AC-AUDIT-2 (REQ-AUDIT-002, REQ-AUDIT-003) — 비파괴 사후 단건
- Given: 비파괴 행위(예: `ocr.verify`)
- When: 행위가 성공적으로 1회 완료된다
- Then: 단일 헬퍼 `recordAudit` 경로로 `outcome="completed"` 감사 항목이 정확히 1건 기록된다(중복·누락 없음)

### AC-AUDIT-3 (REQ-AUDIT-004, REQ-AUDIT-012)
- Given: 관리자가 OCR 상세 화면에 있음
- When: 검증 상태를 "정확"으로 변경한다
- Then: `verified_note`에 `[admin:...]` 프리픽스가 붙지 않고, `action="ocr.verify"`, `target_type="ocr_capture"`, `target_id=<id>`, `outcome="completed"`, `metadata`에 이전/이후 상태를 담은 감사 항목이 생성된다. `verified_by`는 null 유지. `from` 값은 갱신 반환값/원자적 캡처로 취득되어 스테일하지 않다

### AC-AUDIT-4 (REQ-AUDIT-005 — DB 불변성)
- Given: 감사 항목이 존재하고 `BEFORE UPDATE OR DELETE` 트리거(+권한 회수)가 적용된 상태
- When: (a) 관리자 웹앱 코드베이스를 검사하고, (b) `service_role`로 `admin_audit_logs`에 `UPDATE`/`DELETE`를 직접 시도한다
- Then: (a) 앱 코드에 UPDATE/DELETE 경로가 없다(insert·select만), (b) DB가 UPDATE/DELETE를 오류로 거부한다(트리거 예외 또는 권한 거부)

### AC-AUDIT-5 (REQ-AUDIT-006, REQ-AUDIT-003) — 순서 정책 양 경로 검증
- 분기 A (파괴적/PII, 중단 경로):
  - Given: 파괴적/PII 행위(예: `pii.reveal`)에서 의도 기록이 실패하도록 강제된 상황
  - When: 해당 행위를 시도한다
  - Then: 상태 변경/PII 노출이 발생하지 않는다(fail-closed). 성공 표시가 남지 않는다
- 분기 A' (파괴적/PII, 정상 경로):
  - Given: 의도 기록이 성공하는 상황
  - When: 본 행위가 성공한다
  - Then: 동일 `correlationId`로 `intent` 1건과 `completed` 1건이 존재한다. 본 행위가 실패하면 `failed`가 기록되거나 `completed`가 부재하며, `intent` 단독은 성공으로 표기되지 않는다
- 분기 B (비파괴, 경고 경로):
  - Given: 비파괴 행위(예: `ocr.verify`)에서 감사 insert가 실패하는 상황
  - When: 해당 행위를 수행한다
  - Then: 본 행위 결과는 유지되고, 감사 실패가 경고/서버 로그로 표면화된다(무음 성공 아님, 행위 실패 처리 아님)

### AC-AUDIT-6 (REQ-AUDIT-007 — 조회/필터/정합화)
- Given: 다양한 actor/action/date/target 및 `intent`/`completed`/`failed` 항목이 존재
- When: `/audit`에서 특정 `actor_email`과 날짜 범위로 필터한다
- Then: 조건에 맞는 항목만 최신순으로 표시되고, `completed`는 "성공", `intent` 단독은 "미완료/시도", `failed`는 "실패"로 표기된다

### AC-AUDIT-7 (REQ-AUDIT-008 — 접근 통제)
- Given: 로그인하지 않은 사용자
- When: `/audit`에 직접 접근한다
- Then: `/login`으로 리다이렉트되며 감사 데이터가 응답되지 않는다

### AC-AUDIT-8 (REQ-AUDIT-009 — 행위 분류)
- Given: 감사 대상 `action` 통제 어휘
- When: 8장 통제 어휘 표를 확인한다
- Then: 각 `action`에 분류(파괴적/PII vs 비파괴)와 순서 정책이 명시되어 있고, 분기 로직이 이 분류로 결정된다. 초기값: `ocr.verify`/`pii.export.masked`=비파괴, `pii.reveal`/`pii.export.unmasked`=파괴적/PII

### AC-AUDIT-9 (REQ-AUDIT-010 — metadata 원값 PII 금지)
- Given: PII 관련 행위(`pii.reveal` / `pii.export.unmasked`)의 감사 항목
- When: 해당 항목의 `metadata`를 검사한다
- Then: 열람/내보낸 필드명·대상 식별자·범위·행 수 등 비식별 맥락만 있고 은행 PII 원값(평문/복호값)이 없다. `/audit`에서 항목을 열어도 원값이 드러나지 않는다

### AC-AUDIT-10 (REQ-AUDIT-011 — 이력 미백필)
- Given: 마이그레이션 이전 `verified_note`에 `[admin:...]` 프리픽스가 있는 기존 레코드
- When: 마이그레이션을 적용하고 신규 검증을 수행한다
- Then: 과거 `verified_note` 문자열은 변경·삭제·백필되지 않고 보존되며, 신규 검증만 `admin_audit_logs`에 나타난다. 이원 출처가 문서에 명시된다

## R3 — PII 보호

### AC-PII-1 (REQ-PII-001 — 기본 마스킹)
- Given: 은행 정보가 있는 profiles 데이터
- When: 사용자 관리 목록/상세를 연다
- Then: `bank_name`/`bank_account`/`account_holder`가 기본적으로 마스킹되어 표시되고, 원값 전체가 노출되지 않는다

### AC-PII-2 (REQ-PII-002 — 열거된 표면별 검증)
- Given: PII를 다루는 열거된 6개 표면(목록/상세/검색/CSV/서버 액션 반환/오류·로그)
- When: 각 표면을 정상/오류 경로로 실행한다
- Then:
  - 서버 액션 반환 타입에 은행 PII 원값 필드가 없다(마스킹 또는 배제)
  - 지정 로거를 경유한 오류/서버 로그의 검사 목록에 PII 원값이 없다
  - `_enc` 원값/복호값이 위 표면에 그대로 나타나지 않는다
- 참고: 감사 로그 표면은 AC-AUDIT-9로 별도 검증한다

### AC-PII-3 (REQ-PII-003, REQ-AUDIT-006 — 감사되는 마스킹 해제, intent-first)
- Given: 마스킹된 profile 상세 화면
- When: 관리자가 명시적으로 마스킹 해제를 요청한다
- Then: 원값 노출 **전** `action="pii.reveal"`, `outcome="intent"`, `target_type="profile"`, `target_id=<profile id>`, `metadata.fields`(필드명, 원값 아님)를 담은 의도 항목이 기록되고, 노출 성공 시 동일 `correlationId`의 `completed`가 기록된다
- And: 의도 기록이 실패하면 원값이 노출되지 않는다(fail-closed)

### AC-PII-4 (REQ-PII-004 — 기본 내보내기 + 스트림 일관)
- Given: 사용자 데이터 CSV 내보내기 기능
- When: 기본(비승인) 모드로 내보낸다(스트리밍 포함)
- Then: 산출 CSV에 마스킹되지 않은 은행 PII가 포함되지 않으며, 스트림 전 구간(모든 청크)에서 동일 마스킹 규칙이 적용된다. (권장) `pii.export.masked` 사후 감사가 남는다

### AC-PII-5 (REQ-PII-005, REQ-AUDIT-006 — 비마스킹 내보내기: 자기 확인 + intent-first + 완료 시점 감사)
- Given: 비마스킹 내보내기 요청
- When: 인-UI 자기 확인(확인 다이얼로그/타이핑 확인) 없이 시도한다
- Then: 내보내기가 실행되지 않는다
- And When: 자기 확인 후 수행한다
- Then: 내보내기 **전** `action="pii.export.unmasked"`, `outcome="intent"` 항목이 기록되고, 스트림이 **성공적으로 완료된 시점**에 동일 `correlationId`의 `completed`가 기록된다. 중도 실패 시 `completed`가 없고(의도만 잔존) `failed`가 기록될 수 있다. `metadata`에 범위/행 수만 담기고 원값은 없다
- And: 이 확인은 동일 관리자의 self-confirm이며 타 관리자 승인/역할 체계를 요구하지 않는다(비목표 경계)

### AC-PII-6 (REQ-PII-006 — 검색 채널 특화)
- Given: 은행 필드로 검색 가능한 사용자 관리 화면
- When: 부분 계좌번호 등으로 검색한다
- Then: 검색 결과의 은행 PII는 마스킹되어 표시되고, 매칭된 레코드의 원값은 별도 `pii.reveal` 없이는 노출되지 않으며(검색을 통한 원값 확인 금지), 질의 에코가 전체 원값을 드러내지 않는다

## 엣지 케이스 (Edge Cases)

- 동일 관리자가 짧은 시간에 다수 행위 → 행위마다 별도 감사 항목(집계·병합 없음).
- `target_id`가 없는 행위(예: 전체 범위 내보내기) → `target_id=null` 허용, `target_type`은 필수.
- 세션이 액션 처리 도중 만료 → 액션 진입 시 재검증 결과를 기준으로 거부(AC-ATTR-2).
- `_enc` 컬럼만 존재하고 평문이 비어 있는 경우 → 마스킹 규칙은 노출 표현 기준이며, 원값·복호값 유출 금지는 동일 적용.
- **동시 OCR 검증(REQ-AUDIT-012)**: 두 관리자가 동일 `ocr_capture`를 동시에 변경 → last-write-wins로 마지막 쓰기가 최종 상태. 각자의 `ocr.verify` 감사 항목이 남고, `from`은 스테일하지 않게 캡처된다(락 미도입, 저빈도 근거).
- **파괴적/PII 의도 후 크래시**: 의도 기록 성공 + 본 행위 진행 중 프로세스 중단 → `completed` 부재의 dangling intent가 남고, `/audit`에서 "미완료/시도"로 표기(성공으로 오인 금지).

## 품질 게이트 / Definition of Done

- [ ] R1: 모든 감사 항목에 세션 기반 `actor_email` 존재, `"unknown"` 폴백 제거됨
- [ ] R1: 공유 비밀번호 한계·위험 수용·SSO 후속·AUTH_SECRET 대응이 UI 또는 운영 문서에 명시됨
- [ ] R2: `admin_audit_logs` 테이블 + `BEFORE UPDATE OR DELETE` 트리거(+권한 회수) 마이그레이션이 모바일/백엔드 팀 조율 후 적용됨(M1 외부 승인 확보)
- [ ] R2: DB가 감사 로그 UPDATE/DELETE를 거부함(트리거/권한으로 검증)
- [ ] R2: 단일 `recordAudit` 헬퍼 경유, 순서 정책 분기(비파괴 사후 best-effort / 파괴적·PII intent-first fail-closed)가 양 경로로 검증됨
- [ ] R2: `verifyAction`이 note 프리픽스 대신 구조화 감사(`ocr.verify`)를 남기고, 이력 미백필·동시성 `from` 캡처 준수
- [ ] R2: 감사 `metadata`에 은행 PII 원값 없음(REQ-AUDIT-010)
- [ ] R2: `/audit` 필터 + 정합화 표기(intent 미완료 구분) + 비로그인 접근 차단
- [ ] R3: 열거된 6개 표면 기본 마스킹, 서버 액션 반환/로그에 원값 없음
- [ ] R3: 마스킹 해제·비마스킹 내보내기가 intent-first 감사(원값 미저장)를 남기고, 비마스킹은 인-UI 자기 확인 요구
- [ ] R3: 검색 채널이 원값 확인 오라클이 아님(REQ-PII-006)
- [ ] 비목표(spec.md 11장) 미구현 확인 — 파괴적 기능/SSO/역할·승인자 체계/모바일 변경 없음
- [ ] `.moai/project/db/` 스키마 문서가 신규 테이블·트리거로 갱신됨(마이그레이션 확정 시)
- [ ] (게이트) M1 외부 승인 미확보 시 M1 의존 통합 마일스톤은 보류하고 병렬 앱-측 작업만 진행(plan §4)
