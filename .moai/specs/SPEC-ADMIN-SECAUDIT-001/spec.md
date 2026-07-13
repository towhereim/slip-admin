---
id: SPEC-ADMIN-SECAUDIT-001
version: 0.2.0
status: draft
created: 2026-07-13
updated: 2026-07-13
author: shlim
priority: high
issue_number: null
---

# SPEC-ADMIN-SECAUDIT-001 — 관리자 보안 및 감사 기반(Security & Audit Foundation)

## HISTORY

- 2026-07-13 (v0.2.0): 독립 감사(audit.md) 결함 F1–F14에 대한 사용자 확정 결정(D1/D2/D3) 반영.
  - D1: 감사 순서 정책을 행위 유형별로 분리 확정 — 파괴적/PII 노출 행위는 **의도 선기록(intent-first) + 실패 시 중단(fail-closed)**, 비파괴 행위는 **사후 best-effort**. REQ-AUDIT-003/006 재작성, 분류 규칙(REQ-AUDIT-009)·정합화 규칙 신설.
  - D2: 감사 로그 불변성을 **DB 수준(트리거/권한 회수)** 강제로 승격(REQ-AUDIT-005 재작성). §1 목표의 불변 주장이 in-scope 요구로 뒷받침되도록 수정.
  - D3: metadata 원값 PII 금지(REQ-AUDIT-010), verified_note 이력 미백필/이원 출처(REQ-AUDIT-011), 동시성(REQ-AUDIT-012) 신설. REQ-PII-002 검증 범위 한정, REQ-PII-005 "승인" 정의(인-UI 자기 확인)·비목표 경계, REQ-PII-006 차별화, REQ-ATTR-004/005 정정.
- 2026-07-13 (v0.1.0): 최초 초안 작성. R1(관리자 신원·행위자 귀속), R2(감사 로그), R3(PII 보호) 세 요구 그룹 정의. 후속 "파괴적 기능" SPEC들의 선행(prerequisite) 기반 SPEC.

---

## 1. 목표 (Goal)

slip-admin(SLIP 관리자 웹앱)에서 **민감하거나 파괴적인 모든 관리자 행위를 특정 관리자에게 귀속**시키고, **DB 수준에서 변경 불가능한(append-only) 감사 로그로 기록**하며, **사용자 PII(은행 정보)를 기본 마스킹**하는 보안·감사 기반을 정의한다.

이 SPEC은 **선행 기반(prerequisite foundation)** 이다. 이후의 파괴적 기능 SPEC(관리자 계정 비활성화/삭제, 피드백 중앙화, 발송 로그 등)은 이 SPEC이 제공하는 감사 로그와 귀속 체계에 **의존**한다. 이 SPEC 자체는 파괴적 기능을 구현하지 않는다(11장 Exclusions 참고).

### 성공의 정의

- 감사 대상 행위는 예외 없이 세션의 관리자 이메일(`actor_email`)을 담아 `admin_audit_logs`에 기록된다(비파괴 행위는 완료 1건, 파괴적/PII 행위는 의도 선기록 후 종결 기록).
- 감사 로그는 **DB 수준(BEFORE UPDATE OR DELETE 트리거, 필요 시 권한 회수 병행)에서 append-only가 강제**되어 `service_role` 경로로도 UPDATE/DELETE가 거부된다(REQ-AUDIT-005). 애플리케이션 코드에도 변경·삭제 경로를 두지 않는다.
- profiles의 은행 PII는 노출되는 열거된 표면(4·7장)에서 기본 마스킹되며, 마스킹 해제 및 비마스킹 내보내기는 감사 기록을 남긴다. 감사 로그 자체에는 PII 원값을 저장하지 않는다(REQ-AUDIT-010).

---

## 2. 배경 및 현재 상태 (Background & Current State)

### 2.1 기술 스택 / 접근 경계

- Next.js 15 App Router + TypeScript + Tailwind. UI는 한국어.
- 모든 DB 접근은 **서버 전용**이며 Supabase `service_role` 키로 이루어진다(RLS 우회). `lib/supabaseAdmin.ts`가 `server-only` 가드로 클라이언트 번들 유입을 차단한다.
- **SLIP 모바일 앱과 동일한 Supabase 프로젝트(공유 프로덕션 DB)** 를 사용한다. 신규 테이블/트리거/권한 변경은 공유 프로덕션 자산에 대한 변경이다(9장 참고).

### 2.2 현재 인증 구현 (이미 존재)

- `lib/admins.ts` — `isAllowedAdmin(email, password)`: 이메일을 `ADMIN_EMAILS` 허용목록과 대조하고, **모든 관리자가 공유하는 단일 `ADMIN_PASSWORD`** 와 비교한다. 관리자는 각자 **자신의 이메일**로 로그인하되 비밀번호는 하나를 공유한다.
- `lib/session.ts` — `jose`로 서명한 httpOnly JWT 쿠키 `admin_session`, payload `{ email }`, 12시간 TTL. 서명 비밀은 단일 `AUTH_SECRET`(32자 이상). Edge(미들웨어)에서 동작.
- `middleware.ts` — `/login`과 정적 자산을 제외한 모든 라우트를 보호하며 JWT를 검증한다.
- `app/login/actions.ts`, `app/logout/actions.ts` — 서버 액션.

### 2.3 대체(교체) 대상인 임시 감사 방식 (Stopgap to Replace)

