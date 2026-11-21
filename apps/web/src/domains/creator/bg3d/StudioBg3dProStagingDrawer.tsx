/**
 * BG3D 전문가 작업공간용 연출·접지·포즈 전이·손그림 LT 스타일 빌더·실내 광원 스위치보드 통합 드로어(lazy 전용).
 *
 * - 180도 리버스샷 잠금 (`studio-bg3d-180-axis-constraint`)
 * - 단축키 X 지면 접지 & 외형 100% 보존 템플릿 포즈 전이 (`studio-bg3d-ground-snap-and-template-transfer`)
 * - SketchUp Style Builder × Blender Line Art 3.0 손그림 LT 아틀라스 (`studio-lt-style-builder-edge-atlas`)
 * - 16광원 시맨틱 태그 스위치보드 (`studio-bg3d-light-switchboard-water`)
 */
import { useMemo, useState } from "react";

import {
  chainProjected3dEdges,
  createDefaultLineArtModifierStackConfig,
  buildStyleBuilderStrokeAtlas,
  evaluateLineArtModifierStack,
  type LineArtModifierStackConfig,
  type Projected3dEdgeSegment,
} from "../lt-convert/studio-lt-style-builder-edge-atlas";
import {
  constrainCameraTo180Axis,
  createActionLine180Frame,
  flipActionLine180Side,
  generateShotReverseShotSuite,
  type ActionLine180Frame,
  type Axis180ShotSpec,
  type AxisHalfPlaneSide,
} from "./studio-bg3d-180-axis-constraint";
import {
  computeGroundSnapTransform,
  transferTemplateStagingToCharacter,
  type CharacterInstanceRecord,
  type GroundSnapResult,
  type TemplateActorSlotSpec,
  type TemplateTransferResult,
} from "./studio-bg3d-ground-snap-and-template-transfer";
import {
  compileBg3dSwitchboardPass,
  createBg3dLightSwitchboard,
  toggleBg3dLightGroup,
  type Bg3dLightSemanticTag,
  type Bg3dLightSwitchboardState,
  type Bg3dLocalLightFixture,
} from "./studio-bg3d-light-switchboard-water";

export interface StudioBg3dProStagingDrawerProps {
  readonly axis180Locked: boolean;
  readonly axisSide: AxisHalfPlaneSide;
  readonly onToggleAxis180Lock: (locked: boolean) => void;
  readonly onChangeAxisSide: (side: AxisHalfPlaneSide) => void;
  readonly onSelectShotSpec?: (shot: Axis180ShotSpec) => void;
  readonly onGroundSnap?: (result: GroundSnapResult) => void;
  readonly onTransferPose?: (result: TemplateTransferResult) => void;
  readonly onStatusMessage: (messageKo: string) => void;
  readonly onClose: () => void;
}

const DEFAULT_USER_CHARACTER: CharacterInstanceRecord = {
  appearance: {
    characterId: "char-hero-seoyeon",
    displayName: "주인공 서연",
    assetUrl: "/vrm/toonstudio-hero-v1/hero-female-romance.vrm",
    hairPresetId: "hair-long-wave-ribbon",
    outfitSlots: { top: "uniform-blazer", bottom: "pleated-skirt", shoes: "loafer-classic" },
    colors: { hair: "#2b1d2e", outfit: "#1f2937", eyes: "#4a6fa5" },
    heightM: 1.66,
  },
  performance: {
    worldPosition: [-0.9, 0.14, 0.2],
    worldRotationEulerDeg: [0, 15, 0],
    boneRotations: { spine: [0, 0, 0, 1] },
    expressionWeights: { neutral: 1 },
  },
};

