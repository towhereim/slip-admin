"use client";

// 삭제처럼 되돌릴 수 없는 액션에 window.confirm 을 붙이는 최소 클라이언트 submit 버튼.
// 서버 액션은 부모 server component 의 <form action={...}> 로 전달된다.
export function ConfirmButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