`app/(dashboard)/ocr/[id]/actions.ts`의 `verifyAction`은 현재 행위 관리자를 기록하기 위해 `ocr_captures.verified_note` 앞에 `[admin:${adminEmail}]` 문자열을 **덧붙이는 방식**을 쓴다. `ocr_captures.verified_by`(profiles FK)는 관리자가 profiles 행이 아니므로 `null`로 둔다. 이 문자열 프리픽스 방식은 **구조화된 감사 로그로 교체될 대상**이며, 이미 축적된 과거 이력의 취급 방침은 REQ-AUDIT-011에서 정한다.

### 2.4 관련 실 DB 스키마 (확인됨)

- `profiles(id, name, email, avatar_color, initial, created_at, updated_at, onboarded_at, bank_name, bank_account, account_holder, bank_name_enc bytea, bank_account_enc bytea, account_holder_enc bytea)`
  - 은행 3필드(bank_name / bank_account / account_holder)는 **평문**과 `_enc`(암호화 bytea) 형태가 **모두** 존재한다. 이 6개 컬럼 전부 **PII**로 취급한다.
- `ocr_captures(..., verified_status, verified_by uuid FK, verified_at, verified_note, ...)` — `verified_by`는 profiles FK이며 관리자는 profiles가 아니므로 현재 null.
- **`admin_audit_logs` / `admin_actions` 테이블은 존재하지 않는다** — 본 SPEC에서 신규 설계한다.
- 주의: `project_deletion_requests` / `project_deletion_votes`는 **사용자 측 삭제 투표 플로우**이며 관리자 감사 추적과 **무관**하다. 혼동 금지.

---

## 3. 용어 (Glossary)

| 용어 | 정의 |
|------|------|
| 민감/감사 대상 행위 | 감사 로그를 남겨야 하는 관리자 행위(OCR 검증 상태 변경, PII 마스킹 해제, PII 포함 내보내기 등) |
| 파괴적/PII 노출 행위 | 되돌리기 어렵거나 PII 원값을 노출하는 행위. 예: (후속) 계정 비활성화/삭제, `pii.reveal`, `pii.export.unmasked`. **의도 선기록 + 실패 시 중단** 대상(REQ-AUDIT-006) |
| 비파괴 행위 | 상태 확인/경미한 상태 변경 등. 예: `ocr.verify`, 목록/조회, `pii.export.masked`. **사후 best-effort 기록** 대상(REQ-AUDIT-003) |
| `actor_email` | 감사 로그에 기록되는 행위자 식별자. `admin_session` JWT의 `email`에서 취득 |
| 귀속(attribution) | 특정 행위를 특정 관리자 이메일에 연결하는 것 |
| 의도 선기록(intent-first) | 파괴적/PII 행위에서 본 행위 실행 **전** 의도(outcome=`intent`) 감사 항목을 먼저 기록하는 것 |
| 정합화(reconciliation) | 의도 항목과 종결 항목(`completed`/`failed`)을 대조하여 "성공"인지 "미완료/실패"인지 판정하는 것 |
| 마스킹(masking) | PII 값을 부분 은닉된 표현으로 대체하여 표시하는 것 |
| 마스킹 해제(reveal) | 마스킹된 PII 원값을 명시적 행위로 노출하는 것 (감사 기록 대상) |

---

## 4. 범위 (Scope)

본 SPEC은 세 요구 그룹으로 구성된다.

- **R1 — 관리자 신원 및 행위자 귀속** (요구 ID: `REQ-ATTR-*`)
- **R2 — 감사 로그** (요구 ID: `REQ-AUDIT-*`)
- **R3 — PII 보호(마스킹 / 감사 기반 열람 / 내보내기 보호)** (요구 ID: `REQ-PII-*`)

EARS 표기: **[Ubiquitous]** 항상, **WHEN** 이벤트 기반, **WHILE** 상태 기반, **IF … THEN** 원치 않는 동작 방지. 각 요구의 응답은 "…해야 한다(shall)"로 기술한다.

PII 마스킹의 대상 표면(enumerable surfaces)은 다음으로 **한정**한다(REQ-PII-002 검증 근거): (1) 사용자 관리 목록, (2) 사용자 상세, (3) 검색 결과, (4) CSV 내보내기 산출물, (5) 서버 액션 반환값, (6) 오류 메시지/서버 로그.

---

## 5. R1 — 관리자 신원 및 행위자 귀속 (Admin Identity & Actor Attribution)

### REQ-ATTR-001 [Ubiquitous]
관리자 웹앱은 모든 감사 대상 행위에 대해 그 행위를 유효 세션의 관리자 이메일(`actor_email`)에 **귀속시켜야 한다(shall)**.

수용 기준:
- 감사 대상 행위로 생성된 모든 감사 로그 항목은 비어 있지 않은 `actor_email`을 가진다.
- `actor_email`은 `admin_session` JWT의 `email`에서만 취득한다(클라이언트 입력값을 신뢰하지 않는다).

### REQ-ATTR-002 [Event-Driven]
**WHEN** 관리자가 감사 대상 서버 액션을 실행하면, 시스템은 액션 실행 시점에 `admin_session` 쿠키를 재검증하여 `actor_email`을 확정**해야 한다(shall)**.

수용 기준:
- 서버 액션은 미들웨어 보호에만 의존하지 않고 액션 내부에서 `verifySession`으로 세션을 재검증한다.
- 확정된 `actor_email`이 감사 로그 및 행위 처리에 사용된다.

