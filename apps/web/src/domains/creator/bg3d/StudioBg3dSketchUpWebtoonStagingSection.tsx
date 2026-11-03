/**
 * StudioBg3dSketchUpWebtoonStagingSection.tsx
 *
 * REA 역공학 기반 SketchUp 3D 배경 제작·연출(Authoring & Staging) 7대 워크플로 통합 섹션:
 * 1. Push/Pull(P) 관통 개구부 · Offset(F) 창틀 · Follow-Me 몰딩 · 축 추론 잠금 · *N//N 배열 → 3D 씬 즉시 삽입
 * 2. 2점 투시 수직선 고정 프레이밍 잠금 + SketchUp Scene Tab 컷별 스냅샷/복원
 * 3. 외부 태양 그림자 보존형 실내 방 자동 단면 컷어웨이 (Shadow-Preserving Interior Room Auto-Cutaway)
 * 4. 천문 태양 고도/방위각 계산기 + 웹툰 시간대 프리셋(황금시간대/정오/블루아워/달빛 야간) + 그림자 소프트니스/진하기
 * 5. SketchUp 6종 스타일 + Outliner 웹툰 태그 가시성 프리셋 세트 원클릭 전환
 * 6. Dynamic Components (문 회전 각도 0°~180° · 미닫이 창문/서랍 오프셋 · 조명 스위치) 씬 배치 & 3컷 연속 연출 시퀀서
 * 7. 1-Click 웹툰 6패스 LT(주선 + 질감선 + 그림자 Multiply + 스크린톤 + 밑색 + 공기원근 Depth) 레이어 스택 레시피
 */
import { Camera, Layers, SunMedium, WandSparkles } from "lucide-react";
import React, { useMemo, useState } from "react";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import { STUDIO_SKETCHUP_STYLE_PRESETS } from "./studio-bg3d-sketchup-styles-uv-engine";
import {
  buildDynamicComponentArticulatedPrimitives,
  buildSketchUpWebtoonSixPassLtRecipe,
  commitSketchUpDirectModelingToPrimitives,
  computeAbleAtmosphericPostProcessAndGreasePencilGuide,
  computeShadowPreservingRoomCutawayPlan,
  generateDynamicComponentActionShotSequence,
  panSketchUpTwoPointPerspectiveLockedCamera,
  resolveSketchUpStyleAndOutlinerPreset,
  resolveWebtoonSketchUpSolarRig,
  WEBTOON_OUTLINER_TAG_VISIBILITY_PRESETS,
  WEBTOON_SKETCHUP_SOLAR_PRESETS,
  type SketchUpAxisLockId,
  type StudioSketchUpStylePresetId,
  type WebtoonOutlinerTagPresetId,
  type WebtoonSolarPresetId,
} from "./studio-bg3d-sketchup-webtoon-staging-bridge";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";

