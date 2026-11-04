/**
 * studio-bg3d-sketchup-webtoon-staging-bridge.ts
 *
 * REA 역공학 기반 SketchUp 3D 배경 제작·연출(Authoring & Staging) 7대 핵심 역량 통합 브리지:
 * 1. Push/Pull (P) 관통 개구부 · Offset (F) · Follow-Me 몰딩 · 축 추론(Red/Green/Blue/Magenta) · *N//N 배열 → 정본 BgPrimitive[] 즉시 커밋
 * 2. 2점 투시(Two-Point Perspective) 수직선 고정 팬/시프트 잠금 + SketchUp Scene Tab 컷별 전체 상태(카메라·태양광·스타일·단면·태그·동적 컴포넌트) 스냅샷/복원
 * 3. 외부 태양 그림자 보존형 실내 방 자동 단면 컷어웨이 (Shadow-Preserving Interior Room Auto-Cutaway)
 * 4. 천문 태양 고도/방위각 계산기 + 웹툰 시간대 프리셋(황금시간대/정오/블루아워/달빛 야간) + 그림자 소프트니스/진하기 통합 리그
 * 5. SketchUp 6종 스타일(은선/텍스처 음영/X-Ray/뒷면 점선) + Outliner 웹툰 태그 가시성 프리셋 세트 원클릭 전환
 * 6. Dynamic Components (대화형 문 개폐 각도 0°~180° · 미닫이 창문/서랍 오프셋 · 조명 스위치) 정본 프리미티브 반영 및 연속 컷 시퀀서
 * 7. 1-Click 웹툰 6패스 LT 레이어 스택 추출 레시피 (주선 + 질감선 + 그림자 Multiply + 스크린톤 + 밑색 Color + 공기원근 Depth 동시 공존)
 *
 * 역공학 근거 (REA Evidence):
 * - `ev_a57c83ab33f2bb207dd687a8eda60bf9bd27288f6529a3bf89cd4af8f5fd93f7` (SketchUp for Web)
 * - `ev_6eb7a7b9a898a1de62e96ef866c5817773350b20a7b8a21eba1e6b8f11278d37` (3D Warehouse)
 * - `ev_dcb6092584624db698dff8ea9569dbedce43478b6cdfe01af9d02cade76d46d6` (Section Planes)
 * - `ev_139ab8710501ec5706ed3e506c412d853c996efd0c479fb8a40815e8db79bcc4` (Real-World Shadows)
 * - `ev_ccc4d33d4d410abb6eaf1a879b859bd3f7edb72a4c78cf6142a160481a28cda1` (Creating Scenes)
 * - `ev_3714961a8f0736ef6eac9882997747568bb9f47b067eda2ef1dee25c119e59af` (Choosing a Style)
 * - `ev_38a304255486542b26f2e6cf6efe464a818acd504f43c6bee87cf2e223580f65` (Push/Pull 3D)
 * - `ev_972305f4810ca0d1412def8019552781a6bdea432a891b4b5290669f69b37bee` (Controlling Visibility with Tags)
 * - `ev_a0d43a3a4517edab58a5db13e1096fa0c380c16b099ab506e3b8c72cfd673c63` (Hierarchies in Outliner)
 * - `ev_13d5f54ca9e07e565251cf5c6ec93ae70ea002f60253c1b712a9c5eba2d19158` (ACON3D)
 */

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import {
  extrudeSketchUpFollowMe,
  extrudeSketchUpPolygonFaceWithHoleCut,
  generateSketchUpLinearArray,
  offsetSketchUpPolygon2D,
  parseSketchUpArrayInput,
  type SketchUpVec2,
} from "./studio-bg3d-sketchup-direct-modeling";
import {
  computeSketchUpSolarPosition,
  type SketchUpSolarPositionResult,
} from "./studio-bg3d-sketchup-shadow-and-exporter";
import {
  resolveSketchUpStyleToBg3dSettings,
  STUDIO_SKETCHUP_STYLE_PRESETS,
  type SketchUpFaceStyleKind,
} from "./studio-bg3d-sketchup-styles-uv-engine";

// 기존 UI 소비자의 공개 경로는 유지하고 Worker는 순수 레시피를 직접 사용한다.
export { buildSketchUpWebtoonSixPassLtRecipe } from "./studio-bg3d-six-pass-lt-recipe";
export type { WebtoonSixPassLtLayerEntry, WebtoonSixPassLtRoleId } from "./studio-bg3d-six-pass-lt-recipe";

