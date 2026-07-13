import { describe, it, expect, vi } from "vitest";
import { createSupabaseAuditWriter } from "@/lib/auditWriter";
import { AuditPiiError, type AuditEntry } from "@/lib/audit";

// insert 호출을 기록하고 지정한 응답을 돌려주는 최소 fake Supabase 클라이언트.
function makeFakeClient(response: { error: { message: string } | null } = { error: null }) {
  const insert = vi.fn(async (_row: Record<string, unknown>) => response);
  const from = vi.fn(() => ({ insert }));
  return { client: { from }, from, insert };
}

const baseEntry: AuditEntry = {
  actorEmail: "admin@slip.kr",
  action: "pii.reveal",
  targetType: "profile",
  targetId: "profile-123",
  metadata: { fields: ["bank_account"] },
  outcome: "intent",
  correlationId: "corr-abc",
};

describe("createSupabaseAuditWriter (SPEC-ADMIN-SECAUDIT-001 §8)", () => {
  it("camelCase AuditEntry 를 snake_case admin_audit_logs 행으로 매핑한다", async () => {
    const { client, from, insert } = makeFakeClient();
    const writer = createSupabaseAuditWriter(client);

    await writer.write({
      actorEmail: "admin@slip.kr",
      action: "ocr.verify",
      targetType: "ocr_capture",
      targetId: "cap-1",
      metadata: { status: "verified" },
      outcome: "completed",
    });

    expect(from).toHaveBeenCalledWith("admin_audit_logs");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      actor_email: "admin@slip.kr",
      action: "ocr.verify",
      target_type: "ocr_capture",
      target_id: "cap-1",
      metadata: { status: "verified" },
      outcome: "completed",
    });
  });

  it("correlationId 를 metadata.correlationId 로 병합하고 최상위 컬럼으로는 내보내지 않는다", async () => {
    const { client, insert } = makeFakeClient();
    const writer = createSupabaseAuditWriter(client);

    await writer.write(baseEntry);

    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    const metadata = row.metadata as Record<string, unknown>;
    expect(metadata.correlationId).toBe("corr-abc");
    expect(metadata.fields).toEqual(["bank_account"]);
    // 최상위에는 correlationId / correlation_id 컬럼이 없어야 한다(스키마에 없음).
    expect("correlationId" in row).toBe(false);
    expect("correlation_id" in row).toBe(false);
  });

  it("targetId 가 없으면 target_id 는 null 이다", async () => {
    const { client, insert } = makeFakeClient();
    const writer = createSupabaseAuditWriter(client);

    await writer.write({
      actorEmail: "admin@slip.kr",
      action: "pii.export.masked",
      targetType: "export",
      metadata: {},
      outcome: "completed",
    });

    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.target_id).toBeNull();
  });

  it("metadata 에 원값 PII 키가 있으면 AuditPiiError 로 거부하고 insert 하지 않는다 (REQ-AUDIT-010)", async () => {
    const { client, insert } = makeFakeClient();
    const writer = createSupabaseAuditWriter(client);

    await expect(
      writer.write({
        actorEmail: "admin@slip.kr",
        action: "pii.reveal",
        targetType: "profile",
        targetId: "p1",
        metadata: { bank_account: "110-222-333444" },
        outcome: "intent",
      }),
    ).rejects.toBeInstanceOf(AuditPiiError);

    expect(insert).not.toHaveBeenCalled();
  });

  it("Supabase 가 error 를 반환하면 메시지를 담은 Error 로 거부한다", async () => {
    const { client } = makeFakeClient({ error: { message: "duplicate key value" } });
    const writer = createSupabaseAuditWriter(client);

    await expect(writer.write(baseEntry)).rejects.toThrow(/duplicate key value/);
  });

  it("성공 시(error: null) void 로 resolve 하고 insert 를 정확히 1회 호출한다", async () => {
    const { client, insert } = makeFakeClient({ error: null });
    const writer = createSupabaseAuditWriter(client);

    await expect(writer.write(baseEntry)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("주입된 fake 클라이언트를 사용한다(getSupabaseAdmin 미호출: 실제 env 없이 동작)", async () => {
    const { client, insert } = makeFakeClient();
    const writer = createSupabaseAuditWriter(client);

    // Supabase env 를 구성하지 않았음에도 throw 없이 동작하면 주입 경로가 쓰인 것.
    await expect(writer.write(baseEntry)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
