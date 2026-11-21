/** Linux 실측에서 canvas 표시와 GC 전후 readback을 함께 확인한 SwiftShader 설정이다. */
export const STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS = Object.freeze([
  "--disable-dev-shm-usage",
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
  // 이번 Linux WebGPU 비교에서 검증하지 않은 프로필·플랫폼의 기존 경로는 유지한다.
  const args = ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=swiftshader"];
  if (webgpu) args.push("--enable-unsafe-webgpu");
  return args;
}
