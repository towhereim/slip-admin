import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// 순수/서버 유틸(lib/*) 단위 테스트. DOM 불필요 → node 환경.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/adminSession.ts", "lib/audit.ts", "lib/mask.ts"],
    },
  },
  resolve: {
    alias: {
      // tsconfig 의 "@/*" 경로 별칭을 vitest 에서도 해석.
      "@": root,
      // server-only 는 Node 에서 로드되면 throw 하므로 빈 스텁으로 대체.
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