### REQ-ATTR-003 [Unwanted, IF…THEN]
**IF** 감사 대상 행위 실행 시점에 유효한 관리자 세션을 확인할 수 없다면, **THEN** 시스템은 해당 행위를 **거부해야 하며(shall reject)**, 위조되거나 자리표시자(예: `"unknown"`) 행위자를 담은 감사 로그를 남겨서는 **안 된다(shall not)**.

수용 기준:
- 세션 미검증 상태에서 감사 대상 행위는 상태 변경 없이 거부된다.
- 현행 `verifyAction`의 `adminEmail = session?.email ?? "unknown"` 폴백은 제거된다(익명 귀속 금지).

### REQ-ATTR-004 [Ubiquitous — 알려진 한계 문서화 + 명시적 위험 수용]
시스템은 **공유 `ADMIN_PASSWORD` 구조상 `actor_email`이 암호학적 증명(proof)이 아니라 자기 주장(claim)** 임을, 그리고 이것이 **명시적으로 수용된 위험(accepted risk)** 임을 문서화**해야 한다(shall)**.

배경/한계:
- 모든 관리자가 동일한 비밀번호를 공유하므로, 허용목록에 있는 임의의 관리자가 타 관리자의 이메일로 로그인해 행위를 귀속시킬 여지가 존재한다.
- 세션 무결성은 단일 `AUTH_SECRET` 서명에 의존하므로, `AUTH_SECRET`이 노출되면 임의의 `admin_session` JWT를 위조할 수 있다(§10에서 로테이션/노출 대응 문서화).
- 따라서 `actor_email`은 "누가 했다고 주장되는가"를 보장하되, "그 사람이 반드시 했다"를 암호학적으로 보장하지는 않는다.

수용 기준:
- 이 한계와 위험 수용이 감사 로그 UI(또는 운영 문서)에서 명시된다(예: "행위자는 세션 이메일 기준이며 공유 비밀번호 환경에서는 강한 신원 증명이 아님").
- (권장) 위험 수용에 대해 승인권자 서명/승인 근거를 운영 문서에 남긴다.

### REQ-ATTR-005 [Ubiquitous — 후속 강화 경로 문서화]
시스템 문서는 강한 신원 보증을 위한 **관리자별 개별 자격증명 또는 SSO** 도입을 **비차단(non-blocking) 권장 후속 경로로 명시해야 한다(shall)**. 본 SPEC에서 SSO/개별 비밀번호 구현은 요구하지 않는다(11장 비목표 참고).

수용 기준:
- §10(권장 후속 강화)에 개별 자격증명/SSO 항목이 문서로 존재한다(문서 존재로 검증).
- 이 항목이 본 SPEC의 기능 완료 조건이 아님이 명시된다.

> 참고(F12): 본 요구는 "미래 가정"에 대한 WHERE(선택 기능) 오용을 피하기 위해 **현재 문서에 대한 Ubiquitous 문서화 요구**로 표현한다. 실제 SSO/자격증명 시스템 구축은 §10의 후속 작업이다.

---

## 6. R2 — 감사 로그 (Audit Log)

### REQ-AUDIT-001 [Ubiquitous — 신규 테이블]
공유 Supabase에 신규 테이블 `admin_audit_logs`가 **존재해야 한다(shall)**. 스키마는 8장을 따른다(`outcome` 컬럼 포함).

수용 기준:
- 테이블은 최소 `id, actor_email, action, target_type, target_id, metadata, outcome, created_at` 컬럼을 가진다.
- 마이그레이션(테이블 + 불변성 트리거/권한)은 공유 프로덕션 DB 대상이므로 모바일/백엔드 팀과 조율된다(9장).

### REQ-AUDIT-002 [Ubiquitous — 단일 재사용 헬퍼]
시스템은 모든 민감 서버 액션이 호출하는 **단일 재사용 서버 측 헬퍼**(예: `lib/audit.ts`의 `recordAudit({ actorEmail, action, targetType, targetId, metadata, outcome, correlationId })`)를 통해서만 감사 로그를 기록**해야 한다(shall)**.

수용 기준:
- 감사 로그 삽입 경로는 이 헬퍼 하나로 일원화된다(액션마다 개별 insert 로직을 두지 않는다).
- 헬퍼 인터페이스(입력 필드)는 8장 스키마와 1:1 대응된다.
- 헬퍼는 `outcome`(intent/completed/failed)과 `correlationId`(의도↔종결 연결)를 지원하여 의도 선기록 2단계 패턴(REQ-AUDIT-006)과 사후 단건 패턴(REQ-AUDIT-003)을 모두 표현한다.

### REQ-AUDIT-003 [Event-Driven — 비파괴 행위: 사후 best-effort]
**WHEN** 비파괴 감사 대상 행위(REQ-AUDIT-009 분류)가 완료되면, 시스템은 본 행위를 먼저 수행한 뒤 `outcome="completed"` 감사 항목을 **1건 기록해야 한다(shall)**. 이때 감사 기록이 실패하면 시스템은 경고/로그를 남기되 본 행위를 실패 처리하지 **않는다(shall not fail the action)**.

수용 기준:
- 비파괴 행위 1회 성공당 `outcome="completed"` 감사 항목 1건이 생성된다(정상 경로).
- 감사 insert가 실패해도 본 행위 결과는 유지되며, 실패는 경고/서버 로그로 표면화된다(무음 아님).
- 항목에는 `actor_email`, `action`, `target_type`, (해당 시) `target_id`, 관련 `metadata`가 채워진다.