const TEMPLATE_POSE_PRESET_ITEMS: readonly TemplateActorSlotSpec[] = [
  {
    slotId: "tpl-dialogue-confront",
    labelKo: "대화 대치 스탠딩",
    referenceHeightM: 1.72,
    performance: {
      worldPosition: [-0.85, 0.12, 0.0],
      worldRotationEulerDeg: [0, 72, 0],
      boneRotations: {
        spine: [0.04, 0.08, 0, 0.996],
        head: [0.02, -0.14, 0, 0.99],
        rightUpperArm: [0.18, 0.05, -0.22, 0.957],
      },
      hipsTranslationM: [0, -0.02, 0],
      expressionWeights: { joy: 0.25, surprised: 0.15 },
      lookAt: { mode: "target", targetWorldPosition: [0.85, 1.58, 0] },
      handPose: { leftPresetId: "relaxed-open", rightPresetId: "gesture-point" },
    },
  },
  {
    slotId: "tpl-window-lean",
    labelKo: "창가 기대기 · 회상",
    referenceHeightM: 1.68,
    performance: {
      worldPosition: [0.4, 0.08, -1.1],
      worldRotationEulerDeg: [0, -38, 0],
      boneRotations: {
        spine: [-0.06, -0.12, 0.04, 0.99],
        head: [-0.05, 0.18, 0.03, 0.982],
      },
      hipsTranslationM: [0, -0.06, 0],
      expressionWeights: { relaxed: 0.7 },
      lookAt: { mode: "angles", yawDeg: 22, pitchDeg: -8 },
      handPose: { leftPresetId: "resting-rail", rightPresetId: "relaxed-open" },
    },
  },
  {
    slotId: "tpl-blade-draw",
    labelKo: "무기 발도 · 액션",
    referenceHeightM: 1.78,
    performance: {
      worldPosition: [0, 0.18, 0.6],
      worldRotationEulerDeg: [0, 24, 0],
      boneRotations: {
        spine: [0.14, -0.22, 0.05, 0.964],
        rightUpperArm: [0.42, -0.18, -0.35, 0.818],
        leftUpperArm: [-0.2, 0.15, 0.28, 0.927],
      },
      hipsTranslationM: [0, -0.14, 0.08],
      expressionWeights: { angry: 0.8 },
      lookAt: { mode: "camera" },
      handPose: { leftPresetId: "grip-sheath", rightPresetId: "grip-sword" },
    },
  },
];
const TEMPLATE_POSE_PRESETS: readonly TemplateActorSlotSpec[] = Object.freeze(TEMPLATE_POSE_PRESET_ITEMS);

const DEFAULT_SWITCHBOARD_FIXTURE_ITEMS: readonly Bg3dLocalLightFixture[] = [
  {
    id: "fix-chandelier-main",
    label: "중앙 샹들리에",
    kind: "point",
    tag: "light:chandelier",
    groupId: "grp-chandelier",
    enabled: true,
    positionM: [0, 3.4, 0],
    direction: [0, -1, 0],
    kelvin: 3200,
    intensity: 2.8,
    attenuationRadiusM: 12,
    innerConeDeg: 35,
    outerConeDeg: 65,
    emissiveMeshId: "mesh-chandelier-bulbs",
    emissiveBoost: 1.4,
    godRay: { enabled: true, coneLengthM: 3.2, coneRadiusM: 1.1, opacity01: 0.28, toonSteps: 3 },
  },
  {
    id: "fix-desk-lamp",
    label: "책상 스탠드",
    kind: "spot",
    tag: "light:lamp",
    groupId: "grp-lamp",
    enabled: true,
    positionM: [1.6, 1.3, -0.8],
    direction: [-0.3, -0.9, 0.2],
    kelvin: 2900,
    intensity: 1.9,
    attenuationRadiusM: 6,
    innerConeDeg: 22,
    outerConeDeg: 48,
    emissiveMeshId: "mesh-desk-lamp-shade",
    emissiveBoost: 1.2,
    godRay: { enabled: false, coneLengthM: 1.4, coneRadiusM: 0.4, opacity01: 0, toonSteps: 2 },
  },
  {
    id: "fix-neon-sign",
    label: "창밖 네온 사인",
    kind: "area",
    tag: "light:neon",
    groupId: "grp-neon",
    enabled: false,
    positionM: [-3.2, 2.2, -2.5],
    direction: [0.85, -0.15, 0.5],
    kelvin: 8800,
    intensity: 2.4,
    attenuationRadiusM: 9,
    innerConeDeg: 40,
    outerConeDeg: 75,
    emissiveMeshId: "mesh-neon-tube",
    emissiveBoost: 2.1,
    godRay: { enabled: true, coneLengthM: 2.5, coneRadiusM: 0.9, opacity01: 0.22, toonSteps: 3 },
  },
  {
    id: "fix-window-daylight",
    label: "대창 채광 슬릿",
    kind: "area",
    tag: "light:window",
    groupId: "grp-window",
    enabled: true,
    positionM: [3.4, 2.6, 0.4],
    direction: [-0.9, -0.35, -0.1],
    kelvin: 5800,
    intensity: 3.1,
    attenuationRadiusM: 14,
    innerConeDeg: 30,
    outerConeDeg: 60,
    emissiveBoost: 1.0,
    godRay: { enabled: true, coneLengthM: 4.5, coneRadiusM: 1.4, opacity01: 0.32, toonSteps: 4 },
  },
];
const DEFAULT_SWITCHBOARD_FIXTURES: readonly Bg3dLocalLightFixture[] = Object.freeze(DEFAULT_SWITCHBOARD_FIXTURE_ITEMS);

