/**
 * 같은 장소 세트 패키지 — 장소별 카메라·조명·소품 정본 상태를 버전으로 관리한다.
 *
 * 근거: creative-features REPORT A-4 — "장소를 세트로 등록하면 카메라 프리셋·조명·소품 배치가
 * 묶여 버전으로 남고, 새 회차에서 세트를 열면 마지막 정본 상태로 시작한다. 세트가 바뀌면
 * 사용 회차에 P-4식 영향 알림이 간다." 배경 '파일'이 아니라 장소 '정본 상태'를 다룬다.
 *
 * 이 모듈은 순수 모델이다. 씬 문서(studio-bg3d-scene-document-types)의 카메라·조명 타입과
 * 노드(소품) 배치를 그대로 스냅샷하므로 엔진·렌더러와 무관하게 동작한다.
 * 버전은 추가만 가능하고(append-only), 정본은 항상 가장 큰 버전 번호다.
 */

import type {
  StudioBg3dCameraSettings,
  StudioBg3dLightingSettings,
  StudioBg3dSceneDocument,
  StudioBg3dSceneNode,
  StudioBg3dTransform,
} from "./studio-bg3d-scene-document-types";

export const STUDIO_BG3D_PLACE_SET_PACKAGE_KIND = "toonstudio.bg3d-place-set" as const;
export const STUDIO_BG3D_PLACE_SET_MAX_VERSIONS = 64;
export const STUDIO_BG3D_PLACE_SET_MAX_PROPS = 256;

/** 세트 정본 상태에 고정되는 소품(씬 노드) 배치 1건. 지오메트리·바이트는 소유하지 않는다. */
export interface StudioBg3dPlaceSetPropState {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: StudioBg3dSceneNode["kind"];
  /** primitive 노드의 도형 종류. model 노드에서는 없다. */
  readonly primitiveKind?: string;
  /** model 노드가 참조하는 첨부 id. primitive 노드에서는 없다. */
  readonly attachmentId?: string;
  readonly transform: StudioBg3dTransform;
  readonly visible: boolean;
}

/** 한 버전의 정본 상태: 카메라 + 조명 + (선택) 환경 에셋 + 소품 배치. */
export interface StudioBg3dPlaceSetState {
  readonly camera: StudioBg3dCameraSettings;
  readonly lighting: StudioBg3dLightingSettings;
  /** 번들 환경 카탈로그 에셋 id. 문서만으로 알 수 없으면 null. */
  readonly environmentAssetId: string | null;
  readonly props: readonly StudioBg3dPlaceSetPropState[];
}

export interface StudioBg3dPlaceSetVersion {
  readonly version: number;
  /** ISO 8601 시각 문자열. 호출자가 주입한다(모델은 시계를 읽지 않는다). */
  readonly createdAt: string;
  readonly note: string;
  readonly state: StudioBg3dPlaceSetState;
}

/** 장소 1곳의 세트 패키지. versions는 버전 오름차순, 마지막 원소가 정본이다. */
export interface StudioBg3dPlaceSetPackage {
  readonly kind: typeof STUDIO_BG3D_PLACE_SET_PACKAGE_KIND;
  readonly placeId: string;
  readonly placeName: string;
  readonly versions: readonly StudioBg3dPlaceSetVersion[];
}

/** 어느 회차·컷이 이 세트를 어떤 버전으로 적용했는지의 사용 대장 1건. */
export interface StudioBg3dPlaceSetUsageRef {
  readonly episodeId: string;
  readonly episodeLabel: string;
  /** 컷(샷) 단위 사용이면 샷 id, 회차 전체 사용이면 null. */
  readonly shotId: string | null;
  readonly shotLabel: string | null;
  readonly appliedVersion: number;
}

export type StudioBg3dPlaceSetChangeKind =
  | "camera"
  | "lighting"
  | "environment"
  | "prop-added"
  | "prop-removed"
  | "prop-moved"
  | "prop-visibility";

export interface StudioBg3dPlaceSetChange {
  readonly kind: StudioBg3dPlaceSetChangeKind;
  /** prop-* 변경일 때 대상 노드 id. 그 외에는 null. */
  readonly nodeId: string | null;
  readonly label: string;
  readonly labelEn: string;
}