### REQ-AUDIT-004 [Event-Driven — 임시 방식 교체]
**WHEN** 관리자가 OCR 검증 상태를 변경하면(비파괴 행위), 시스템은 `verified_note`에 `[admin:...]` 프리픽스를 덧붙이는 대신 구조화된 감사 로그 항목(`action="ocr.verify"`, `target_type="ocr_capture"`, `target_id=<ocr id>`, `outcome="completed"`)을 기록**해야 한다(shall)**.

수용 기준:
- `verifyAction`은 더 이상 `verified_note`에 관리자 이메일 프리픽스를 쓰지 않는다.
- OCR 검증 행위는 `admin_audit_logs`에 기록되며, `verified_by`는 계속 null(관리자는 profiles 아님)이나 귀속은 감사 로그가 담당한다.
- `metadata`에 최소한 이전/이후 `verified_status`가 포함된다(원값 PII는 포함하지 않는다 — REQ-AUDIT-010).

### REQ-AUDIT-005 [Ubiquitous — DB 수준 불변성 강제]
`admin_audit_logs`는 **DB 수준에서 append-only가 강제되어야 한다(shall)**. 시스템은 `service_role` 경로를 포함한 어떤 경로로도 기존 행의 수정·삭제가 거부되도록 **BEFORE UPDATE OR DELETE 트리거로 예외를 발생시켜야 하며(shall)**, 방어적으로 앱이 사용하는 역할에서 UPDATE/DELETE 권한 회수를 병행하는 것을 권장한다. 애플리케이션 코드에도 UPDATE/DELETE 경로를 두어서는 **안 된다(shall not)**.

수용 기준:
- `admin_audit_logs`에 대한 `UPDATE` 또는 `DELETE` 시도가 DB에서 오류로 거부된다(트리거 예외 또는 권한 거부).
- 관리자 웹앱 코드에 `admin_audit_logs`에 대한 UPDATE/DELETE 경로가 존재하지 않는다(insert·select만).
- 이 트리거/권한 설정은 테이블 마이그레이션과 함께 공유 프로덕션 DB 조율 대상에 포함된다(9장, plan M1).

### REQ-AUDIT-006 [Unwanted/Event — 파괴적·PII 행위: 의도 선기록 + 실패 시 중단]
**WHEN** 파괴적/PII 노출 행위(REQ-AUDIT-009 분류)가 요청되면, 시스템은 본 행위 실행 **전에** `outcome="intent"` 감사 항목을 먼저 기록**해야 한다(shall)**. **IF** 의도 항목 기록이 실패하면, **THEN** 시스템은 본 행위를 **중단해야 한다(shall abort, fail-closed)** — 상태 변경이나 PII 노출이 발생해서는 안 된다.

의도↔종결 정합화(대조 가능성) 표현:
- 의도 기록 성공 후 본 행위가 성공하면 동일 `correlationId`로 `outcome="completed"` 종결 항목을 기록한다.
- 본 행위가 실패하면 가능한 한 `outcome="failed"` 종결 항목을 기록한다. 종결 항목을 남기지 못한 경우, **종결 항목 없는 의도 항목(dangling intent)** 이 "의도는 기록되었으나 행위는 완료되지 않음"을 나타내는 지속 신호가 된다.
- 감사 로그는 불변(REQ-AUDIT-005)이므로 의도 항목을 사후 UPDATE로 승격하지 않고 **별도 종결 항목(append)** 으로 표현한다.

수용 기준(파괴적-중단 경로):
- 의도 기록이 실패하도록 강제한 상황에서 본 행위를 시도하면 상태 변경/PII 노출이 발생하지 않는다(fail-closed).
- 의도 기록 성공 + 본 행위 성공 시 `intent` 1건과 동일 `correlationId`의 `completed` 1건이 존재한다.
- 의도 기록 성공 + 본 행위 실패 시 `failed` 종결 항목이 기록되거나(가능 시), 최소한 `completed` 항목이 존재하지 않는다.
- `intent`만 있고 `completed`가 없는 항목은 결코 "성공한 행위"로 표현되지 않는다(REQ-AUDIT-007).

### REQ-AUDIT-007 [Event-Driven — 감사 조회 UI + 정합화·PII 렌더 정책]
**WHEN** 관리자가 감사 페이지(예: `/audit`)에 접근하면, 시스템은 감사 항목을 **행위자·행위(action)·날짜·대상(target)** 기준으로 목록/필터링하여 제공**해야 하며(shall)**, 의도/종결 정합화 결과를 올바르게 표현**해야 한다(shall)**.

수용 기준:
- `/audit` 페이지가 항목을 최신순으로 나열하고, 최소 필터(`actor_email`, `action`, 날짜 범위, `target_type`/`target_id`)를 제공한다.
- 목록은 서버 측(service_role)에서 조회하여 렌더한다(클라이언트에서 직접 DB 접근 금지).
- **정합화 표현**: `completed` 종결(및 그 의도 쌍)은 "성공"으로, `intent`만 있고 종결이 없는 항목은 "미완료/시도"로, `failed`는 "실패"로 표시한다. `intent`를 성공으로 표시하지 않는다.
- **PII 렌더 정책**: `metadata`에 원값 PII가 없어야 하며(REQ-AUDIT-010), `/audit` 화면은 metadata를 그대로 노출하더라도 PII가 드러나지 않는다.

### REQ-AUDIT-008 [State-Driven — 감사 페이지 접근 통제]
**WHILE** 유효한 관리자 세션이 없는 동안, 시스템은 감사 페이지 및 그 데이터 접근을 **차단해야 한다(shall)**.