export type StudioSketchUpStylePresetId = string | SketchUpFaceStyleKind;

export type SketchUpAxisLockId = "none" | "red-x" | "green-z" | "blue-y" | "magenta-parallel";

export interface SketchUpDirectModelingCommitSpec {
  readonly wallWidthMeters: number;
  readonly wallHeightMeters: number;
  readonly wallThicknessMeters: number;
  readonly openingWidthMeters: number;
  readonly openingHeightMeters: number;
  readonly sillHeightMeters: number;
  readonly frameOffsetMeters: number;
  readonly includeCrownMolding: boolean;
  readonly axisLock: SketchUpAxisLockId;
  readonly arrayInputToken?: string;
  readonly arraySpanMeters?: number;
}

export interface SketchUpDirectModelingCommitResult {
  readonly primitives: readonly BgPrimitive[];
  readonly meshVertexCount: number;
  readonly meshTriangleCount: number;
  readonly MoldingQuadCount: number;
  readonly axisLockColorHex: string;
  readonly summaryKo: string;
}

const AXIS_LOCK_COLORS: Readonly<Record<SketchUpAxisLockId, string>> = Object.freeze({
  none: "#64748b",
  "red-x": "#ef4444",
  "green-z": "#22c55e",
  "blue-y": "#3b82f6",
  "magenta-parallel": "#c026d3",
});

/**
 * 1. Push/Pull (P) 관통 개구부 · Offset (F) 창틀 · Follow-Me 몰딩 스윕 · *N//N 배열을
 *    호스트 3D 뷰포트용 `BgPrimitive[]` 세그먼트로 변환
 */
