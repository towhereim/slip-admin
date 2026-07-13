import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// service_role 로 DB 를 직접 조회한다(RLS 우회). 빌드 타임 프리렌더 방지.
export const dynamic = "force-dynamic";

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

interface ProjectRow {
  id: string;
  name: string;
  eventCount: number;
  memberCount: number;
  receiptCount: number;
  totalAmount: number;
}

interface DashboardData {
  projectCount: number;
  eventCount: number;
  receiptCount: number;
  userCount: number;
  avgMembersPerProject: number;
  avgReceiptsPerEvent: number;
  ocrTotal: number;
  ocrUnreviewed: number;
  ocrCorrect: number;
  ocrIncorrect: number;
  ocrAccuracy: number;
  projects: ProjectRow[];
}

// @MX:NOTE: [AUTO] 프로젝트별 집계는 관련 행(events/memberships/receipts)을 메모리에
// 로드해 JS 에서 Map 으로 합산한다. 현재 데이터 규모에선 충분하지만, 규모가 커지면
// SQL 집계(뷰/RPC)로 옮겨야 한다.
async function loadDashboard(): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  // 카운트는 head+count 로 행을 가져오지 않고 개수만 센다.
  const [
    projectsCount,
    eventsCount,
    receiptsCount,
    profilesCount,
    ocrTotalCount,
    ocrUnreviewedCount,
    ocrCorrectCount,
    ocrIncorrectCount,
  ] = await Promise.all([
    supabase.from("projects").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("receipts").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("ocr_captures").select("*", { count: "exact", head: true }),
    supabase
      .from("ocr_captures")
      .select("*", { count: "exact", head: true })
      .eq("verified_status", "unreviewed"),
    supabase
      .from("ocr_captures")
      .select("*", { count: "exact", head: true })
      .eq("verified_status", "correct"),
    supabase
      .from("ocr_captures")
      .select("*", { count: "exact", head: true })
      .eq("verified_status", "incorrect"),
  ]);

  // 프로젝트별 집계용 원본 행. limit 로 상한을 둔다(현 규모 안전).
  const [projectsRes, eventsRes, membershipsRes, receiptsRes] =
    await Promise.all([
      supabase.from("projects").select("id, name").limit(10000),
      supabase.from("events").select("id, project_id").limit(50000),
      supabase
        .from("memberships")
        .select("project_id, scope")
        .eq("scope", "project")
        .limit(100000),
      supabase.from("receipts").select("event_id, amount").limit(200000),
    ]);

  const projects = projectsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const memberships = membershipsRes.data ?? [];
  const receipts = receiptsRes.data ?? [];

  // event_id -> project_id 매핑.
  const eventToProject = new Map<string, string>();
  const eventCountByProject = new Map<string, number>();
  for (const e of events as { id: string; project_id: string }[]) {
    eventToProject.set(e.id, e.project_id);
    eventCountByProject.set(
      e.project_id,
      (eventCountByProject.get(e.project_id) ?? 0) + 1,
    );
  }

  // 프로젝트 스코프 멤버 수.
  const memberCountByProject = new Map<string, number>();
  for (const m of memberships as { project_id: string | null }[]) {
    if (!m.project_id) continue;
    memberCountByProject.set(
      m.project_id,
      (memberCountByProject.get(m.project_id) ?? 0) + 1,
    );
  }

  // 영수증 수/합계는 event_id 를 project_id 로 환원해 합산.
  const receiptCountByProject = new Map<string, number>();
  const totalAmountByProject = new Map<string, number>();
  for (const r of receipts as { event_id: string; amount: number | null }[]) {
    const pid = eventToProject.get(r.event_id);
    if (!pid) continue;
    receiptCountByProject.set(pid, (receiptCountByProject.get(pid) ?? 0) + 1);
    totalAmountByProject.set(
      pid,
      (totalAmountByProject.get(pid) ?? 0) + (r.amount ?? 0),
    );
  }

  const projectRows: ProjectRow[] = (
    projects as { id: string; name: string }[]
  )
    .map((p) => ({
      id: p.id,
      name: p.name,
      eventCount: eventCountByProject.get(p.id) ?? 0,
      memberCount: memberCountByProject.get(p.id) ?? 0,
      receiptCount: receiptCountByProject.get(p.id) ?? 0,
      totalAmount: totalAmountByProject.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const projectCount = projectsCount.count ?? 0;
  const eventCount = eventsCount.count ?? 0;
  const receiptCount = receiptsCount.count ?? 0;
  const userCount = profilesCount.count ?? 0;
  const ocrCorrect = ocrCorrectCount.count ?? 0;
  const ocrIncorrect = ocrIncorrectCount.count ?? 0;

  // 프로젝트 스코프 멤버십 총합(평균 계산용).
  const totalProjectMembers = memberships.length;

  return {
    projectCount,
    eventCount,
    receiptCount,
    userCount,
    avgMembersPerProject:
      projectCount > 0 ? totalProjectMembers / projectCount : 0,
    avgReceiptsPerEvent: eventCount > 0 ? receiptCount / eventCount : 0,
    ocrTotal: ocrTotalCount.count ?? 0,
    ocrUnreviewed: ocrUnreviewedCount.count ?? 0,
    ocrCorrect,
    ocrIncorrect,
    // 0으로 나누기 방지.
    ocrAccuracy:
      ocrCorrect + ocrIncorrect > 0
        ? ocrCorrect / (ocrCorrect + ocrIncorrect)
        : 0,
    projects: projectRows,
  };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  let errorMessage: string | null = null;

  try {
    data = await loadDashboard();
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.";
  }

  if (errorMessage || !data) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold text-gray-900">대시보드</h1>
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
          데이터를 불러오지 못했어요. 환경변수(Supabase) 설정을 확인해 주세요.
          <div className="mt-1 font-mono text-xs text-amber-600">
            {errorMessage}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>

      {/* 상단 통계 카드 */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="총 프로젝트" value={data.projectCount.toLocaleString("ko-KR")} />
        <StatCard label="총 이벤트" value={data.eventCount.toLocaleString("ko-KR")} />
        <StatCard label="총 영수증" value={data.receiptCount.toLocaleString("ko-KR")} />
        <StatCard label="총 사용자" value={data.userCount.toLocaleString("ko-KR")} />
      </section>

      {/* 평균 지표 */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard
          label="프로젝트당 평균 멤버 수"
          value={data.avgMembersPerProject.toFixed(1)}
        />
        <StatCard
          label="이벤트당 평균 영수증 수"
          value={data.avgReceiptsPerEvent.toFixed(1)}
        />
      </section>

      {/* OCR 통계 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">OCR 통계</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label="총 캡처 수" value={data.ocrTotal.toLocaleString("ko-KR")} />
          <StatCard label="미검토" value={data.ocrUnreviewed.toLocaleString("ko-KR")} />
          <StatCard label="정확" value={data.ocrCorrect.toLocaleString("ko-KR")} />
          <StatCard label="부정확" value={data.ocrIncorrect.toLocaleString("ko-KR")} />
          <StatCard label="정확도율" value={pct(data.ocrAccuracy)} />
        </div>
      </section>

      {/* 프로젝트별 표 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">프로젝트별 현황</h2>
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">프로젝트명</th>
                <th className="px-4 py-3 text-right font-medium">이벤트 수</th>
                <th className="px-4 py-3 text-right font-medium">멤버 수</th>
                <th className="px-4 py-3 text-right font-medium">영수증 수</th>
                <th className="px-4 py-3 text-right font-medium">총 금액</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-400" colSpan={5}>
                    프로젝트가 없습니다.
                  </td>
                </tr>
              ) : (
                data.projects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {p.eventCount.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {p.memberCount.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {p.receiptCount.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {won(p.totalAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