수용 기준:
- `/audit`는 다른 대시보드 라우트와 동일하게 `middleware.ts` 보호 하에 있으며 비로그인 시 `/login`으로 리다이렉트된다.
- 감사 데이터 조회 경로는 세션 검증 없이 응답하지 않는다.

### REQ-AUDIT-009 [Ubiquitous — 행위 분류(결정론적 순서 규칙)] (신규, D1)
시스템은 감사 대상 `action` 통제 어휘(8장)의 **모든 항목을 "파괴적/PII 노출" 또는 "비파괴" 중 하나로 사전 분류해야 한다(shall)**. 분류는 순서 정책(REQ-AUDIT-003 vs REQ-AUDIT-006)을 결정론적으로 결정한다.

수용 기준:
- 통제 어휘의 각 `action`에 분류(파괴적/PII vs 비파괴)가 명시되어 있다(8장 표의 "분류" 열).
- 새 `action` 추가 시 분류 없이 감사 대상으로 사용할 수 없다.
- 초기 분류: `ocr.verify`=비파괴, `pii.export.masked`=비파괴, `pii.reveal`=파괴적/PII, `pii.export.unmasked`=파괴적/PII.

### REQ-AUDIT-010 [Unwanted, IF…THEN — metadata 원값 PII 금지] (신규, F4/D3)
**IF** 감사 항목 `metadata`에 은행 PII 원값(bank_name/bank_account/account_holder 평문 또는 그 복호값)을 기록하려 한다면, **THEN** 시스템은 이를 **금지해야 한다(shall not store)**. 감사 항목은 "어떤 필드/대상이 열람·내보내졌는지"와 "누가"만 기록하며, 민감 값 자체는 담지 않는다. 본 규칙은 감사 로그가 불변·영구(REQ-AUDIT-005)이므로 [HARD] 이다.

수용 기준:
- `pii.reveal` / `pii.export.unmasked` 감사 항목의 `metadata`에는 열람/내보낸 **필드명·대상 식별자·범위·행 수** 등 비식별 맥락만 존재하고 원값은 없다.
- `/audit`에서 어떤 감사 항목을 열어도 은행 PII 원값이 드러나지 않는다(R3와 정합).

### REQ-AUDIT-011 [Ubiquitous — verified_note 이력 미백필 / 이원 출처] (신규, F5/D3)
기존 `ocr_captures.verified_note`에 축적된 `[admin:...]` 프리픽스 이력은 **백필/마이그레이션하지 않는다(shall not backfill)**. 신규 OCR 검증부터 구조화 감사 로그로 기록하며, 마이그레이션 이전 데이터의 귀속은 기존 `verified_note` 문자열로 남는 **이원 출처(dual-source)** 임을 문서화**해야 한다(shall)**.

수용 기준:
- 과거 `verified_note`의 `[admin:...]` 문자열은 변경·삭제·백필되지 않고 그대로 보존된다.
- 마이그레이션 시점 이후의 OCR 검증만 `admin_audit_logs`에 나타난다.
- 운영 문서/SPEC에 "마이그레이션 이전 귀속은 verified_note, 이후는 감사 로그"라는 이원 출처가 명시된다.

### REQ-AUDIT-012 [Ubiquitous — 동시 OCR 검증 정책] (신규, F8/D3)
동일 `ocr_capture`에 대한 동시 검증 상태 변경에 대해 시스템은 **last-write-wins**를 채택**해야 한다(shall)**. `ocr.verify` 감사 `metadata`의 이전값(`from`) 캡처는 read-then-write 경쟁으로 스테일 값을 남기지 않도록 처리**해야 한다(shall)**.

수용 기준:
- 동시 변경 시 마지막 쓰기가 최종 상태가 된다(명시적 락 없음). 근거: 관리자 검증은 저빈도 행위로 last-write-wins의 손실이 허용 범위이며 락 도입 비용이 이득을 상회한다.
- `from` 값은 갱신과 동일 시점의 값을 사용(예: 조건부 업데이트의 반환값 또는 원자적 캡처)하여, 별도 선행 read로 인한 스테일 `from` 기록을 피한다. 불가 시 `metadata`에 `from`을 "관측 시점 값(비원자적)"으로 표기한다.

---

## 7. R3 — PII 보호 (PII Masking / Audited Reveal / Export Protection)

대상 PII: `profiles`의 `bank_name`, `bank_account`, `account_holder` 및 그 `_enc` 변형 6개 컬럼. 세 항목을 **PII 묶음(bundle)** 으로 취급한다. 대상 표면은 4장의 열거된 6개 표면으로 한정한다.

### REQ-PII-001 [Ubiquitous — 기본 마스킹]
시스템은 은행 PII가 노출되는 열거된 표면(사용자 관리 목록·상세, 검색 결과, 내보내기)에서 해당 값을 **기본적으로 마스킹해야 한다(shall)**.

수용 기준:
- 사용자 목록/상세/검색 어디에서도 마스킹되지 않은 은행 PII가 기본 상태로 표시되지 않는다.
- 마스킹 표현 규칙(예: 계좌번호는 마지막 4자리만, 예금주는 첫 글자만 노출)은 plan/run에서 확정하되, 원값 전체가 노출되지 않음을 보장한다.

### REQ-PII-002 [Unwanted, IF…THEN — 열거된 표면에서의 원값 배제]
**IF** 은행 PII 원값(평문 또는 `_enc` 복호값)이 4장에 **열거된 표면**(사용자 관리 목록/상세, 검색 결과, CSV 내보내기, 서버 액션 반환값, 오류 메시지/서버 로그)에 나타날 수 있다면, **THEN** 시스템은 해당 표면에서 이를 마스킹하거나 배제**해야 한다(shall)**.

