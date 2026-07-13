import Link from "next/link";
import { classifyAction, type AuditOutcome, type AuditClass } from "@/lib/audit";
import { MOCK_AUDIT_ROWS, type AuditRow } from "@/lib/mockAudit";
import { formatDateTime } from "@/lib/ocr";

// service_role 조회로 교체될 스캐폴딩. 현재는 모의 데이터만 사용한다(DEV MOCK).
export const dynamic = "force-dynamic";

// ── outcome 배지(정합화 표현, REQ-AUDIT-007) ─────────────────────────────
const OUTCOME_LABEL: Record<AuditOutcome, string> = {
  intent: "대기",
  completed: "완료",
  failed: "실패",
};
const OUTCOME_BADGE: Record<AuditOutcome, string> = {
  intent: "bg-gray-100 text-gray-600",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

// ── 행위 분류(REQ-AUDIT-009) 표시 라벨 ───────────────────────────────────
const CLASS_LABEL: Record<AuditClass, string> = {
  destructive_or_pii: "파괴적/PII",
  non_destructive: "비파괴",
};

// ── 필터 정의(ocr 페이지와 동일한 쿼리파라미터 링크 방식) ────────────────
const OUTCOME_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "intent", label: "대기(intent)" },
  { value: "completed", label: "완료(completed)" },
  { value: "failed", label: "실패(failed)" },
];
const CLASS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "destructive_or_pii", label: "파괴적/PII" },
  { value: "non_destructive", label: "비파괴" },
];

// metadata 를 방어적으로 요약한다(REQ-AUDIT-010/007). 알려진 안전 키만 노출하고
// 그 외 임의 키는 절대 덤프하지 않는다. 원값 PII 가 metadata 에 없더라도, 미래에
// 실 데이터가 붙었을 때 예상치 못한 민감 값이 화면에 흘러나오지 않도록 화이트리스트로 막는다.
const SAFE_META_KEYS = [
  "from",
  "to",
  "fields",
  "rows",
  "count",
  "scope",
  "format",
] as const;

function summarizeMetadata(metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of SAFE_META_KEYS) {
    const value = metadata[key];
    if (value === undefined || value === null || value === "") continue;
    const rendered = Array.isArray(value)
      ? value.join(", ")
      : String(value);
    parts.push(`${key}: ${rendered}`);
  }
  const corr = metadata.correlationId;
  if (typeof corr === "string" && corr) {
    parts.push(`corr: ${corr.slice(0, 8)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

// correlationId 별 종결(completed/failed) outcome 을 미리 계산해 정합화를 판정한다.
function buildTerminalByCorrelation(
  rows: AuditRow[],
): Map<string, AuditOutcome> {
  const map = new Map<string, AuditOutcome>();
  for (const row of rows) {
    if (!row.correlationId) continue;
    if (row.outcome === "completed" || row.outcome === "failed") {
      map.set(row.correlationId, row.outcome);
    }
  }
  return map;
}

// 행 단위 정합화 라벨(REQ-AUDIT-007). intent 를 성공으로 표현하지 않는다.
function reconciliationLabel(
  row: AuditRow,
  terminalByCorr: Map<string, AuditOutcome>,
): { text: string; tone: string } {
  if (!row.correlationId) {
    return { text: "단건", tone: "text-gray-400" };
  }
  const terminal = terminalByCorr.get(row.correlationId);
  if (row.outcome === "intent") {
    if (terminal === "completed") return { text: "의도 → 완료", tone: "text-green-600" };
    if (terminal === "failed") return { text: "의도 → 실패", tone: "text-red-600" };
    return { text: "의도 (미완료)", tone: "text-amber-600" };
  }
  if (row.outcome === "completed") return { text: "종결 (완료)", tone: "text-green-600" };
  return { text: "종결 (실패)", tone: "text-red-600" };
}

function isOutcome(v: string): v is AuditOutcome {
  return v === "intent" || v === "completed" || v === "failed";
}
function isClass(v: string): v is AuditClass {
  return v === "destructive_or_pii" || v === "non_destructive";
}

export default async function AuditListPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; class?: string }>;
}) {
  const sp = await searchParams;
  const outcome = sp.outcome ?? "all";
  const actionClass = sp.class ?? "all";

  // 정합화 판정은 전체 데이터 기준으로 계산한 뒤 필터를 적용한다(필터가 쌍을
  // 끊어도 종결 여부 판정이 흔들리지 않도록).
  const terminalByCorr = buildTerminalByCorrelation(MOCK_AUDIT_ROWS);

  const rows = [...MOCK_AUDIT_ROWS]
    .filter((r) => (outcome !== "all" && isOutcome(outcome) ? r.outcome === outcome : true))
    .filter((r) =>
      actionClass !== "all" && isClass(actionClass)
        ? classifyAction(r.action) === actionClass
        : true,
    )
    // 최신순.
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">감사 로그</h1>
      </div>

      {/* DEV MOCK 안내 + 귀속 한계 고지(REQ-ATTR-004) */}
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
        <div className="font-medium">개발용 모의 데이터(DEV MOCK)</div>
        <div className="mt-1 text-amber-600">
          이 화면은 스캐폴딩이며 M1(공유 DB 마이그레이션) 이후 실제 감사 로그로
          교체됩니다. 행위자는 세션 이메일 기준이며, 공유 비밀번호 환경에서는 강한
          신원 증명이 아닙니다.
        </div>
      </div>

      {/* 필터: 결과(outcome) */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500">결과</div>
        <div className="flex flex-wrap gap-2">
          {OUTCOME_FILTERS.map((f) => {
            const active = outcome === f.value;
            return (
              <Link
                key={f.value}
                href={`/audit?outcome=${f.value}&class=${actionClass}`}
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
      </div>

      {/* 필터: 행위 분류(class) */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500">행위 분류</div>
        <div className="flex flex-wrap gap-2">
          {CLASS_FILTERS.map((f) => {
            const active = actionClass === f.value;
            return (
              <Link
                key={f.value}
                href={`/audit?outcome=${outcome}&class=${f.value}`}
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
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">시각</th>
              <th className="px-4 py-3 font-medium">행위자</th>
              <th className="px-4 py-3 font-medium">행위</th>
              <th className="px-4 py-3 font-medium">대상</th>
              <th className="px-4 py-3 font-medium">결과</th>
              <th className="px-4 py-3 font-medium">정합화</th>
              <th className="px-4 py-3 font-medium">맥락</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-400" colSpan={7}>
                  감사 항목이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const cls = classifyAction(row.action);
                const recon = reconciliationLabel(row, terminalByCorr);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.actorEmail}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.action}</div>
                      <div className="text-xs text-gray-400">{CLASS_LABEL[cls]}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{row.targetType}</div>
                      {row.targetId ? (
                        <div className="font-mono text-xs text-gray-400">
                          {row.targetId}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          OUTCOME_BADGE[row.outcome]
                        }
                      >
                        {OUTCOME_LABEL[row.outcome]}
                      </span>
                    </td>
                    <td className={"px-4 py-3 text-xs font-medium " + recon.tone}>
                      {recon.text}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {summarizeMetadata(row.metadata)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        정합화: 완료 종결(및 그 의도)은 성공, 종결 없는 의도는 미완료/시도, 실패는
        실패로 표시합니다. metadata 는 알려진 안전 키만 노출합니다(원값 PII 미표시).
      </p>
    </div>
  );
}
