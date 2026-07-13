// admin_audit_logs 테이블에 감사 항목을 기록하는 실제 Supabase 기반 AuditWriter.
// M3(verifyAction 재작성)가 사용할 seam 이며, 여기서는 어댑터만 정의한다(호출부 미연결).
// 기본 경로에서 service_role 클라이언트를 쓰므로 server-only 로 클라이언트 번들을 차단한다.
import "server-only";
import {
  assertNoRawPii,
  type AuditEntry,
  type AuditWriter,
} from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// 어댑터가 사용하는 insert 체인만 담은 최소 구조 타입. 실제 SupabaseClient 를
// 직접 요구하지 않아 테스트에서 fake 를 주입할 수 있다(라이브 연결 불필요).
export interface AuditInsertResult {
  error: { message: string } | null;
}

export interface MinimalSupabaseClient {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<AuditInsertResult>;
  };
}

const TABLE = "admin_audit_logs";

// @MX:ANCHOR: [AUTO] admin_audit_logs 로의 유일한 쓰기 경로(M3 감사 seam)
// @MX:REASON: AuditEntry→행 매핑·PII 사전 차단·실패 시 throw 계약이 여기 한 곳에 모여야
// 호출자(recordPostAction=삼킴, withDestructiveAudit=fail-closed)의 순서 정책이 성립한다.
export function createSupabaseAuditWriter(
  client?: MinimalSupabaseClient,
): AuditWriter {
  return {
    async write(entry: AuditEntry): Promise<void> {
      // correlationId 는 컬럼이 아니므로 metadata.correlationId 로 병합한다(spec §8).
      const metadata: Record<string, unknown> = { ...(entry.metadata ?? {}) };
      if (entry.correlationId) metadata.correlationId = entry.correlationId;

      // 영구·불변 로그이므로 원값 PII 유입을 사전 차단한다(REQ-AUDIT-010, 심층 방어).
      assertNoRawPii(metadata);

      const row = {
        actor_email: entry.actorEmail,
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId ?? null,
        metadata,
        outcome: entry.outcome,
      };

      const db = client ?? (getSupabaseAdmin() as unknown as MinimalSupabaseClient);
      const { error } = await db.from(TABLE).insert(row);
      if (error) throw new Error(`감사 로그 기록 실패: ${error.message}`);
    },
  };
}