수용 기준(각 표면별로 객관적 검증):
- 서버 액션 반환 타입에 은행 PII 원값 필드가 포함되지 않는다(마스킹된 표현 또는 배제).
- 오류/서버 로그는 지정된 로거를 경유하며, 검사 목록(사용자 관리·검색·내보내기 관련 로그/에러 digest)에 PII 원값이 없다.
- `_enc`(bytea) 원값 및 복호값이 위 표면에 그대로 나타나지 않는다.
- 감사 로그 표면은 REQ-AUDIT-010이 별도로 규율한다.

> 참고(F7): 본 요구는 "어디에도 절대 없음"이라는 전칭 부정 대신 **열거된 6개 표면**으로 검증 범위를 한정한다.

### REQ-PII-003 [Event-Driven — 감사되는 마스킹 해제 (파괴적/PII)]
**WHEN** 관리자가 은행 PII의 마스킹 해제(원값 열람)를 명시적으로 요청하면, 시스템은 파괴적/PII 행위 순서(REQ-AUDIT-006)에 따라 원값 노출 **전** `outcome="intent"` 감사 항목(`action="pii.reveal"`, `target_type="profile"`, `target_id=<profile id>`)을 기록하고, 노출 성공 시 `completed` 종결 항목을 기록**해야 한다(shall)**.

수용 기준:
- 마스킹 해제는 기본 화면과 구분되는 **명시적 행위**로만 발생한다(우발적 노출 없음).
- 의도 항목 기록이 실패하면 원값이 노출되지 않는다(fail-closed).
- `metadata`에 어떤 필드가 열람되었는지(예: `fields: ["bank_account"]`)가 기록되며, 원값은 담지 않는다(REQ-AUDIT-010).

### REQ-PII-004 [State-Driven — 기본 내보내기의 PII 배제/마스킹]
**WHILE** CSV 내보내기가 기본(비승인) 모드인 동안, 시스템은 은행 PII를 **배제하거나 마스킹된 형태로만** 포함**해야 한다(shall)**. 스트리밍 내보내기의 경우 모든 청크에 걸쳐 마스킹이 일관 적용**되어야 한다(shall)**.

수용 기준:
- 기본 CSV 내보내기 산출물에는 마스킹되지 않은 은행 PII가 포함되지 않는다.
- 스트림 분할과 무관하게 전 구간에서 동일한 마스킹 규칙이 적용된다.
- (권장) 기본 마스킹 내보내기도 비파괴 사후 best-effort로 `action="pii.export.masked"` 감사를 남긴다.

### REQ-PII-005 [Event-Driven — 비마스킹 내보내기: 인-UI 자기 확인 + 감사 (파괴적/PII)]
**WHEN** 관리자가 비마스킹(원값 포함) 내보내기를 수행하면, 시스템은 **인-UI 명시적 확인 단계**(확인 다이얼로그 또는 타이핑 확인)를 거치고, 파괴적/PII 순서(REQ-AUDIT-006)에 따라 내보내기 **전** `outcome="intent"` 감사(`action="pii.export.unmasked"`, `target_type="export"`)를 기록하며, 내보내기가 성공적으로 완료된 시점에 `completed` 종결 항목을 기록**해야 한다(shall)**.

"승인(authorization)"의 정의와 경계:
- 여기서 "승인"은 **동일 관리자의 인-UI 자기 확인(self-confirm)** 을 의미한다(확인 다이얼로그/타이핑 확인).
- **다자 승인·역할/권한 체계·승인자 주체를 신설하지 않는다.** 계정/역할 관리 시스템 도입은 비목표(11장)이며 본 요구의 범위가 아니다. (공유 비밀번호 단일 티어 관리자 모델에는 별도 "승인자"가 없다.)

수용 기준:
- 인-UI 자기 확인 없이는 비마스킹 내보내기가 실행되지 않는다.
- 의도 항목 기록 실패 시 내보내기가 시작되지 않는다(fail-closed).
- 종결 `completed` 항목은 내보내기(스트림) **성공적 완료 시점**에 기록된다. 다운로드/스트림이 중도 실패하면 `completed`가 남지 않으며(의도만 잔존), `failed` 종결을 남길 수 있다.
- `metadata`에 대상 범위/행 수 등 비식별 맥락이 포함되고 원값은 없다(REQ-AUDIT-010).

### REQ-PII-006 [Unwanted, IF…THEN — 검색을 통한 PII 노출/확인 방지]
**IF** 관리자가 은행 필드로 검색할 때 검색 질의 에코(입력값 표시)나 매칭 결과가 마스킹되지 않은 은행 PII를 드러낼 수 있다면, **THEN** 시스템은 검색 결과와 질의 에코를 마스킹 상태로 유지**해야 하며(shall)**, 검색을 마스킹 우회(확인 오라클) 경로로 만들어서는 **안 된다(shall not)**.

수용 기준(REQ-PII-001과 차별화 — 검색 채널 특화):
- 검색 결과 목록의 은행 PII는 마스킹되어 표시된다.
- 검색으로 매칭된 레코드의 원값은 별도 `pii.reveal`(REQ-PII-003) 없이는 노출되지 않는다(검색을 통한 원값 확인 금지).
- 질의 에코(검색어 재표시)가 전체 원값을 드러내지 않는다.

