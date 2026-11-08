import { configDefaults, defineConfig } from "vitest/config";

import { SERIAL_TEST_FILES } from "../../vitest.serial-test-files.mjs";

import viteConfig from "./vite.config";

const BRUSH_LAB_PREFIX = "apps/brush-lab/";

// 루트와 앱 로컬 검사가 같은 직렬 파일 목록을 쓰도록 경로만 앱 기준으로 바꾼다.
export const BRUSH_LAB_SERIAL_TEST_FILES = SERIAL_TEST_FILES
  .filter((file) => file.startsWith(BRUSH_LAB_PREFIX))
  .map((file) => file.slice(BRUSH_LAB_PREFIX.length));

export default defineConfig({
  ...viteConfig,
  test: {
    // 앱의 test 명령이 이 병렬 검사 뒤에 직렬 성능 검사를 반드시 실행한다.
    exclude: [...configDefaults.exclude, ...BRUSH_LAB_SERIAL_TEST_FILES],
  },
});
