// 관리자 허용 목록 + 공유 비밀번호 검증. 환경변수는 호출 시점에 읽는다.
export function isAllowedAdmin(email: string, password: string): boolean {
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  const normalized = email.trim().toLowerCase();

  // 비밀번호가 비어 있으면(미설정) 어떤 로그인도 허용하지 않는다.
  if (adminPassword.length === 0) return false;
  return allow.includes(normalized) && password === adminPassword;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
