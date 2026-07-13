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