export function commitSketchUpDirectModelingToPrimitives(
  spec: SketchUpDirectModelingCommitSpec,
): SketchUpDirectModelingCommitResult {
  const halfW = Math.max(1.2, spec.wallWidthMeters) / 2;
  const wallH = Math.max(2.0, spec.wallHeightMeters);
  const wallT = Math.max(0.12, spec.wallThicknessMeters);
  const openHalfW = Math.min(halfW - 0.25, Math.max(0.4, spec.openingWidthMeters) / 2);
  const sillY = Math.max(0.0, Math.min(wallH - 0.6, spec.sillHeightMeters));
  const headY = Math.min(wallH - 0.15, sillY + Math.max(0.5, spec.openingHeightMeters));

  const outerWallLoop: readonly SketchUpVec2[] = [
    [-halfW, 0],
    [halfW, 0],
    [halfW, wallH],
    [-halfW, wallH],
  ];
  const openingLoop: readonly SketchUpVec2[] = [
    [-openHalfW, sillY],
    [openHalfW, sillY],
    [openHalfW, headY],
    [-openHalfW, headY],
  ];

  const pushPull = extrudeSketchUpPolygonFaceWithHoleCut({
    outerLoop2D: outerWallLoop,
    innerProfile2D: openingLoop,
    distanceMeters: -wallT,
    wallThicknessMeters: wallT,
  });

  const frameOffsetMeters = Math.max(0.03, spec.frameOffsetMeters);
  const frameOffsetResult = offsetSketchUpPolygon2D(openingLoop, frameOffsetMeters);
  const frameOuter = frameOffsetResult.offsetLoop;

  const moldingResult = spec.includeCrownMolding
    ? extrudeSketchUpFollowMe({
        profile2D: [
          [0, 0],
          [0.08, 0],
          [0.08, 0.09],
          [0, 0.09],
        ],
        path3D: [
          [-halfW, wallH, -wallT / 2],
          [halfW, wallH, -wallT / 2],
        ],
        closedPath: false,
      })
    : null;

  const parsedArray = parseSketchUpArrayInput(spec.arrayInputToken ?? "");
  const allPlacements = spec.arrayInputToken
    ? generateSketchUpLinearArray({
        basePosition: [0, 0, 0],
        deltaVector:
          spec.axisLock === "green-z"
            ? [0, 0, spec.arraySpanMeters ?? spec.wallWidthMeters + 0.4]
            : [spec.arraySpanMeters ?? spec.wallWidthMeters + 0.4, 0, 0],
        command: parsedArray,
      })
    : ([{ copyIndex: 0, position: [0, 0, 0] as const, rotationDeg: [0, 0, 0] as const }] as const);
  const arrayPositions = (
    parsedArray.ok && parsedArray.count >= 1
      ? allPlacements.slice(0, parsedArray.count)
      : allPlacements
  ).map((p) => p.position);

  const primitives: BgPrimitive[] = [];
  const leftPillarW = Math.max(0.15, halfW - openHalfW);
  const lintelH = Math.max(0.12, wallH - headY);

  arrayPositions.forEach(([offsetX, offsetY, offsetZ], copyIdx) => {
    const suffix = arrayPositions.length > 1 ? ` #${copyIdx + 1}` : "";
    // 좌·우 기둥
    primitives.push({
      id: `skp-dm-wall-left-${copyIdx}`,
      name: `Push/Pull 좌측 벽체${suffix}`,
      kind: "box",
      position: [offsetX - (openHalfW + leftPillarW / 2), offsetY + wallH / 2, offsetZ],
      rotation: [0, 0, 0],
      scale: [leftPillarW, wallH, wallT],
      color: "#e2e8f0",
    });
    primitives.push({
      id: `skp-dm-wall-right-${copyIdx}`,
      name: `Push/Pull 우측 벽체${suffix}`,
      kind: "box",
      position: [offsetX + (openHalfW + leftPillarW / 2), offsetY + wallH / 2, offsetZ],
      rotation: [0, 0, 0],
      scale: [leftPillarW, wallH, wallT],
      color: "#e2e8f0",
    });
    // 상부 인방보(Lintel)
    primitives.push({
      id: `skp-dm-wall-lintel-${copyIdx}`,
      name: `Push/Pull 상부 인방보${suffix}`,
      kind: "box",
      position: [offsetX, offsetY + headY + lintelH / 2, offsetZ],
      rotation: [0, 0, 0],
      scale: [openHalfW * 2, lintelH, wallT],
      color: "#cbd5e1",
    });
    // 하부 창대벽(Sill)
    if (sillY > 0.05) {
      primitives.push({
        id: `skp-dm-wall-sill-${copyIdx}`,
        name: `Push/Pull 하부 창대벽${suffix}`,
        kind: "box",
        position: [offsetX, offsetY + sillY / 2, offsetZ],
        rotation: [0, 0, 0],
        scale: [openHalfW * 2, sillY, wallT],
        color: "#cbd5e1",
      });
    }
    // 개구부 안쪽은 비우고 바깥 테두리 네 변에만 창틀을 배치한다.
    const frameW = Math.max(
      openHalfW * 2 + frameOffsetMeters * 2,
      Math.abs((frameOuter[1]?.[0] ?? openHalfW) - (frameOuter[0]?.[0] ?? -openHalfW)),
    );
    const frameSegments = [
      { id: "left", label: "좌측", x: -openHalfW - frameOffsetMeters / 2, y: (sillY + headY) / 2, width: frameOffsetMeters, height: headY - sillY },
      { id: "right", label: "우측", x: openHalfW + frameOffsetMeters / 2, y: (sillY + headY) / 2, width: frameOffsetMeters, height: headY - sillY },
      { id: "top", label: "상부", x: 0, y: headY + frameOffsetMeters / 2, width: frameW, height: frameOffsetMeters },
      { id: "bottom", label: "하부", x: 0, y: sillY - frameOffsetMeters / 2, width: frameW, height: frameOffsetMeters },
    ];
    for (const segment of frameSegments) {
      primitives.push({
        id: `skp-dm-offset-frame-${segment.id}-${copyIdx}`,
        name: `Offset(F) ${segment.label} 창문 프레임${suffix}`,
        kind: "box",
        position: [offsetX + segment.x, offsetY + segment.y, offsetZ],
        rotation: [0, 0, 0],
        scale: [segment.width, segment.height, wallT + 0.04],
        color: "#475569",
      });
    }
    // Follow-Me 상부 몰딩
    if (spec.includeCrownMolding) {
      primitives.push({
        id: `skp-dm-followme-molding-${copyIdx}`,
        name: `Follow-Me 크라운 몰딩${suffix}`,
        kind: "box",
        position: [offsetX, offsetY + wallH - 0.045, offsetZ + wallT / 2 + 0.04],
        rotation: [0, 0, 0],
        scale: [halfW * 2, 0.09, 0.08],
        color: "#f8fafc",
      });
    }
  });

  const triangleCount = pushPull.mesh.triangleCount;
  const moldingQuadCount = moldingResult
    ? Math.max(1, Math.floor(moldingResult.mesh.triangleCount / 2))
    : 0;
  return {
    primitives,
    meshVertexCount: pushPull.mesh.vertexCount,
    meshTriangleCount: triangleCount,
    MoldingQuadCount: moldingQuadCount,
    axisLockColorHex: AXIS_LOCK_COLORS[spec.axisLock],
    summaryKo: `Push/Pull 관통 개구부(${triangleCount} tris) · Offset 프레임 · Follow-Me 몰딩(${moldingQuadCount} quads) · ${arrayPositions.length}배열 생성 (${primitives.length}개 프리미티브)`,
  };
}