> 참고(F11): 본 요구는 REQ-PII-001(일반 기본 마스킹)과 중복되지 않도록 **검색을 PII 확인/우회 채널로 쓰지 못하게 하는 것**으로 차별화한다.

---

## 8. `admin_audit_logs` 테이블 스키마 (신규 설계)

> 아래는 **스키마 설계(명세)** 이며, 실제 마이그레이션 DDL(테이블 + 불변성 트리거/권한)은 run 단계에서 작성한다(9장 조율 필요).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | `uuid` | PK, 기본값 `gen_random_uuid()` | 항목 고유 식별자 |
| `actor_email` | `text` | NOT NULL | 행위자(세션 이메일). 자기 주장 기반(REQ-ATTR-004) |
| `action` | `text` | NOT NULL | 행위 유형(아래 통제 어휘) |
| `target_type` | `text` | NOT NULL | 대상 엔터티 유형(예: `ocr_capture`, `profile`, `export`) |
| `target_id` | `text` | NULL 허용 | 대상 식별자(대상이 특정되지 않는 행위는 null) |
| `metadata` | `jsonb` | NOT NULL, 기본값 `'{}'` | 행위별 **비식별** 맥락. 원값 PII 금지(REQ-AUDIT-010). `correlationId` 포함 가능 |
| `outcome` | `text` | NOT NULL, 기본값 `'completed'`, CHECK in (`intent`,`completed`,`failed`) | 정합화용 상태. 비파괴=완료 단건, 파괴적/PII=의도→종결 |
| `created_at` | `timestamptz` | NOT NULL, 기본값 `now()` | 기록 시각 |

- 의도↔종결 연결: 파괴적/PII 행위는 `metadata.correlationId`(uuid)로 `intent`↔`completed`/`failed`를 연결한다.
- 권장 인덱스: `created_at DESC`, `actor_email`, `action`, `(target_type, target_id)`, `outcome` — REQ-AUDIT-007 필터·정합화를 지원. `metadata.correlationId` 조회 최적화(인덱싱/컬럼 승격)는 run 단계에서 결정.

### 권장 `action` 통제 어휘 (초기 집합) + 분류(REQ-AUDIT-009) + 순서 정책

| action | target_type | 분류 | 순서 정책 | 설명 |
|--------|-------------|------|-----------|------|
| `ocr.verify` | `ocr_capture` | 비파괴 | 사후 best-effort (REQ-AUDIT-003) | OCR 검증 상태 변경 (REQ-AUDIT-004) |
| `pii.export.masked` | `export` | 비파괴 | 사후 best-effort (권장 기록) | 마스킹된 CSV 내보내기 |
| `pii.reveal` | `profile` | 파괴적/PII | 의도 선기록 + 실패 시 중단 (REQ-AUDIT-006) | 마스킹된 은행 PII 원값 열람 (REQ-PII-003) |
| `pii.export.unmasked` | `export` | 파괴적/PII | 의도 선기록 + 성공 시 종결 (REQ-AUDIT-006) | 비마스킹 CSV 내보내기 (REQ-PII-005) |

> 후속(Tier B) 계정 비활성화/삭제 등 파괴적 행위는 본 SPEC 밖이나, 추가 시 반드시 "파괴적/PII"로 분류되어 의도 선기록 + fail-closed를 따른다.

### 불변성(immutability) 강제 설계 (REQ-AUDIT-005, D2)

- **필수**: `admin_audit_logs`에 `BEFORE UPDATE OR DELETE` 트리거를 두어 예외를 발생시킨다. 트리거는 역할과 무관하게(예: `service_role` 포함) 발동하여 기존 행의 변경·삭제를 거부한다.
- **권장(방어적)**: 앱이 사용하는 역할에서 해당 테이블의 `UPDATE`/`DELETE` 권한을 회수(REVOKE)한다.
- **검증**: `UPDATE`/`DELETE` 시도가 DB 오류로 거부됨을 확인(AC-AUDIT-4).
- 이 트리거/권한은 테이블 신설과 **함께** 공유 프로덕션 DB 조율 대상(9장, plan M1).

---

## 9. 공유 프로덕션 DB 마이그레이션 / 조율 리스크 (Coordination & Migration Risk)

> [HARD] `admin_audit_logs` 신설 **및 불변성 트리거/권한**은 **SLIP 모바일 앱과 공유하는 프로덕션 Supabase**에 대한 스키마·권한 변경이다.

- 이 마이그레이션(테이블 + `BEFORE UPDATE OR DELETE` 트리거 + 필요 시 권한 회수)은 관리자 웹앱 단독 자산이 아니라 **공유 프로덕션 DB**를 변경하므로, 적용 전 **모바일/백엔드 팀과 반드시 조율**한다.
- 조율 항목: 테이블 신설 승인, 네이밍 충돌 여부, **불변성 트리거/권한 회수 설계 및 side effect**(다른 서비스의 쓰기 경로에 영향 없는지), RLS 정책 필요 여부, 롤백 절차.
- `admin_audit_logs`는 관리자 전용이며 모바일 앱 런타임 경로가 접근하지 않아야 한다(범위 격리).
- 신규 테이블/트리거는 기존 사용자 데이터에 대한 파괴적 변경이 아니라 **추가(additive)** 성격이나, 공유 프로덕션이라는 이유만으로 조율·승인·롤백 계획을 필수로 한다.
- **실행 자율성(F9)**: 공유 DB에 손대는 항목(테이블/트리거/권한 = plan M1)만 외부 팀 승인에 게이트된다. `lib/audit.ts` 인터페이스, 마스킹 유틸, `/audit`·사용자 관리 UI 스캐폴딩(모의 데이터 대상)은 M1 승인과 **병렬로** 진행 가능하다.
- `.moai/project/db/`의 스키마 문서(`schema.md`, `migrations.md`, `erd.mmd`)는 현재 템플릿(TBD) 상태이므로, 본 마이그레이션 확정 시 함께 갱신한다.

