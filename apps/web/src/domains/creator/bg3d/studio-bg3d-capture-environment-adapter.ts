import type { StudioBg3dCaptureEnvironmentReceipt } from "./studio-bg3d-capture-environment-receipt";

interface CaptureEnvironmentOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

type AcquireEnvironment = (options: CaptureEnvironmentOptions) => Promise<StudioBg3dCaptureEnvironmentReceipt>;
const authorities = new WeakMap<object, AcquireEnvironment>();

/** 실제 adapter identity와 공개 DTO를 유지한 채 캡처 준비 권위만 결박한다. */
export function registerStudioBg3dCaptureEnvironmentAdapter(adapter: object, acquire: AcquireEnvironment): void {
  authorities.set(adapter, acquire);
}

/** 제품 bridge의 폐기된 권위도 남겨 stale adapter가 무검사 경로로 돌아가지 않게 한다. */
export function acquireStudioBg3dCaptureEnvironmentForAdapter(
  adapter: object,
  options: CaptureEnvironmentOptions = {},
): Promise<StudioBg3dCaptureEnvironmentReceipt> | undefined {
  return authorities.get(adapter)?.(options);
}
