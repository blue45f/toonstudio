/**
 * `/studio/canvas` 라이브 포인터 루프와 실시간 필기감 이펙트(`StudioNibTactileVfxOverlay`)를
 * 지연 `import()`로 연결하는 메모리 전용 경량 브리지.
 * - 브라우저 영속 키-값 저장소(`localStorage`/`sessionStorage`)를 사용하지 않는다.
 */
import type { NibTactileVfxMode, NibVfxPointerSample } from "../brush-feel-vfx/nib-tactile-vfx-engine";

export type { NibTactileVfxMode, NibVfxPointerSample };

export const STUDIO_LIVE_NIB_VFX_ORDER: readonly NibTactileVfxMode[] = Object.freeze(["subtle", "vivid", "off"]);

interface LiveNibVfxBridgeModule {
  readonly emitStudioNibVfxSample: (sample: NibVfxPointerSample) => void;
  readonly setStudioNibVfxMode: (mode: NibTactileVfxMode) => void;
}

let liveNibVfxMode: NibTactileVfxMode = "subtle";
const liveNibVfxModeListeners = new Set<(mode: NibTactileVfxMode) => void>();
let liveNibVfxModule: LiveNibVfxBridgeModule | null = null;
let liveNibVfxLoadPromise: Promise<LiveNibVfxBridgeModule | null> | null = null;

function ensureLiveNibVfxModule(): LiveNibVfxBridgeModule | null {
  if (liveNibVfxModule) return liveNibVfxModule;
  if (!liveNibVfxLoadPromise) {
    liveNibVfxLoadPromise = import("../brush-feel-vfx/StudioNibTactileVfxOverlay")
      .then((mod) => {
        liveNibVfxModule = {
          emitStudioNibVfxSample: mod.emitStudioNibVfxSample,
          setStudioNibVfxMode: mod.setStudioNibVfxMode,
        };
        liveNibVfxModule.setStudioNibVfxMode(liveNibVfxMode);
        return liveNibVfxModule;
      })
      .catch(() => null);
  }
  return null;
}

export function dispatchLiveNibVfxSample(sample: NibVfxPointerSample): void {
  if (liveNibVfxMode === "off") return;
  const loaded = ensureLiveNibVfxModule();
  if (loaded) loaded.emitStudioNibVfxSample(sample);
}

export const getLiveNibVfxMode = (): NibTactileVfxMode => liveNibVfxMode;

export const setLiveNibVfxMode = (mode: NibTactileVfxMode): NibTactileVfxMode => {
  const next: NibTactileVfxMode = mode === "vivid" || mode === "off" || mode === "subtle" ? mode : "subtle";
  liveNibVfxMode = next;
  liveNibVfxModule?.setStudioNibVfxMode(next);
  for (const listener of [...liveNibVfxModeListeners]) listener(next);
  return next;
};

export const cycleLiveNibVfxMode = (): NibTactileVfxMode => {
  const idx = STUDIO_LIVE_NIB_VFX_ORDER.indexOf(liveNibVfxMode);
  return setLiveNibVfxMode(STUDIO_LIVE_NIB_VFX_ORDER[(idx + 1) % STUDIO_LIVE_NIB_VFX_ORDER.length] ?? "subtle");
};

export const subscribeLiveNibVfxMode = (listener: (mode: NibTactileVfxMode) => void): (() => void) => {
  liveNibVfxModeListeners.add(listener);
  return () => {
    liveNibVfxModeListeners.delete(listener);
  };
};
