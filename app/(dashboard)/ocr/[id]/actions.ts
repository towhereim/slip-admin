"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { isVerifiedStatus } from "@/lib/ocr";

// 세 버튼(정확/부정확/미검토로)이 하나의 form 을 공유한다. 클릭한 submit 버튼의
// name="status" value 가 전송된다. verified_by 는 관리자가 profiles 행이 아니므로
// null 로 두고, 감사용으로 관리자 이메일을 verified_note 앞에 붙인다.
export async function verifyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!id || !isVerifiedStatus(status)) return;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const adminEmail = session?.email ?? "unknown";

  const prefix = `[admin:${adminEmail}]`;
  const verified_note = note ? `${prefix} ${note}` : prefix;

  const supabase = getSupabaseAdmin();
  await supabase
    .from("ocr_captures")
    .update({
      verified_status: status,
      verified_at: new Date().toISOString(),
      verified_by: null,
      verified_note,
    })
    .eq("id", id);

  revalidatePath(`/ocr/${id}`);
}
