import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  asObject,
  formatConfidence,
  formatKrw,
  formatDateTime,
  isVerifiedStatus,
  pickNumber,
  pickString,
  STATUS_BADGE,
  STATUS_LABEL,
  VERIFIED_STATUSES,
  type VerifiedStatus,
} from "@/lib/ocr";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

interface CaptureRow {
  id: string;
  created_at: string | null;
  source: string | null;
  engine: string | null;
  ocr_confidence: number | null;
  parsed: unknown;
  verified_status: string;
}

const FILTERS: { value: string; label: string }[] = [
  { value: "unreviewed", label: "미검토" },
  { value: "all", label: "전체" },
  { value: "correct", label: "정확" },
  { value: "incorrect", label: "부정확" },
];

export default async function OcrListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "unreviewed";

  let rows: CaptureRow[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("ocr_captures")
      .select(
        "id, created_at, source, engine, ocr_confidence, parsed, verified_status",
      )
      // 낮은 신뢰도 우선 → 검수 우선순위. null 신뢰도는 먼저 보이게.
      .order("ocr_confidence", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);

    if (status !== "all" && isVerifiedStatus(status)) {
      query = query.eq("verified_status", status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows = (data ?? []) as CaptureRow[];
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "목록을 불러오지 못했습니다.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">OCR 검증 목록</h1>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <Link
              key={f.value}
              href={`/ocr?status=${f.value}`}
              className={
                "rounded-full px-3 py-1.5 text-sm font-medium transition " +
                (active
                  ? "bg-brand text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100")
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

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
                <th className="px-4 py-3 font-medium">생성일</th>
                <th className="px-4 py-3 font-medium">소스</th>
                <th className="px-4 py-3 font-medium">엔진</th>
                <th className="px-4 py-3 text-right font-medium">신뢰도</th>
                <th className="px-4 py-3 font-medium">가맹점</th>
                <th className="px-4 py-3 text-right font-medium">금액</th>
                <th className="px-4 py-3 font-medium">날짜</th>
                <th className="px-4 py-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-400" colSpan={8}>
                    캡처가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const parsed = asObject(row.parsed);
                  const merchant = pickString(parsed, "merchant") ?? "-";
                  const amount = pickNumber(parsed, "amount");
                  const date = pickString(parsed, "date") ?? "-";
                  const vs: VerifiedStatus = isVerifiedStatus(
                    row.verified_status,
                  )
                    ? row.verified_status
                    : "unreviewed";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-gray-700">
                        <Link
                          href={`/ocr/${row.id}`}
                          className="block text-brand hover:underline"
                        >
                          {formatDateTime(row.created_at)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.source ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.engine ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatConfidence(row.ocr_confidence)}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{merchant}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatKrw(amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{date}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-medium " +
                            STATUS_BADGE[vs]
                          }
                        >
                          {STATUS_LABEL[vs]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        신뢰도 낮은 순으로 최대 {LIST_LIMIT}건까지 표시합니다.
      </p>
    </div>
  );
}