/** 정본이 오른 뒤 옛 버전을 적용한 사용처에 가는 영향 알림 1건(사용처 단위). */
export interface StudioBg3dPlaceSetImpactNotice {
  /** 결정적 id: placeId·from/to 버전·사용처로 구성돼 재계산해도 동일하다. */
  readonly id: string;
  readonly placeId: string;
  readonly placeName: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly usage: StudioBg3dPlaceSetUsageRef;
  readonly changes: readonly StudioBg3dPlaceSetChange[];
  readonly message: string;
  readonly messageEn: string;
}

export interface StudioBg3dPlaceSetImpactSummary {
  readonly totalCount: number;
  readonly unacknowledgedCount: number;
  /** 옛 버전을 적용 중인 사용처 수(미확인 여부 무관). */
  readonly staleUsageCount: number;
}

// ---------------------------------------------------------------------------
// 내부 비교 유틸 — 숫자 오차(1e-6) 허용 깊은 동등 비교. 키 순서는 무시한다.
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return a === b || Math.abs(a - b) <= 1e-6;
  }
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord).filter((key) => aRecord[key] !== undefined);
    const bKeys = Object.keys(bRecord).filter((key) => bRecord[key] !== undefined);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => deepEqual(aRecord[key], bRecord[key]))
    );
  }
  return false;
}

function cloneVec3(vec: readonly [number, number, number]): [number, number, number] {
  return [vec[0], vec[1], vec[2]];
}

function cloneTransform(transform: StudioBg3dTransform): StudioBg3dTransform {
  return {
    position: cloneVec3(transform.position),
    rotation: cloneVec3(transform.rotation),
    scale: cloneVec3(transform.scale),
  };
}

function cloneState(state: StudioBg3dPlaceSetState): StudioBg3dPlaceSetState {
  return {
    camera: {
      ...state.camera,
      position: cloneVec3(state.camera.position),
      target: cloneVec3(state.camera.target),
      ...(state.camera.lensShift
        ? { lensShift: [state.camera.lensShift[0], state.camera.lensShift[1]] as [number, number] }
        : {}),
      ...(state.camera.up ? { up: cloneVec3(state.camera.up) } : {}),
    },
    lighting: {
      ...state.lighting,
      key: { ...state.lighting.key, direction: cloneVec3(state.lighting.key.direction) },
      fill: { ...state.lighting.fill, direction: cloneVec3(state.lighting.fill.direction) },
    },
    environmentAssetId: state.environmentAssetId,
    props: state.props.map((prop) => ({ ...prop, transform: cloneTransform(prop.transform) })),
  };
}

// ---------------------------------------------------------------------------
// 캡처 — 씬 문서에서 정본 상태를 뽑는다.
// ---------------------------------------------------------------------------

export interface StudioBg3dPlaceSetCaptureOptions {
  /** 문서가 참조 중인 환경 카탈로그 에셋 id. 모르면 생략(null). */
  readonly environmentAssetId?: string | null;
  /** 이 id들의 노드만 소품으로 고정한다. 생략하면 문서의 모든 노드가 소품이다. */
  readonly propNodeIds?: readonly string[];
}

/** 씬 문서의 현재 카메라·조명·소품 배치를 정본 상태 스냅샷으로 캡처한다. */
export function captureStudioBg3dPlaceSetState(
  document: StudioBg3dSceneDocument,
  options: StudioBg3dPlaceSetCaptureOptions = {},
): StudioBg3dPlaceSetState {
  const wanted = options.propNodeIds ? new Set(options.propNodeIds) : null;
  const props: StudioBg3dPlaceSetPropState[] = [];
  for (const node of document.nodes) {
    if (wanted && !wanted.has(node.id)) continue;
    if (props.length >= STUDIO_BG3D_PLACE_SET_MAX_PROPS) break;
    props.push({
      nodeId: node.id,
      name: node.name,
      kind: node.kind,
      ...(node.kind === "primitive" ? { primitiveKind: node.primitiveKind } : {}),
      ...(node.kind === "model" ? { attachmentId: node.attachmentId } : {}),
      transform: cloneTransform(node.transform),
      visible: node.visible,
    });
  }
  return cloneState({
    camera: document.camera,
    lighting: document.lighting,
    environmentAssetId: options.environmentAssetId ?? null,
    props,
  });
}

