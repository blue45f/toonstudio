import { useMemo, useState } from "react";
import { Check, Layers, Sparkles, Sun, UserPlus, UserX, Wand2 } from "lucide-react";

import { KWEBTOON_ARCHETYPE_STAGE_BRIDGE, type KWebtoonArchetypeBridgeId } from "../studio-3d-pro/kwebtoon-npr-ink-contract";
import {
  MAX_STAGE_CHARACTERS,
  MIN_STAGE_CHARACTERS,
  STAGE_BACKGROUND_SLOTS,
  STAGE_TIME_OF_DAY_LIST,
  WEBTOON_COMPOSITE_FRAMING_PRESETS,
  addStageCharacter,
  applyCompositeFramingPreset,
  applySmartAutoHarmonize,
  buildCompositeCutLayerPlan,
  createInitialStageCompositeState,
  formatStageOklch,
  generateStageCrowdExtras,
  getStageBackgroundSlot,
  getWebtoonCompositeFramingPreset,
  harmonizeStageLightingAndInk,
  projectStagePointToPreview,
  removeStageCharacter,
  setStageManualGroundOffset,
  switchStageBackground,
  updateStageCharacterSlot,
  type CompositeBakePassCode,
  type CompositeCutLayerPlan,
  type StageAspectRatioId,
  type StageBackgroundSlotId,
  type StageCompositeState,
  type StageCrowdDensityId,
  type StageTimeOfDayId,
} from "./stage-3d-bg-character-compositor";

export interface Studio3dBgCharacterCompositorPanelProps {
  readonly initialBackgroundId?: StageBackgroundSlotId;
  readonly onBakeCompositeCut?: (plan: CompositeCutLayerPlan) => void;
}

const ASPECT_OPTIONS: readonly { readonly id: StageAspectRatioId; readonly labelKo: string }[] =
  Object.freeze([
    { id: "9:16", labelKo: "9:16 세로 컷" },
    { id: "4:5", labelKo: "4:5 인스타·표지" },
    { id: "16:9", labelKo: "16:9 와이드 컷" },
  ]);

const CROWD_OPTIONS: readonly { readonly id: StageCrowdDensityId; readonly labelKo: string }[] =
  Object.freeze([
    { id: "none", labelKo: "없음 (0명)" },
    { id: "sparse", labelKo: "적게 (4명)" },
    { id: "medium", labelKo: "보통 (8명)" },
    { id: "bustling", labelKo: "붐빔 (14명)" },
  ]);

const FRAME_GUIDE_BOX: Readonly<Record<StageAspectRatioId, { readonly x: number; readonly y: number; readonly w: number; readonly h: number }>> =
  Object.freeze({
    "16:9": { x: 16, y: 14, w: 328, h: 184 },
    "4:5": { x: 96, y: 8, w: 168, h: 204 },
    "9:16": { x: 120, y: 6, w: 120, h: 208 },
  });

const CARD_CLS =
  "rounded-xl border border-line bg-panel p-3 text-fg";
const SUBCARD_CLS =
  "rounded-lg border border-line bg-card p-2.5";
const BTN_CLS =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";

function pillClass(active: boolean): string {
  return active
    ? `${BTN_CLS} border-accent bg-accent text-[var(--color-on-accent,oklch(0.99_0.003_75))]`
    : `${BTN_CLS} border-line bg-panel text-fg hover:border-accent hover:bg-raised`;
}

