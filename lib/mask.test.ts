import { describe, it, expect } from "vitest";
import {
  maskBankAccount,
  maskBankName,
  maskAccountHolder,
  maskProfilePii,
} from "@/lib/mask";

describe("maskBankAccount (REQ-PII-001)", () => {
  it("긴 계좌번호는 마지막 4자리만 노출하고 나머지는 가린다", () => {
    expect(maskBankAccount("12345678")).toBe("●●●●5678");
  });

  it("4자 이하 계좌는 전체를 가린다(원값 노출 금지)", () => {
    expect(maskBankAccount("1234")).toBe("●●●●");
    expect(maskBankAccount("12")).toBe("●●");
  });

  it("null/빈 값은 빈 문자열을 반환한다", () => {
    expect(maskBankAccount(null)).toBe("");
    expect(maskBankAccount(undefined)).toBe("");
    expect(maskBankAccount("")).toBe("");
  });
});

describe("maskBankName (REQ-PII-001)", () => {
  it("첫 글자만 노출하고 나머지는 가린다", () => {
    expect(maskBankName("국민은행")).toBe("국●●●");
  });

  it("한 글자 이름은 완전히 가린다", () => {
    expect(maskBankName("A")).toBe("●");
  });

  it("null/빈 값은 빈 문자열을 반환한다", () => {
    expect(maskBankName(null)).toBe("");
    expect(maskBankName(undefined)).toBe("");
    expect(maskBankName("")).toBe("");
  });
});

describe("maskAccountHolder (REQ-PII-001)", () => {
  it("첫 글자만 노출하고 나머지는 가린다", () => {
    expect(maskAccountHolder("홍길동")).toBe("홍●●");
  });

  it("한 글자 예금주는 완전히 가린다", () => {
    expect(maskAccountHolder("김")).toBe("●");
  });

  it("null/빈 값은 빈 문자열을 반환한다", () => {
    expect(maskAccountHolder(null)).toBe("");
    expect(maskAccountHolder("")).toBe("");
  });
});

describe("maskProfilePii (REQ-PII-001, REQ-PII-002)", () => {
  it("세 은행 필드를 마스킹하고 다른 필드는 보존한다", () => {
    const profile = {
      id: "p1",
      name: "홍길동",
      bank_name: "국민은행",
      bank_account: "12345678",
      account_holder: "홍길동",
    };
    const masked = maskProfilePii(profile);
    expect(masked.id).toBe("p1");
    expect(masked.name).toBe("홍길동");
    expect(masked.bank_name).toBe("국●●●");
    expect(masked.bank_account).toBe("●●●●5678");
    expect(masked.account_holder).toBe("홍●●");
  });

  it("_enc(bytea) 변형 컬럼은 결과에 절대 노출되지 않는다", () => {
    const profile = {
      id: "p1",
      bank_name: "국민은행",
      bank_account: "12345678",
      account_holder: "홍길동",
      bank_name_enc: new Uint8Array([1, 2, 3]),
      bank_account_enc: new Uint8Array([4, 5, 6]),
      account_holder_enc: new Uint8Array([7, 8, 9]),
    };
    const masked = maskProfilePii(profile) as Record<string, unknown>;
    expect("bank_name_enc" in masked).toBe(false);
    expect("bank_account_enc" in masked).toBe(false);
    expect("account_holder_enc" in masked).toBe(false);
  });

  it("원본 객체를 변경하지 않는다(shallow copy)", () => {
    const profile = {
      id: "p1",
      bank_account: "12345678",
      bank_name: "국민은행",
      account_holder: "홍길동",
    };
    maskProfilePii(profile);
    expect(profile.bank_account).toBe("12345678");
  });
});