// ---------------------------------------------------------------------------
// 패키지 생성·버전 발행
// ---------------------------------------------------------------------------

export interface StudioBg3dPlaceSetCreateInput {
  readonly placeId: string;
  readonly placeName: string;
  readonly state: StudioBg3dPlaceSetState;
  readonly createdAt: string;
  readonly note?: string;
}

/** 장소를 세트로 등록한다. 첫 상태가 정본 v1이 된다. */
export function createStudioBg3dPlaceSetPackage(
  input: StudioBg3dPlaceSetCreateInput,
): StudioBg3dPlaceSetPackage {
  return {
    kind: STUDIO_BG3D_PLACE_SET_PACKAGE_KIND,
    placeId: input.placeId,
    placeName: input.placeName,
    versions: [
      {
        version: 1,
        createdAt: input.createdAt,
        note: input.note ?? "",
        state: cloneState(input.state),
      },
    ],
  };
}

/** 정본(마지막) 버전을 돌려준다. 버전이 없으면 null. */
export function getStudioBg3dPlaceSetLatestVersion(
  placeSet: StudioBg3dPlaceSetPackage,
): StudioBg3dPlaceSetVersion | null {
  let latest: StudioBg3dPlaceSetVersion | null = null;
  for (const entry of placeSet.versions) {
    if (!latest || entry.version > latest.version) latest = entry;
  }
  return latest;
}

export function getStudioBg3dPlaceSetVersion(
  placeSet: StudioBg3dPlaceSetPackage,
  version: number,
): StudioBg3dPlaceSetVersion | null {
  return placeSet.versions.find((entry) => entry.version === version) ?? null;
}

/**
 * 세트를 열 때 시작할 상태 — 항상 마지막 정본이다(판정: "세트를 열면 마지막 정본으로 시작").
 * 버전이 없으면 null.
 */
export function resolveStudioBg3dPlaceSetStartState(
  placeSet: StudioBg3dPlaceSetPackage,
): StudioBg3dPlaceSetState | null {
  const latest = getStudioBg3dPlaceSetLatestVersion(placeSet);
  return latest ? cloneState(latest.state) : null;
}

/**
 * 정본 상태를 씬 문서에 적용한 새 문서를 돌려준다.
 * 카메라·조명은 통째로 정본으로 교체되고, 소품은 nodeId가 일치하는 노드의
 * transform·visible만 정본으로 맞춘다. 문서에 없는 소품은 지오메트리를 만들 수
 * 없으므로 만들지 않고 skippedPropNodeIds로 정직하게 보고한다.
 */
export function applyStudioBg3dPlaceSetStateToDocument(
  document: StudioBg3dSceneDocument,
  state: StudioBg3dPlaceSetState,
): { readonly document: StudioBg3dSceneDocument; readonly skippedPropNodeIds: readonly string[] } {
  const propByNodeId = new Map(state.props.map((prop) => [prop.nodeId, prop]));
  const presentNodeIds = new Set(document.nodes.map((node) => node.id));
  const skippedPropNodeIds = state.props
    .filter((prop) => !presentNodeIds.has(prop.nodeId))
    .map((prop) => prop.nodeId);
  const nodes = document.nodes.map((node) => {
    const prop = propByNodeId.get(node.id);
    if (!prop) return node;
    return { ...node, transform: cloneTransform(prop.transform), visible: prop.visible };
  });
  const cloned = cloneState(state);
  return {
    document: {
      ...document,
      camera: cloned.camera,
      lighting: cloned.lighting,
      nodes,
    },
    skippedPropNodeIds,
  };
}

// ---------------------------------------------------------------------------
// 상태 diff — 무엇이 달라졌는지(버전 발행·영향 알림의 공통 근거)
// ---------------------------------------------------------------------------

