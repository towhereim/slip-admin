// 관리자 세션에서 행위자 이메일을 확정하는 중앙 헬퍼(REQ-ATTR-001/002/003).
// next/headers 에 의존하므로 서버 컨텍스트 전용이다. supabase 는 import 하지 않는다.
import "server-only";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

// 유효한 관리자 세션을 확인할 수 없을 때 발생하는 오류(REQ-ATTR-003).
// "unknown" 등 자리표시자 귀속을 남기지 않도록 fail-closed 로 throw 한다.
export class AdminSessionError extends Error {
  constructor(message = "유효한 관리자 세션이 없습니다.") {
    super(message);
    this.name = "AdminSessionError";
  }
}

// 세션 검증기 시그니처(테스트 주입용). 기본값은 lib/session 의 verifySession.
type VerifyFn = (token: string) => Promise<{ email: string } | null>;

// 토큰 → 이메일 정규화(순수 로직). 쿠키 읽기와 분리해 단위 테스트 가능하게 한다.
// 토큰이 없으면 verify 를 호출하지 않고 null 을 반환한다.
export async function resolveAdminEmail(
  token: string | undefined,
  verify: VerifyFn = verifySession,
): Promise<string | null> {
  if (!token) return null;
  const session = await verify(token);
  return session?.email ?? null;
}

// admin_session 쿠키에서 토큰을 읽는 얇은 래퍼(next/headers 경계).
async function readSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

// 현재 세션의 관리자 이메일 또는 null. 기존 중복 getAdminEmail 헬퍼를 일원화한다.
export async function getAdminEmail(): Promise<string | null> {
  return resolveAdminEmail(await readSessionToken());
}

// 감사 대상 행위의 행위자 확정. 유효 세션이 없으면 AdminSessionError 를 throw 한다.
// REQ-ATTR-003: "unknown" 폴백 금지 — 익명/위조 귀속을 남기지 않는 fail-closed.
export async function requireAdminEmail(): Promise<string> {
  const email = await getAdminEmail();
  if (!email) throw new AdminSessionError();
  return email;
}
