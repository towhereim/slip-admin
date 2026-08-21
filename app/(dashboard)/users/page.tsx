import { maskProfilePii } from "@/lib/mask";
import { MOCK_USERS } from "@/lib/mockUsers";
import { formatDateTime } from "@/lib/ocr";
import { RevealStub } from "./RevealStub";

// service_role profiles 조회로 교체될 스캐폴딩. 현재는 모의 데이터만 사용한다(DEV MOCK).
export const dynamic = "force-dynamic";

export default async function UsersListPage() {
  // 은행 PII 는 반드시 maskProfilePii 를 거쳐 기본 마스킹된 표현으로만 노출한다
  // (REQ-PII-001). _enc 필드는 유틸이 결과에서 제거하므로 어떤 표면에도 나타나지 않는다.
  const rows = MOCK_USERS.map((u) => maskProfilePii(u));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">사용자</h1>
      </div>

      {/* DEV MOCK 안내 + reveal/audit 유보 고지(REQ-PII-005 스캐폴드) */}
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
        <div className="font-medium">개발용 모의 데이터(DEV MOCK)</div>
        <div className="mt-1 text-amber-600">
          은행 정보는 기본 마스킹으로 표시됩니다. &quot;마스킹 해제&quot;는 인-UI
          자기 확인(REQ-PII-005)의 형태만 시연하는 스캐폴드이며, 실제 원값 노출과
          감사 기록(pii.reveal 의도 선기록)은 M1 이후로 유보됩니다.
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">이메일</th>
              <th className="px-4 py-3 font-medium">가입일</th>
              <th className="px-4 py-3 font-medium">은행</th>
              <th className="px-4 py-3 font-medium">계좌</th>
              <th className="px-4 py-3 font-medium">예금주</th>
              <th className="px-4 py-3 font-medium">마스킹 해제</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-400" colSpan={7}>
                  사용자가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">
                    {row.bank_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">
                    {row.bank_account}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">
                    {row.account_holder}
                  </td>
                  <td className="px-4 py-3">
                    <RevealStub userName={row.name} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        은행/계좌/예금주는 기본 마스킹되어 표시됩니다. 원값 열람은 감사 기록을 남기는
        명시적 행위로만 가능하도록 후속 마일스톤에서 구현됩니다.
      </p>
    </div>
  );
}
