import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../fixtures/studio-chemy-v1-pressure/original-source-manifest.json", import.meta.url), "utf8"));

/** 원래 Chemy 참조 도구는 제품 의존성을 내리지 않고 별도 설치 경로에서 선택한다. */
export function createStudioChemyToolchainRequire(directory = process.env.TOONSPECTRUM_CHEMY_TOOLCHAIN_DIR) {
  return createRequire(resolve(directory || repository, "package.json"));
}

/** 고정 골든의 Playwright·Vite 버전을 실제 설치 패키지와 대조한 뒤 로드한다. */
export async function loadStudioChemyBrowserToolchain(directory = process.env.TOONSPECTRUM_CHEMY_TOOLCHAIN_DIR) {
  const require = createStudioChemyToolchainRequire(directory);
  for (const name of ["playwright", "vite"]) {
    const installed = JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8"));
    if (installed.version !== manifest.dependencies[name].version) {
      throw new Error(`Chemy 고정 도구 ${name} ${manifest.dependencies[name].version}이 필요합니다. 실제 ${installed.version}; TOONSPECTRUM_CHEMY_TOOLCHAIN_DIR를 확인하세요.`);
    }
  }
  const [playwright, { createServer }] = await Promise.all([
    import(pathToFileURL(require.resolve("playwright")).href),
    import(pathToFileURL(require.resolve("vite")).href),
  ]);
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium || typeof chromium.launch !== "function") throw new Error("고정 Playwright의 Chromium 실행 API가 없습니다.");
  return { chromium, createServer };
}
