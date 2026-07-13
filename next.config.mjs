/** @type {import('next').NextConfig} */
const nextConfig = {
  // 관리자 도구는 서버 사이드에서만 Supabase service_role 키를 사용한다.
  // 데이터 페이지는 각 파일에서 `export const dynamic = 'force-dynamic'`로
  // 빌드 타임 프리렌더를 막으므로 여기서 추가 설정이 필요 없다.
  reactStrictMode: true,
};

export default nextConfig;
