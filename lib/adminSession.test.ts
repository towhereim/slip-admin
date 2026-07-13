import { describe, it, expect, vi, beforeEach } from "vitest";

// next/headers 의 cookies() 를 모킹한다(요청 스코프 없이 테스트하기 위함).
let mockToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "admin_session" && mockToken !== undefined
        ? { value: mockToken }
        : undefined,
  }),
}));

import { signSession } from "@/lib/session";
import {
  resolveAdminEmail,
  getAdminEmail,
  requireAdminEmail,
  AdminSessionError,
} from "@/lib/adminSession";

beforeEach(() => {
  mockToken = undefined;
  process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long!!";
});

describe("resolveAdminEmail (REQ-ATTR-001, 002)", () => {
  it("유효한 세션이면 이메일을 반환한다(주입된 verify 사용)", async () => {
    const verify = vi.fn().mockResolvedValue({ email: "a@slip.kr" });
    const email = await resolveAdminEmail("tok", verify);
    expect(email).toBe("a@slip.kr");
    expect(verify).toHaveBeenCalledWith("tok");
  });

  it("세션 검증이 null 이면 null 을 반환한다", async () => {
    const verify = vi.fn().mockResolvedValue(null);
    expect(await resolveAdminEmail("tok", verify)).toBeNull();
  });

  it("토큰이 없으면 verify 를 호출하지 않고 null 을 반환한다", async () => {
    const verify = vi.fn();
    expect(await resolveAdminEmail(undefined, verify)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("getAdminEmail (REQ-ATTR-003)", () => {
  it("세션 쿠키가 없으면 null 을 반환한다", async () => {
    mockToken = undefined;
    expect(await getAdminEmail()).toBeNull();
  });

  it("유효한 세션 쿠키가 있으면 이메일을 반환한다", async () => {
    mockToken = await signSession("a@slip.kr");
    expect(await getAdminEmail()).toBe("a@slip.kr");
  });
});

describe("requireAdminEmail (REQ-ATTR-003 — fail-closed 귀속)", () => {
  it("유효한 세션이 없으면 AdminSessionError 를 throw 한다('unknown' 폴백 금지)", async () => {
    mockToken = undefined;
    await expect(requireAdminEmail()).rejects.toBeInstanceOf(AdminSessionError);
  });

  it("위조/무효 토큰이면 AdminSessionError 를 throw 한다", async () => {
    mockToken = "invalid.jwt.token";
    await expect(requireAdminEmail()).rejects.toBeInstanceOf(AdminSessionError);
  });

  it("유효한 세션이면 이메일을 반환한다", async () => {
    mockToken = await signSession("a@slip.kr");
    expect(await requireAdminEmail()).toBe("a@slip.kr");
  });
});