/** 두 정본 상태 사이의 변경 목록. 순서: 카메라→조명→환경→소품(추가·이동·가시성·제거). */
export function diffStudioBg3dPlaceSetStates(
  previous: StudioBg3dPlaceSetState,
  next: StudioBg3dPlaceSetState,
): readonly StudioBg3dPlaceSetChange[] {
  const changes: StudioBg3dPlaceSetChange[] = [];
  if (!deepEqual(previous.camera, next.camera)) {
    changes.push({
      kind: "camera",
      nodeId: null,
      label: "카메라 정본이 달라졌습니다",
      labelEn: "Canonical camera changed",
    });
  }
  if (!deepEqual(previous.lighting, next.lighting)) {
    changes.push({
      kind: "lighting",
      nodeId: null,
      label: "조명 정본이 달라졌습니다",
      labelEn: "Canonical lighting changed",
    });
  }
  if (previous.environmentAssetId !== next.environmentAssetId) {
    changes.push({
      kind: "environment",
      nodeId: null,
      label: "배경 환경이 달라졌습니다",
      labelEn: "Environment asset changed",
    });
  }
  const previousProps = new Map(previous.props.map((prop) => [prop.nodeId, prop]));
  const nextProps = new Map(next.props.map((prop) => [prop.nodeId, prop]));
  for (const prop of next.props) {
    const before = previousProps.get(prop.nodeId);
    if (!before) {
      changes.push({
        kind: "prop-added",
        nodeId: prop.nodeId,
        label: `소품 '${prop.name}'이(가) 추가됐습니다`,
        labelEn: `Prop '${prop.name}' was added`,
      });
      continue;
    }
    if (!deepEqual(before.transform, prop.transform)) {
      changes.push({
        kind: "prop-moved",
        nodeId: prop.nodeId,
        label: `소품 '${prop.name}'의 배치가 달라졌습니다`,
        labelEn: `Prop '${prop.name}' moved`,
      });
    }
    if (before.visible !== prop.visible) {
      changes.push({
        kind: "prop-visibility",
        nodeId: prop.nodeId,
        label: `소품 '${prop.name}'의 표시 여부가 달라졌습니다`,
        labelEn: `Prop '${prop.name}' visibility changed`,
      });
    }
  }
  for (const prop of previous.props) {
    if (!nextProps.has(prop.nodeId)) {
      changes.push({
        kind: "prop-removed",
        nodeId: prop.nodeId,
        label: `소품 '${prop.name}'이(가) 제거됐습니다`,
        labelEn: `Prop '${prop.name}' was removed`,
      });
    }
  }
  return changes;
}

/** 두 상태가 정본으로서 동일한가(변경 없음 판정). */
export function isStudioBg3dPlaceSetStateEqual(
  a: StudioBg3dPlaceSetState,
  b: StudioBg3dPlaceSetState,
): boolean {
  return diffStudioBg3dPlaceSetStates(a, b).length === 0;
}

export interface StudioBg3dPlaceSetPublishResult {
  readonly placeSet: StudioBg3dPlaceSetPackage;
  /** 실제로 새 버전이 생겼으면 그 버전, 변경이 없어 발행하지 않았으면 null. */
  readonly publishedVersion: StudioBg3dPlaceSetVersion | null;
  /** 직전 정본 대비 변경 목록. 발행하지 않았으면 빈 배열. */
  readonly changes: readonly StudioBg3dPlaceSetChange[];
}

/**
 * 현재 상태를 새 정본으로 발행한다. 직전 정본과 같으면 버전을 만들지 않는다
 * (빈 버전으로 이력이 오염되는 것을 막는다). 버전 상한을 넘으면 가장 오래된
 * 비정본 버전부터 버리되 정본(마지막)은 항상 남긴다.
 */
export function publishStudioBg3dPlaceSetVersion(
  placeSet: StudioBg3dPlaceSetPackage,
  nextState: StudioBg3dPlaceSetState,
  input: { readonly createdAt: string; readonly note?: string },
): StudioBg3dPlaceSetPublishResult {
  const latest = getStudioBg3dPlaceSetLatestVersion(placeSet);
  if (!latest) {
    const created = createStudioBg3dPlaceSetPackage({
      placeId: placeSet.placeId,
      placeName: placeSet.placeName,
      state: nextState,
      createdAt: input.createdAt,
      note: input.note,
    });
    return { placeSet: created, publishedVersion: created.versions[0] ?? null, changes: [] };
  }
  const changes = diffStudioBg3dPlaceSetStates(latest.state, nextState);
  if (changes.length === 0) {
    return { placeSet, publishedVersion: null, changes: [] };
  }
  const version: StudioBg3dPlaceSetVersion = {
    version: latest.version + 1,
    createdAt: input.createdAt,
    note: input.note ?? "",
    state: cloneState(nextState),
  };
  let versions = [...placeSet.versions, version];
  if (versions.length > STUDIO_BG3D_PLACE_SET_MAX_VERSIONS) {
    versions = versions.slice(versions.length - STUDIO_BG3D_PLACE_SET_MAX_VERSIONS);
  }
  return {
    placeSet: { ...placeSet, versions },
    publishedVersion: version,
    changes,
  };
}

