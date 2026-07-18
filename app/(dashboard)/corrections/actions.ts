"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isMatchType, type MatchType } from "@/lib/ocr";

// OCR 유의어(오독 보정) 사전 CRUD. 모두 service_role 클라이언트로 RLS 를 우회한다.
// wrong_text 는 lower(btrim(...)) 유니크 인덱스가 걸려 있어, 정규화 형태가 겹치면
// Postgres 가 23505 를 던진다. 이 경우 친절한 한국어 안내로 리다이렉트한다.

const DUP_CODE = "23505";

// match_type 폼값을 검증한다. 미지정/이상값은 기본 'exact'.
function readMatchType(formData: FormData): MatchType {
  const v = String(formData.get("match_type") ?? "").trim();
  return isMatchType(v) ? v : "exact";
}

// 오독 원문 신규 등록.
export async function createCorrection(formData: FormData): Promise<void> {
  const wrong = String(formData.get("wrong_text") ?? "").trim();
  const correct = String(formData.get("correct_text") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const matchType = readMatchType(formData);

  if (!wrong || !correct) {
    redirect("/corrections?error=empty");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("ocr_corrections").insert({
    wrong_text: wrong,
    correct_text: correct,
    note: note || null,
    match_type: matchType,
  });

  if (error) {
    if (error.code === DUP_CODE) redirect("/corrections?error=duplicate");
    redirect("/corrections?error=unknown");
  }

  revalidatePath("/corrections");
  redirect("/corrections");
}

// 오독 원문/보정값/메모/일치유형 수정.
export async function updateCorrection(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const wrong = String(formData.get("wrong_text") ?? "").trim();
  const correct = String(formData.get("correct_text") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const matchType = readMatchType(formData);

  if (!id) return;
  if (!wrong || !correct) {
    redirect("/corrections?error=empty");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ocr_corrections")
    .update({
      wrong_text: wrong,
      correct_text: correct,
      note: note || null,
      match_type: matchType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.code === DUP_CODE) redirect("/corrections?error=duplicate");
    redirect("/corrections?error=unknown");
  }

  revalidatePath("/corrections");
  redirect("/corrections");
}

// 사용여부 토글. 현재 값을 hidden 으로 받아 반대로 저장한다.
export async function toggleCorrection(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const current = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;

  const supabase = getSupabaseAdmin();
  await supabase
    .from("ocr_corrections")
    .update({ enabled: !current, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/corrections");
}

// 삭제.
export async function deleteCorrection(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = getSupabaseAdmin();
  await supabase.from("ocr_corrections").delete().eq("id", id);

  revalidatePath("/corrections");
}
