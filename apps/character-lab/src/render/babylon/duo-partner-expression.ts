/** 상대역 GLB의 표정 프리셋을 적용하고 이전에 활성화된 표정 채널을 초기화한다. */
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";

import type { loadCharacterAssetContainer } from "./package-loader";
import type { DuoPartnerExpressionPreset } from "../../contracts";

type LoadedContainer = Awaited<ReturnType<typeof loadCharacterAssetContainer>>;

const PARTNER_EXPRESSION_WEIGHTS: Readonly<Record<DuoPartnerExpressionPreset, Readonly<Record<string, number>>>> = {
  neutral: {},
  "warm-smile": {
    mouthSmile: 0.78,
    eyeSquint: 0.36,
    browInnerUp: 0.22,
    HappyBrow: 0.58,
  },
  "cold-smirk": {
    mouthSmile: 0.42,
    eyeSquint: 0.3,
    browDown: 0.28,
    AngryBrow: 0.26,
  },
  shocked: {
    eyeWide: 0.82,
    jawOpen: 0.48,
    browInnerUp: 0.68,
    mouthFunnel: 0.26,
  },
  "stern-glare": {
    mouthFrown: 0.52,
    browDown: 0.72,
    eyeSquint: 0.28,
    AngryBrow: 0.68,
  },
};

export function applyDuoPartnerExpressionMorphs(container: LoadedContainer, expression: DuoPartnerExpressionPreset): void {
  const weights = PARTNER_EXPRESSION_WEIGHTS[expression] ?? PARTNER_EXPRESSION_WEIGHTS.neutral;
  const knownKeys = new Set<string>([
    "mouthSmile",
    "mouthFrown",
    "jawOpen",
    "mouthPucker",
    "mouthFunnel",
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeWide",
    "eyeSquint",
    "browInnerUp",
    "browDown",
    "cheekPuff",
    "HappyBrow",
    "AngryBrow",
  ]);
  for (const abstract of container.meshes) {
    if (!(abstract instanceof Mesh)) continue;
    const manager = abstract.morphTargetManager;
    if (!manager) continue;
    manager.useTextureToStoreTargets = true;
    for (let i = 0; i < manager.numTargets; i += 1) {
      const target = manager.getTarget(i);
      const rawName = target.name;
      const stripped = rawName.startsWith("facs:") ? rawName.slice(5) : rawName;
      if (stripped in weights) {
        target.influence = weights[stripped] ?? 0;
      } else if (knownKeys.has(stripped)) {
        target.influence = 0;
      }
    }
  }
}
