---
id: SPEC-ADMIN-SECAUDIT-001
version: 0.2.0
status: draft
created: 2026-07-13
updated: 2026-07-13
author: shlim
priority: high
---

# 구현 계획 (Implementation Plan) — SPEC-ADMIN-SECAUDIT-001

> 본 문서는 계획(plan) 단계 산출물이다. 구현 코드는 run 단계에서 작성한다. 시간 추정치는 사용하지 않으며 우선순위와 순서로 표현한다.
> v0.2.0: 감사(audit.md) 결정 D1/D2/D3 반영 — 순서 정책(의도 선기록 vs 사후), DB 트리거 불변성, metadata PII 금지, M1 범위 축소(F9).

## 1. 기술 접근 (Technical Approach)

### 1.1 감사 로그 코어 (R2)

- 신규 테이블 `admin_audit_logs`(spec.md 8장 스키마, `outcome` 컬럼 포함)를 공유 프로덕션 Supabase에 마이그레이션. **공유 DB에 손대는 항목(테이블 + 불변성 트리거/권한)은 M1 조율 대상(spec.md 9장)**.
- 불변성(REQ-AUDIT-005): `BEFORE UPDATE OR DELETE` 트리거로 예외 발생을 **필수**로 두고, 앱 역할의 UPDATE/DELETE 권한 회수를 **방어적으로 병행**. 트리거·권한은 테이블 마이그레이션과 함께 M1에서 조율.
- 신규 `lib/audit.ts`에 단일 헬퍼 `recordAudit`를 둔다. 계약(계약만 명시, 구현은 run):
  - 입력: `{ actorEmail: string; action: string; targetType: string; targetId?: string | null; metadata?: Record<string, unknown>; outcome?: "intent" | "completed" | "failed"; correlationId?: string }`
  - 동작: `getSupabaseAdmin()`로 `admin_audit_logs`에 1건 insert. `server-only` 경계 유지.
  - 실패 처리: 오류를 삼키지 않고 호출부로 전파(파괴적/PII는 fail-closed, 비파괴는 호출부가 best-effort 처리).
- 헬퍼는 감사 로그 삽입의 **유일한 경로**. 액션별 개별 insert 금지(REQ-AUDIT-002).
- [HARD] `metadata`에 은행 PII 원값 금지(REQ-AUDIT-010) — 헬퍼 사용 규약 및 리뷰 체크리스트로 강제.

### 1.2 순서 정책 (D1) — 행위 유형별 분기

- 행위 분류(REQ-AUDIT-009)는 통제 어휘 표(spec.md 8장)로 결정론적. 새 action 추가 시 분류 필수.
- **비파괴(`ocr.verify`, `pii.export.masked`)**: 본 행위 → 사후 `recordAudit(outcome="completed")` best-effort. 감사 실패 시 경고/로그, 본 행위 유지(REQ-AUDIT-003).
- **파괴적/PII(`pii.reveal`, `pii.export.unmasked`, 후속 Tier B 계정 행위)**: `recordAudit(outcome="intent", correlationId)` 선기록 → 실패 시 **중단(fail-closed)** → 본 행위 → 성공 시 `completed`, 실패 시 `failed` 종결(동일 correlationId)(REQ-AUDIT-006).
- 정합화 표현(REQ-AUDIT-007): `/audit`는 `intent` 단독을 성공으로 표시하지 않음(미완료/시도), `completed`만 성공.

### 1.3 세션 재검증 및 귀속 (R1)

- 감사 대상 서버 액션은 액션 내부에서 `verifySession`으로 `actor_email`을 확정(REQ-ATTR-002).
- 세션 미검증 시 상태 변경 없이 거부. `"unknown"` 폴백 제거(REQ-ATTR-003).
- 공유 비밀번호 한계·위험 수용(REQ-ATTR-004)과 SSO 후속(REQ-ATTR-005)을 `/audit` UI 안내 또는 운영 문서에 반영. `AUTH_SECRET` 로테이션은 §10 후속.