/**
 * 2. 2점 투시(Two-Point Perspective) 수평 Pitch 잠금 + 수직 렌즈 시프트(`lensShiftY`) 프레이밍 이동
 */
export function panSketchUpTwoPointPerspectiveLockedCamera(
  camera: StudioBg3dCameraSettings,
  deltaShiftX: number,
  deltaShiftY: number,
): StudioBg3dCameraSettings {
  const eyeY = camera.position[1];
  const currentShiftX = camera.lensShift?.[0] ?? 0;
  const currentShiftY = camera.lensShift?.[1] ?? 0;
  const clampedShiftX = Math.max(-0.6, Math.min(0.6, Math.round((currentShiftX + deltaShiftX) * 1000) / 1000));
  const clampedShiftY = Math.max(-0.6, Math.min(0.6, Math.round((currentShiftY + deltaShiftY) * 1000) / 1000));

  return {
    ...camera,
    // 2점 투시에서는 카메라 시선 높이를 눈높이(eyeY)와 수평으로 고정해 모든 수직 기둥이 평행하도록 보장
    target: [camera.target[0], eyeY, camera.target[2]],
    up: [0, 1, 0],
    projection: "perspective",
    lensShift: [clampedShiftX, clampedShiftY],
  };
}

export type WebtoonSolarPresetId =
  | "golden-hour-morning"
  | "noon-clear"
  | "golden-hour-sunset"
  | "blue-hour-dusk"
  | "night-moonlight";

export interface WebtoonSketchUpSolarPreset {
  readonly id: WebtoonSolarPresetId;
  readonly labelKo: string;
  readonly month: number;
  readonly day: number;
  readonly timeOfDayHours: number;
  readonly lightSlider: number;
  readonly darkSlider: number;
  readonly shadowSoftness: number;
  readonly shadowDarkness: number;
}

export const WEBTOON_SKETCHUP_SOLAR_PRESETS: Readonly<
  Record<WebtoonSolarPresetId, WebtoonSketchUpSolarPreset>
> = Object.freeze({
  "golden-hour-morning": {
    id: "golden-hour-morning",
    labelKo: "등교·출근 아침 황금빛 (07:30)",
    month: 5,
    day: 15,
    timeOfDayHours: 7.5,
    lightSlider: 82,
    darkSlider: 45,
    shadowSoftness: 0.45,
    shadowDarkness: 55,
  },
  "noon-clear": {
    id: "noon-clear",
    labelKo: "한낮 정오 직사광 (12:30)",
    month: 6,
    day: 21,
    timeOfDayHours: 12.5,
    lightSlider: 90,
    darkSlider: 55,
    shadowSoftness: 0.15,
    shadowDarkness: 68,
  },
  "golden-hour-sunset": {
    id: "golden-hour-sunset",
    labelKo: "하교·노을 골든아워 (17:45)",
    month: 10,
    day: 12,
    timeOfDayHours: 17.75,
    lightSlider: 78,
    darkSlider: 38,
    shadowSoftness: 0.55,
    shadowDarkness: 62,
  },
  "blue-hour-dusk": {
    id: "blue-hour-dusk",
    labelKo: "해질녘 블루아워 (19:00)",
    month: 9,
    day: 22,
    timeOfDayHours: 19.0,
    lightSlider: 48,
    darkSlider: 30,
    shadowSoftness: 0.75,
    shadowDarkness: 42,
  },
  "night-moonlight": {
    id: "night-moonlight",
    labelKo: "심야 달빛·가로등 (23:00)",
    month: 11,
    day: 3,
    timeOfDayHours: 23.0,
    lightSlider: 28,
    darkSlider: 20,
    shadowSoftness: 0.65,
    shadowDarkness: 75,
  },
});

