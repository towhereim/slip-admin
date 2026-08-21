// ocr_captures.parsed jsonb 에서 안전하게 값을 뽑는 헬퍼 + 공용 타입.

export type VerifiedStatus = "unreviewed" | "correct" | "incorrect";
export const VERIFIED_STATUSES: VerifiedStatus[] = [
  "unreviewed",
  "correct",
  "incorrect",
];

export function isVerifiedStatus(v: string): v is VerifiedStatus {
  return (VERIFIED_STATUSES as string[]).includes(v);
}

export const STATUS_LABEL: Record<VerifiedStatus, string> = {
  unreviewed: "미검토",
  correct: "정확",
  incorrect: "부정확",
};

export const STATUS_BADGE: Record<VerifiedStatus, string> = {
  unreviewed: "bg-gray-100 text-gray-600",
  correct: "bg-green-100 text-green-700",
  incorrect: "bg-red-100 text-red-700",
};

// ocr_corrections.match_type — 전체 라인 정확 치환(exact) vs 라인 내부 부분 치환(substring).
export type MatchType = "exact" | "substring";
export const MATCH_TYPES: MatchType[] = ["exact", "substring"];

export function isMatchType(v: string): v is MatchType {
  return (MATCH_TYPES as string[]).includes(v);
}

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  exact: "전체 일치",
  substring: "부분 일치",
};

type Json = Record<string, unknown>;

export function asObject(v: unknown): Json {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
}

export function pickString(obj: Json, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

export function pickNumber(obj: Json, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

export function formatConfidence(v: number | null): string {
  if (v === null) return "-";
  // 0..1 범위면 % 로, 이미 0..100 이면 그대로 % 처리.
  const ratio = v <= 1 ? v * 100 : v;
  return `${ratio.toFixed(0)}%`;
}

export function formatKrw(v: number | null): string {
  if (v === null) return "-";
  return `₩${v.toLocaleString("ko-KR")}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// 사용자 최종 수정값(ocr_captures.corrected) vs 파싱 초안(parsed) diff
// ---------------------------------------------------------------------------

export type OcrDiffKey = "merchant" | "amount" | "date" | "itemName";

export interface OcrDiffField {
  key: OcrDiffKey;
  label: string;
  before: string; // parsed(수정 전) 표시값
  after: string; // corrected(수정 후) 표시값
  changed: boolean;
}

// corrected jsonb {merchant, amount, date, itemName} 를 parsed 초안과 필드별로 비교한다.
// corrected 가 비어 있으면(사용자가 아직 저장하지 않음) null 을 반환해 호출부가 카드를
// 통째로 숨기도록 한다. 금액은 formatKrw, 나머지는 문자열로 비교한다.
export function diffParsedCorrected(
  parsed: unknown,
  corrected: unknown,
): OcrDiffField[] | null {
  const c = asObject(corrected);
  if (Object.keys(c).length === 0) return null;
  const p = asObject(parsed);

  const text = (o: Json, key: string) => pickString(o, key) ?? "-";
  const krw = (o: Json, key: string) => formatKrw(pickNumber(o, key));

  const specs: { key: OcrDiffKey; label: string; fmt: (o: Json) => string }[] = [
    { key: "merchant", label: "상호", fmt: (o) => text(o, "merchant") },
    { key: "amount", label: "금액", fmt: (o) => krw(o, "amount") },
    { key: "date", label: "날짜", fmt: (o) => text(o, "date") },
    { key: "itemName", label: "품목", fmt: (o) => text(o, "itemName") },
  ];

  return specs.map(({ key, label, fmt }) => {
    const before = fmt(p);
    const after = fmt(c);
    return { key, label, before, after, changed: before !== after };
  });
}