export function Studio3dBgCharacterCompositorPanel({
  initialBackgroundId = "rofan-imperial-arch-chandelier",
  onBakeCompositeCut,
}: Studio3dBgCharacterCompositorPanelProps) {
  const [state, setState] = useState<StageCompositeState>(() =>
    createInitialStageCompositeState(initialBackgroundId),
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("stage-char-1");
  const [statusNoticeKo, setStatusNoticeKo] = useState<string>("");

  const background = useMemo(
    () => getStageBackgroundSlot(state.backgroundId),
    [state.backgroundId],
  );
  const framing = useMemo(
    () => getWebtoonCompositeFramingPreset(state.framingId),
    [state.framingId],
  );
  const harmony = useMemo(
    () =>
      harmonizeStageLightingAndInk({
        background,
        characters: state.characters,
        timeOfDay: state.timeOfDay,
        celPresetId: state.celPresetId,
        inkPx: state.inkPx,
        aspectRatio: state.aspectRatio,
      }),
    [background, state.characters, state.timeOfDay, state.celPresetId, state.inkPx, state.aspectRatio],
  );
  const crowdExtras = useMemo(
    () =>
      generateStageCrowdExtras({
        background,
        characters: state.characters,
        framingId: state.framingId,
        density: state.crowdDensity,
      }),
    [background, state.characters, state.framingId, state.crowdDensity],
  );
  const bakePlan = useMemo(
    () => buildCompositeCutLayerPlan({ state, harmony, crowdExtras }),
    [state, harmony, crowdExtras],
  );

  const activeCharacter =
    state.characters.find((c) => c.id === selectedCharacterId) ?? state.characters[0];
  const frameGuide = FRAME_GUIDE_BOX[state.aspectRatio];
  const maxGroundError = bakePlan.pngManifest.maxGroundingErrorMeters;
  const inkStrokePx = Math.max(0.8, Math.min(3.2, harmony.inkContract.inkPx * 0.95));

  const handleSmartAutoHarmonize = () => {
    const next = applySmartAutoHarmonize(state);
    const nextBg = getStageBackgroundSlot(next.backgroundId);
    const nextFraming = getWebtoonCompositeFramingPreset(next.framingId);
    setState(next);
    setStatusNoticeKo(
      `"${nextBg.titleKo}"에 맞춰 ${nextFraming.labelKo} 구도·${next.inkPx.toFixed(1)}px 단일 잉크·발밑 접지(0.000m)를 자동 동기화했습니다.`,
    );
  };

  const handleTogglePass = (passCode: CompositeBakePassCode) => {
    setState((prev) => ({
      ...prev,
      enabledPasses: {
        ...prev.enabledPasses,
        [passCode]: !prev.enabledPasses[passCode],
      },
    }));
  };

  const handleBakeCut = () => {
    onBakeCompositeCut?.(bakePlan);
    setStatusNoticeKo(
      `분리 레이어 ${bakePlan.enabledCount}/5 패스(${bakePlan.viewportPx[0]}×${bakePlan.viewportPx[1]} · 잉크 ${harmony.inkContract.inkPx.toFixed(1)}px) 컷 베이크를 준비했습니다.`,
    );
  };

  return (
    <section
      className={`${CARD_CLS} flex flex-col gap-3`}
      aria-label="3D 배경 + 3D 캐릭터 통합 합성 스테이지"
      data-testid="studio-3d-bg-char-compositor-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers size={16} aria-hidden />
          <h4 className="text-sm font-semibold [word-break:keep-all]">
            3D 배경 + 3D 캐릭터 통합 합성
          </h4>
        </div>
        <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-fg-2 tabular-nums">
          접지 오차 {maxGroundError.toFixed(3)}m · 잉크 {harmony.inkContract.inkPx.toFixed(1)}px
        </span>
      </header>

      <p className="text-xs text-fg-2 [word-break:keep-all]">
        배경과 캐릭터를 하나의 월드 좌표·단일 선 굵기·바닥 접지로 묶어 5개 분리 레이어 컷으로 굽습니다.
      </p>

      {/* ── 원클릭 AI 자동 맞추기 ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${pillClass(true)} flex-1 [word-break:keep-all]`}
          onClick={handleSmartAutoHarmonize}
        >
          <Wand2 size={14} aria-hidden />
          AI 추천 구도·조명 자동 맞추기
        </button>
        <button
          type="button"
          className={`${pillClass(false)} [word-break:keep-all]`}
          onClick={handleBakeCut}
        >
          <Sparkles size={14} aria-hidden />
          5레이어 분리 컷 굽기
        </button>
      </div>

      {statusNoticeKo ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-1.5 rounded-lg border border-accent bg-raised px-2.5 py-2 text-xs text-fg [word-break:keep-all]"
        >
          <Check size={14} aria-hidden />
          <span>{statusNoticeKo}</span>
        </p>
      ) : null}

      {/* ── 인터랙티브 SVG 스테이지 프리뷰 ─────────────────────────────────── */}
      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-fg-2">
          <span className="font-medium text-fg [word-break:keep-all]">
            실시간 합성 스테이지 ({framing.labelKo})
          </span>
          <span className="tabular-nums">
            {framing.focalLengthMm}mm · {state.aspectRatio} · 인물 {state.characters.length}명 · 군중 {crowdExtras.length}명
          </span>
        </div>

        <svg
          viewBox="0 0 360 220"
          role="img"
          aria-label={`${background.titleKo} 배경과 ${state.characters.length}명 캐릭터 실시간 합성 스테이지 미리보기`}
          data-testid="stage-3d-compositor-preview"
          className="w-full rounded-lg border border-line bg-canvas"
        >
          {state.enabledPasses["10_BG_3D_LT"] ? (
            <g data-testid="preview-pass-10_BG_3D_LT">
              <rect x={0} y={0} width={360} height={84} fill={harmony.atmosphereOklchCss} fillOpacity={0.38} />
              <rect x={0} y={84} width={360} height={136} fill={harmony.floorBounceOklchCss} fillOpacity={0.28} />
              <line x1={0} y1={84} x2={360} y2={84} stroke="var(--color-fg-2)" strokeOpacity={0.65} strokeWidth={inkStrokePx * 0.75} />
              {background.elevationZones.map((zone) => {
                const pt = projectStagePointToPreview(zone.centerX, zone.elevationY, zone.centerZ, background.footprintMeters);
                const rw = Math.max(36, zone.halfWidthX * 30 * pt.scale);
                const rh = Math.max(12, zone.halfDepthZ * 16 * pt.scale);
                return (
                  <rect
                    key={zone.id}
                    x={pt.cx - rw * 0.5}
                    y={pt.cy - rh * 0.4}
                    width={rw}
                    height={rh}
                    rx={4}
                    fill={formatStageOklch(background.floorBounceOklch, 0.52)}
                    stroke="var(--color-fg-2)"
                    strokeOpacity={0.7}
                    strokeWidth={inkStrokePx * 0.65}
                  />
                );
              })}
              {crowdExtras.map((extra) => {
                const pt = projectStagePointToPreview(extra.positionM[0], extra.positionM[1], extra.positionM[2], background.footprintMeters);
                const hPx = extra.heightM * 24 * pt.scale;
                return (
                  <ellipse
                    key={extra.id}
                    cx={pt.cx}
                    cy={pt.cy - hPx * 0.45}
                    rx={5.5 * pt.scale}
                    ry={hPx * 0.46}
                    fill={harmony.atmosphereOklchCss}
                    fillOpacity={extra.silhouetteOpacity}
                  />
                );
              })}
            </g>
          ) : null}

          {state.enabledPasses["40_CONTACT_SHADOW"] ? (
            <g data-testid="preview-pass-40_CONTACT_SHADOW">
              {harmony.contactShadows.map((shadow) => {
                const pt = projectStagePointToPreview(
                  shadow.anchorM[0] + shadow.offsetXM,
                  shadow.anchorM[1],
                  shadow.anchorM[2] + shadow.offsetZM,
                  background.footprintMeters,
                );
                return (
                  <ellipse
                    key={shadow.characterId}
                    cx={pt.cx}
                    cy={pt.cy}
                    rx={Math.max(12, shadow.ellipseRadiusXM * 46 * pt.scale)}
                    ry={Math.max(5, shadow.ellipseRadiusZM * 14 * pt.scale)}
                    fill={shadow.shadowOklchCss}
                  />
                );
              })}
            </g>
          ) : null}

          {state.characters.map((char) => {
            const footY = char.positionM[1] + char.footSoleLocalY;
            const pt = projectStagePointToPreview(char.positionM[0], footY, char.positionM[2], background.footprintMeters);
            const hPx = char.heightM * 36 * pt.scale;
            const wPx = char.shoulderRadiusM * 56 * pt.scale;
            const headR = Math.max(5.5, hPx * 0.13);
            const rimX = pt.cx + (harmony.rimAzimuthDeg > 180 ? -wPx * 0.48 : wPx * 0.48);
            const isSelected = activeCharacter?.id === char.id;
            return (
              <g key={char.id} data-character-id={char.id}>
                {state.enabledPasses["30_CHAR_FLAT"] ? (
                  <>
                    <rect x={pt.cx - wPx * 0.5} y={pt.cy - hPx * 0.78} width={wPx} height={hPx * 0.78} rx={6} fill={formatStageOklch(char.accentOklch, 0.88)} />
                    <circle cx={pt.cx} cy={pt.cy - hPx * 0.89} r={headR} fill={formatStageOklch(char.accentOklch, 0.88)} />
                  </>
                ) : null}
                {state.enabledPasses["20_CHAR_LINEART"] ? (
                  <>
                    <rect x={pt.cx - wPx * 0.5} y={pt.cy - hPx * 0.78} width={wPx} height={hPx * 0.78} rx={6} fill="none" stroke="var(--color-fg)" strokeWidth={inkStrokePx} />
                    <circle cx={pt.cx} cy={pt.cy - hPx * 0.89} r={headR} fill="none" stroke="var(--color-fg)" strokeWidth={inkStrokePx} />
                  </>
                ) : null}
                {state.enabledPasses["50_RIM_ATMOSPHERE"] ? (
                  <line
                    x1={rimX}
                    y1={pt.cy - hPx * 0.94}
                    x2={rimX}
                    y2={pt.cy - hPx * 0.08}
                    stroke={harmony.rimLightOklchCss}
                    strokeWidth={inkStrokePx * 1.15}
                    strokeLinecap="round"
                  />
                ) : null}
                {isSelected ? (
                  <circle cx={pt.cx} cy={pt.cy} r={4} fill="var(--color-accent)" />
                ) : null}
              </g>
            );
          })}

          {/* 카메라 화각 크롭 프레임 가이드 */}
          <rect
            x={frameGuide.x}
            y={frameGuide.y}
            width={frameGuide.w}
            height={frameGuide.h}
            rx={4}
            fill="none"
            stroke={harmony.keyLightOklchCss}
            strokeWidth={1.4}
            strokeDasharray="5 4"
          />
        </svg>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-2 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-line" style={{ backgroundColor: harmony.keyLightOklchCss }} aria-hidden />
            주광 {harmony.kelvin}K
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-line" style={{ backgroundColor: harmony.rimLightOklchCss }} aria-hidden />
            림라이트 {Math.round(harmony.rimIntensity * 100)}%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-line" style={{ backgroundColor: harmony.floorBounceOklchCss }} aria-hidden />
            바닥 바운스 {Math.round(harmony.floorBounceStrength * 100)}%
          </span>
        </div>
      </div>

      {/* ── 필수 선택 ① 3D 배경 고르기 ─────────────────────────────────────── */}
      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold [word-break:keep-all]">① 3D 배경 고르기 (10종)</span>
          <select
            aria-label="3D 배경 고르기"
            value={state.backgroundId}
            className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
            onChange={(event) => {
              const nextId = event.target.value as StageBackgroundSlotId;
              setState((prev) => switchStageBackground(prev, nextId));
            }}
          >
            <optgroup label="Blender 5.3 히어로 세트 (4종)">
              {STAGE_BACKGROUND_SLOTS.filter((s) => s.sourceKind === "blender-hero-glb").map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.titleKo} · 단차 {slot.elevationZones.length}곳
                </option>
              ))}
            </optgroup>
            <optgroup label="기존 BG3D 웹툰 세트 (6종)">
              {STAGE_BACKGROUND_SLOTS.filter((s) => s.sourceKind === "bg3d-rich-preset").map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.titleKo} · 단차 {slot.elevationZones.length}곳
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <p className="text-[11px] text-fg-2 [word-break:keep-all]">
          {background.genreKo} · {background.subtitleKo}
        </p>

        {/* 시간대 빠른 선택 */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="배경 시간대 조명 선택">
          <Sun size={13} className="text-fg-2" aria-hidden />
          {STAGE_TIME_OF_DAY_LIST.map((profile) => (
            <button
              key={profile.id}
              type="button"
              aria-pressed={state.timeOfDay === profile.id}
              className={pillClass(state.timeOfDay === profile.id)}
              onClick={() => setState((prev) => ({ ...prev, timeOfDay: profile.id as StageTimeOfDayId }))}
            >
              {profile.labelKo.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* ── 필수 선택 ② 캐릭터 배치 (1~3인) ────────────────────────────────── */}
      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-xs font-semibold [word-break:keep-all]">
            ② 캐릭터 배치 ({state.characters.length}/{MAX_STAGE_CHARACTERS}인)
          </strong>
          <button
            type="button"
            className={pillClass(false)}
            disabled={state.characters.length >= MAX_STAGE_CHARACTERS}
            onClick={() =>
              setState((prev) => {
                const next = addStageCharacter(prev);
                const added = next.characters[next.characters.length - 1];
                if (added) setSelectedCharacterId(added.id);
                return next;
              })
            }
          >
            <UserPlus size={14} aria-hidden />
            인물 추가
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {state.characters.map((char, idx) => (
            <div
              key={char.id}
              className={`flex flex-col gap-1.5 rounded-lg border p-2 ${
                activeCharacter?.id === char.id ? "border-accent bg-raised" : "border-line bg-panel"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <button
                  type="button"
                  className="min-h-11 rounded px-2 text-left text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent [word-break:keep-all]"
                  aria-pressed={activeCharacter?.id === char.id}
                  onClick={() => setSelectedCharacterId(char.id)}
                >
                  슬롯 {idx + 1} · {char.displayNameKo}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={pillClass(char.sourceKind === "vrm-avatar")}
                    aria-pressed={char.sourceKind === "vrm-avatar"}
                    onClick={() =>
                      setState((prev) =>
                        updateStageCharacterSlot(prev, char.id, {
                          sourceKind: char.sourceKind === "vrm-avatar" ? "kwebtoon-archetype" : "vrm-avatar",
                        }),
                      )
                    }
                  >
                    {char.sourceKind === "vrm-avatar" ? "VRM 아바타" : "웹툰 10종"}
                  </button>
                  <button
                    type="button"
                    aria-label={`슬롯 ${idx + 1} 삭제`}
                    className={pillClass(false)}
                    disabled={state.characters.length <= MIN_STAGE_CHARACTERS}
                    onClick={() => setState((prev) => removeStageCharacter(prev, char.id))}
                  >
                    <UserX size={14} aria-hidden />
                  </button>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-[11px] text-fg-2">
                <span>슬롯 {idx + 1} 캐릭터 유형</span>
                <select
                  aria-label={`슬롯 ${idx + 1} 캐릭터 유형`}
                  value={char.archetypeId}
                  className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg"
                  onChange={(event) =>
                    setState((prev) =>
                      updateStageCharacterSlot(prev, char.id, {
                        archetypeId: event.target.value as KWebtoonArchetypeBridgeId,
                      }),
                    )
                  }
                >
                  {KWEBTOON_ARCHETYPE_STAGE_BRIDGE.map((item) => (
                    <option key={item.archetypeId} value={item.archetypeId}>
                      {item.shortLabelKo} ({item.genreKo} · {item.headsTall}등신)
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
                접지: {char.groundedZoneLabelKo} · Y={(char.positionM[1] + char.footSoleLocalY).toFixed(2)}m (오차{" "}
                {char.groundingErrorMeters.toFixed(3)}m)
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 8종 한국 웹툰 대표 구도 원클릭 프리셋 ───────────────────────────── */}
      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <strong className="text-xs font-semibold [word-break:keep-all]">
          한국 웹툰 대표 구도 원클릭 (8종)
        </strong>
        <div className="grid grid-cols-2 gap-1.5">
          {WEBTOON_COMPOSITE_FRAMING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={state.framingId === preset.id}
              className={`${pillClass(state.framingId === preset.id)} flex-col items-start text-left [word-break:keep-all]`}
              onClick={() => setState((prev) => applyCompositeFramingPreset(prev, preset.id))}
            >
              <span className="font-semibold">{preset.labelKo}</span>
              <span className="text-[11px] opacity-80 tabular-nums">
                {preset.focalLengthMm}mm · {preset.recommendedActorCount}인 · {preset.recommendedAspectRatio}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 점진적 공개: 상세 설정 (<details>) ─────────────────────────────── */}
      <details
        className="rounded-lg border border-line bg-card p-2.5"
        data-testid="stage-3d-compositor-advanced"
      >
        <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-fg [word-break:keep-all] focus-visible:outline-2 focus-visible:outline-accent">
          상세 설정 (접지 오프셋 · 잉크 굵기 · 5레이어 분리 · 군중 밀도)
        </summary>
        <div className="mt-2 flex flex-col gap-3 border-t border-line pt-2.5">
          {/* 접지 오프셋 */}
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-xs">
              <span className="flex justify-between">
                <span>바닥 접지 높이 오프셋</span>
                <strong className="tabular-nums">{state.manualGroundOffsetM.toFixed(2)} m</strong>
              </span>
              <input
                type="range"
                min={-0.2}
                max={0.3}
                step={0.02}
                value={state.manualGroundOffsetM}
                aria-label="바닥 접지 높이 오프셋"
                className="min-h-11 w-full"
                onChange={(e) => setState((prev) => setStageManualGroundOffset(prev, Number(e.target.value)))}
              />
            </label>
            <button
              type="button"
              className={pillClass(state.manualGroundOffsetM === 0)}
              onClick={() => setState((prev) => setStageManualGroundOffset(prev, 0))}
            >
              바닥 자동 잠금 복원 (0.00m)
            </button>
          </div>

          {/* 단일 잉크 굵기 & 화면비 */}
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="flex justify-between">
                <span>배경·캐릭터 단일 잉크 굵기</span>
                <strong className="tabular-nums">{state.inkPx.toFixed(1)} px</strong>
              </span>
              <input
                type="range"
                min={0.8}
                max={3.2}
                step={0.1}
                value={state.inkPx}
                aria-label="배경·캐릭터 단일 잉크 굵기"
                className="min-h-11 w-full"
                onChange={(e) => setState((prev) => ({ ...prev, inkPx: Number(e.target.value) }))}
              />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="출력 화면비 선택">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={state.aspectRatio === opt.id}
                  className={pillClass(state.aspectRatio === opt.id)}
                  onClick={() => setState((prev) => ({ ...prev, aspectRatio: opt.id }))}
                >
                  {opt.labelKo}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
              등방성 검증: 배경 {harmony.backgroundMeasuredInkPx.toFixed(2)}px = 캐릭터{" "}
              {harmony.characterMeasuredInkPx.toFixed(2)}px (비율 {harmony.isotropicRatio.toFixed(3)}x)
            </p>
          </div>

          {/* 5개 분리 레이어 토글 */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-semibold [word-break:keep-all]">
              5레이어 분리 베이크 패스 ({bakePlan.enabledCount}/5 활성)
            </legend>
            {bakePlan.layers.map((layer) => (
              <label
                key={layer.passCode}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={layer.enabled}
                    onChange={() => handleTogglePass(layer.passCode)}
                  />
                  <span className="flex flex-col">
                    <strong className="font-mono text-[11px]">{layer.passCode}</strong>
                    <span className="text-[11px] text-fg-2 [word-break:keep-all]">
                      {layer.labelKo} · {layer.cspRoleKo}
                    </span>
                  </span>
                </span>
                <span className="text-[10px] uppercase text-fg-2">{layer.blendMode}</span>
              </label>
            ))}
          </fieldset>

          {/* 자동 3D 군중 엑스트라 밀도 */}
          <div className="flex flex-col gap-1.5">
            <strong className="text-xs font-semibold [word-break:keep-all]">
              자동 3D 군중 엑스트라 밀도
            </strong>
            <div className="grid grid-cols-2 gap-1.5">
              {CROWD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={state.crowdDensity === opt.id}
                  className={pillClass(state.crowdDensity === opt.id)}
                  onClick={() => setState((prev) => ({ ...prev, crowdDensity: opt.id }))}
                >
                  {opt.labelKo}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

export default Studio3dBgCharacterCompositorPanel;