const SAMPLE_LT_EDGES: readonly Projected3dEdgeSegment[] = Object.freeze([
  { id: "e1", ax: 40, ay: 30, azDepth: 4.2, bx: 180, by: 34, bzDepth: 4.4, kind: "silhouette", dihedralAngleDeg: 148, materialBoundary: false, intersectionEdge: false },
  { id: "e2", ax: 180, ay: 34, azDepth: 4.4, bx: 184, by: 220, bzDepth: 4.8, kind: "silhouette", dihedralAngleDeg: 152, materialBoundary: false, intersectionEdge: false },
  { id: "e3", ax: 62, ay: 88, azDepth: 6.5, bx: 146, by: 90, bzDepth: 6.8, kind: "crease", dihedralAngleDeg: 94, materialBoundary: false, intersectionEdge: false },
  { id: "e4", ax: 90, ay: 120, azDepth: 8.1, bx: 152, by: 196, bzDepth: 8.6, kind: "material-boundary", dihedralAngleDeg: 62, materialBoundary: true, intersectionEdge: false },
]);

function createDefaultHandDrawnAtlas() {
  const makeStroke = (len: number) => [
    { x: 0, y: 0, pressure01: 0.28 },
    { x: len * 0.35, y: 0.4, pressure01: 0.88 },
    { x: len * 0.72, y: -0.3, pressure01: 0.76 },
    { x: len, y: 0.1, pressure01: 0.22 },
  ];
  return buildStyleBuilderStrokeAtlas({
    id: "bg3d-handdrawn-gpen",
    name: "작가 G펜 4버킷 아틀라스",
    seed: 2026,
    strokesByBucket: {
      32: makeStroke(32),
      64: makeStroke(64),
      128: makeStroke(128),
      256: makeStroke(256),
    },
  });
}

