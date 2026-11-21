import { readFileSync } from "node:fs";
import { Script } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { resolveStudioSoakBrowserLaunchArgs, STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS } from "./studio-soak-browser-launch";

const verifiedLinuxArgs = [
  "--disable-dev-shm-usage", "--no-sandbox", "--enable-unsafe-webgpu",
  "--enable-features=CDPScreenshotNewSurface,Vulkan", "--use-vulkan=swiftshader",
  "--use-webgpu-adapter=swiftshader", "--use-gpu-in-tests", "--use-gl=angle",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
];
const previousArgs = ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=swiftshader"];

describe("소크의 검증된 Linux WebGPU 표시 설정", () => {
  it("Dawn·ANGLE·Vulkan을 함께 고정하고 screenshot feature를 보존한다", () => {
    expect(resolveStudioSoakBrowserLaunchArgs(true, "linux")).toEqual(verifiedLinuxArgs);
    expect(Object.isFrozen(STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS)).toBe(true);
  });

  it.each<NodeJS.Platform>(["linux", "darwin", "win32"])("%s의 비 WebGPU 프로필은 기존 설정을 유지한다", (platform) => {
    expect(resolveStudioSoakBrowserLaunchArgs(false, platform)).toEqual(previousArgs);
  });

  it.each<NodeJS.Platform>(["darwin", "win32", "freebsd"])("실측하지 않은 %s WebGPU 경로를 바꾸지 않는다", (platform) => {
    expect(resolveStudioSoakBrowserLaunchArgs(true, platform)).toEqual([...previousArgs, "--enable-unsafe-webgpu"]);
  });

  it("호출자가 인자를 바꿔도 다른 실행과 진단 상수를 오염시키지 않는다", () => {
    const first = resolveStudioSoakBrowserLaunchArgs(true, "linux");
    first.splice(0, first.length, "--disable-gpu");
    expect(resolveStudioSoakBrowserLaunchArgs(true, "linux")).toEqual(verifiedLinuxArgs);
    expect(STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS).toEqual(verifiedLinuxArgs);
    const previous = resolveStudioSoakBrowserLaunchArgs(false, "linux");
    previous.push("--enable-unsafe-webgpu");
    expect(resolveStudioSoakBrowserLaunchArgs(false, "linux")).toEqual(previousArgs);
  });

  it("플랫폼을 생략한 실제 호출은 현재 프로세스 플랫폼을 사용한다", () => {
    expect(resolveStudioSoakBrowserLaunchArgs(true)).toEqual(resolveStudioSoakBrowserLaunchArgs(true, process.platform));
  });
});

function actualSoakLaunch() {
  const source = readFileSync(new URL("../verify-studio-five-hour-soak.mts", import.meta.url), "utf8");
  const start = source.indexOf("  const args = resolveStudioSoakBrowserLaunchArgs(");
  const end = source.indexOf("  const context = await browser.newContext(", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return new Script(`(async () => { let browser; ${source.slice(start, end)} })()`);
}

describe("실제 소크 launch와 진단의 설정 연결", () => {
  it.each([true, false])("WebGPU=%s의 실제 launch 인자와 보고서가 일치한다", async (webgpu) => {
    const launch = vi.fn(async () => ({ version: () => "158.0.8127.18" }));
    const report = { browserVersion: null, browserLaunchArgs: [] };
    await actualSoakLaunch().runInNewContext({
      chromium: { launch }, report, WEBGPU: webgpu,
      resolveStudioSoakBrowserLaunchArgs: (requested: boolean) => resolveStudioSoakBrowserLaunchArgs(requested, "linux"),
    });
    const expected = webgpu ? verifiedLinuxArgs : previousArgs;
    expect(launch).toHaveBeenCalledExactlyOnceWith({ args: expected });
    expect(report).toEqual({ browserVersion: "158.0.8127.18", browserLaunchArgs: expected });
  });

  it("실제 launch 실패를 정상 보고서로 바꾸지 않는다", async () => {
    const error = new Error("GPU 프로세스를 시작하지 못했습니다.");
    const report = { browserVersion: null, browserLaunchArgs: [] };
    await expect(actualSoakLaunch().runInNewContext({
      chromium: { launch: vi.fn(async () => { throw error; }) }, report, WEBGPU: true,
      resolveStudioSoakBrowserLaunchArgs,
    })).rejects.toBe(error);
    expect(report).toEqual({ browserVersion: null, browserLaunchArgs: [] });
  });

  it("독립 8조건 진단도 같은 Linux 설정으로 비교한다", () => {
    const source = readFileSync(new URL("../diagnose-studio-soak-webgpu.mts", import.meta.url), "utf8");
    const start = source.indexOf("const CONFIGURATIONS = ");
    const end = source.indexOf("] as const;", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const configurations = new Script(`${source.slice(start, end + 1)}; CONFIGURATIONS;`)
      .runInNewContext({ STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS });
    expect(configurations).toEqual([
      { id: "existing", args: [...previousArgs, "--enable-unsafe-webgpu"] },
      { id: "vulkan-angle", args: verifiedLinuxArgs },
    ]);
  });
});