export interface ResolvedWebtoonSolarRig {
  readonly preset: WebtoonSketchUpSolarPreset;
  readonly solar: SketchUpSolarPositionResult;
  readonly ambientIntensity: number;
  readonly directionalIntensity: number;
  readonly shadowSoftness: number;
  readonly shadowDarkness: number;
  readonly summaryKo: string;
}

/**
 * 4. 천문 태양 고도/방위각 계산기 + 웹툰 시간대 프리셋 + 그림자 소프트니스/진하기 통합 계산
 */
export function resolveWebtoonSketchUpSolarRig(input: {
  readonly presetId: WebtoonSolarPresetId;
  readonly latitudeDeg?: number;
  readonly longitudeDeg?: number;
  readonly utcOffsetHours?: number;
  readonly northAngleDeg?: number;
  readonly overrideTimeOfDayHours?: number;
  readonly overrideShadowSoftness?: number;
  readonly overrideShadowDarkness?: number;
}): ResolvedWebtoonSolarRig {
  const preset = WEBTOON_SKETCHUP_SOLAR_PRESETS[input.presetId];
  const timeOfDayHours = input.overrideTimeOfDayHours ?? preset.timeOfDayHours;
  const solar = computeSketchUpSolarPosition({
    latitudeDeg: input.latitudeDeg ?? 37.5665,
    longitudeDeg: input.longitudeDeg ?? 126.978,
    utcOffsetHours: input.utcOffsetHours ?? 9,
    solarNorthAngleDeg: input.northAngleDeg ?? 0,
    month: preset.month,
    day: preset.day,
    timeOfDayHours,
    lightSlider: preset.lightSlider,
    darkSlider: preset.darkSlider,
    shadowsEnabled: true,
    useSunForShading: true,
  });

  const shadowSoftness = Math.max(
    0,
    Math.min(1, input.overrideShadowSoftness ?? preset.shadowSoftness),
  );
  const shadowDarkness = Math.max(
    0,
    Math.min(100, input.overrideShadowDarkness ?? preset.shadowDarkness),
  );
  const ambientIntensity = Math.round((0.18 + (preset.darkSlider / 100) * 0.62) * 100) / 100;
  const directionalIntensity = Math.round((0.4 + (preset.lightSlider / 100) * 1.35) * 100) / 100;

  return {
    preset,
    solar,
    ambientIntensity,
    directionalIntensity,
    shadowSoftness,
    shadowDarkness,
    summaryKo: `${preset.labelKo} · 고도 ${solar.solarAltitudeDeg.toFixed(1)}° / 방위 ${solar.solarAzimuthDeg.toFixed(1)}° · 그림자 농도 ${shadowDarkness}% · 소프트니스 ${(shadowSoftness * 100).toFixed(0)}%`,
  };
}

export type RoomWallId = "north" | "south" | "east" | "west" | "ceiling" | "floor";

export interface ShadowPreservingWallState {
  readonly wallId: RoomWallId;
  readonly cameraVisible: boolean;
  readonly preserveShadowCaster: boolean;
  readonly sectionCutActive: boolean;
}

export interface ShadowPreservingRoomCutawayPlan {
  readonly walls: readonly ShadowPreservingWallState[];
  readonly hiddenFromCameraWalls: readonly RoomWallId[];
  readonly preservedShadowCasters: readonly RoomWallId[];
  readonly summaryKo: string;
}

/**
 * 3. 외부 태양 그림자 보존형 실내 자동 단면 컷어웨이 (`computeShadowPreservingRoomCutawayPlan`)
 *    카메라 시야를 가리는 앞벽·천장은 카메라 레이에서만 숨기고(`cameraVisible: false`),
 *    태양광 그림자 캐스터(`preserveShadowCaster: true`)는 유지해 실내 바닥의 창틀 채광을 보존합니다.
 */
