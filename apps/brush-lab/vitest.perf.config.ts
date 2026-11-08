import { configDefaults, defineConfig } from "vitest/config";

import baseConfig, { BRUSH_LAB_SERIAL_TEST_FILES } from "./vitest.config";

// Architecture CI도 앱 로컬 test 명령을 쓰므로 루트와 별도로 직렬 실행을 연결한다.
// mergeConfig는 include/exclude 배열을 합치므로 여기서는 두 목록을 명시적으로 교체한다.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [...BRUSH_LAB_SERIAL_TEST_FILES],
    exclude: [...configDefaults.exclude],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