### 1.4 OCR 검증 마이그레이션 (R2)

- `app/(dashboard)/ocr/[id]/actions.ts`의 `verifyAction` 수정:
  - `verified_note`에서 `[admin:...]` 프리픽스 로직 제거.
  - `verified_status` 갱신 후(비파괴) `recordAudit({ action: "ocr.verify", targetType: "ocr_capture", targetId: id, outcome: "completed", metadata: { from, to } })` 호출.
  - `verified_by`는 계속 null 유지(관리자는 profiles 아님).
  - 동시성(REQ-AUDIT-012): `from` 값은 갱신 반환값/원자적 캡처로 취득(선행 read로 인한 스테일 방지). last-write-wins.
- 이력(REQ-AUDIT-011): 기존 `verified_note`의 `[admin:...]`는 백필하지 않음. 이원 출처 문서화.

### 1.5 감사 조회 페이지 (R2)

- 신규 라우트 `app/(dashboard)/audit/page.tsx`(라우트 그룹 컨벤션에 맞춤).
- 서버 컴포넌트에서 `getSupabaseAdmin()`로 조회, 최신순 + 필터(actor/action/date/target) + 정합화 표현.
- 기존 대시보드 라우트와 동일하게 `middleware.ts` 보호(REQ-AUDIT-008).
- metadata 렌더 시에도 PII 원값이 없어야 함(REQ-AUDIT-010 전제).

### 1.6 PII 마스킹 / 열람 / 내보내기 (R3)

- 열거된 6개 표면(spec.md 4장)에 마스킹 유틸 일관 적용(REQ-PII-001/002).
- 마스킹 해제(파괴적/PII): 원값 노출 전 `intent` 선기록 → 성공 시 `completed`(REQ-PII-003, REQ-AUDIT-006).
- CSV 기본 내보내기: PII 배제/마스킹, 스트림 전 구간 일관(REQ-PII-004). 마스킹 내보내기는 `pii.export.masked` 사후 기록 권장.
- 비마스킹 내보내기(파괴적/PII): 인-UI 자기 확인 → `intent` 선기록 → 스트림 성공 완료 시 `completed`(REQ-PII-005). 역할/승인자 체계 미신설(비목표).
- 검색 채널(REQ-PII-006): 결과·질의 에코 마스킹, 검색을 원값 확인 오라클로 쓰지 못하게 함.
- `_enc`(bytea) 원값/복호값은 열거 표면·로그로 유출 금지(REQ-PII-002).

## 2. 마일스톤 (우선순위 기반, 순서 존재)

> M1은 **공유 DB에 손대는 항목만** 포함하며 외부 팀 승인에 게이트된다(F9). 그 외 앱-측 작업(헬퍼 인터페이스, 마스킹 유틸, UI 스캐폴딩 — 모의 데이터 대상)은 M1과 **병렬** 진행 가능하다. 최종 통합·엔드투엔드 검증은 M1 완료 후 수행.

