/**
 * 소스 종류별 커스터마이즈 능력(레시피 v3, 2026-10-23 A-1) — 계약 `SourceCapabilities.custom`의 값.
 *
 * - 키트: v2 계획이면 계획이 판정한 값(`custom.capabilities`, 올린 파츠 기준), v1이면 `kitV1CustomCapabilities`.
 * - 제작 패키지: `packageCustomCapabilities`(지원 항목 없음 + 사유).
 * - 절차: 모델 데이터(`HumanoidModelData`)에서 판정한다 — 파츠의 채널(`channel`·`colorKey`)·영역 채널, 범위별 `shape:<이름>:±` morph,
 *   층 역할(inner·outer·legwear) 파츠. 계약 메시(`MeshPartData`)에는 UV1·앵커 부착 자리가 없어 무늬·헤어 흐름·앵커는 미지원이다.
 *   비례 목표는 절차 생성기가 지오메트리로 반영할 때만 available이다 — 모델 데이터로는 알 수 없어 조립하는 쪽이 `proceduralProportion`으로 밝힌다(기본 unavailable).
 *
 * 렌더 엔진은 `domains`를 import할 수 없으므로 이 값은 계획(키트 `custom`)으로 전달되거나, 앱 조립(composition)이 주입해 쓴다.
 * 사유 키·순서는 계약 순서(채널 → 형태 → 층 → 앵커 → patternUv → hairFlow → proportion)다. 미지원은 사유만 낸다(대체 없음).
 */
import {
  ACCESSORY_ANCHORS,
  ACCESSORY_ANCHOR_LABELS_KO,
  CHANNEL_LABELS_KO,
  DERIVED_CHANNEL_KEYS,
  PART_SCOPES,
  REGION_CHANNEL_KEYS,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  customReasonKey,
  meshPartChannel,
  parseShapeMorphName,
} from "../../contracts";

import { scopeLabelKo, shapeDisplayKo } from "./custom-labels";
import { kitV1CustomCapabilities } from "./kit-custom-capability";
import { isKitPlanV2 } from "./kit-plan-v2-types";
import { sortChannels } from "./kit-v2-mesh-info";
import { packageCustomCapabilities } from "./package-capability";

import type { CharacterSource, ChannelKey, CustomCapabilities, FixedPartScope, HumanoidModelData, PartRole, PartScope, WardrobeLayer } from "../../contracts";

export interface SourceCustomOptions {
  /** 절차 생성기가 비례 목표(두신 등)를 지오메트리로 반영하는지. 기본 "unavailable"(2026-10-23 현재 절차 생성기는 반영하지 않는다). */
  readonly proceduralProportion?: "available" | "unavailable";
}

/** 파츠 역할 → 형태 값 범위(헤어 부속은 액세서리 슬롯) */
const ROLE_SCOPE: Readonly<Partial<Record<PartRole, FixedPartScope>>> = {
  hair: "hair",
  top: "top",
  inner: "inner",
  outer: "outer",
  bottom: "bottom",
  legwear: "legwear",
  shoes: "shoes",
  accessory: "accessory",
  "hair-accessory": "accessory",
};

const LAYER_ROLES: Readonly<Record<WardrobeLayer, PartRole>> = { inner: "inner", outer: "outer", legwear: "legwear" };

