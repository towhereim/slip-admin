// 관리자 세션 JWT 서명/검증. jose 만 의존하므로 Edge 런타임(middleware)에서도
// 동작한다. server-only / supabase 를 import 하지 않는다(그러면 Edge 번들이 깨진다).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12시간

export interface SessionPayload {
  email: string;
}

// AUTH_SECRET 은 함수 안에서 lazy 하게 읽는다(모듈 로드 시 throw 금지 → 빌드 안전).
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET 환경변수가 없거나 32자 미만입니다.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

// 유효하면 payload, 아니면 null. AUTH_SECRET 미설정/서명 불일치/만료 모두 null.
export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.email === "string" && payload.email.length > 0) {
      return { email: payload.email };
    }
    return null;
  } catch {
    return null;
  }
}
