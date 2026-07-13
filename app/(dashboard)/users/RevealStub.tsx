"use client";

import { useState } from "react";

// REQ-PII-005(인-UI 자기 확인) "형태"만 시연하는 스캐폴드다. 이 마일스톤(M2b)에서는
// 실제 원값 노출과 감사 기록(REQ-PII-003 pii.reveal 의도 선기록)을 구현하지 않는다.
// 확인 시 실제 데이터 대신 TODO 안내만 보여주며, reveal+audit 배선은 M1 이후로 유보한다.
export function RevealStub({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <span className="text-xs text-amber-600">
        TODO: M-later에서 감사 기록 후 노출
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
      >
        마스킹 해제
      </button>
    );
  }

  // 인-UI 자기 확인 스텁(다이얼로그 형태). 실제 노출/감사는 없음.
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-gray-500">
        {userName}님의 PII를 노출할까요?
      </span>
      <button
        type="button"
        onClick={() => setConfirmed(true)}
        className="rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
      >
        확인
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
      >
        취소
      </button>
    </span>
  );
}
