# 보안 및 감사 기반 — 알려진 한계와 권장 후속 강화

> 대상 SPEC: [SPEC-ADMIN-SECAUDIT-001](../.moai/specs/SPEC-ADMIN-SECAUDIT-001/spec.md) — 관리자 보안 및 감사 기반(Security & Audit Foundation)
> 성격: 운영/보안 참조 문서. 본 문서는 SPEC-ADMIN-SECAUDIT-001의 M7 산출물로, 보안·감사 기반의 **알려진 한계(known limitations)** 와 **권장 후속 강화(recommended future hardening)** 를 기록한다.
> 근거 요구: REQ-ATTR-004, REQ-ATTR-005, spec §10. 관련 배경: spec §2(현재 인증), §5(R1 신원·귀속).

---

## 1. 관리자 신원·귀속의 한계 (REQ-ATTR-004)

### 현재 인증 구현 (spec §2.2)

- **이메일 허용목록 + 공유 비밀번호**: `lib/admins.ts`의 `isAllowedAdmin(email, password)`가 이메일을 `ADMIN_EMAILS` 허용목록과 대조하고, **모든 관리자가 공유하는 단일 `ADMIN_PASSWORD`** 와 비교한다. 관리자는 각자 자신의 이메일로 로그인하되 비밀번호는 하나를 공유한다.
- **세션**: `lib/session.ts`에서 `jose`로 서명한 httpOnly JWT 쿠키 `admin_session`을 사용한다. payload는 `{ email }`, 서명 알고리즘은 HS256, TTL 12시간이다.
- **행위자 취득**: 감사 로그의 `actor_email`은 클라이언트 입력이 아니라 `admin_session` JWT의 `email`에서만 취득한다(REQ-ATTR-001).

### 핵심 한계

비밀번호가 공유되므로, 감사 로그의 `actor_email`은 **검증된 신원(proof)이 아니라 자기 주장(claim)** 이다.

- 허용목록에 있는 이메일이면 **누구든** 그 이메일로 로그인하여 그 사람인 것처럼 행위를 귀속시킬 수 있다.
- 즉 `actor_email`은 "누가 했다고 주장되는가"를 나타낼 뿐, "그 사람이 반드시 했다"를 암호학적으로 보장하지 않는다.
- 세션 무결성은 단일 서명 비밀 `AUTH_SECRET`에 의존하므로, 이 비밀이 노출되면 임의의 `admin_session` JWT를 위조할 수 있다(아래 §2 참고).

### 위험 수용 (accepted risk)

- 이 한계는 현재 **명시적으로 수용된 위험(accepted risk)** 이다. 공유 `ADMIN_PASSWORD` 구조를 유지하는 한 `actor_email`은 강한 신원 증명이 아니다.
- **운영 권장**: 이 위험 수용에 대해 **승인권자 서명/승인 근거**(누가 이 위험을 언제 수용했는지)를 운영 문서에 남긴다.
- **UI/운영 표기**: 감사 로그 UI 또는 운영 문서에서 "행위자는 세션 이메일 기준이며, 공유 비밀번호 환경에서는 강한 신원 증명이 아니다"라는 취지를 명시한다.

---

## 2. AUTH_SECRET 관리 (REQ-ATTR-004 배경)

세션 무결성은 단일 서명 비밀 `AUTH_SECRET`(32자 이상)에 전적으로 의존한다.

### 위험

- `AUTH_SECRET`이 노출되면 임의의 `admin_session` JWT를 위조할 수 있어, 허용목록에 있는 어떤 이메일로도 세션을 위조·귀속시킬 수 있다.

### 운영 절차

- **정기 로테이션**: `AUTH_SECRET`을 주기적으로 교체하는 절차를 운영 프로세스로 마련한다.
- **노출 시 즉시 대응**: 노출이 의심되면 즉시 비밀을 교체하고 **전 세션을 무효화**한다. 서명 비밀을 교체하면 기존에 발급된 모든 JWT가 검증에 실패하므로 자연히 무효화된다.
- **비밀 커밋 금지**: `.env.local`을 포함한 비밀 파일은 버전 관리에 커밋하지 않는다(기존 규칙 재확인).