---

## 10. 권장 후속 강화 (Recommended Future Hardening — 비차단)

본 SPEC의 완료 조건이 **아니며**, 향후 별도 작업으로 권장(문서화 대상 — REQ-ATTR-005):

- **관리자별 개별 자격증명 또는 SSO** 도입으로 `actor_email`을 자기 주장(claim)에서 검증된 신원(proof)으로 승격(REQ-ATTR-004/005 한계 해소).
- **`AUTH_SECRET` 관리**: 정기 로테이션 절차와 노출 시 즉시 교체·전 세션 무효화 대응을 운영 절차로 마련(단일 서명 비밀 위조 위험 완화 — REQ-ATTR-004 배경).
- 감사 로그에 대한 이상 탐지/알림(대량 마스킹 해제, 대량 비마스킹 내보내기, dangling intent 급증 등).

---

## 11. Exclusions (What NOT to Build) — 비목표(Non-Goals)

> [HARD] 아래 항목은 본 SPEC의 범위에서 **명시적으로 제외**된다.

- **관리자 계정 비활성화/삭제 기능 자체** — 본 SPEC에 의존하는 후속 "Tier B" SPEC에서 다룬다. 본 SPEC은 그 기반(감사·귀속·의도 선기록 순서)만 제공한다.
- **피드백 DB 중앙화, 발송/전송 로그(Resend/Expo), OCR/업로드 실패 상태 추적** — "Tier C"의 별도 SPEC들이며 본 SPEC 범위 밖.
- **SSO / 관리자별 개별 비밀번호 구현** — 권장 후속 작업으로만 문서화(10장). 본 SPEC에서 구현하지 않는다.
- **역할/권한/승인자 체계(계정 관리 시스템)** — REQ-PII-005의 "승인"은 동일 관리자의 인-UI 자기 확인이며, 다자 승인·역할 기반 접근 제어(RBAC)·승인자 주체를 신설하지 않는다(F6 경계).
- **모바일 앱 측 변경** — 본 SPEC은 관리자 웹앱과 공유 DB의 관리자 전용 테이블/트리거만 다룬다.
- **PII 암호화 방식 자체의 변경** — 기존 평문/`_enc` 컬럼 구조를 재설계하지 않는다. 본 SPEC은 노출·열람·내보내기 지점의 마스킹/감사만 규정한다.
- **verified_note 이력 백필** — 과거 `[admin:...]` 이력은 감사 로그로 이관하지 않는다(REQ-AUDIT-011, 이원 출처 유지).

---

## 12. 의존성 및 후속 SPEC (Dependencies & Downstream)

- **선행/의존 대상**: 본 SPEC은 아래 후속 SPEC들의 **선행 기반**이다.
  - (Tier B, 예정) 관리자 계정 비활성화/삭제 — 파괴적 행위이므로 `recordAudit` 의도 선기록 순서(REQ-AUDIT-006)와 `admin_audit_logs`에 기록해야 하며 본 SPEC 완료를 전제로 한다.
  - (Tier C, 예정) 피드백 중앙화, 발송/전송 로그, OCR/업로드 실패 추적 — 관리자 행위 부분에서 동일한 감사 기반을 재사용한다.
- **직접 영향 코드(참고)**: `app/(dashboard)/ocr/[id]/actions.ts`(`verifyAction` 교체), 신규 `lib/audit.ts`, 신규 `/audit` 라우트, 사용자 관리/검색/내보내기 화면.
- **본 SPEC이 의존하는 기존 요소**: `lib/session.ts`(세션 검증, `AUTH_SECRET` 무결성), `middleware.ts`(라우트 보호), `lib/supabaseAdmin.ts`(서버 전용 접근).

---

## 13. 결정 및 미해결 사항 (Decisions & Open Items)

### 13.1 결정 완료 (Resolved by D1/D2/D3 — run 이전 차단 결정)

- **감사-실패 순서 정책**(구 §13 미해결): 확정됨(D1). 파괴적/PII=의도 선기록+fail-closed(REQ-AUDIT-006), 비파괴=사후 best-effort(REQ-AUDIT-003). AC-AUDIT-5로 양 경로 검증 가능.
- **append-only 강제 방식**(구 §13 미해결): 확정됨(D2). DB `BEFORE UPDATE OR DELETE` 트리거 필수 + 권한 회수 병행 권장(REQ-AUDIT-005).
- **마스킹된 내보내기 감사 여부**(구 §13 미해결): 확정됨(D3 기본값). `pii.export.masked`를 비파괴 사후 best-effort로 **기록 권장**(REQ-PII-004).

### 13.2 run 단계 세부 (genuinely-remaining)

- 마스킹 표현의 정확한 형식(계좌번호 노출 자릿수, 예금주 마스킹 규칙) — run 단계 UI 세부.
- 인-UI 자기 확인(REQ-PII-005)의 정확한 상호작용 형태(확인 다이얼로그 vs 타이핑 확인) — run 단계 UI 세부(자기 확인이라는 성격은 확정).
- `metadata.correlationId` 조회 최적화(인덱싱/컬럼 승격 여부) — run 단계 성능 세부.
