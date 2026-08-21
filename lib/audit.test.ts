import { describe, it, expect, vi } from "vitest";
import {
  classifyAction,
  recordPostAction,
  withDestructiveAudit,
  assertNoRawPii,
  AuditPiiError,
  InMemoryAuditWriter,
  NoopAuditWriter,
  type AuditWriter,
  type AuditEntry,
} from "@/lib/audit";

// 항상 throw 하는 writer (best-effort/실패 경로 검증용).
class ThrowingAuditWriter implements AuditWriter {
  async write(): Promise<void> {
    throw new Error("write 실패");
  }
}

// 특정 outcome 에서만 throw 하는 writer (intent 실패 등 세밀한 경로 검증용).
class SelectiveThrowingWriter implements AuditWriter {
  entries: AuditEntry[] = [];
  constructor(private readonly failOn: AuditEntry["outcome"]) {}
  async write(entry: AuditEntry): Promise<void> {
    if (entry.outcome === this.failOn) throw new Error(`${entry.outcome} 실패`);
    this.entries.push(entry);
  }
}

const base = {
  actorEmail: "a@slip.kr",
  action: "pii.reveal" as const,
  targetType: "profile" as const,
  targetId: "p1",
  metadata: { fields: ["bank_account"] },
};

describe("classifyAction (REQ-AUDIT-009)", () => {
  it("초기 통제 어휘를 결정론적으로 분류한다", () => {
    expect(classifyAction("ocr.verify")).toBe("non_destructive");
    expect(classifyAction("pii.export.masked")).toBe("non_destructive");
    expect(classifyAction("pii.reveal")).toBe("destructive_or_pii");
    expect(classifyAction("pii.export.unmasked")).toBe("destructive_or_pii");
  });

  it("알 수 없는 action 은 더 안전한 쪽(destructive_or_pii)으로 기본 분류한다", () => {
    expect(classifyAction("something.unknown")).toBe("destructive_or_pii");
    expect(classifyAction("")).toBe("destructive_or_pii");
  });
});

describe("recordPostAction (REQ-AUDIT-003 — 비파괴 사후 best-effort)", () => {
  it("completed outcome 1건을 기록한다", async () => {
    const writer = new InMemoryAuditWriter();
    await recordPostAction(writer, {
      actorEmail: "a@slip.kr",
      action: "ocr.verify",
      targetType: "ocr_capture",
      targetId: "o1",
      metadata: { from: "unreviewed", to: "correct" },
    });
    expect(writer.entries).toHaveLength(1);
    expect(writer.entries[0].outcome).toBe("completed");
    expect(writer.entries[0].actorEmail).toBe("a@slip.kr");
  });

  it("writer.write 가 throw 해도 실패 처리하지 않고 경고만 남긴다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const writer = new ThrowingAuditWriter();
    await expect(
      recordPostAction(writer, {
        actorEmail: "a@slip.kr",
        action: "ocr.verify",
        targetType: "ocr_capture",
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("withDestructiveAudit (REQ-AUDIT-006 — 의도 선기록 + fail-closed)", () => {
  it("정상 경로: 동일 correlationId 로 intent 와 completed 를 기록하고 action 을 1회 실행한다", async () => {
    const writer = new InMemoryAuditWriter();
    const action = vi.fn().mockResolvedValue("결과");

    const result = await withDestructiveAudit(writer, base, action);

    expect(result).toBe("결과");
    expect(action).toHaveBeenCalledTimes(1);
    expect(writer.entries).toHaveLength(2);
    const [intent, completed] = writer.entries;
    expect(intent.outcome).toBe("intent");
    expect(completed.outcome).toBe("completed");
    expect(intent.correlationId).toBeTruthy();
    expect(completed.correlationId).toBe(intent.correlationId);
  });

  it("intent 기록 실패: action 을 실행하지 않고 에러를 전파한다(fail-closed)", async () => {
    const writer = new SelectiveThrowingWriter("intent");
    const action = vi.fn().mockResolvedValue("결과");

    await expect(withDestructiveAudit(writer, base, action)).rejects.toThrow(
      "intent 실패",
    );
    expect(action).not.toHaveBeenCalled();
    expect(writer.entries).toHaveLength(0);
  });

  it("action 실패: intent 와 failed 를 기록하고 에러를 재전파하며 completed 는 남기지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const writer = new InMemoryAuditWriter();
    const action = vi.fn().mockRejectedValue(new Error("행위 실패"));

    await expect(withDestructiveAudit(writer, base, action)).rejects.toThrow(
      "행위 실패",
    );
    const outcomes = writer.entries.map((e) => e.outcome);
    expect(outcomes).toContain("intent");
    expect(outcomes).toContain("failed");
    expect(outcomes).not.toContain("completed");
    warn.mockRestore();
  });

  it("종결 기록(completed) 실패는 삼켜지고 action 결과는 유지된다(best-effort)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const writer = new SelectiveThrowingWriter("completed");
    const action = vi.fn().mockResolvedValue("결과");

    const result = await withDestructiveAudit(writer, base, action);

    expect(result).toBe("결과");
    // intent 는 기록되고 completed 는 삼켜짐
    expect(writer.entries.map((e) => e.outcome)).toEqual(["intent"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("assertNoRawPii (REQ-AUDIT-010 — metadata 원값 PII 금지)", () => {
  it("PII 값을 담은 metadata 는 throw 한다", () => {
    expect(() =>
      assertNoRawPii({ bank_account: "12345678" }),
    ).toThrow(AuditPiiError);
    expect(() => assertNoRawPii({ account_holder: "홍길동" })).toThrow(
      AuditPiiError,
    );
    expect(() => assertNoRawPii({ bank_name: "국민은행" })).toThrow(
      AuditPiiError,
    );
  });

  it("_enc 변형 키도 값이 있으면 throw 한다", () => {
    expect(() =>
      assertNoRawPii({ bank_account_enc: "deadbeef" }),
    ).toThrow(AuditPiiError);
  });

  it("비식별 맥락만 담은 metadata 는 통과한다", () => {
    expect(() =>
      assertNoRawPii({ fields: ["bank_account"], rowCount: 10 }),
    ).not.toThrow();
  });

  it("PII 키라도 값이 비어 있으면(null/빈문자열) 통과한다", () => {
    expect(() =>
      assertNoRawPii({ bank_account: null, account_holder: "" }),
    ).not.toThrow();
  });
});

describe("writer 구현체", () => {
  it("NoopAuditWriter 는 아무 것도 하지 않고 throw 하지 않는다", async () => {
    const writer = new NoopAuditWriter();
    await expect(
      writer.write({
        actorEmail: "a@slip.kr",
        action: "ocr.verify",
        targetType: "ocr_capture",
        metadata: {},
        outcome: "completed",
      }),
    ).resolves.toBeUndefined();
  });
});
