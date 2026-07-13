"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedAdmin, normalizeEmail } from "@/lib/admins";
import { signSession, SESSION_COOKIE } from "@/lib/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!isAllowedAdmin(email, password)) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  const token = await signSession(normalizeEmail(email));
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  // 성공 시 대시보드로. redirect 는 예외를 던지므로 이 아래 코드는 실행되지 않는다.
  redirect("/");
}
