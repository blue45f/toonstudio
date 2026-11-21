import { createRequire } from "node:module";

/** Linux 실측에서 canvas 표시와 GC 전후 readback을 함께 확인한 SwiftShader 설정이다. */
export const STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS = Object.freeze([
  "--disable-dev-shm-usage",
  "--enable-automation",
  "--no-sandbox",
  "--enable-unsafe-webgpu",
  "--enable-features=CDPScreenshotNewSurface,Vulkan",
  "--use-vulkan=swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--use-gpu-in-tests",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
]);

export function resolveStudioSoakBrowserLaunchArgs(
  webgpu: boolean,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (webgpu && platform === "linux") return [...STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS];
  // OpenGL ES의 SwiftShader 경로도 ANGLE을 거쳐야 한다. Vulkan 조합은 실측한 Linux에만 적용한다.
  const args = ["--disable-dev-shm-usage", "--enable-automation", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  if (webgpu) args.push("--enable-unsafe-webgpu");
  return args;
}

interface StudioSoakBrowserProtocolVersion {
  protocolVersion: string;
  product: string;
  revision: string;
  userAgent: string;
  jsVersion: string;
}
interface StudioSoakBrowserMetadataSession {
  send(method: "Browser.getBrowserCommandLine" | "Browser.getVersion"): Promise<unknown>;
  detach(): Promise<void>;
}
interface StudioSoakBrowserMetadataSource {
  version(): string;
  newBrowserCDPSession(): Promise<StudioSoakBrowserMetadataSession>;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readStudioSoakPlaywrightVersion(): string {
  const metadata: unknown = createRequire(import.meta.url)("playwright/package.json");
  if (!record(metadata) || typeof metadata.version !== "string" || !metadata.version.trim()) {
    throw new Error("실행 중인 Playwright 버전을 읽을 수 없습니다. 설치된 playwright 패키지를 확인하세요.");
  }
  return metadata.version;
}

export function createStudioSoakBrowserLaunchEvidence(requestedArgs: readonly string[]) {
  return {
    playwrightVersion: readStudioSoakPlaywrightVersion(),
    browserVersion: null as string | null,
    browserLaunchArgs: [...requestedArgs],
    browserActualLaunchArgs: null as string[] | null,
    browserProtocolVersion: null as StudioSoakBrowserProtocolVersion | null,
  };
}

class StudioSoakBrowserLaunchTimeoutError extends Error {
  readonly code = "STUDIO_SOAK_BROWSER_LAUNCH_TIMEOUT";
  constructor(label: string) {
    super(`${label}: Chromium 실행 정보 수집이 8000ms를 넘었습니다.`);
    this.name = "StudioSoakBrowserLaunchTimeoutError";
  }
}

/** 정리 오류로 감싸도 미완료 CDP 작업의 timeout 원인을 잃지 않는다. */
export function isStudioSoakBrowserLaunchTimeout(value: unknown): boolean {
  const pending = [value];
  const visited = new Set<unknown>();
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!record(candidate) || visited.has(candidate)) continue;
    visited.add(candidate);
    if (candidate.code === "STUDIO_SOAK_BROWSER_LAUNCH_TIMEOUT" || candidate.name === "TimeoutError") return true;
    if (Array.isArray(candidate.errors)) pending.push(...candidate.errors);
    if (candidate.cause !== undefined) pending.push(candidate.cause);
  }
  return false;
}

async function within<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StudioSoakBrowserLaunchTimeoutError(label)), 8_000);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function actualLaunchArgs(value: unknown): string[] {
  if (!record(value) || !Array.isArray(value.arguments) || value.arguments.length === 0
    || !value.arguments.every((argument): argument is string => typeof argument === "string")) {
    throw new Error("Chromium의 실제 실행 인자가 없습니다. --enable-automation과 CDP 수집을 확인하세요.");
  }
  return [...value.arguments];
}

function assertRequestedArgs(argumentsList: readonly string[], requestedArgs: readonly string[]): void {
  // 같은 스위치가 중복되면 마지막 값이 적용되므로, 앞쪽에 요청 문자열이 있다는 이유만으로 인정하지 않는다.
  for (const requested of requestedArgs) {
    const key = requested.split("=", 1)[0];
    const actual = argumentsList.findLast((argument) => argument === key || argument.startsWith(key + "="));
    if (actual !== requested) throw new Error(`Chromium 실행 인자가 요청과 다릅니다: ${requested}. 브라우저 launch 설정을 확인하세요.`);
  }
}

function protocolVersion(value: unknown): StudioSoakBrowserProtocolVersion {
  if (!record(value) || typeof value.protocolVersion !== "string" || !value.protocolVersion.trim()
    || typeof value.product !== "string" || !value.product.trim()
    || typeof value.revision !== "string" || !value.revision.trim()
    || typeof value.userAgent !== "string" || !value.userAgent.trim()
    || typeof value.jsVersion !== "string" || !value.jsVersion.trim()) {
    throw new Error("Chromium 버전 응답이 불완전합니다. Browser.getVersion의 원본 응답을 확인하세요.");
  }
  return { protocolVersion: value.protocolVersion, product: value.product, revision: value.revision,
    userAgent: value.userAgent, jsVersion: value.jsVersion };
}

/** 버전·요청·실제 인자를 함께 남긴다. 수집 실패를 숨기거나 acceptance 성공으로 바꾸지 않는다. */
export async function collectStudioSoakBrowserLaunchEvidence(
  browser: StudioSoakBrowserMetadataSource,
  evidence: ReturnType<typeof createStudioSoakBrowserLaunchEvidence>,
): Promise<void> {
  evidence.browserVersion = browser.version();
  const session = await within(browser.newBrowserCDPSession(), "browser CDP session");
  let operationFailed = false;
  let operationError: unknown;
  try {
    await within((async () => {
      evidence.browserProtocolVersion = protocolVersion(await session.send("Browser.getVersion"));
      evidence.browserActualLaunchArgs = actualLaunchArgs(await session.send("Browser.getBrowserCommandLine"));
      assertRequestedArgs(evidence.browserActualLaunchArgs, evidence.browserLaunchArgs);
    })(), "browser metadata");
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }
  try { await within(session.detach(), "browser CDP detach"); }
  catch (error) {
    if (operationFailed) {
      throw new AggregateError([operationError, error],
        `Chromium 실행 정보 수집과 CDP 정리가 모두 실패했습니다. 수집: ${String(operationError)}; 정리: ${String(error)}`,
        { cause: error });
    }
    throw error;
  }
  if (operationFailed) throw operationError;
}
