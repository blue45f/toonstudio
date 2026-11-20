/**
 * 렌더 텔레메트리 및 4모드 안구 하이라이트 구조적 포트(순수, Babylon 의존성 0).
 *
 * UI(`app/shell/panels/RenderPanel.tsx`)가 `render/babylon/**`를 직접 import하지 않고
 * 엔진의 실제 활성 셰이더 패스 상태와 안구 하이라이트 변환 포트를 안전하게 읽는다.
 */
import type { Vec3 } from "../contracts";
import type { CharacterLabRenderTelemetry } from "./style/character-verify-ai-fresh-ideas";
import type { EyeballHighlightMode } from "./toon-reference";

export const EYEBALL_HIGHLIGHT_MODES: readonly EyeballHighlightMode[] = ["fix", "cam", "light", "world"] as const;

export const EYEBALL_HIGHLIGHT_MODE_LABELS_KO: Readonly<Record<EyeballHighlightMode, string>> = Object.freeze({
  fix: "고정(안구 기준)",
  cam: "카메라 추적",
  light: "광원 기준",
  world: "월드 고정",
});

export interface EyeballHighlightConfig {
  readonly mode: EyeballHighlightMode;
  readonly offsetPos: readonly [number, number];
  /** F10 시선 카메라 고정(fixEyeballCam) 활성화 여부 */
  readonly fixEyeballCam: boolean;
}

export interface EyeballHighlightState extends EyeballHighlightConfig {
  readonly resolvedEyeballEulerDeg: Vec3;
  readonly highlightEulerDeg: Vec3;
}

export const DEFAULT_EYEBALL_HIGHLIGHT_CONFIG: EyeballHighlightConfig = Object.freeze({
  mode: "cam",
  offsetPos: [0, 0] as const,
  fixEyeballCam: false,
});

export interface EyeballHighlightPort {
  eyeballHighlight(): EyeballHighlightState;
  setEyeballHighlight(patch: Partial<EyeballHighlightConfig>): EyeballHighlightState;
}

export interface RenderTelemetryPort {
  renderTelemetry(): CharacterLabRenderTelemetry;
}

export interface RigInspectablePort {
  inspectRig(): {
    readonly kind: "procedural" | "package" | "kit";
    readonly parts: ReadonlyArray<{
      readonly role: string;
      readonly faceShadowUv?: boolean;
      readonly hairFlowUv?: boolean;
    }>;
  } | null;
}

export function hasEyeballHighlight(engine: unknown): engine is EyeballHighlightPort {
  if (typeof engine !== "object" || engine === null) return false;
  const candidate = engine as Partial<EyeballHighlightPort>;
  return typeof candidate.eyeballHighlight === "function" && typeof candidate.setEyeballHighlight === "function";
}

export function hasRenderTelemetry(engine: unknown): engine is RenderTelemetryPort {
  return typeof engine === "object" && engine !== null && typeof (engine as Partial<RenderTelemetryPort>).renderTelemetry === "function";
}

export function readRenderTelemetry(engine: unknown): CharacterLabRenderTelemetry | null {
  return hasRenderTelemetry(engine) ? engine.renderTelemetry() : null;
}

export function readKitHeadFaceShadowUv(engine: unknown): boolean {
  if (typeof engine !== "object" || engine === null) return false;
  const candidate = engine as Partial<RigInspectablePort>;
  if (typeof candidate.inspectRig !== "function") return false;
  const rig = candidate.inspectRig();
  if (!rig || rig.kind !== "kit") return false;
  return rig.parts.some((part) => part.role === "head" && part.faceShadowUv === true);
}
