// ⚠️ DEV MOCK — 실제 profiles 조회(service_role)로 교체될 임시 픽스처다.
// supabase 를 import 하지 않는다. 사용자 관리 화면(REQ-PII-001/002)이 은행 PII
// 기본 마스킹을 "실제로 마스킹이 적용됨"으로 시연하기 위해, 픽스처에는 일부러
// 마스킹 전 민감 원값을 담는다(화면에서는 maskProfilePii 를 거쳐 노출).
// _enc(bytea) 변형은 절대 렌더되지 않아야 하므로 자리표시자만 둔다(마스킹 유틸이 제거).

export interface MockUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
  bank_name: string;
  bank_account: string;
  account_holder: string;
  // 실제 스키마의 _enc 컬럼 존재를 반영(값은 자리표시자). maskProfilePii 가 결과에서 제거한다.
  bank_name_enc: string;
  bank_account_enc: string;
  account_holder_enc: string;
}

export const MOCK_USERS: MockUser[] = [
  {
    id: "prof_5c7d",
    name: "김철수",
    email: "chulsoo.kim@example.com",
    created_at: "2026-03-02T14:20:00+09:00",
    bank_name: "국민은행",
    bank_account: "123456789012",
    account_holder: "김철수",
    bank_name_enc: "<enc>",
    bank_account_enc: "<enc>",
    account_holder_enc: "<enc>",
  },
  {
    id: "prof_9a1e",
    name: "이영희",
    email: "younghee.lee@example.com",
    created_at: "2026-04-11T09:05:00+09:00",
    bank_name: "신한은행",
    bank_account: "9876543210",
    account_holder: "이영희",
    bank_name_enc: "<enc>",
    bank_account_enc: "<enc>",
    account_holder_enc: "<enc>",
  },
  {
    id: "prof_3b8f",
    name: "박민준",
    email: "minjun.park@example.com",
    created_at: "2026-05-27T18:47:00+09:00",
    bank_name: "카카오뱅크",
    bank_account: "3333012345678",
    account_holder: "박민준",
    bank_name_enc: "<enc>",
    bank_account_enc: "<enc>",
    account_holder_enc: "<enc>",
  },
  {
    id: "prof_7d2c",
    name: "정수아",
    email: "sua.jung@example.com",
    created_at: "2026-06-30T11:12:00+09:00",
    bank_name: "우리은행",
    bank_account: "100200300400",
    account_holder: "정수아",
    bank_name_enc: "<enc>",
    bank_account_enc: "<enc>",
    account_holder_enc: "<enc>",
  },
];
