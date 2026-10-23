/**
 * 키트 v2 계획의 커스터마이즈 부분 타입(레시피 v3, 2026-10-23 A-1). 렌더 통합(R-3b)이 소비한다.
 *
 * 계약 `KitPlan`(contracts/character-kit.ts)은 v1 모양이라 v2 정보를 담을 자리가 없다. 그래서 v2 계획은 계약 `KitPlan` 필드(베이스 + 슬롯 파츠,
 * 메시·재질은 채널을 모르는 엔진용 v1 투영)를 그대로 채우고 **추가 필드 `custom`**에 v2 정보를 싣는다. 계약 타입으로는 `custom`이 보이지 않으므로
 * 앱·엔진을 거쳐도 값은 남고, render는 core가 이 모양을 계약으로 올린 뒤 읽는다(**계약 승격 요청** — 최종 보고 참조).
 * 그때까지 render 밖에서는 `isKitPlanV2`로 좁혀 쓴다.
 *
 * 계획은 지오메트리 입력(슬롯 + 옷장 층·추가 소품 프리셋)만의 함수다. 형태 값(partParams)·표면·헤어 색·비례 목표는 적용 시점 값이라
 * 계획에 넣지 않고(계획은 지오메트리 키가 바뀔 때만 다시 만들어진다), 이 타입의 능력 데이터로 `diagnoseKitCustomization`이 판정한다.
 */
import type {
  AccessoryAnchor,
  AccessoryInstanceId,
  ChannelKey,
  CustomCapabilities,
  KitHideableRegionId,
  KitPartSlot,
  KitPlan,
  KitV2Base,
  KitV2Material,
  KitV2Mesh,
  PartScope,
  PresetId,
  RegionChannelKey,
  WardrobeLayer,
} from "../../contracts";

/** 파일 종류: 베이스·슬롯 파츠(계약 `KitPlan.parts`와 같은 집합)·층·추가 소품 인스턴스 */
export type KitPlanFileKind = "base" | "part" | "layer" | "accessory";

/** 형태 키 하나: 이름·한글 라벨·그릴 수 있는 값 범위(− 방향만·+ 방향만인 키는 반쪽이다) */
export interface KitPlanShape {
  /** `shape:<이름>:±`의 이름 */
  readonly name: string;
  readonly labelKo: string;
  /** −1(− morph 있음) 또는 0 */
  readonly min: -1 | 0;
  /** 1(+ morph 있음) 또는 0 */
  readonly max: 0 | 1;
}

export interface KitPlanFile {
  /**
   * 베이스 `base/<베이스>`, 슬롯 파츠는 프리셋 id(계약 `KitPlan.parts[i].id`와 같다), 층은 `<층>:<프리셋 id>`, 추가 소품은 `<인스턴스 id>:<프리셋 id>`.
   * 같은 프리셋을 슬롯과 층에 함께 입거나 여러 인스턴스로 붙여도 id가 겹치지 않는다(같은 파일 url을 여러 항목이 가리킬 수 있다).
   */
  readonly id: string;
  readonly kind: KitPlanFileKind;
  /** 프리셋 슬롯(베이스는 null). 층은 그 층의 바탕 슬롯(top·bottom), 추가 소품은 accessory */
  readonly slot: KitPartSlot | null;
  readonly presetId: PresetId | null;
  /** 형태 값·소품 오프셋이 적용되는 파츠 범위(`PartScope`). 베이스·홍채는 범위가 없어 null */
  readonly scope: PartScope | null;
  readonly layer: WardrobeLayer | null;
  readonly instanceId: AccessoryInstanceId | null;
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  /** v2 메시 선언 원본(강체 여부·형태 morph·UV1 메타 포함) */
  readonly meshes: readonly KitV2Mesh[];
  /** 몸에서 숨길 영역(베이스는 빈 배열). 추가 소품은 기본 앵커 자리 기준 선언이다 */
  readonly hides: readonly KitHideableRegionId[];
  /** 그리는 메시(헤어는 고른 LOD)에 실제로 있는 형태 키. 선언했지만 그 LOD에 morph가 없는 키는 빠진다 */
  readonly shapes: readonly KitPlanShape[];
  /** 이 파일 재질이 칠하는 채널(계약 `CHANNEL_KEYS` 순서). 베이스는 머리 영역 마스크 채널(입술·볼 홍조)을 포함한다 */
  readonly channels: readonly ChannelKey[];
  /** 강체 메시(`skinned: false`) 노드 이름. 모든 메시가 강체여야 추가 소품으로 앵커에 붙일 수 있다 */
  readonly rigidMeshes: readonly string[];
  /** 강체 메시의 기본 앵커(변형 `anchor`). 추가 소품의 실제 앵커·오프셋은 적용 플랜(`ApplyPlan.accessories`)이 준다 */
  readonly defaultAnchor: AccessoryAnchor | null;
  /** 모든 메시에 패턴용 UV1(`uv1.purpose: "pattern"`)이 있는지 */
  readonly patternUv: boolean;
  /** 그리는 메시 전부에 헤어 흐름 UV1(`uv1.purpose: "hair-flow"`)이 있는지(헤어 파일만 의미가 있다) */
  readonly hairFlowUv: boolean;
  /** 그리는 메시(헤어는 고른 LOD)의 삼각형 합 */
  readonly activeTriangles: number;
}

