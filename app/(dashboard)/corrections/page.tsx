import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatDateTime } from "@/lib/ocr";
import { ConfirmButton } from "./ConfirmButton";
import {
  createCorrection,
  updateCorrection,
  toggleCorrection,
  deleteCorrection,
} from "./actions";

export const dynamic = "force-dynamic";

interface CorrectionRow {
  id: string;
  wrong_text: string;
  correct_text: string;
  enabled: boolean;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// 서버 액션이 리다이렉트로 넘겨준 error 쿼리를 사람이 읽을 문구로 변환.
const ERROR_MESSAGES: Record<string, string> = {
  duplicate: "이미 등록된 오독 원문이에요. 다른 값을 입력해 주세요.",
  empty: "오독 원문과 보정값을 모두 입력해 주세요.",
  unknown: "저장 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
};

export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const banner = sp.error ? ERROR_MESSAGES[sp.error] ?? null : null;

  let rows: CorrectionRow[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ocr_corrections")
      .select("id, wrong_text, correct_text, enabled, note, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as CorrectionRow[];
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "목록을 불러오지 못했습니다.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">유의어 사전</h1>
      </div>

      <p className="text-sm text-gray-500">
        OCR 오독 원문을 올바른 값으로 자동 보정하기 위한 사전입니다. 오독 원문은
        공백/대소문자를 무시하고 중복될 수 없습니다.
      </p>

      {banner ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {banner}
        </div>
      ) : null}

      {/* 추가 폼 */}
      <section className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">추가</h2>
        <form
          action={createCorrection}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-500">오독 원문</span>
            <input
              type="text"
              name="wrong_text"
              required
              placeholder="예: 스타박스"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-500">보정값</span>
            <input
              type="text"
              name="correct_text"
              required
              placeholder="예: 스타벅스"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-500">메모 (선택)</span>
            <input
              type="text"
              name="note"
              placeholder="비고"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            추가
          </button>
        </form>
      </section>

      {errorMessage ? (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
          목록을 불러오지 못했어요. 환경변수(Supabase) 설정을 확인해 주세요.
          <div className="mt-1 font-mono text-xs text-amber-600">
            {errorMessage}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">오독 원문</th>
                <th className="px-4 py-3 font-medium">보정값</th>
                <th className="px-4 py-3 font-medium">사용여부</th>
                <th className="px-4 py-3 font-medium">메모</th>
                <th className="px-4 py-3 font-medium">등록일</th>
                <th className="px-4 py-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-400" colSpan={6}>
                    등록된 유의어가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 align-top last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.wrong_text}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.correct_text}
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleCorrection}>
                        <input type="hidden" name="id" value={row.id} />
                        <input
                          type="hidden"
                          name="enabled"
                          value={String(row.enabled)}
                        />
                        <button
                          type="submit"
                          className={
                            "rounded-full px-2.5 py-0.5 text-xs font-medium transition hover:opacity-80 " +
                            (row.enabled
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500")
                          }
                          title="클릭하여 사용여부를 전환합니다"
                        >
                          {row.enabled ? "사용중" : "중지"}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.note ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <details className="group">
                          <summary className="cursor-pointer text-xs font-medium text-brand hover:underline">
                            수정
                          </summary>
                          <form
                            action={updateCorrection}
                            className="mt-2 flex flex-col gap-2 rounded-lg bg-gray-50 p-3 ring-1 ring-gray-200"
                          >
                            <input type="hidden" name="id" value={row.id} />
                            <input
                              type="text"
                              name="wrong_text"
                              defaultValue={row.wrong_text}
                              required
                              placeholder="오독 원문"
                              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                            <input
                              type="text"
                              name="correct_text"
                              defaultValue={row.correct_text}
                              required
                              placeholder="보정값"
                              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                            <input
                              type="text"
                              name="note"
                              defaultValue={row.note ?? ""}
                              placeholder="메모 (선택)"
                              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                            <button
                              type="submit"
                              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                            >
                              저장
                            </button>
                          </form>
                        </details>

                        <form action={deleteCorrection}>
                          <input type="hidden" name="id" value={row.id} />
                          <ConfirmButton
                            message="이 항목을 삭제할까요?"
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            삭제
                          </ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        최신 등록순으로 전체 항목을 표시합니다.
      </p>
    </div>
  );
}
