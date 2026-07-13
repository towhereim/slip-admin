// profiles 은행 PII 마스킹 유틸(REQ-PII-001, REQ-PII-002).
// 순수 함수 모음이며 표현(JSX)에 의존하지 않는다. 목록/상세/검색/내보내기 등
// 열거된 표면에서 재사용한다. 원값 전체가 노출되지 않도록 보장한다.

const HIDDEN = "●";

// 계좌번호: 마지막 4자리만 노출, 나머지는 가린다. 4자 이하면 전체를 가린다.
export function maskBankAccount(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  if (s.length <= 4) return HIDDEN.repeat(s.length);
  return HIDDEN.repeat(s.length - 4) + s.slice(-4);
}

// 은행명: 첫 글자만 노출, 나머지는 가린다. 한 글자면 전체를 가린다.
export function maskBankName(v: string | null | undefined): string {
  return maskKeepFirst(v);
}

// 예금주: 첫 글자만 노출, 나머지는 가린다. 한 글자면 전체를 가린다.
export function maskAccountHolder(v: string | null | undefined): string {
  return maskKeepFirst(v);
}

// 첫 글자만 남기고 마스킹. 길이 1 이하는 원값 노출을 막기 위해 전체를 가린다.
function maskKeepFirst(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  if (s.length <= 1) return HIDDEN;
  return s[0] + HIDDEN.repeat(s.length - 1);
}

// 마스킹 대상 3필드 + 절대 노출 금지인 _enc(bytea) 변형 3필드.
type ProfilePiiFields = {
  bank_name?: string | null;
  bank_account?: string | null;
  account_holder?: string | null;
  bank_name_enc?: unknown;
  bank_account_enc?: unknown;
  account_holder_enc?: unknown;
};

// profile 의 얕은 복사본을 만들어 은행 3필드를 마스킹하고, _enc 변형은 결과에서
// 제거한다(어떤 표면에도 노출되지 않도록). 원본 객체는 변경하지 않는다.
export function maskProfilePii<T extends ProfilePiiFields>(
  profile: T,
): Omit<T, keyof ProfilePiiFields> & {
  bank_name: string;
  bank_account: string;
  account_holder: string;
} {
  const {
    bank_name,
    bank_account,
    account_holder,
    bank_name_enc: _bankNameEnc,
    bank_account_enc: _bankAccountEnc,
    account_holder_enc: _accountHolderEnc,
    ...rest
  } = profile;

  return {
    ...(rest as Omit<T, keyof ProfilePiiFields>),
    bank_name: maskBankName(bank_name),
    bank_account: maskBankAccount(bank_account),
    account_holder: maskAccountHolder(account_holder),
  };
}
