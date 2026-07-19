import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateReadSasUrl } from "@/lib/azure";
import { verifyAction } from "./actions";
import {
  asObject,
  diffParsedCorrected,
  formatConfidence,
  formatDateTime,
  formatKrw,
  isVerifiedStatus,
  pickNumber,
  pickString,
  STATUS_BADGE,
  STATUS_LABEL,
  type VerifiedStatus,
} from "@/lib/ocr";

export const dynamic = "force-dynamic";

interface CaptureDetail {
  id: string;
  receipt_id: string | null;
  event_id: string | null;
  source: string | null;
  engine: string | null;
  raw_text: string | null;
  raw_blocks: unknown;
  parsed: unknown;
  corrected: unknown;
  corrected_at: string | null;
  ocr_confidence: number | null;
  verified_status: string;
  verified_at: string | null;
  verified_note: string | null;
  created_at: string | null;
}

interface ReceiptRow {
  id: string;
  photo_path: string | null;
  merchant: string | null;
  amount: number | null;
  receipt_date: string | null;
  status: string | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-gray-900">
        {value}
      </span>
    </div>
  );
}

export default async function OcrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let capture: CaptureDetail | null = null;
  let receipt: ReceiptRow | null = null;
  let imageUrl: string | null = null;
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data: cap, error: capErr } = await supabase
      .from("ocr_captures")
      .select(
        "id, receipt_id, event_id, source, engine, raw_text, raw_blocks, parsed, corrected, corrected_at, ocr_confidence, verified_status, verified_at, verified_note, created_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (capErr) throw new Error(capErr.message);
    capture = (cap as CaptureDetail | null) ?? null;

    if (capture?.receipt_id) {
      const { data: rec } = await supabase
        .from("receipts")
        .select("id, photo_path, merchant, amount, receipt_date, status")
        .eq("id", capture.receipt_id)
        .maybeSingle();
      receipt = (rec as ReceiptRow | null) ?? null;
    }

    if (receipt?.photo_path) {
      // AZURE_* 미설정 시 null → placeholder 렌더.
      imageUrl = await generateReadSasUrl(receipt.photo_path);
    }
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "상세를 불러오지 못했습니다.";
  }

  if (errorMessage) {
    return (
      <div className="space-y-4">
        <Link href="/ocr" className="text-sm text-brand hover:underline">
          ← 목록으로
        </Link>
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
          상세를 불러오지 못했어요.
          <div className="mt-1 font-mono text-xs text-amber-600">
            {errorMessage}
          </div>
        </div>
      </div>
    );
  }

  if (!capture) {
    return (
      <div className="space-y-4">
        <Link href="/ocr" className="text-sm text-brand hover:underline">
          ← 목록으로
        </Link>
        <div className="rounded-xl bg-white p-6 text-sm text-gray-500 ring-1 ring-gray-200">
          해당 캡처를 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  const parsed = asObject(capture.parsed);
  const conf = asObject(parsed["conf"]);
  const vs: VerifiedStatus = isVerifiedStatus(capture.verified_status)
    ? capture.verified_status
    : "unreviewed";

  const parsedMerchant = pickString(parsed, "merchant");
  const parsedAmount = pickNumber(parsed, "amount");
  const parsedDate = pickString(parsed, "date");
  const parsedItemName = pickString(parsed, "itemName");

  const fieldConf = (key: string) => formatConfidence(pickNumber(conf, key));

  // 사용자 최종 수정값(피드백) — corrected 가 없으면 null.
  const diff = diffParsedCorrected(capture.parsed, capture.corrected);
  const changedCount = diff?.filter((d) => d.changed).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/ocr" className="text-sm text-brand hover:underline">
          ← 목록으로
        </Link>
        <span
          className={
            "rounded-full px-3 py-1 text-sm font-semibold " + STATUS_BADGE[vs]
          }
        >
          현재 상태: {STATUS_LABEL[vs]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 좌측: 영수증 이미지 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">영수증 이미지</h2>
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
            {imageUrl ? (
              // 짧은 수명 SAS URL. next/image 대신 순수 img 사용(외부 도메인 설정 불필요).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="영수증 이미지"
                className="mx-auto max-h-[70vh] w-auto"
              />
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center">
                <div className="rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-500">
                  {receipt?.photo_path ?? "photo_path 없음"}
                </div>
                <p className="text-sm text-gray-500">
                  이미지 표시에는 AZURE_* 환경변수가 필요해요.
                </p>
              </div>
            )}
          </div>

          {receipt ? (
            <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                영수증(receipts) 값
              </h3>
              <Field label="상호" value={receipt.merchant ?? "-"} />
              <Field label="금액" value={formatKrw(receipt.amount)} />
              <Field label="날짜" value={receipt.receipt_date ?? "-"} />
              <Field label="상태" value={receipt.status ?? "-"} />
            </div>
          ) : null}
        </section>

        {/* 우측: OCR 데이터 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">OCR 데이터</h2>

          <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">파싱 결과</h3>
            <Field
              label="상호"
              value={`${parsedMerchant ?? "-"}  (${fieldConf("merchant")})`}
            />
            <Field
              label="금액"
              value={`${formatKrw(parsedAmount)}  (${fieldConf("amount")})`}
            />
            <Field
              label="날짜"
              value={`${parsedDate ?? "-"}  (${fieldConf("date")})`}
            />
            <Field
              label="품목"
              value={`${parsedItemName ?? "-"}  (${fieldConf("itemName")})`}
            />
          </div>

          {/* 사용자 최종 수정값(피드백): parsed(수정 전) → corrected(수정 후) */}
          {diff ? (
            <div className="rounded-xl bg-white p-4 ring-1 ring-indigo-200">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-indigo-700">
                  사용자 수정값 (피드백)
                </h3>
                <span className="text-xs text-gray-400">
                  {changedCount > 0 ? `${changedCount}개 변경` : "변경 없음"} ·{" "}
                  {formatDateTime(capture.corrected_at)}
                </span>
              </div>
              <div className="space-y-1">
                {diff.map((d) => (
                  <div
                    key={d.key}
                    className={
                      "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 " +
                      (d.changed ? "bg-amber-50" : "")
                    }
                  >
                    <span className="text-sm text-gray-500">{d.label}</span>
                    <span className="flex items-center gap-2 text-right text-sm">
                      <span
                        className={
                          d.changed
                            ? "text-gray-400 line-through"
                            : "text-gray-400"
                        }
                      >
                        {d.before}
                      </span>
                      <span className="text-gray-300">→</span>
                      <span
                        className={
                          "font-medium " +
                          (d.changed ? "text-amber-700" : "text-gray-900")
                        }
                      >
                        {d.after}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                사용자가 앱에서 최종 저장한 값입니다. 변경된 필드는 파서·유의어
                사전 개선의 근거로 활용하세요.
              </p>
            </div>
          ) : null}

          <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">메타</h3>
            <Field
              label="전체 신뢰도"
              value={formatConfidence(capture.ocr_confidence)}
            />
            <Field label="엔진" value={capture.engine ?? "-"} />
            <Field label="소스" value={capture.source ?? "-"} />
            <Field label="생성일" value={formatDateTime(capture.created_at)} />
            <Field
              label="검수일"
              value={formatDateTime(capture.verified_at)}
            />
            <Field label="검수 메모" value={capture.verified_note ?? "-"} />
          </div>

          <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              전체 인식 텍스트 (raw_text)
            </h3>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              {capture.raw_text ?? "(없음)"}
            </pre>
          </div>

          <details className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700">
              raw_blocks (JSON)
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              {JSON.stringify(capture.raw_blocks ?? {}, null, 2)}
            </pre>
          </details>
        </section>
      </div>

      {/* 검수 액션 */}
      <section className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">검수</h2>
        <form action={verifyAction} className="space-y-3">
          <input type="hidden" name="id" value={capture.id} />
          <input
            type="text"
            name="note"
            placeholder="검수 메모 (선택)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="status"
              value="correct"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              정확
            </button>
            <button
              type="submit"
              name="status"
              value="incorrect"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              부정확
            </button>
            <button
              type="submit"
              name="status"
              value="unreviewed"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              미검토로
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