import { useT } from "@/shared/lib/i18n";
import { defineBilingualText, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const ROLE_LENS_COPY = {
  title: defineBilingualText("Bg3dRoleLens", "title", "직무별 스타일·태그·카메라 설정 프리셋", "Role-based style, tag, and camera setting presets"),
  scope: defineBilingualText("Bg3dRoleLens", "scope", "프리셋은 아래 설정을 선택합니다. 장면 배치와 카메라 적용은 각각의 적용 버튼으로 실행하며, 편집 권한이나 동선 잠금을 변경하지 않습니다.", "Presets select the settings below. Use the insertion or camera button to apply them to the scene. They do not change editing permissions or lock actor paths."),
  main: defineBilingualText("Bg3dRoleLens", "main", "배경 메인 · 텍스처·정리 태그", "Background lead · textures and clean tags"),
  assist: defineBilingualText("Bg3dRoleLens", "assist", "배경 보조 · 선 스타일·소품 숨김", "Background assistant · lines and hidden props"),
  camera: defineBilingualText("Bg3dRoleLens", "camera", "콘티 · 와이어·배우 태그·카메라 시프트", "Storyboard · wireframe, actor tags, and camera shift"),
  lighting: defineBilingualText("Bg3dRoleLens", "lighting", "명암 · 단색·황혼 태양광", "Shading · monochrome and dusk sunlight"),
  rejected: defineBilingualText("Bg3dRoleLens", "rejected", "현재 장면에 배치하지 못했습니다. 장면 잠금과 삽입 가능 상태를 확인해 주세요.", "The scene rejected the insertion. Check the scene lock and insertion availability."),
  cameraRequest: defineBilingualText("Bg3dRoleLens", "cameraRequest", "2점 투시 수직 고정 카메라 적용 요청", "Request a two-point perspective camera"),
};

export interface StudioBg3dSketchUpWebtoonStagingSectionProps {
  readonly disabled?: boolean;
  readonly onStatusChange?: (messageKo: string) => void;
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  readonly onApplySceneCamera?: (camera: StudioBg3dCameraSettings, labelKo: string) => void;
}

export function StudioBg3dSketchUpWebtoonStagingSection({
  disabled = false,
  onStatusChange,
  onInsertScenePrimitives,
  onApplySceneCamera,
}: StudioBg3dSketchUpWebtoonStagingSectionProps): React.JSX.Element {
  const t = useT();
  useBilingualI18nRevision();
  // 1. Direct Modeling + Axis Inference + Array state
  const [axisLock, setAxisLock] = useState<SketchUpAxisLockId>("red-x");
  const [arrayToken, setArrayToken] = useState<string>("*2");
  const [includeCrownMolding, setIncludeCrownMolding] = useState<boolean>(true);

  // 2 & 3. Two-Point Perspective + Shadow-Preserving Room Cutaway state
  const [lensShiftY, setLensShiftY] = useState<number>(0.12);
  const [preserveExteriorShadows, setPreserveExteriorShadows] = useState<boolean>(true);

  // 4. Solar Shadow Calculator Preset state
  const [solarPresetId, setSolarPresetId] =
    useState<WebtoonSolarPresetId>("golden-hour-sunset");
  const [shadowSoftness, setShadowSoftness] = useState<number>(0.55);

  // 5. Style Builder + Outliner Tag Visibility Preset state
  const [stylePresetId, setStylePresetId] =
    useState<StudioSketchUpStylePresetId>("skp-shaded-with-textures");
  const [tagPresetId, setTagPresetId] =
    useState<WebtoonOutlinerTagPresetId>("interior-clean-line");

  // 6. Dynamic Components Articulation state
  const [doorSwingDeg, setDoorSwingDeg] = useState<number>(45);
  const [windowSlideMeters, setWindowSlideMeters] = useState<number>(0.45);
  const [drawerPullMeters, setDrawerPullMeters] = useState<number>(0.25);
  const [ceilingLightOn, setCeilingLightOn] = useState<boolean>(true);
  const [roleLensId, setRoleLensId] = useState<
    "background-main" | "background-assist" | "storyboard-camera" | "color-lighting"
  >("background-main");

  const applyRoleLensPreset = (
    lens: "background-main" | "background-assist" | "storyboard-camera" | "color-lighting",
  ) => {
    setRoleLensId(lens);
    if (lens === "background-main") {
      setStylePresetId("skp-shaded-with-textures");
      setTagPresetId("interior-clean-line");
      setPreserveExteriorShadows(true);
    } else if (lens === "background-assist") {
      setStylePresetId("skp-hidden-line-webtoon");
      setTagPresetId("hide-small-props");
      setPreserveExteriorShadows(true);
    } else if (lens === "storyboard-camera") {
      setStylePresetId("skp-xray-wire");
      setTagPresetId("actor-blocking-clear");
      setLensShiftY(0.15);
    } else {
      setStylePresetId("skp-monochrome-inspect");
      setSolarPresetId("blue-hour-dusk");
      setShadowSoftness(0.7);
    }
  };

  const directModelingCommit = useMemo(
    () =>
      commitSketchUpDirectModelingToPrimitives({
        wallWidthMeters: 3.6,
        wallHeightMeters: 2.8,
        wallThicknessMeters: 0.22,
        openingWidthMeters: 1.4,
        openingHeightMeters: 1.3,
        sillHeightMeters: 0.85,
        frameOffsetMeters: 0.06,
        includeCrownMolding,
        axisLock,
        arrayInputToken: arrayToken,
        arraySpanMeters: 3.8,
      }),
    [axisLock, arrayToken, includeCrownMolding],
  );

  const twoPointCamera = useMemo(
    () =>
      panSketchUpTwoPointPerspectiveLockedCamera(
        {
          position: [3.8, 1.65, 5.2],
          target: [0, 1.2, 0],
          up: [0, 1, 0],
          fovDegrees: 38,
          projection: "perspective",
          lensShift: [0, 0],
        },
        0,
        lensShiftY,
      ),
    [lensShiftY],
  );

  const cutawayPlan = useMemo(
    () =>
      computeShadowPreservingRoomCutawayPlan({
        cameraPosition: twoPointCamera.position,
        roomCenter: [0, 1.5, 0],
        roomSize: [6, 3, 6],
        preserveExteriorShadows,
      }),
    [twoPointCamera.position, preserveExteriorShadows],
  );

  const solarRig = useMemo(
    () =>
      resolveWebtoonSketchUpSolarRig({
        presetId: solarPresetId,
        overrideShadowSoftness: shadowSoftness,
      }),
    [solarPresetId, shadowSoftness],
  );

  const styleAndOutliner = useMemo(
    () => resolveSketchUpStyleAndOutlinerPreset(stylePresetId, tagPresetId),
    [stylePresetId, tagPresetId],
  );

  const dynamicComponentPrimitives = useMemo(
    () =>
      buildDynamicComponentArticulatedPrimitives({
        doorSwingAngleDeg: doorSwingDeg,
        windowSlideOffsetMeters: windowSlideMeters,
        drawerPullOffsetMeters: drawerPullMeters,
        ceilingLightSwitchOn: ceilingLightOn,
      }),
    [doorSwingDeg, windowSlideMeters, drawerPullMeters, ceilingLightOn],
  );

  const actionShotSequence = useMemo(
    () =>
      generateDynamicComponentActionShotSequence({
        tabId: "scene-classroom-entry",
        labelKo: "교실 복도 등장 씬",
        camera: twoPointCamera,
        twoPointPerspectiveLocked: true,
        solarPresetId,
        stylePresetId,
        tagPresetId,
        preserveExteriorShadowsOnCutaway: preserveExteriorShadows,
        dynamicComponents: {
          doorSwingAngleDeg: doorSwingDeg,
          windowSlideOffsetMeters: windowSlideMeters,
          drawerPullOffsetMeters: drawerPullMeters,
          ceilingLightSwitchOn: ceilingLightOn,
        },
      }),
    [
      twoPointCamera,
      solarPresetId,
      stylePresetId,
      tagPresetId,
      preserveExteriorShadows,
      doorSwingDeg,
      windowSlideMeters,
      drawerPullMeters,
      ceilingLightOn,
    ],
  );

  const sixPassLtRecipe = useMemo(
    () =>
      buildSketchUpWebtoonSixPassLtRecipe({
        includeColorBase: true,
        includeHalftone: true,
        includeShadowPass: true,
        includeDepthFogPass: true,
      }),
    [],
  );

  const ableAndGreasePencilGuide = useMemo(
    () => computeAbleAtmosphericPostProcessAndGreasePencilGuide(solarPresetId, twoPointCamera),
    [solarPresetId, twoPointCamera],
  );

  return (
    <details
      open
      data-testid="sketchup-webtoon-staging-bridge-section"
      className="rounded-xl border border-line bg-card p-3"
    >
      <summary className="cursor-pointer font-bold text-fg">
        공간 모델러 3D 웹툰 배경 연출·스테이징 통합 워크벤치 (REA Verified)
      </summary>

      <div className="mt-2.5 space-y-2.5 text-[0.65rem] text-fg">
        {/* 직무별 로컬 설정 프리셋. 장면 변경은 기존 명시적 명령 경계를 사용한다. */}
        <div
          data-testid="sketchup-role-lens-bar"
          className="rounded-lg border border-accent/30 bg-accent-soft/20 p-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-bold text-fg">
              {t(ROLE_LENS_COPY.title)}
            </span>
            <div
              data-testid="sketchup-hybrid-competitor-presets"
              className="flex flex-wrap gap-1"
            >
              {(
                [
                  {
                    id: "background-main",
                    label: ROLE_LENS_COPY.main,
                  },
                  {
                    id: "background-assist",
                    label: ROLE_LENS_COPY.assist,
                  },
                  {
                    id: "storyboard-camera",
                    label: ROLE_LENS_COPY.camera,
                  },
                  {
                    id: "color-lighting",
                    label: ROLE_LENS_COPY.lighting,
                  },
                ] as const
              ).map((lens) => (
                <button
                  key={lens.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`sketchup-role-lens-${lens.id}`}
                  onClick={() => applyRoleLensPreset(lens.id)}
                  aria-pressed={roleLensId === lens.id}
                  className={
                    roleLensId === lens.id
                      ? "rounded border border-accent bg-accent px-2 py-0.5 text-[0.6rem] font-bold text-on-accent"
                      : "rounded border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 hover:border-accent/50"
                  }
                >
                  {t(lens.label)}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-fg-2">{t(ROLE_LENS_COPY.scope)}</p>
          <p
            data-testid="sketchup-able-grease-pencil-summary"
            className="mt-1 font-mono text-[0.58rem] text-fg-2"
          >
            {ableAndGreasePencilGuide.summaryKo}
          </p>
        </div>

        {/* 1. Direct Modeling + Axis Inference + Array Commit */}
        <div className="rounded-lg border border-line bg-panel p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-fg">
              ① Push/Pull(P) 관통 창문 · Offset(F) 창틀 · Follow-Me 몰딩 · 축 잠금 배열 커밋
            </span>
            <button
              type="button"
              disabled={disabled || !onInsertScenePrimitives}
              data-testid="sketchup-direct-modeling-commit-btn"
              onClick={() => {
                const inserted = onInsertScenePrimitives?.(
                  directModelingCommit.primitives,
                  directModelingCommit.summaryKo,
                );
                onStatusChange?.(inserted === true ? directModelingCommit.summaryKo : t(ROLE_LENS_COPY.rejected));
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[0.65rem] font-bold text-on-accent hover:bg-accent/90"
            >
              <WandSparkles className="size-3" aria-hidden />
              <span>현재 3D 씬에 개구부 벽체·몰딩 배열 배치 ({directModelingCommit.primitives.length}개)</span>
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg-2">Axis Inference 잠금</span>
              <select
                aria-label="SketchUp 축 추론 잠금"
                value={axisLock}
                onChange={(e) => setAxisLock(e.target.value as SketchUpAxisLockId)}
                className="rounded border border-line bg-card px-1.5 py-1 text-fg"
              >
                <option value="red-x">Red X축 잠금 (→)</option>
                <option value="green-z">Green Y/깊이축 잠금 (←)</option>
                <option value="blue-y">Blue Z/수직축 잠금 (↑)</option>
                <option value="magenta-parallel">Magenta 평행/수직 추론 (↓)</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg-2">VCB 배열 복제 (*N / /N)</span>
              <select
                aria-label="SketchUp 배열 복제 토큰"
                value={arrayToken}
                onChange={(e) => setArrayToken(e.target.value)}
                className="rounded border border-line bg-card px-1.5 py-1 text-fg"
              >
                <option value="*1">단일 벽체 (*1)</option>
                <option value="*2">2연속 창문 벽체 (*2)</option>
                <option value="*3">3연속 교실 창문 벽체 (*3)</option>
                <option value="/2">내분 2등분 배열 (/2)</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 pt-3">
              <input
                type="checkbox"
                checked={includeCrownMolding}
                onChange={(e) => setIncludeCrownMolding(e.target.checked)}
                className="accent-accent"
              />
              <span>Follow-Me 상부 크라운 몰딩 포함</span>
            </label>
          </div>
          <p className="mt-1.5 font-mono text-[0.6rem] text-fg-2">
            {directModelingCommit.summaryKo}
          </p>
        </div>

        {/* 2 & 3. 2-Point Perspective + Shadow-Preserving Room Cutaway */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-panel p-2.5">
            <div className="flex items-center justify-between font-bold text-fg">
              <span>② 2점 투시(Two-Point) 수직선 고정 & 렌즈 시프트</span>
              <span className="font-mono text-accent">
                ShiftY {twoPointCamera.lensShift?.[1]?.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              aria-label="2점 투시 수직 렌즈 시프트"
              min={-0.45}
              max={0.45}
              step={0.05}
              value={lensShiftY}
              onChange={(e) => setLensShiftY(parseFloat(e.target.value))}
              className="mt-1.5 w-full accent-accent"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="font-mono text-[0.58rem] text-fg-2">
                EyeY={twoPointCamera.position[1]}m · TargetY={twoPointCamera.target[1]}m (수평 고정)
              </span>
              <button
                type="button"
                disabled={disabled || !onApplySceneCamera}
                data-testid="sketchup-two-point-apply-btn"
                onClick={() => {
                  const msg = `${t(ROLE_LENS_COPY.cameraRequest)} (LensShiftY ${twoPointCamera.lensShift?.[1]?.toFixed(2)})`;
                  onApplySceneCamera?.(twoPointCamera, msg);
                  onStatusChange?.(msg);
                }}
                className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[0.6rem] font-bold text-on-accent"
              >
                <Camera className="size-3" aria-hidden />
                <span>2점 투시 적용</span>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel p-2.5">
            <div className="flex items-center justify-between font-bold text-fg">
              <span>③ 외부 채광 그림자 보존 실내 단면 컷어웨이</span>
              <label className="flex items-center gap-1 font-normal text-fg-2">
                <input
                  type="checkbox"
                  checked={preserveExteriorShadows}
                  onChange={(e) => setPreserveExteriorShadows(e.target.checked)}
                  className="accent-accent"
                />
                <span>창틀 그림자 보존</span>
              </label>
            </div>
            <p
              data-testid="sketchup-shadow-preserving-cutaway-summary"
              className="mt-1.5 font-mono text-[0.6rem] text-fg-2"
            >
              {cutawayPlan.summaryKo}
            </p>
          </div>
        </div>

        {/* 4 & 5. Solar Shadow Calculator + Style & Outliner Tag Presets */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-panel p-2.5">
            <div className="flex items-center justify-between font-bold text-fg">
              <span className="inline-flex items-center gap-1">
                <SunMedium className="size-3.5 text-accent" aria-hidden />
                <span>④ 웹툰 시간대별 태양광·그림자 소프트니스</span>
              </span>
              <span className="font-mono text-accent">
                {(shadowSoftness * 100).toFixed(0)}% Soft
              </span>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <select
                aria-label="웹툰 태양광 시간대 프리셋"
                data-testid="sketchup-solar-preset-select"
                value={solarPresetId}
                onChange={(e) => setSolarPresetId(e.target.value as WebtoonSolarPresetId)}
                className="w-2/3 rounded border border-line bg-card px-1.5 py-1 text-fg"
              >
                {Object.values(WEBTOON_SKETCHUP_SOLAR_PRESETS).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.labelKo}
                  </option>
                ))}
              </select>
              <input
                type="range"
                aria-label="그림자 소프트니스"
                min={0.1}
                max={0.95}
                step={0.05}
                value={shadowSoftness}
                onChange={(e) => setShadowSoftness(parseFloat(e.target.value))}
                className="w-1/3 accent-accent"
              />
            </div>
            <p className="mt-1 font-mono text-[0.58rem] text-fg-2">{solarRig.summaryKo}</p>
          </div>

          <div className="rounded-lg border border-line bg-panel p-2.5">
            <div className="font-bold text-fg">
              ⑤ 공간 모델러 스타일(6종) + Outliner 태그 가시성 프리셋
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <select
                aria-label="SketchUp 스타일 프리셋"
                value={stylePresetId}
                onChange={(e) =>
                  setStylePresetId(e.target.value as StudioSketchUpStylePresetId)
                }
                className="rounded border border-line bg-card px-1.5 py-1 text-fg"
              >
                {Object.values(STUDIO_SKETCHUP_STYLE_PRESETS).map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.labelKo}
                  </option>
                ))}
              </select>
              <select
                aria-label="Outliner 태그 가시성 프리셋"
                data-testid="sketchup-outliner-tag-preset-select"
                value={tagPresetId}
                onChange={(e) =>
                  setTagPresetId(e.target.value as WebtoonOutlinerTagPresetId)
                }
                className="rounded border border-line bg-card px-1.5 py-1 text-fg"
              >
                {Object.values(WEBTOON_OUTLINER_TAG_VISIBILITY_PRESETS).map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.labelKo}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 font-mono text-[0.58rem] text-fg-2">
              {styleAndOutliner.summaryKo}
            </p>
          </div>
        </div>

        {/* 6 & 7. Dynamic Components Articulation + 1-Click 6-Pass LT Recipe */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-panel p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-fg">
                ⑥ 동적 구성요소(문·창문·서랍·조명) & 3컷 연속 시퀀스
              </span>
              <button
                type="button"
                disabled={disabled || !onInsertScenePrimitives}
                data-testid="sketchup-dc-spawn-btn"
                onClick={() => {
                  const msg = `동적 구성요소(문 ${doorSwingDeg}° · 창문 ${(windowSlideMeters * 100).toFixed(0)}cm · 서랍 ${(drawerPullMeters * 100).toFixed(0)}cm) 씬 배치 완료`;
                  const inserted = onInsertScenePrimitives?.(
                    dynamicComponentPrimitives,
                    msg,
                  );
                  onStatusChange?.(inserted === true ? msg : t(ROLE_LENS_COPY.rejected));
                }}
                className="rounded bg-accent px-2 py-0.5 text-[0.6rem] font-bold text-on-accent"
              >
                DC 소품 씬 배치
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[0.6rem]">
              <label className="flex flex-col">
                <span>문 회전: {doorSwingDeg}°</span>
                <input
                  type="range"
                  aria-label="동적 구성요소 문 개폐 각도"
                  min={0}
                  max={150}
                  step={15}
                  value={doorSwingDeg}
                  onChange={(e) => setDoorSwingDeg(Number(e.target.value))}
                  className="accent-accent"
                />
              </label>
              <label className="flex flex-col">
                <span>창문 개방: {(windowSlideMeters * 100).toFixed(0)}cm</span>
                <input
                  type="range"
                  aria-label="동적 구성요소 창문 슬라이딩"
                  min={0}
                  max={1.0}
                  step={0.1}
                  value={windowSlideMeters}
                  onChange={(e) => setWindowSlideMeters(Number(e.target.value))}
                  className="accent-accent"
                />
              </label>
              <label className="flex flex-col">
                <span>서랍 인출: {(drawerPullMeters * 100).toFixed(0)}cm</span>
                <input
                  type="range"
                  aria-label="동적 구성요소 서랍 인출"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={drawerPullMeters}
                  onChange={(e) => setDrawerPullMeters(Number(e.target.value))}
                  className="accent-accent"
                />
              </label>
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[0.58rem] text-fg-2">
              <span>
                연속 연출 탭: {actionShotSequence.map((s) => s.labelKo).join(" → ")}
              </span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={ceilingLightOn}
                  onChange={(e) => setCeilingLightOn(e.target.checked)}
                  className="accent-accent"
                />
                <span>조명 ON</span>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel p-2.5">
            <div className="flex items-center justify-between font-bold text-fg">
              <span className="inline-flex items-center gap-1">
                <Layers className="size-3.5 text-accent" aria-hidden />
                <span>⑦ 1-Click 웹툰 6패스 LT 레이어 스택 (Color+Tone+Shadow+Depth)</span>
              </span>
              <span className="font-mono text-accent">{sixPassLtRecipe.length} Layers</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {sixPassLtRecipe.map((layer) => (
                <span
                  key={layer.role}
                  data-testid={`sketchup-lt-pass-chip-${layer.role}`}
                  className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[0.58rem] text-fg-2"
                >
                  {layer.nameKo} ({layer.blendMode} · {Math.round(layer.opacity * 100)}%)
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