// ---------------------------------------------------------------------------
// 영향 알림 — 정본이 오르면 옛 버전을 적용한 사용처에 알림이 간다(P-4식).
// ---------------------------------------------------------------------------

/**
 * 사용 대장과 대조해 영향 알림을 만든다. appliedVersion이 정본보다 낮은 사용처만
 * 대상이며, 그 버전→정본 사이의 누적 변경을 알림에 싣는다. 정본과 같은 버전을
 * 적용한 사용처에는 알림이 가지 않는다(소음 방지).
 */
export function buildStudioBg3dPlaceSetImpactNotices(
  placeSet: StudioBg3dPlaceSetPackage,
  usages: readonly StudioBg3dPlaceSetUsageRef[],
): readonly StudioBg3dPlaceSetImpactNotice[] {
  const latest = getStudioBg3dPlaceSetLatestVersion(placeSet);
  if (!latest) return [];
  const notices: StudioBg3dPlaceSetImpactNotice[] = [];
  for (const usage of usages) {
    if (usage.appliedVersion >= latest.version) continue;
    const applied = getStudioBg3dPlaceSetVersion(placeSet, usage.appliedVersion);
    // 적용 버전이 이력에서 사라진(상한으로 밀려난) 경우에도 알림은 가야 하므로
    // 변경 목록은 비우되 버전 차이 자체를 알린다.
    const changes = applied
      ? diffStudioBg3dPlaceSetStates(applied.state, latest.state)
      : [];
    const where = usage.shotLabel
      ? `${usage.episodeLabel} · ${usage.shotLabel}`
      : usage.episodeLabel;
    notices.push({
      id: [
        "place-set-impact",
        placeSet.placeId,
        `v${usage.appliedVersion}`,
        `v${latest.version}`,
        usage.episodeId,
        usage.shotId ?? "episode",
      ].join(":"),
      placeId: placeSet.placeId,
      placeName: placeSet.placeName,
      fromVersion: usage.appliedVersion,
      toVersion: latest.version,
      usage,
      changes,
      message: `'${placeSet.placeName}' 세트 정본이 v${usage.appliedVersion}에서 v${latest.version}(으)로 올랐습니다. ${where}은(는) 옛 정본을 쓰고 있습니다.`,
      messageEn: `The canonical set for '${placeSet.placeName}' moved from v${usage.appliedVersion} to v${latest.version}. ${where} still uses the older version.`,
    });
  }
  return notices;
}

/** 확인한 알림 id를 모아 배지·집계의 근거로 쓴다. 없는 id는 무시한다. */
export function acknowledgeStudioBg3dPlaceSetImpact(
  acknowledgedIds: readonly string[],
  noticeId: string,
): readonly string[] {
  return acknowledgedIds.includes(noticeId)
    ? acknowledgedIds
    : [...acknowledgedIds, noticeId];
}

export function acknowledgeAllStudioBg3dPlaceSetImpacts(
  notices: readonly StudioBg3dPlaceSetImpactNotice[],
): readonly string[] {
  return notices.map((notice) => notice.id);
}

export function summarizeStudioBg3dPlaceSetImpacts(
  notices: readonly StudioBg3dPlaceSetImpactNotice[],
  acknowledgedIds: readonly string[],
): StudioBg3dPlaceSetImpactSummary {
  const acknowledged = new Set(acknowledgedIds);
  return {
    totalCount: notices.length,
    unacknowledgedCount: notices.filter((notice) => !acknowledged.has(notice.id)).length,
    staleUsageCount: notices.length,
  };
}
