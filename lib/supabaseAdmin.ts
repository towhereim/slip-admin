// service_role Supabase 클라이언트. RLS 를 우회하므로 절대 클라이언트로 번들되면
// 안 된다. `server-only` 가드가 클라이언트 번들 포함 시 빌드를 실패시킨다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// 환경변수는 함수 안에서 lazy 하게 읽어 모듈 로드 시 throw 하지 않는다(빌드 안전).
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