/** 베이스 머리 영역 마스크(입술·볼 홍조 채널 → PNG 색 성분) */
export interface KitPlanRegionMask {
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly channels: Readonly<Partial<Record<RegionChannelKey, "r" | "g" | "b" | "a">>>;
}

export interface KitPlanBase {
  readonly heightM: number;
  /** 머리 높이(m, 정수리~턱) */
  readonly headHeightM: number;
  /** 두신 = heightM ÷ headHeightM(비례 근사의 출발점) */
  readonly headsTall: number;
  /** 앵커 → joint + joint 로컬 오프셋(m). 강체 소품을 붙이는 자리다 */
  readonly anchors: KitV2Base["anchors"];
  readonly headRegionMask: KitPlanRegionMask | null;
}

/** 레시피가 입힌 층·추가 소품 중 계획에 올리지 못한 것(대체 없이 사유만) */
export interface KitPlanSkip {
  readonly kind: "layer" | "accessory";
  /** 층 이름 또는 소품 인스턴스 id */
  readonly key: string;
  readonly presetId: string;
  readonly reasonKo: string;
}

export interface KitPlanCustom {
  readonly manifestVersion: 2;
  readonly base: KitPlanBase;
  /** [0, parts.length) = 계약 `KitPlan.parts`와 같은 순서·id(베이스 + 슬롯 파츠), 그 뒤 층(inner→outer→legwear)·추가 소품(레시피 순서) */
  readonly files: readonly KitPlanFile[];
  /** 계획의 모든 파일이 쓰는 v2 재질(이름 → 역할·채널·틴트) */
  readonly materials: Readonly<Record<string, KitV2Material>>;
  /**
   * 범위별 형태 키(이름·한글 라벨·값 범위) — 계약 `CustomCapabilities.shapes`(이름만)의 라벨·범위판이다. 키 순서는 능력과 같다
   * (고정 범위는 `PART_SCOPES`, 소품 인스턴스는 번호순). 슬라이더 UI·엔진의 범위 메시 적용이 이 값을 쓴다.
   */
  readonly shapes: Readonly<Partial<Record<PartScope, readonly KitPlanShape[]>>>;
  /** 이 계획(올린 파일)의 커스터마이즈 능력. 엔진이 `SourceCapabilities.custom`으로 보고한다 */
  readonly capabilities: CustomCapabilities;
  /** 무늬를 그릴 수 있는 채널: 그 채널을 칠하는 모든 메시에 패턴용 UV1이 있다(계약 `patternUv` 불리언보다 세밀한 판정) */
  readonly patternChannels: readonly ChannelKey[];
  readonly skipped: readonly KitPlanSkip[];
  /** 그리는 삼각형 합과 예산(`KIT_BUDGET.triangles.activeWorst`) */
  readonly triangles: { readonly active: number; readonly budget: number };
}

/** v2 manifest로 만든 계획(계약 `KitPlan` + `custom`) */
export interface KitPlanV2 extends KitPlan {
  readonly custom: KitPlanCustom;
}

/** 계약 `KitPlan`이 v2 계획인지(추가 필드 `custom`이 있는지) */
export function isKitPlanV2(plan: KitPlan): plan is KitPlanV2 {
  const custom = (plan as Partial<KitPlanV2>).custom;
  return typeof custom === "object" && custom !== null && custom.manifestVersion === 2;
}
