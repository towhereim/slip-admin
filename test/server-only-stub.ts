// vitest용 `server-only` 스텁. 실제 패키지는 클라이언트 번들에서 import 되면
// throw 하도록 되어 있어 Node(vitest) 환경에서 그대로 로드하면 테스트가 깨진다.
// 여기서는 아무 동작도 하지 않는 빈 모듈로 대체한다(테스트 전용).
export {};
