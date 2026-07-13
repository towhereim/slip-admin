// 관리자 감사 로그의 순수 로직 코어(REQ-AUDIT-002/003/006/009/010).
// supabase / next/headers 를 import 하지 않아 전부 단위 테스트 가능하며, 실제
// Supabase 기반 AuditWriter 는 의도적으로 M1 이후로 미룬다(여기서는 인터페이스만).

// 통제 어휘(spec §8). 확장 여지를 위해 문자열 union + 임의 문자열을 함께 허용한다.
export type AuditAction =
  | "ocr.verify"
  | "pii.reveal"
  | "pii.export.masked"
  | "pii.export.unmasked";

export type AuditTargetType = "ocr_capture" | "profile" | "export";

export type AuditOutcome = "intent" | "completed" | "failed";

// 행위 분류(REQ-AUDIT-009). 순서 정책(사후 best-effort vs 의도 선기록)을 결정한다.
export type AuditClass = "destructive_or_pii" | "non_destructive";

// 호출자가 제공하는 기본 감사 맥락(outcome/correlationId 는 헬퍼가 채운다).
export interface AuditBase {
  actorEmail: string;
  action: AuditAction | (string & {});
  targetType: AuditTargetType | (string & {});
  targetId?: string;
  // jsonb-safe 객체. 원값 PII 금지(REQ-AUDIT-010).
  metadata?: Record<string, unknown>;
}

// writer.write 로 전달되는 완결된 감사 항목. correlationId 는 최상위 필드이며,
// 실제 DB writer 가 spec §8 의 metadata.correlationId 로 병합한다.
export interface AuditEntry extends Omit<AuditBase, "metadata"> {
  metadata: Record<string, unknown>;
  outcome: AuditOutcome;
  correlationId?: string;
}

// 통제 어휘별 분류 맵(REQ-AUDIT-009). 순서 정책을 결정론적으로 고정한다.
const ACTION_CLASSIFICATION: Record<string, AuditClass> = {
  "ocr.verify": "non_destructive",
  "pii.export.masked": "non_destructive",
  "pii.reveal": "destructive_or_pii",
  "pii.export.unmasked": "destructive_or_pii",
};

// @MX:ANCHOR: [AUTO] 감사 순서 정책 분기의 단일 진실 소스
// @MX:REASON: 분류가 틀리면 파괴적/PII 행위가 fail-closed 경로를 건너뛰어 무음 노출이 발생한다.
// 알 수 없는 action 은 더 안전한 쪽(destructive_or_pii = 의도 선기록 + fail-closed)으로
// 기본 분류한다. 분류 없는 신규 action 이 실수로 비파괴 사후 경로를 타는 것을 막기 위함.
export function classifyAction(action: string): AuditClass {
  return ACTION_CLASSIFICATION[action] ?? "destructive_or_pii";
}

// 감사 항목을 기록하는 인터페이스(구현은 M1 이후 Supabase 기반으로 제공).
export interface AuditWriter {
  write(entry: AuditEntry): Promise<void>;
}

// 테스트/UI 모의용 인메모리 writer. 기록된 항목을 배열로 노출한다.
export class InMemoryAuditWriter implements AuditWriter {
  readonly entries: AuditEntry[] = [];
  async write(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

// 아무 것도 기록하지 않는 writer.
export class NoopAuditWriter implements AuditWriter {
  async write(_entry: AuditEntry): Promise<void> {}
}

// metadata 에 담긴 원값 PII 를 감지했을 때 발생하는 오류(REQ-AUDIT-010).
export class AuditPiiError extends Error {
  constructor(key: string) {
    super(`감사 metadata 에 PII 원값이 포함될 수 없습니다: ${key}`);
    this.name = "AuditPiiError";
  }
}

// metadata 에 값이 채워진 PII 성 키가 있으면 throw 한다(REQ-AUDIT-010).
// 감사 로그는 불변·영구이므로 [HARD] 로 원값 유입을 사전 차단한다.
const PII_KEYS = [
  "bank_name",
  "bank_account",
  "account_holder",
  "bank_name_enc",
  "bank_account_enc",
  "account_holder_enc",
];

export function assertNoRawPii(metadata: Record<string, unknown>): void {
  for (const key of PII_KEYS) {
    const value = metadata[key];
    if (value !== undefined && value !== null && value !== "") {
      throw new AuditPiiError(key);
    }
  }
}

// 감사 실패를 삼키고 경고만 남기는 내부 헬퍼(best-effort 경로 공용).
async function safeWrite(writer: AuditWriter, entry: AuditEntry): Promise<void> {
  try {
    await writer.write(entry);
  } catch (err) {
    console.warn("[audit] 감사 기록 실패 (무시됨):", entry.action, err);
  }
}

// 비파괴 행위: 본 행위 이후 completed 1건을 best-effort 로 기록한다(REQ-AUDIT-003).
// 기록이 실패해도 절대 rethrow 하지 않는다(본 행위를 실패 처리하지 않음).
export async function recordPostAction(
  writer: AuditWriter,
  base: AuditBase,
): Promise<void> {
  await safeWrite(writer, {
    ...base,
    metadata: base.metadata ?? {},
    outcome: "completed",
  });
}

// 파괴적/PII 행위: 의도 선기록 + 실패 시 중단(REQ-AUDIT-006).
// (a) intent 를 먼저 기록 — 이 기록이 실패하면 action 을 실행하지 않고 rethrow(fail-closed).
// (b) action 실행 → 성공 시 completed(best-effort), 실패 시 failed(best-effort) 후 rethrow.
// intent↔종결 은 동일 correlationId 로 연결한다.
export async function withDestructiveAudit<T>(
  writer: AuditWriter,
  base: AuditBase,
  action: () => Promise<T>,
): Promise<T> {
  const correlationId = crypto.randomUUID();
  const metadata = base.metadata ?? {};

  // (a) 의도 선기록: 실패하면 그대로 전파되어 action 이 실행되지 않는다.
  await writer.write({ ...base, metadata, outcome: "intent", correlationId });

  let result: T;
  try {
    // (b) 본 행위 실행.
    result = await action();
  } catch (err) {
    // 실패 종결(best-effort) 후 원래 에러 재전파.
    await safeWrite(writer, {
      ...base,
      metadata,
      outcome: "failed",
      correlationId,
    });
    throw err;
  }

  // 성공 종결(best-effort). 실패해도 action 결과는 유지된다.
  await safeWrite(writer, {
    ...base,
    metadata,
    outcome: "completed",
    correlationId,
  });
  return result;
}
