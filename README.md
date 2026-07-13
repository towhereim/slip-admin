# SLIP 관리자 (slip-admin)

SLIP 모바일 앱과 **같은 Supabase 프로젝트**를 읽는 내부 관리자 웹앱(Phase 2)입니다.
모든 DB 접근은 **서버 사이드에서만** `service_role` 키로 이뤄지며(RLS 우회),
UI 는 한국어입니다.

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- 인증: 이메일 허용목록 + 공유 비밀번호 → `jose` 로 서명한 httpOnly 세션 JWT 쿠키
- 페이지: 대시보드(`/`), OCR 검증 목록(`/ocr`), OCR 검증 상세(`/ocr/[id]`)

## 빠른 시작

```bash
cp .env.local.example .env.local   # 값 채우기 (아래 참고)
npm install
npm run dev                        # http://localhost:3000
```

프로덕션 빌드:

```bash
npm run build
npm run start
```

타입 체크:

```bash
npm run typecheck
```

## 환경변수 (.env.local)

`.env.local` 은 `.gitignore` 로 커밋되지 않습니다. **실제 값은 절대 커밋하지 마세요.**

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | O | 공개 프로젝트 URL (모바일 앱과 동일) |
| `SUPABASE_SERVICE_ROLE_KEY` | O | **서버 전용** service_role 시크릿. `NEXT_PUBLIC_` 붙이지 말 것 |
| `ADMIN_EMAILS` | O | 로그인 허용 이메일 (쉼표 구분, 대소문자 무시) |
| `ADMIN_PASSWORD` | O | 공유 관리자 비밀번호 |
| `AUTH_SECRET` | O | 세션 JWT 서명용 32자 이상 무작위 문자열 |
| `AZURE_STORAGE_ACCOUNT` | 선택 | 영수증 이미지 표시용 |
| `AZURE_STORAGE_KEY` | 선택 | 영수증 이미지 표시용 (base64 계정 키) |
| `AZURE_BLOB_CONTAINER` | 선택 | 영수증 이미지 컨테이너 (예: `receipts`) |

### service_role 키 발급

Supabase 대시보드 → **Settings → API → Project API keys** → `service_role` (secret)
값을 복사해 `SUPABASE_SERVICE_ROLE_KEY` 에 넣습니다. 이 키는 RLS 를 우회하므로
서버에서만 사용되며, 이 앱은 클라이언트로 절대 노출하지 않습니다(`server-only` 가드).

### AUTH_SECRET 생성

```bash
openssl rand -base64 48
```

### Azure (선택)

세 개의 `AZURE_*` 값이 모두 있어야 OCR 상세에서 영수증 이미지가 표시됩니다.
없으면 상세 페이지는 이미지 대신 placeholder 박스와 안내 문구를 보여주며,
앱은 크래시하지 않습니다. 값은 모바일 앱의 Edge Function 시크릿과 동일합니다
(Azure Storage 계정/키/컨테이너).

## 보안 메모

- `service_role` 키/`ADMIN_PASSWORD`/`AUTH_SECRET`/`AZURE_*` 는 모두 서버 전용입니다.
- 세션 쿠키는 `httpOnly`, `sameSite=lax`, 프로덕션에서 `secure` 입니다(약 12시간 만료).
- `middleware.ts` 가 `/login` 과 정적 자산을 제외한 모든 라우트를 보호합니다.

## 구조

```
app/
  layout.tsx                  루트(껍데기)
  login/                      로그인 페이지 + 서버 액션
  logout/actions.ts           로그아웃 서버 액션
  (dashboard)/
    layout.tsx                사이드바 + 헤더 셸
    page.tsx                  대시보드(통계)
    ocr/page.tsx              OCR 검증 목록
    ocr/[id]/page.tsx         OCR 검증 상세
    ocr/[id]/actions.ts       검수(verify) 서버 액션
lib/
  supabaseAdmin.ts            service_role 클라이언트 (server-only)
  session.ts                  세션 JWT (jose, Edge 안전)
  admins.ts                   허용목록/비밀번호 검증
  azure.ts                    Azure 읽기 SAS 생성 (미설정 시 null)
  ocr.ts                      parsed jsonb 헬퍼/포맷터
middleware.ts                 인증 가드
```
