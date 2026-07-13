import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SLIP 관리자",
  description: "SLIP 내부 관리자 도구",
};

// 루트 레이아웃은 껍데기만. 사이드바/헤더 셸은 (dashboard) 그룹 레이아웃에 있다.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