export function StudioBg3dProStagingDrawer({
  axis180Locked,
  axisSide,
  onToggleAxis180Lock,
  onChangeAxisSide,
  onSelectShotSpec,
  onGroundSnap,
  onTransferPose,
  onStatusMessage,
  onClose,
}: StudioBg3dProStagingDrawerProps) {
  const [activeShotId, setActiveShotId] = useState<string>("shot-establishing");
  const [characterRecord, setCharacterRecord] = useState<CharacterInstanceRecord>(DEFAULT_USER_CHARACTER);
  const [lastTransferNote, setLastTransferNote] = useState<string | null>(null);
  const [ltConfig, setLtConfig] = useState<LineArtModifierStackConfig>(() => createDefaultLineArtModifierStackConfig());
  const [switchboard, setSwitchboard] = useState<Bg3dLightSwitchboardState>(() =>
    createBg3dLightSwitchboard(DEFAULT_SWITCHBOARD_FIXTURES, 0.9),
  );

  const actionFrame: ActionLine180Frame = useMemo(
    () =>
      createActionLine180Frame({
        actorA: { id: "actor-a", name: "서연", position: [-0.9, 0, 0] },
        actorB: { id: "actor-b", name: "도윤", position: [0.9, 0, 0] },
        lockedSide: axisSide,
      }),
    [axisSide],
  );
  const shotSuite = useMemo(() => generateShotReverseShotSuite(actionFrame), [actionFrame]);

  const handDrawnAtlas = useMemo(() => createDefaultHandDrawnAtlas(), []);
  const ltEvaluation = useMemo(() => {
    const polylines = chainProjected3dEdges(SAMPLE_LT_EDGES, {
      creaseAngleThresholdDeg: ltConfig.creaseAngleThresholdDeg,
    });
    return evaluateLineArtModifierStack(polylines, handDrawnAtlas, ltConfig);
  }, [handDrawnAtlas, ltConfig]);

  const compiledLights = useMemo(() => compileBg3dSwitchboardPass(switchboard), [switchboard]);

  const handleSelectShot = (shot: Axis180ShotSpec) => {
    const checked = axis180Locked
      ? constrainCameraTo180Axis(actionFrame, shot.position, "plane-project")
      : null;
    setActiveShotId(shot.id);
    onSelectShotSpec?.(shot);
    onStatusMessage(
      `${shot.labelKo} (${shot.focalLengthMm}mm) 적용${checked ? ` · ${checked.summaryKo}` : ""}`,
    );
  };

  const handleApplyTemplatePose = (slot: TemplateActorSlotSpec) => {
    const result = transferTemplateStagingToCharacter(characterRecord, slot, {
      snapToGroundAfterTransfer: true,
      raycastGroundY: () => 0,
    });
    setCharacterRecord(result.character);
    setLastTransferNote(
      `${slot.labelKo} 전이 완료 · 외형 ${result.preservedAppearanceKeys.length}항목 100% 보존 · 키 비율 ×${result.hipsHeightScaleApplied}`,
    );
    onTransferPose?.(result);
    onStatusMessage(`템플릿 "${slot.labelKo}" 포즈·표정 전이 완료 (내 캐릭터 외형 보존)`);
  };

  const handleInstantGroundSnap = () => {
    const snap = computeGroundSnapTransform({
      currentPosition: characterRecord.performance.worldPosition,
      raycastGroundY: () => 0,
      defaultGroundY: 0,
    });
    setCharacterRecord((prev) => ({
      ...prev,
      performance: { ...prev.performance, worldPosition: snap.nextPosition },
    }));
    onGroundSnap?.(snap);
    onStatusMessage(`지면 접지 완료 (Y 보정 ${snap.deltaY}m · 바닥 0mm 밀착)`);
  };

  const handleToggleLightGroup = (tag: Bg3dLightSemanticTag, label: string) => {
    const next = toggleBg3dLightGroup(switchboard, tag);
    const nextPass = compileBg3dSwitchboardPass(next);
    setSwitchboard(next);
    onStatusMessage(`${label} 전환 · 활성 조명 ${nextPass.activeLightCount}/${nextPass.totalFixtureCount}개`);
  };

  return (
    <section
      data-testid="studio-bg3d-pro-staging-drawer"
      aria-label="3D 연출·포즈·손그림 선화·조명 도구"
      className="border-b border-line bg-panel px-3 py-2.5 text-xs text-fg [word-break:keep-all]"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-fg">
          3D 연출·포즈·손그림 LT·조명 스위치보드
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 hover:border-accent hover:text-fg"
        >
          연출 도구 접기
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {/* 1. 180도 리버스샷 잠금 */}
        <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="font-semibold text-fg">180° 리버스샷 잠금</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={axis180Locked}
                data-testid="bg3d-pro-axis180-toggle"
                onClick={() => {
                  const next = !axis180Locked;
                  onToggleAxis180Lock(next);
                  onStatusMessage(next ? "180° 액션 라인 반평면 잠금 켜짐" : "180° 액션 라인 잠금 해제");
                }}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
              >
                {axis180Locked ? "잠금 중" : "해제됨"}
              </button>
              <button
                type="button"
                data-testid="bg3d-pro-axis180-flip"
                onClick={() => {
                  const flipped = flipActionLine180Side(actionFrame);
                  onChangeAxisSide(flipped.lockedSide);
                  onStatusMessage(`180° 허용 반평면 전환 (축 ${flipped.lockedSide > 0 ? "+1" : "-1"})`);
                }}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 hover:border-accent"
              >
                축 반전
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {shotSuite.map((shot) => (
              <button
                key={shot.id}
                type="button"
                aria-pressed={activeShotId === shot.id}
                data-testid={`bg3d-pro-shot-${shot.id}`}
                onClick={() => handleSelectShot(shot)}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2 text-xs text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
              >
                {shot.labelKo}
              </button>
            ))}
          </div>
        </div>

        {/* 2. 지면 접지(X) & 템플릿 포즈 전이 */}
        <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="font-semibold text-fg">지면 접지(X) · 포즈 전이</span>
            <button
              type="button"
              data-testid="bg3d-pro-ground-snap-btn"
              onClick={handleInstantGroundSnap}
              className="inline-flex min-h-11 items-center rounded-lg border border-accent bg-accent-soft px-2.5 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent"
            >
              바닥 스냅 (X)
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {TEMPLATE_POSE_PRESETS.map((slot) => (
              <button
                key={slot.slotId}
                type="button"
                data-testid={`bg3d-pro-pose-${slot.slotId}`}
                onClick={() => handleApplyTemplatePose(slot)}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2.5 text-xs text-fg-2 hover:border-accent hover:text-fg"
              >
                {slot.labelKo}
              </button>
            ))}
          </div>
          <p data-testid="bg3d-pro-pose-readout" className="text-xs text-fg-3 tabular-nums">
            {lastTransferNote ?? `현재 위치 Y ${characterRecord.performance.worldPosition[1]}m · 외형 ${characterRecord.appearance.displayName}`}
          </p>
        </div>

        {/* 3. 손그림 LT 스타일 빌더 */}
        <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="font-semibold text-fg">손그림 LT 스타일 빌더</span>
            <span data-testid="bg3d-pro-lt-readout" className="font-mono text-xs tabular-nums text-accent">
              {ltEvaluation.length}스트로크 · {ltConfig.baseWidthPx}px
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-xs text-fg-2 tabular-nums">선폭 {ltConfig.baseWidthPx}px</span>
              <input
                type="range"
                aria-label="손그림 선폭"
                min={1.0}
                max={4.5}
                step={0.2}
                value={ltConfig.baseWidthPx}
                onChange={(e) => {
                  const baseWidthPx = Number(e.currentTarget.value);
                  setLtConfig((prev) => ({ ...prev, baseWidthPx }));
                  onStatusMessage(`손그림 LT 기본 선폭 ${baseWidthPx}px 반영`);
                }}
                className="w-full accent-accent"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-fg-2 tabular-nums">뻗침 {ltConfig.overshootPx}px</span>
              <input
                type="range"
                aria-label="손그림 끝점 뻗침"
                min={0}
                max={10}
                step={1}
                value={ltConfig.overshootPx}
                onChange={(e) => {
                  const overshootPx = Number(e.currentTarget.value);
                  setLtConfig((prev) => ({ ...prev, overshootPx }));
                  onStatusMessage(`손그림 LT 끝점 오버슈트 ${overshootPx}px 반영`);
                }}
                className="w-full accent-accent"
              />
            </label>
          </div>
          <p className="text-xs text-fg-3">
            {handDrawnAtlas.name} ({handDrawnAtlas.buckets.length}버킷) · 떨림 {ltConfig.jitterAmplitudePx}px
          </p>
        </div>

        {/* 4. 실내 광원 스위치보드 */}
        <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="font-semibold text-fg">광원 스위치보드</span>
            <span data-testid="bg3d-pro-light-readout" className="font-mono text-xs tabular-nums text-accent">
              활성 {compiledLights.activeLightCount}/{compiledLights.totalFixtureCount} · 갓레이 {compiledLights.godRayMeshes.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {switchboard.groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={group.enabled}
                data-testid={`bg3d-pro-light-group-${group.id}`}
                onClick={() => handleToggleLightGroup(group.tag, group.label)}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2 text-xs text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
              >
                {group.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-2 tabular-nums">
            <span>디머 {Math.round(switchboard.masterDimmer01 * 100)}%</span>
            <input
              type="range"
              aria-label="실내 조명 마스터 디머"
              min={0}
              max={100}
              step={5}
              value={Math.round(switchboard.masterDimmer01 * 100)}
              onChange={(e) => {
                const nextDimmer = Number(e.currentTarget.value) / 100;
                setSwitchboard((prev) => ({ ...prev, masterDimmer01: nextDimmer }));
              }}
              className="flex-1 accent-accent"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
