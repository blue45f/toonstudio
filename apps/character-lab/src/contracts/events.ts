/**
 * 명령(LabCommand)·이벤트(LabEvent) 유니온.
 * 명령은 패널 → store로 가는 사용자 의도이며 1 명령 = history 1단계다(`coalesceKey`가 있는 명령은 연속 드래그를 1단계로 병합).
 * 이벤트는 엔진·물리·비전·스케줄러 → store로 가는 상태 보고이며 history에 들어가지 않는다.
 *
 * 레시피 v3 명령(2026-10-23 CORE-1): `style/apply`·`look/set`·`proportion/set`·`channel/set`·`surface/set`·`part-param/set`·
 * `wardrobe/set`·`accessory/add|remove|set`·`hair-color/set`·`look-preset/apply`. 설계 목록(§2.4)에 없던 `proportion/set`(비례 슬라이더)과
 * `hair-color/set`(헤어 색 흐름)은 레시피 필드를 편집할 경로가 없으면 그 필드가 죽은 값이 되므로 더했다.
 */
import type { ArtStylePack, LookPatch, Proportion, StyleApplyScope, StyleFigure } from "./art-style";
import type { PoseScope } from "./bones";
import type { CaptureResult, ThumbnailEntry } from "./capture";
import type { CharacterLook } from "./character-look-recipe";
import type { ChannelKey } from "./color-channels";
import type { AccessoryAnchor, AccessoryInstanceId, AccessoryOffset, HairColor, PartScope, StyleFaceBinding, Surface, WardrobeLayer } from "./customization";
import type { EngineStatus } from "./engine";
import type { LabFailure } from "./errors";
import type { ExpressionWeights } from "./expression";
import type { RecipeColorKey } from "./mesh-data";
import type { PaintUndoToken } from "./paint";
import type { BodyParamKey, FaceParamKey } from "./params";
import type { PhysicsProviderId, PhysicsStatus } from "./physics";
import type { Pose } from "./pose";
import type { CharacterRecipe } from "./recipe";
import type { ShadingProfile } from "./shading";
import type { PresetId, SlotCapabilityMap, SlotKind } from "./slots";
import type { VisionStatus } from "./vision";