export function computeShadowPreservingRoomCutawayPlan(input: {
  readonly cameraPosition: readonly [number, number, number];
  readonly roomCenter?: readonly [number, number, number];
  readonly roomSize?: readonly [number, number, number];
  readonly autoHideCeilingAboveEyeY?: number;
  readonly preserveExteriorShadows?: boolean;
}): ShadowPreservingRoomCutawayPlan {
  const center = input.roomCenter ?? [0, 1.5, 0];
  const size = input.roomSize ?? [6, 3, 6];
  const preserveShadows = input.preserveExteriorShadows ?? true;
  const dx = input.cameraPosition[0] - center[0];
  const dy = input.cameraPosition[1] - center[1];
  const dz = input.cameraPosition[2] - center[2];

  const halfW = size[0] / 2;
  const halfD = size[2] / 2;

  const hideSouth = dz > halfD * 0.35;
  const hideNorth = dz < -halfD * 0.35;
  const hideEast = dx > halfW * 0.35;
  const hideWest = dx < -halfW * 0.35;
  const hideCeiling = input.cameraPosition[1] > (input.autoHideCeilingAboveEyeY ?? center[1] + 0.6) || dy > 0.4;

  const entries: readonly [RoomWallId, boolean][] = [
    ["north", hideNorth],
    ["south", hideSouth],
    ["east", hideEast],
    ["west", hideWest],
    ["ceiling", hideCeiling],
    ["floor", false],
  ];

  const walls: ShadowPreservingWallState[] = entries.map(([wallId, cut]) => ({
    wallId,
    cameraVisible: !cut,
    preserveShadowCaster: cut ? preserveShadows : true,
    sectionCutActive: cut,
  }));

  const hiddenFromCameraWalls = walls.filter((w) => !w.cameraVisible).map((w) => w.wallId);
  const preservedShadowCasters = walls
    .filter((w) => !w.cameraVisible && w.preserveShadowCaster)
    .map((w) => w.wallId);

  return {
    walls,
    hiddenFromCameraWalls,
    preservedShadowCasters,
    summaryKo: `실내 컷 자동 단면: 카메라 가림 벽 [${hiddenFromCameraWalls.join(", ") || "없음"}] 투명화 · 외부 채광 그림자 보존 [${preservedShadowCasters.join(", ") || "없음"}]`,
  };
}

export type WebtoonOutlinerTagPresetId =
  | "interior-clean-line"
  | "hide-ceiling-lights"
  | "hide-small-props"
  | "actor-blocking-clear"
  | "show-all";

export interface WebtoonOutlinerTagVisibilityPreset {
  readonly id: WebtoonOutlinerTagPresetId;
  readonly labelKo: string;
  readonly hiddenTags: readonly string[];
  readonly descriptionKo: string;
}

export const WEBTOON_OUTLINER_TAG_VISIBILITY_PRESETS: Readonly<
  Record<WebtoonOutlinerTagPresetId, WebtoonOutlinerTagVisibilityPreset>
> = Object.freeze({
  "interior-clean-line": {
    id: "interior-clean-line",
    labelKo: "실내 정밀 선화 모드 (잡동사니·천장등 숨김)",
    hiddenTags: ["ceiling-fixture", "clutter-props", "exterior-trees", "helper-dummies"],
    descriptionKo: "배경 펜선이 복잡해지는 소품과 천장 조명을 숨겨 깔끔한 실내 선화를 추출합니다.",
  },
  "hide-ceiling-lights": {
    id: "hide-ceiling-lights",
    labelKo: "하이앵글 컷용 천장·조명 숨김",
    hiddenTags: ["ceiling", "ceiling-fixture", "chandeliers"],
    descriptionKo: "위에서 내려다보는 부감(High-Angle) 컷에서 시야를 가리는 천장과 샹들리에를 숨깁니다.",
  },
  "hide-small-props": {
    id: "hide-small-props",
    labelKo: "원경·와이드 샷용 소품 숨김",
    hiddenTags: ["clutter-props", "tableware", "stationery", "books-detail"],
    descriptionKo: "전경/설정 샷에서 선 뭉침을 유발하는 미세 소품 태그를 일괄 비활성화합니다.",
  },
  "actor-blocking-clear": {
    id: "actor-blocking-clear",
    labelKo: "인물 작화 동선 확보 (전경 의자·탁자 숨김)",
    hiddenTags: ["foreground-chairs", "center-table", "helper-dummies"],
    descriptionKo: "캐릭터 전신·상반신 작화 영역과 겹치는 전경 가구를 즉시 숨깁니다.",
  },
  "show-all": {
    id: "show-all",
    labelKo: "모든 Outliner 태그 표시",
    hiddenTags: [],
    descriptionKo: "숨겨진 모든 SketchUp 태그와 컴포넌트 계층을 표시합니다.",
  },
});