| 순서 | 마일스톤 | 관련 요구 | 완료 신호 | M1 승인 의존 |
|------|----------|-----------|-----------|--------------|
| M1 (High) | 공유 DB 조율: `admin_audit_logs` 테이블 + `BEFORE UPDATE OR DELETE` 트리거(+권한 회수) 마이그레이션 확정·적용 | REQ-AUDIT-001, 005, spec.md 9장 | 팀 승인 + 테이블/트리거 적용, UPDATE/DELETE 거부 검증 | — (외부 게이트) |
| M2a (High, 병렬) | `recordAudit` 헬퍼 인터페이스 + 세션 재검증 유틸 + 순서 분기 로직(모의 대상) | REQ-AUDIT-002, 009, REQ-ATTR-001~003 | 단일 헬퍼, `unknown` 폴백 제거, intent/completed 분기 | 병렬 가능 |
| M2b (High, 병렬) | 마스킹 유틸 + `/audit`·사용자 관리 UI 스캐폴딩(모의 데이터) | REQ-PII-001, 002, REQ-AUDIT-007 | 열거 표면 마스킹, 정합화 표시 UI | 병렬 가능 |
| M3 (High) | `verifyAction` → 구조화 감사로 교체 + 동시성 `from` 캡처 | REQ-AUDIT-004, 011, 012 | note 프리픽스 제거, `ocr.verify` 감사, 이력 미백필 | M1 적용 후 통합 |
| M4 (Medium) | `/audit` 실 데이터 조회·필터·정합화(접근 통제) | REQ-AUDIT-007, 008 | 필터 동작 + intent 미완료 표기 + 비로그인 차단 | M1 적용 후 |
| M5 (Medium) | 파괴적/PII 순서 적용: 마스킹 해제 intent-first | REQ-PII-003, REQ-AUDIT-006, 010 | reveal fail-closed + 감사(원값 미저장) | M1 적용 후 |
| M6 (Medium) | 내보내기 보호: 기본 마스킹 + 비마스킹 자기 확인/intent-first | REQ-PII-004, 005, REQ-AUDIT-006 | 기본 PII 배제, 비마스킹 자기 확인+감사(완료 시점) | M1 적용 후 |
| M7 (Low) | 한계·후속 강화 문서화 | REQ-ATTR-004, 005, spec.md 10장 | 공유 비밀번호 한계·위험 수용·SSO·AUTH_SECRET 문서화 | 병렬 가능 |

M3, M5, M6은 다수 화면/액션을 건드릴 수 있으므로 run 단계에서 파일 단위로 분해하여 진행한다.

## 3. 위험 요소 (Risks)

- **공유 프로덕션 DB 변경**: 모바일 팀 미조율 시 충돌/중단 위험 → M1을 **외부 선행 게이트**로 명시. 트리거/권한 회수가 다른 서비스 쓰기 경로에 미치는 side effect를 M1에서 검증(spec.md 9장).
- **불변성 트리거 side effect**: `BEFORE UPDATE OR DELETE` 트리거가 정당한 운영성 작업(파티셔닝/아카이브 등)까지 막을 수 있음 → 예외 절차(관리자 DB 직접 개입)를 조율에서 문서화.
- **감사 누락**: 새 민감 액션 추가 시 `recordAudit`/분류(REQ-AUDIT-009) 누락 가능 → 단일 헬퍼 + 분류 필수 + 리뷰 체크리스트로 완화. 향후 정적 검사 고려.
- **PII 유출 회귀**: 열거 표면·로그·metadata로 원값 유출 위험(REQ-PII-002, REQ-AUDIT-010) → 마스킹 유틸/지정 로거 경유 강제.
- **의도-종결 정합화 정확성**: 두 개의 개별 Supabase insert(의도/종결)가 단일 트랜잭션이 아님. dangling intent는 설계상 허용 신호이며 `/audit`가 이를 성공으로 오인하지 않도록 표현(REQ-AUDIT-007). 정책 자체는 확정됨(D1) — 더 이상 "검토" 항목 아님.

## 4. 조율/의존 (Coordination & Dependencies)

- Git 브랜치/PR: manager-git에 위임.
- 백엔드/DB 마이그레이션 및 불변성 트리거/권한 설계(D2): expert-backend 자문 권장. **run 진입 시 M1 외부 승인 미확보면 M1 의존 마일스톤(M3~M6 통합)은 보류**하고 병렬 앱-측 작업(M2a/M2b/M7)을 선행.
- 프론트(사용자 관리/검색/내보내기 UI, `/audit`): expert-frontend 자문 권장.
- 본 SPEC 완료가 Tier B(계정 비활성화/삭제) 및 Tier C SPEC의 선행 조건(spec.md 12장).
