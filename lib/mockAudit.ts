// ⚠️ DEV MOCK — M1(공유 프로덕션 DB 마이그레이션) 이후 실제 Supabase 기반
// AuditReader 로 교체될 임시 픽스처다. supabase 를 import 하지 않으며, /audit
// 스캐폴딩 화면(REQ-AUDIT-007)이 모의 데이터로 정합화·PII 안전 렌더를 시연하는
// 용도로만 존재한다. 실제 감사 조회는 M1 승인 후 붙는다.

import type { AuditEntry } from "@/lib/audit";

// 화면 렌더에 필요한 표시용 필드(id, created_at)를 AuditEntry 에 덧붙인 행 타입.
// 실제 테이블(spec §8)에는 id/created_at 컬럼이 존재하지만 순수 코어 타입에는
// 없으므로 UI 레이어에서만 확장한다.
export interface AuditRow extends AuditEntry {
  id: string;
  created_at: string;
}

// intent↔종결 정합화 시연을 위해 correlationId 를 공유하는 쌍을 포함한다.
// - ocr.verify(completed): 비파괴 사후 단건
// - pii.reveal(intent→completed): 파괴적/PII, 정상 정합화
// - pii.export.unmasked(intent→failed): 파괴적/PII, 실패 정합화
// - pii.reveal(intent 단독): dangling intent(미완료 신호)
// - pii.export.masked(completed): 비파괴 권장 기록
const CORR_REVEAL_OK = "c1a11111-1111-4111-8111-111111111111";
const CORR_EXPORT_FAIL = "c2b22222-2222-4222-8222-222222222222";
const CORR_REVEAL_DANGLING = "c3c33333-3333-4333-8333-333333333333";

// 최신순 정렬은 화면에서 수행하므로 여기서는 시간 순서만 자연스럽게 둔다.
export const MOCK_AUDIT_ROWS: AuditRow[] = [
  {
    id: "a1",
    created_at: "2026-07-13T09:12:00+09:00",
    actorEmail: "admin.kim@slip.kr",
    action: "ocr.verify",
    targetType: "ocr_capture",
    targetId: "ocr_8f2a",
    outcome: "completed",
    // 원값 PII 없음. 이전/이후 상태만 기록(REQ-AUDIT-004/010).
    metadata: { from: "unreviewed", to: "correct" },
  },
  {
    id: "a2",
    created_at: "2026-07-13T10:03:00+09:00",
    actorEmail: "admin.lee@slip.kr",
    action: "pii.reveal",
    targetType: "profile",
    targetId: "prof_5c7d",
    outcome: "intent",
    correlationId: CORR_REVEAL_OK,
    // 열람한 필드명만. 원값 금지(REQ-AUDIT-010).
    metadata: { correlationId: CORR_REVEAL_OK, fields: ["bank_account"] },
  },
  {
    id: "a3",
    created_at: "2026-07-13T10:03:01+09:00",
    actorEmail: "admin.lee@slip.kr",
    action: "pii.reveal",
    targetType: "profile",
    targetId: "prof_5c7d",
    outcome: "completed",
    correlationId: CORR_REVEAL_OK,
    metadata: { correlationId: CORR_REVEAL_OK, fields: ["bank_account"] },
  },
  {
    id: "a4",
    created_at: "2026-07-13T11:20:00+09:00",
    actorEmail: "admin.kim@slip.kr",
    action: "pii.export.unmasked",
    targetType: "export",
    // 내보내기는 특정 대상 id 가 없다(target_id null 허용, spec §8).
    outcome: "intent",
    correlationId: CORR_EXPORT_FAIL,
    // 대상 범위/행 수 등 비식별 맥락만(REQ-PII-005/AUDIT-010).
    metadata: { correlationId: CORR_EXPORT_FAIL, scope: "project:evt_2f", rows: 128 },
  },
  {
    id: "a5",
    created_at: "2026-07-13T11:20:05+09:00",
    actorEmail: "admin.kim@slip.kr",
    action: "pii.export.unmasked",
    targetType: "export",
    outcome: "failed",
    correlationId: CORR_EXPORT_FAIL,
    metadata: { correlationId: CORR_EXPORT_FAIL, scope: "project:evt_2f", rows: 128 },
  },
  {
    id: "a6",
    created_at: "2026-07-13T13:41:00+09:00",
    actorEmail: "admin.park@slip.kr",
    action: "pii.reveal",
    targetType: "profile",
    targetId: "prof_9a1e",
    outcome: "intent",
    correlationId: CORR_REVEAL_DANGLING,
    // 종결 항목이 없는 dangling intent → "미완료/시도"로 표시되어야 한다.
    metadata: { correlationId: CORR_REVEAL_DANGLING, fields: ["account_holder"] },
  },
  {
    id: "a7",
    created_at: "2026-07-13T14:05:00+09:00",
    actorEmail: "admin.park@slip.kr",
    action: "pii.export.masked",
    targetType: "export",
    outcome: "completed",
    metadata: { scope: "project:evt_7c", rows: 342, format: "csv" },
  },
];