---

## 3. 권장 후속 강화 — 비차단 (REQ-ATTR-005, spec §10)

아래 항목은 본 SPEC의 완료 조건이 **아니며**, 향후 별도 작업으로 권장되는 **비차단(non-blocking)** 후속 경로다.

### 3.1 관리자별 개별 자격증명 또는 SSO

- **관리자별 개별 자격증명 또는 SSO** 도입으로 `actor_email`을 자기 주장(claim)에서 **검증된 신원(proof)** 으로 승격한다. 이는 §1의 핵심 한계를 근본적으로 해소한다.
- 본 SPEC은 SSO/개별 비밀번호 구현을 요구하지 않으며, 이 작업은 **본 SPEC 범위 밖의 후속 작업**이다(spec §11 비목표 참고).

### 3.2 감사 로그 이상 탐지/알림

감사 로그에 대한 이상 징후를 감지·알림하는 체계를 후속으로 마련한다. 대상 신호 예시:

- **대량 마스킹 해제**(`pii.reveal`): 짧은 기간 내 다수의 원값 열람.
- **대량 비마스킹 내보내기**(`pii.export.unmasked`): 원값 포함 내보내기의 급증.
- **dangling `intent` 급증**: 종결(`completed`/`failed`)되지 않은 의도 항목이 비정상적으로 늘어나는 경우(의도는 기록되었으나 완료되지 않은 행위의 지속 신호).

---

## 4. 감사 기반 구성요소 포인터 (구현 현황)

아래는 감사 기반의 구성요소별 구현 현황이다. 앱-측(공유 DB 마이그레이션 비의존) 요소와 마이그레이션 적용(M1) 이후 통합 예정 요소를 구분한다.

### 4.1 구현·검증됨 (앱-측, M1 비의존)

| 구성요소 | 역할 |
|----------|------|
| `lib/audit.ts` | 행위 분류·순서 분기, `recordPostAction`/`withDestructiveAudit`, `assertNoRawPii` |
| `lib/adminSession.ts` | 행위자 귀속, `unknown` 폴백 제거(익명 귀속 금지) |
| `lib/mask.ts` | PII 마스킹 유틸리티 |
| `lib/auditWriter.ts` | 실 Supabase 어댑터(모의 단위테스트 기반) |
| `/audit`·`/users` UI | 스캐폴딩(모의 데이터) |

### 4.2 M1(공유 DB 마이그레이션 적용) 이후 통합 예정

| 항목 | 마일스톤 |
|------|----------|
| `verifyAction`의 구조화 감사 교체 | M3 |
| `/audit` 실데이터 연결 | M4 |
| 마스킹 해제 intent-first 적용 | M5 |
| 비마스킹 내보내기 보호 | M6 |

### 4.3 마이그레이션 위치 및 불변성

- **마이그레이션 정식 위치**: `slip/supabase/migrations/20260713000400_admin_audit_logs.sql` (공유 DB 소유 레포, **미적용** 상태).
- **불변성 강제**: `admin_audit_logs`의 append-only 특성은 `BEFORE UPDATE OR DELETE` 트리거로 DB 수준에서 강제된다(REQ-AUDIT-005). 이 마이그레이션은 SLIP 모바일 앱과 공유하는 프로덕션 DB에 대한 변경이므로, 적용 전 모바일/백엔드 팀과 조율이 필요하다(spec §9).

---

## 참고

- 상세 요구사항과 수용 기준: [SPEC-ADMIN-SECAUDIT-001 spec.md](../.moai/specs/SPEC-ADMIN-SECAUDIT-001/spec.md)
  - §2 배경 및 현재 상태 (현재 인증 구현)
  - §5 R1 관리자 신원 및 행위자 귀속 (REQ-ATTR-001~005)
  - §9 공유 프로덕션 DB 마이그레이션 / 조율 리스크
  - §10 권장 후속 강화 (비차단)
  - §11 Exclusions (비목표)