/**
 * 5. SketchUp 스타일 프리셋 + Outliner 태그 가시성 세트 통합 해석
 */
export function resolveSketchUpStyleAndOutlinerPreset(
  stylePresetId: StudioSketchUpStylePresetId,
  tagPresetId: WebtoonOutlinerTagPresetId,
) {
  const stylePreset =
    STUDIO_SKETCHUP_STYLE_PRESETS.find(
      (s) => s.id === stylePresetId || s.faceStyle === stylePresetId,
    ) ?? STUDIO_SKETCHUP_STYLE_PRESETS[0]!;
  const resolvedStyle = resolveSketchUpStyleToBg3dSettings(stylePreset);
  const tagPreset = WEBTOON_OUTLINER_TAG_VISIBILITY_PRESETS[tagPresetId];
  return {
    stylePreset,
    resolvedStyle,
    tagPreset,
    summaryKo: `스타일 [${stylePreset.labelKo}] + 태그 프리셋 [${tagPreset.labelKo}] (숨김 태그 ${tagPreset.hiddenTags.length}개)`,
  };
}

export interface DynamicComponentArticulationSpec {
  readonly doorSwingAngleDeg: number;
  readonly windowSlideOffsetMeters: number;
  readonly drawerPullOffsetMeters: number;
  readonly ceilingLightSwitchOn: boolean;
}

/**
 * 6. Dynamic Components (문 회전 각도 0°~180° · 창문/서랍 슬라이딩 오프셋 · 조명 스위치)
 *    프리미티브 세트 생성 및 연속 연출 컷(Shot) 시퀀스 생성
 */
export function buildDynamicComponentArticulatedPrimitives(
  spec: DynamicComponentArticulationSpec,
): readonly BgPrimitive[] {
  const clampedAngle = Math.max(0, Math.min(180, spec.doorSwingAngleDeg));
  const rad = (clampedAngle * Math.PI) / 180;
  const doorWidth = 0.9;
  // 경첩(Hinge) 기준 회전 오프셋 계산
  const hingeX = -0.45;
  const centerX = hingeX + (doorWidth / 2) * Math.cos(rad);
  const centerZ = (doorWidth / 2) * Math.sin(rad);

  const windowOffset = Math.max(0, Math.min(1.2, spec.windowSlideOffsetMeters));
  const drawerOffset = Math.max(0, Math.min(0.65, spec.drawerPullOffsetMeters));

  return [
    {
      id: "skp-dc-door-leaf",
      name: `DC 여닫이문 (${clampedAngle.toFixed(0)}° 개폐)`,
      kind: "box",
      position: [Math.round(centerX * 1000) / 1000, 1.05, Math.round(centerZ * 1000) / 1000],
      rotation: [0, -rad, 0],
      scale: [doorWidth, 2.1, 0.05],
      color: "#8b5cf6",
    },
    {
      id: "skp-dc-sliding-window",
      name: `DC 미닫이 창문 (${(windowOffset * 100).toFixed(0)}cm 개방)`,
      kind: "box",
      position: [Math.round((1.2 + windowOffset) * 1000) / 1000, 1.5, -1.8],
      rotation: [0, 0, 0],
      scale: [1.1, 1.2, 0.04],
      color: "#38bdf8",
    },
    {
      id: "skp-dc-desk-drawer",
      name: `DC 책상 서랍 (${(drawerOffset * 100).toFixed(0)}cm 인출)`,
      kind: "box",
      position: [-1.4, 0.62, Math.round((0.5 + drawerOffset) * 1000) / 1000],
      rotation: [0, 0, 0],
      scale: [0.55, 0.18, 0.5],
      color: "#f59e0b",
    },
    {
      id: "skp-dc-ceiling-light",
      name: `DC 천장 조명 (${spec.ceilingLightSwitchOn ? "ON 점등" : "OFF 소등"})`,
      kind: "cylinder",
      position: [0, 2.85, 0],
      rotation: [0, 0, 0],
      scale: [0.45, 0.08, 0.45],
      color: spec.ceilingLightSwitchOn ? "#fde047" : "#475569",
    },
  ];
}