export type LabCommand =
  | { readonly type: "slot/apply"; readonly slot: SlotKind; readonly presetId: PresetId | null }
  | {
      readonly type: "param/set";
      readonly group: "body" | "face";
      readonly key: BodyParamKey | FaceParamKey;
      readonly value: number;
      /** 같은 키의 연속 드래그를 history 1단계로 병합 */
      readonly coalesceKey?: string;
    }
  /** 기본 8채널 색(v2 명령, 그대로 유지). 상속 채널까지 다루려면 `channel/set`을 쓴다. */
  | { readonly type: "color/set"; readonly key: RecipeColorKey; readonly value: string }
  | {
      readonly type: "expression/set";
      readonly weights: ExpressionWeights;
      readonly merge: boolean;
      /**
       * FACS 슬라이더의 연속 드래그를 history 1단계로 병합(`param/set`과 같은 의미, 2026-10-01 animation 요청으로 추가).
       * state/lab-store가 `param/set`과 동일하게 history 항목에 전달한다.
       */
      readonly coalesceKey?: string;
    }
  /** IK·관절 드래그·사진 포즈 결과도 이 명령으로 기록한다 */
  | { readonly type: "pose/set"; readonly pose: Pose; readonly scope: PoseScope; readonly labelKo: string }
  | { readonly type: "hand-pose/set"; readonly side: "left" | "right"; readonly presetId: PresetId | null }
  /** 부분 셰이딩(v2 그대로: 지정한 하위 객체를 통째로 바꾼다). look 부분 변경은 `look/set`을 쓴다. */
  | { readonly type: "shading/set"; readonly profile: Partial<ShadingProfile> }
  | { readonly type: "physics/set-provider"; readonly provider: PhysicsProviderId }
  | { readonly type: "source/set"; readonly source: CharacterRecipe["source"]; readonly capabilities: SlotCapabilityMap }
  | { readonly type: "recipe/load"; readonly recipe: CharacterRecipe }
  | { readonly type: "paint/stroke"; readonly undoToken: PaintUndoToken }
  // ---- 레시피 v3 ----
  /**
   * 화풍 팩 적용(copy-on-apply). 범위별로 값을 레시피에 복사한다:
   * - look: `shading.mode`=toon, `shading.toon`의 램프·림·외곽선, `shading.look` ← 팩
   * - proportion: `style.proportion` ← `pack.proportion[figure]`
   * - face: `face` 바인딩(소스별 매핑, 프리셋 데이터가 만든다)의 눈·눈동자 프리셋(카탈로그 patch 포함) → 얼굴 값 → `style.neutralFacs`
   * - palette: 피부 ← `pack.palette.skin[paletteIndex.skin ?? 0]`, 헤어·눈썹 ← `pack.palette.hair[paletteIndex.hair ?? 0]`(헤어 팔레트가 있을 때)
   * 범위가 하나라도 있으면 `style.packId`·`packRevision`을 팩으로 기록한다. 범위가 비었거나 face 범위인데 바인딩이 없으면 거부한다.
   */
  | {
      readonly type: "style/apply";
      readonly pack: ArtStylePack;
      readonly scope: StyleApplyScope;
      readonly figure: StyleFigure;
      readonly face?: StyleFaceBinding;
      readonly paletteIndex?: { readonly skin?: number; readonly hair?: number };
    }
  /** look 오버라이드(그룹별 병합). 화풍 팩 출처(`style.packId`)는 바꾸지 않는다. */
  | { readonly type: "look/set"; readonly patch: LookPatch; readonly coalesceKey?: string }
  /** 비례 목표 부분 변경. null = 소스 고유 비례로 되돌림. 비례가 없을 때 처음 정하려면 6축을 모두 준다. */
  | { readonly type: "proportion/set"; readonly proportion: Partial<Proportion> | null; readonly coalesceKey?: string }
  /** 채널 색. null = 직접 지정을 지워 상속으로 되돌림(기본 8채널은 null 불가) */
  | { readonly type: "channel/set"; readonly key: ChannelKey; readonly value: string | null; readonly coalesceKey?: string }
  /** 채널 표면(재질·패턴). null = 지정을 지움(역할·프리셋 기본 재질) */
  | { readonly type: "surface/set"; readonly channel: ChannelKey; readonly surface: Surface | null }
  /** 파츠 형태 값 −1..1(0이면 지운다). 소품 인스턴스 범위(acc-<n>)는 그 인스턴스가 있어야 한다. */
  | { readonly type: "part-param/set"; readonly scope: PartScope; readonly shape: string; readonly value: number; readonly coalesceKey?: string }
  /** 겹쳐 입기 층(inner·outer = top/*, legwear = bottom/*). 카탈로그 patch(색)는 적용하지 않는다 — 층 색은 채널 상속으로 정한다. */
  | { readonly type: "wardrobe/set"; readonly layer: WardrobeLayer; readonly presetId: PresetId | null }
  /** 추가 소품(가장 작은 빈 id acc-<n>을 받는다, 최대 11개) */
  | { readonly type: "accessory/add"; readonly presetId: PresetId; readonly anchor: AccessoryAnchor; readonly offset?: AccessoryOffset }
  /** 추가 소품 제거(그 소품의 형태 값도 지운다) */
  | { readonly type: "accessory/remove"; readonly id: AccessoryInstanceId }
  /** 추가 소품 변경(오프셋은 부분 지정) */
  | {
      readonly type: "accessory/set";
      readonly id: AccessoryInstanceId;
      readonly presetId?: PresetId;
      readonly anchor?: AccessoryAnchor;
      readonly offset?: Partial<AccessoryOffset>;
      readonly coalesceKey?: string;
    }
  /** 헤어 색 흐름(그라데이션 구간·끝 색 섞기·포인트) 부분 변경 */
  | { readonly type: "hair-color/set"; readonly patch: Partial<HairColor>; readonly coalesceKey?: string }
  /** "내 룩"·코디 세트·섞기 결과(look/1 문서) 적용: 범위 안 키를 문서 값으로 교체한다 */
  | { readonly type: "look-preset/apply"; readonly look: CharacterLook }
  | { readonly type: "history/undo" }
  | { readonly type: "history/redo" };

export type LabCommandType = LabCommand["type"];

/** history에 기록되는(레시피를 바꾸는) 명령 */
export type RecipeCommand = Exclude<LabCommand, { type: "history/undo" | "history/redo" | "paint/stroke" }>;

/** 명령의 병합 키(없으면 undefined). `param/set`·`expression/set`과 v3 슬라이더 명령(look·비례·채널·형태·소품·헤어 색)이 가진다. */
export function commandCoalesceKey(command: LabCommand): string | undefined {
  return "coalesceKey" in command && typeof command.coalesceKey === "string" ? command.coalesceKey : undefined;
}

export type LabEvent =
  | { readonly type: "engine/status"; readonly status: EngineStatus }
  | { readonly type: "capture/done"; readonly result: CaptureResult }
  | { readonly type: "failure"; readonly failure: LabFailure }
  | { readonly type: "failure/dismiss"; readonly failure: LabFailure }
  | { readonly type: "vision/status"; readonly status: VisionStatus }
  | { readonly type: "physics/status"; readonly status: PhysicsStatus }
  | { readonly type: "thumbnail/update"; readonly presetId: PresetId; readonly entry: ThumbnailEntry }
  /**
   * 엔진이 방금 올린 소스의 슬롯 능력 보고(2026-10-01 core 추가). history에 들어가지 않으며(undo 단계 없음) 현재 소스와 스토어의 능력 맵이
   * 어긋났을 때(기본 절차 소스, `recipe/load`로 소스가 바뀐 경우) 적용 루프가 `loadSource` 결과로 맞춘다.
   * 제작 패키지를 사용자가 고르는 흐름의 `source/set`(능력 맵까지 undo/redo)과는 별개다.
   */
  | { readonly type: "source/capabilities"; readonly capabilities: SlotCapabilityMap };

export type LabEventType = LabEvent["type"];