/** 절차 모델의 커스터마이즈 능력(모델 데이터에서 판정) */
export function proceduralCustomCapabilities(model: HumanoidModelData, options: SourceCustomOptions = {}): CustomCapabilities {
  const reasons: Record<string, string> = {};

  const painted: ChannelKey[] = [];
  for (const part of model.parts) {
    const channel = meshPartChannel(part);
    if (channel !== null) painted.push(channel);
    painted.push(...(part.regionChannels ?? []));
  }
  const channels = sortChannels(painted);
  for (const key of DERIVED_CHANNEL_KEYS) {
    if (channels.includes(key)) continue;
    const label = CHANNEL_LABELS_KO[key];
    reasons[customReasonKey("channel", key)] = (REGION_CHANNEL_KEYS as readonly string[]).includes(key)
      ? `절차 머리 메시에 ${label} 영역 채널이 없어 따로 칠할 수 없습니다.`
      : `절차 모델에는 ${label} 채널을 칠하는 파츠가 없습니다.`;
  }

  const shapeNames = new Map<FixedPartScope, string[]>();
  const scopesPresent = new Set<FixedPartScope>();
  for (const part of model.parts) {
    const scope = ROLE_SCOPE[part.role];
    if (scope === undefined) continue;
    scopesPresent.add(scope);
    const names = shapeNames.get(scope) ?? [];
    for (const morph of part.morphs) {
      const parsed = parseShapeMorphName(morph.name);
      if (parsed !== null && !names.includes(parsed.name)) names.push(parsed.name);
    }
    shapeNames.set(scope, names);
  }
  const shapes: Partial<Record<PartScope, readonly string[]>> = {};
  for (const scope of PART_SCOPES) {
    const names = shapeNames.get(scope) ?? [];
    const label = scopeLabelKo(scope);
    if (names.length > 0) {
      shapes[scope] = names;
      reasons[customReasonKey("shape", scope)] = `절차 ${label} 파츠에는 이 형태 키가 없습니다(있는 형태 키: ${names.map(shapeDisplayKo).join(", ")}).`;
    } else {
      reasons[customReasonKey("shape", scope)] = scopesPresent.has(scope) ? `절차 ${label} 파츠에는 형태 키가 없습니다.` : `절차 모델에 ${label} 파츠가 없어 형태 키를 줄 곳이 없습니다.`;
    }
  }

  const roles = new Set(model.parts.map((part) => part.role));
  const layers: WardrobeLayer[] = [];
  for (const layer of WARDROBE_LAYERS) {
    if (roles.has(LAYER_ROLES[layer])) layers.push(layer);
    else reasons[customReasonKey("layer", layer)] = `절차 모델에 ${WARDROBE_LAYER_LABELS_KO[layer]} 층 파츠가 없습니다.`;
  }

  for (const anchor of ACCESSORY_ANCHORS) {
    reasons[customReasonKey("anchor", anchor)] = `절차 소스는 소품을 앵커에 따로 붙이지 않아(소품은 몸에 스킨된 파츠입니다) ${ACCESSORY_ANCHOR_LABELS_KO[anchor]} 앵커를 쓸 수 없습니다.`;
  }
  reasons[customReasonKey("patternUv")] = "절차 메시에는 패턴용 UV1이 없어 무늬를 그릴 수 없습니다.";
  reasons[customReasonKey("hairFlow")] = roles.has("hair") ? "절차 헤어 메시에는 흐름용 UV1이 없어 끝 색·포인트를 그릴 수 없습니다." : "절차 모델에 헤어가 없어 헤어 색 흐름을 그릴 곳이 없습니다.";
  const proportion = options.proceduralProportion ?? "unavailable";
  if (proportion === "unavailable") reasons[customReasonKey("proportion")] = "절차 소스는 아직 비례 목표(두신 등)로 몸을 다시 만들지 않습니다.";

  return { channels, shapes, layers, anchors: [], patternUv: false, hairFlow: false, proportion, reasonsKo: reasons };
}

/** 엔진에 올린(올릴) 소스의 커스터마이즈 능력 */
export function sourceCustomCapabilities(source: CharacterSource, options: SourceCustomOptions = {}): CustomCapabilities {
  switch (source.kind) {
    case "kit":
      return isKitPlanV2(source.plan) ? source.plan.custom.capabilities : kitV1CustomCapabilities();
    case "package":
      return packageCustomCapabilities(source.plan.manifest);
    case "procedural":
      return proceduralCustomCapabilities(source.model, options);
  }
}