export interface SketchUpWebtoonSceneTabSnapshot {
  readonly tabId: string;
  readonly labelKo: string;
  readonly camera: StudioBg3dCameraSettings;
  readonly twoPointPerspectiveLocked: boolean;
  readonly solarPresetId: WebtoonSolarPresetId;
  readonly stylePresetId: StudioSketchUpStylePresetId;
  readonly tagPresetId: WebtoonOutlinerTagPresetId;
  readonly preserveExteriorShadowsOnCutaway: boolean;
  readonly dynamicComponents: DynamicComponentArticulationSpec;
}

/**
 * 웹툰 연속 연출을 위한 문 개폐 3단계 SketchUp Scene Tab 시퀀스 자동 생성
 */
export function generateDynamicComponentActionShotSequence(
  baseTab: SketchUpWebtoonSceneTabSnapshot,
): readonly SketchUpWebtoonSceneTabSnapshot[] {
  const angles = [0, 45, 110] as const;
  const labels = ["1컷: 문 닫힘(정적)", "2컷: 문 반쯤 열림(긴장)", "3컷: 문 활짝 열림(등장)"] as const;
  return angles.map((angle, idx) => ({
    ...baseTab,
    tabId: `${baseTab.tabId}-step-${idx + 1}`,
    labelKo: labels[idx]!,
    dynamicComponents: {
      ...baseTab.dynamicComponents,
      doorSwingAngleDeg: angle,
    },
  }));
}

export interface AbleHybridPostProcessAndGreasePencilPlan {
  readonly fogNearMeters: number;
  readonly fogFarMeters: number;
  readonly fogTintHex: string;
  readonly aoCreaseIntensity: number;
  readonly greasePencilPlanesMeters: {
    readonly foregroundSilhouette: number;
    readonly midgroundActorPlane: number;
    readonly backgroundSkyDome: number;
  };
  readonly summaryKo: string;
}

/**
 * 8. ACON3D ABLE 스타일 대기원근(Z-Depth Fog)·AO 후보정 및 Blender Grease Pencil 2D-3D 카메라 평면 투영 계산
 */
export function computeAbleAtmosphericPostProcessAndGreasePencilGuide(
  solarPresetId: WebtoonSolarPresetId,
  camera: StudioBg3dCameraSettings,
): AbleHybridPostProcessAndGreasePencilPlan {
  const dx = camera.target[0] - camera.position[0];
  const dy = camera.target[1] - camera.position[1];
  const dz = camera.target[2] - camera.position[2];
  const targetDist = Math.max(1.2, Math.hypot(dx, dy, dz));
  const fogTintBySolar: Readonly<Record<WebtoonSolarPresetId, string>> = {
    "golden-hour-morning": "#e0f2fe",
    "noon-clear": "#f8fafc",
    "golden-hour-sunset": "#fed7aa",
    "blue-hour-dusk": "#c7d2fe",
    "night-moonlight": "#1e293b",
  };
  const aoBySolar: Readonly<Record<WebtoonSolarPresetId, number>> = {
    "golden-hour-morning": 0.42,
    "noon-clear": 0.35,
    "golden-hour-sunset": 0.58,
    "blue-hour-dusk": 0.64,
    "night-moonlight": 0.72,
  };
  const midPlane = Number(targetDist.toFixed(2));
  const fgPlane = Number(Math.max(0.8, targetDist * 0.45).toFixed(2));
  const bgPlane = Number((targetDist * 2.6).toFixed(2));
  return {
    fogNearMeters: Number((targetDist * 0.75).toFixed(2)),
    fogFarMeters: Number((targetDist * 4.2).toFixed(2)),
    fogTintHex: fogTintBySolar[solarPresetId],
    aoCreaseIntensity: aoBySolar[solarPresetId],
    greasePencilPlanesMeters: {
      foregroundSilhouette: fgPlane,
      midgroundActorPlane: midPlane,
      backgroundSkyDome: bgPlane,
    },
    summaryKo: `ABLE 대기원근(${fogTintBySolar[solarPresetId]}) · AO ${Math.round(aoBySolar[solarPresetId] * 100)}% · 2D-3D 작화 평면(${fgPlane}m/${midPlane}m/${bgPlane}m)`,
  };
}
