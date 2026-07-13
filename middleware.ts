// 모든 라우트를 보호한다. /login 과 정적 자산만 예외. admin_session 쿠키의 JWT 를
// jose 로 검증(Edge 런타임)하고, 없거나 유효하지 않으면 /login 으로 리다이렉트.
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 로그인 페이지는 통과시킨다.
  if (pathname === "/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // _next 정적/이미지, favicon, 흔한 이미지 확장자는 미들웨어에서 제외.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
