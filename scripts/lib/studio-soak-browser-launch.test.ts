import { readFileSync } from "node:fs";
import { Script } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectStudioSoakBrowserLaunchEvidence, createStudioSoakBrowserLaunchEvidence,
  resolveStudioSoakBrowserLaunchArgs, STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS,
} from "./studio-soak-browser-launch";

const verifiedLinuxArgs = [
  "--disable-dev-shm-usage", "--enable-automation", "--no-sandbox", "--enable-unsafe-webgpu",
  "--enable-features=CDPScreenshotNewSurface,Vulkan", "--use-vulkan=swiftshader",
  "--use-webgpu-adapter=swiftshader", "--use-gpu-in-tests", "--use-gl=angle",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
];
const angleArgs = ["--disable-dev-shm-usage", "--enable-automation", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const version = { protocolVersion: "1.3", product: "Chrome/158.0.8127.18", revision: "@revision",
  userAgent: "HeadlessChrome/158.0.8127.18", jsVersion: "15.8.0" };

afterEach(() => vi.useRealTimers());

describe("소크의 SwiftShader 표시와 실행 정보 수집 설정", () => {
  it("검증한 Linux WebGPU 전체 조합과 screenshot feature를 보존한다", () => {
    expect(resolveStudioSoakBrowserLaunchArgs(true, "linux")).toEqual(verifiedLinuxArgs);
    expect(Object.isFrozen(STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS)).toBe(true);
  });

  it.each<NodeJS.Platform>(["linux", "darwin", "win32"])("%s의 비 WebGPU 프로필도 공식 ANGLE 경로를 사용한다", (platform) => {
    expect(resolveStudioSoakBrowserLaunchArgs(false, platform)).toEqual(angleArgs);
  });

  it.each<NodeJS.Platform>(["darwin", "win32", "freebsd"])("실측하지 않은 %s에 Linux Vulkan 조합을 적용하지 않는다", (platform) => {
    expect(resolveStudioSoakBrowserLaunchArgs(true, platform)).toEqual([...angleArgs, "--enable-unsafe-webgpu"]);
  });

  it("호출자가 인자를 바꿔도 다른 실행과 진단 상수를 오염시키지 않는다", () => {
    const first = resolveStudioSoakBrowserLaunchArgs(true, "linux");
    first.splice(0, first.length, "--disable-gpu");
    expect(resolveStudioSoakBrowserLaunchArgs(true, "linux")).toEqual(verifiedLinuxArgs);
    expect(STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS).toEqual(verifiedLinuxArgs);
    const normal = resolveStudioSoakBrowserLaunchArgs(false, "linux");
    normal.push("--enable-unsafe-webgpu");
    expect(resolveStudioSoakBrowserLaunchArgs(false, "linux")).toEqual(angleArgs);
  });

  it("플랫폼을 생략한 실제 호출은 현재 프로세스 플랫폼을 사용한다", () => {
    expect(resolveStudioSoakBrowserLaunchArgs(true)).toEqual(resolveStudioSoakBrowserLaunchArgs(true, process.platform));
  });
});

function browserMetadata(args: string[] = verifiedLinuxArgs) {
  const send = vi.fn(async (method: string): Promise<unknown> => method === "Browser.getVersion" ? version
    : { arguments: ["/chromium", "--headless", ...args] });
  const detach = vi.fn(async () => undefined);
  const browser = { version: () => "158.0.8127.18", newBrowserCDPSession: vi.fn(async () => ({ send, detach })) };
  return { browser, send, detach };
}

describe("실제 Chromium 실행 증거", () => {
  it("설치 버전·요청 인자·실제 인자·프로토콜 버전을 함께 기록하고 CDP를 해제한다", async () => {
    const { browser, send, detach } = browserMetadata();
    const requested = [...verifiedLinuxArgs];
    const evidence = createStudioSoakBrowserLaunchEvidence(requested);
    requested.push("--disable-gpu");
    await collectStudioSoakBrowserLaunchEvidence(browser, evidence);
    expect(evidence).toMatchObject({ browserVersion: "158.0.8127.18", browserLaunchArgs: verifiedLinuxArgs,
      browserActualLaunchArgs: ["/chromium", "--headless", ...verifiedLinuxArgs], browserProtocolVersion: version });
    expect(evidence.playwrightVersion).toMatch(/^\d+\.\d+\.\d+/u);
    expect(send.mock.calls.map(([method]) => method)).toEqual(["Browser.getVersion", "Browser.getBrowserCommandLine"]);
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("command-line 수집 실패를 숨기지 않고 이미 얻은 버전은 보존한다", async () => {
    const { browser, send, detach } = browserMetadata();
    const error = new Error("Command line not returned because --enable-automation not set.");
    send.mockImplementation(async (method) => { if (method === "Browser.getVersion") return version; throw error; });
    const evidence = createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs);
    await expect(collectStudioSoakBrowserLaunchEvidence(browser, evidence)).rejects.toBe(error);
    expect(evidence.browserVersion).toBe("158.0.8127.18");
    expect(evidence.browserProtocolVersion).toEqual(version);
    expect(evidence.browserActualLaunchArgs).toBeNull();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it.each<unknown>([{ arguments: [] }, { arguments: ["/chromium", 1] }, {}, null])("실제 인자 응답이 잘못되면 거부한다: %j", async (response) => {
    const { browser, send, detach } = browserMetadata();
    send.mockImplementation(async (method) => method === "Browser.getVersion" ? version : response);
    await expect(collectStudioSoakBrowserLaunchEvidence(browser, createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs)))
      .rejects.toThrow("실제 실행 인자");
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it.each([
    verifiedLinuxArgs.filter((argument) => argument !== "--enable-automation"),
    [...verifiedLinuxArgs, "--use-gl=swiftshader"],
    [...verifiedLinuxArgs, "--enable-features=Vulkan"],
  ])("누락되거나 뒤에서 덮어쓴 설정을 요청대로 실행한 증거로 인정하지 않는다", async (...actual) => {
    const { browser } = browserMetadata(actual);
    const evidence = createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs);
    await expect(collectStudioSoakBrowserLaunchEvidence(browser, evidence)).rejects.toThrow("실행 인자가 요청과 다릅니다");
    expect(evidence.browserActualLaunchArgs).toEqual(["/chromium", "--headless", ...actual]);
  });

  it("불완전한 버전 응답도 실패로 보존한다", async () => {
    const { browser, send } = browserMetadata();
    send.mockResolvedValue({ product: version.product });
    await expect(collectStudioSoakBrowserLaunchEvidence(browser, createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs)))
      .rejects.toThrow("버전 응답이 불완전");
  });

  it("수집과 정리가 함께 실패하면 두 원인을 모두 보존한다", async () => {
    const { browser, send, detach } = browserMetadata();
    const primary = new Error("버전 수집 오류");
    const cleanup = new Error("CDP 해제 오류");
    send.mockRejectedValue(primary);
    detach.mockRejectedValue(cleanup);
    await expect(collectStudioSoakBrowserLaunchEvidence(browser, createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs)))
      .rejects.toMatchObject({ errors: [primary, cleanup], cause: cleanup,
        message: expect.stringContaining("버전 수집 오류; 정리: Error: CDP 해제 오류") });
  });

  it("수집 성공 뒤 CDP 정리만 실패해도 정상 수집으로 보고하지 않는다", async () => {
    const { browser, detach } = browserMetadata();
    const error = new Error("CDP 해제 오류");
    detach.mockRejectedValue(error);
    await expect(collectStudioSoakBrowserLaunchEvidence(browser, createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs)))
      .rejects.toBe(error);
  });

  it("응답 없는 수집을 제한 시간 내 실패시키고 타이머와 CDP를 회수한다", async () => {
    vi.useFakeTimers();
    const { browser, send, detach } = browserMetadata();
    send.mockImplementation(async () => new Promise<never>(() => undefined));
    const result = expect(collectStudioSoakBrowserLaunchEvidence(browser, createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs)))
      .rejects.toThrow("8000ms");
    await vi.advanceTimersByTimeAsync(8_000);
    await result;
    expect(detach).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

function actualSoakLaunch() {
  const source = readFileSync(new URL("../verify-studio-five-hour-soak.mts", import.meta.url), "utf8");
  const start = source.indexOf("  browser = await chromium.launch(");
  const end = source.indexOf("  const context = await browser.newContext(", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return new Script(`(async () => { let browser; ${source.slice(start, end)} })()`);
}

describe("실제 소크 launch와 진단의 설정 연결", () => {
  it.each([true, false])("WebGPU=%s의 실제 launch 인자와 수집 보고서가 일치한다", async (webgpu) => {
    const expected = webgpu ? verifiedLinuxArgs : angleArgs;
    const { browser } = browserMetadata(expected);
    const launch = vi.fn(async () => browser);
    const report = createStudioSoakBrowserLaunchEvidence(resolveStudioSoakBrowserLaunchArgs(webgpu, "linux"));
    await actualSoakLaunch().runInNewContext({ chromium: { launch }, report, collectStudioSoakBrowserLaunchEvidence });
    expect(launch).toHaveBeenCalledExactlyOnceWith({ args: expected });
    expect(report.browserLaunchArgs).toEqual(expected);
    expect(report.browserActualLaunchArgs).toEqual(["/chromium", "--headless", ...expected]);
  });

  it("실제 launch 실패를 정상 보고서로 바꾸지 않고 요청 조건을 보존한다", async () => {
    const error = new Error("GPU 프로세스를 시작하지 못했습니다.");
    const report = createStudioSoakBrowserLaunchEvidence(verifiedLinuxArgs);
    await expect(actualSoakLaunch().runInNewContext({
      chromium: { launch: vi.fn(async () => { throw error; }) }, report, collectStudioSoakBrowserLaunchEvidence,
    })).rejects.toBe(error);
    expect(report.browserLaunchArgs).toEqual(verifiedLinuxArgs);
    expect(report.browserVersion).toBeNull();
    expect(report.browserActualLaunchArgs).toBeNull();
  });

  it("독립 진단의 양군 모두 automation 조건을 맞추며 WebGPU 소크와 같은 설정으로 비교한다", () => {
    const source = readFileSync(new URL("../diagnose-studio-soak-webgpu.mts", import.meta.url), "utf8");
    const start = source.indexOf("const CONFIGURATIONS = ");
    const end = source.indexOf("] as const;", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const configurations = new Script(`${source.slice(start, end + 1)}; CONFIGURATIONS;`)
      .runInNewContext({ STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS });
    expect(configurations).toEqual([
      { id: "existing", args: ["--disable-dev-shm-usage", "--enable-automation", "--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--enable-unsafe-webgpu"] },
      { id: "vulkan-angle", args: verifiedLinuxArgs },
    ]);
  });
});
