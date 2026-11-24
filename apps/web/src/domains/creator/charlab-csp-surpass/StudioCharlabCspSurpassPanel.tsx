/**
 * Wave 39E — 3D 캐릭터 랩스 라이브 링크 · CSP/Procreate/Rebelle 돌파 드로잉 · 스마트워치 리모컨 통합 패널.
 *
 * - Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 0건 · Web Storage 0건 · props `= {}` 미사용)
 */

import { Link2, Palette, PenTool, SlidersHorizontal, Users, Watch } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  createDemoCharacterLiveLinkRegistry,
  DEMO_IK_ANCHOR_PRESETS,
  extractCharacterOklchSwatches,
  propagateCharacterLiveLink,
  solveCoupleAndPropIkAnchors,
  solveSceneHeightScale,
  type CharacterLiveLinkRegistry,
  type CostumeBattleDamageSlotId,
} from "./character-live-link-engine";
import { CharlabCspSurpassDrawingTab } from "./CharlabCspSurpassDrawingTab";
import { CharlabCspSurpassWatchTab } from "./CharlabCspSurpassWatchTab";

export type CharlabCspSurpassTabId = "charlab" | "drawing-surpass" | "watch-remote";

export interface StudioCharlabCspSurpassPanelProps {
  readonly initialTab?: CharlabCspSurpassTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onLiveLinkSync?: (summary: string) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

/** Wave 39E 3탭 인터랙티브 스튜디오 패널. */
export function StudioCharlabCspSurpassPanel(
  props: StudioCharlabCspSurpassPanelProps,
): ReactElement {
  const { initialTab = "charlab", locale = "ko", className, onLiveLinkSync } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<CharlabCspSurpassTabId>(initialTab);
  const [registry, setRegistry] = useState<CharacterLiveLinkRegistry>(() =>
    createDemoCharacterLiveLinkRegistry(),
  );
  const [selectedCharId, setSelectedCharId] = useState<string>("seojun-184");
  const [selectedIkId, setSelectedIkId] = useState<string>(DEMO_IK_ANCHOR_PRESETS[0]!.anchorId);

  const activeProfile = useMemo(
    () =>
      registry.profiles.find((p) => p.characterId === selectedCharId) ?? registry.profiles[0]!,
    [registry.profiles, selectedCharId],
  );

  const heightSolution = useMemo(
    () =>
      solveSceneHeightScale(
        registry.profiles.map((p) => ({
          characterId: p.characterId,
          displayNameKo: p.displayNameKo,
          realHeightCm: p.realHeightCm,
          rawMeshHeightM: p.rawMeshHeightM,
          footWorldY: 0.04,
          heelLiftCm: p.heelLiftCm,
          eyeHeightRatio: p.eyeHeightRatio,
          shoulderHeightRatio: p.shoulderHeightRatio,
        })),
        0,
      ),
    [registry.profiles],
  );

  const activeIkPreset = useMemo(
    () =>
      DEMO_IK_ANCHOR_PRESETS.find((p) => p.anchorId === selectedIkId) ??
      DEMO_IK_ANCHOR_PRESETS[0]!,
    [selectedIkId],
  );
  const ikSolution = useMemo(() => solveCoupleAndPropIkAnchors(activeIkPreset), [activeIkPreset]);
  const paletteReport = useMemo(() => extractCharacterOklchSwatches(activeProfile), [activeProfile]);

  const handleSwitchCostumeSlot = (slotId: CostumeBattleDamageSlotId): void => {
    const res = propagateCharacterLiveLink(registry, activeProfile.characterId, {
      activeSlotId: slotId,
    });
    setRegistry(res.registry);
    onLiveLinkSync?.(res.registry.lastSyncSummary);
  };

  const handleAdjustCharacterHeight = (heightCm: number): void => {
    const res = propagateCharacterLiveLink(registry, activeProfile.characterId, {
      realHeightCm: heightCm,
    });
    setRegistry(res.registry);
    onLiveLinkSync?.(res.registry.lastSyncSummary);
  };

  const tabs: readonly {
    readonly id: CharlabCspSurpassTabId;
    readonly label: string;
    readonly icon: ReactElement;
  }[] = [
    {
      id: "charlab",
      label: pick("캐릭터 라이브 링크", "Character Live-Link"),
      icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: "drawing-surpass",
      label: pick("벡터 교차지우개 · QuickShape · 수채화", "Vector · QuickShape · Wet Paint"),
      icon: <PenTool className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: "watch-remote",
      label: pick("스마트워치 리모컨", "Watch Companion"),
      icon: <Watch className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ];

  const primaryRelation = heightSolution.pairwiseRelations[0];

  return (
    <section
      data-testid="charlab-csp-surpass-panel"
      aria-label={pick(
        "캐릭터 랩스 라이브 링크 · CSP 돌파 드로잉 · 스마트워치 리모컨 스튜디오 패널",
        "Character Labs Live-Link, Drawing Surpass & Smartwatch Companion Panel",
      )}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Link2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>
              {pick(
                "Wave 39E · 캐릭터 랩스 + 돌파 드로잉 + 워치 리모컨",
                "Wave 39E · CharLab + Drawing Surpass + Watch",
              )}
            </span>
          </div>
          <h2 className="text-base font-bold text-fg">
            {pick(
              "캐릭터 라이브 링크 · 정밀 드로잉 · 워치 동반 제어",
              "Character Live-Link · Precision Drawing · Watch Remote",
            )}
          </h2>
        </div>
        <div className="rounded-lg border border-good/40 bg-good-soft px-2.5 py-1.5 text-xs font-semibold text-good tabular-nums">
          {pick("로컬 온디바이스 엔진 준비 완료", "On-Device Engine Ready")}
        </div>
      </header>

      <div role="tablist" aria-label={pick("기능 탭", "Feature Tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              data-testid={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`${TAB_BASE} ${
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "charlab" && (
        <div
          id={`${uid}-panel-charlab`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-charlab`}
          className="space-y-4"
        >
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {registry.profiles.map((prof) => (
                  <button
                    key={prof.characterId}
                    data-testid={`char-select-${prof.characterId}`}
                    type="button"
                    onClick={() => setSelectedCharId(prof.characterId)}
                    className={prof.characterId === activeProfile.characterId ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    <span>{isEn ? prof.displayNameEn : prof.displayNameKo}</span>
                    <span className="tabular-nums text-[11px] opacity-80">rev.{prof.linkRevision}</span>
                  </button>
                ))}
              </div>
              <span data-testid="live-link-sync-status" className="text-xs font-medium text-fg-2">
                {registry.lastSyncSummary}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {activeProfile.costumeSlots.map((slot) => {
                const isActive = slot.slotId === activeProfile.activeSlotId;
                return (
                  <button
                    key={slot.slotId}
                    data-testid={`costume-slot-${slot.slotId}`}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleSwitchCostumeSlot(slot.slotId)}
                    className={`${isActive ? BTN_ACTIVE : BTN_OUTLINE} justify-between px-2.5`}
                  >
                    <span className="truncate">{isEn ? slot.labelEn : slot.labelKo}</span>
                    <span className="tabular-nums text-[11px] opacity-80">{slot.damagePercent}%</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`${uid}-char-height`} className="font-semibold text-fg">
                    {pick("선택 캐릭터 실제 키 (cm)", "Selected Character Real Height (cm)")}
                  </label>
                  <span data-testid="selected-height-readout" className="font-bold text-accent tabular-nums">
                    {activeProfile.realHeightCm} cm
                  </span>
                </div>
                <input
                  id={`${uid}-char-height`}
                  data-testid="char-height-slider"
                  type="range"
                  min={140}
                  max={210}
                  step={1}
                  value={activeProfile.realHeightCm}
                  onChange={(e) => handleAdjustCharacterHeight(Number(e.target.value))}
                  className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
                />
                {primaryRelation && (
                  <p data-testid="height-ratio-summary" className="text-xs text-fg-2 tabular-nums">
                    {pick(
                      `신장 차 ${primaryRelation.heightDiffCm}cm · 비율 ${primaryRelation.heightRatio}x · 눈높이 차 ${primaryRelation.eyeLineDiffCm}cm · 바닥 접지 ${heightSolution.allGroundedOnFloor ? "Y=0.0mm" : "점검"}`,
                      `Delta ${primaryRelation.heightDiffCm}cm · Ratio ${primaryRelation.heightRatio}x · Eye Diff ${primaryRelation.eyeLineDiffCm}cm`,
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-end justify-around gap-3 rounded-lg border border-line bg-canvas p-2.5">
                {heightSolution.characters.map((ch) => (
                  <div key={ch.characterId} className="flex flex-col items-center gap-1">
                    <div
                      className="w-8 rounded-t-md border border-accent bg-accent-soft"
                      style={{ height: `${Math.round(ch.relativeRatioToTallest * 64)}px` }}
                    />
                    <span className="text-[11px] font-semibold text-fg tabular-nums">{ch.realHeightCm}cm</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick("커플 · 소품 IK 앵커 잠금 (< 0.5mm)", "Couple & Prop IK Anchor Lock (< 0.5mm)")}</span>
                </h3>
                <span
                  data-testid="ik-lock-badge"
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    ikSolution.lockedWithinTolerance
                      ? "border-good/40 bg-good-soft text-good"
                      : "border-bad/40 bg-bad-soft text-bad"
                  }`}
                >
                  {ikSolution.anchorDistanceErrorMm.toFixed(3)}mm {ikSolution.lockedWithinTolerance ? "LOCK" : "OUT"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DEMO_IK_ANCHOR_PRESETS.map((preset) => (
                  <button
                    key={preset.anchorId}
                    data-testid={`ik-preset-${preset.anchorId}`}
                    type="button"
                    onClick={() => setSelectedIkId(preset.anchorId)}
                    className={preset.anchorId === activeIkPreset.anchorId ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {isEn ? preset.labelEn : preset.labelKo}
                  </button>
                ))}
              </div>
              <div className="rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg-2 tabular-nums">
                <div>
                  {pick("주체 팔꿈치 굽힘", "Primary Elbow")}:{" "}
                  <strong className="text-fg">{ikSolution.primaryPose.elbowFlexionDeg}°</strong> ·{" "}
                  {pick("상체 보정", "Torso Lean")}:{" "}
                  <strong className="text-fg">{(ikSolution.primaryPose.torsoLeanAppliedM * 100).toFixed(1)}cm</strong>
                </div>
                {ikSolution.partnerPose && (
                  <div className="mt-1">
                    {pick("파트너 팔꿈치", "Partner Elbow")}:{" "}
                    <strong className="text-fg">{ikSolution.partnerPose.elbowFlexionDeg}°</strong> ·{" "}
                    {pick("오차", "Error")}:{" "}
                    <strong className="text-good">{ikSolution.partnerPose.residualErrorMm.toFixed(3)}mm</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick("OKLCH 2D 자동 배색 스와치 추출", "OKLCH 2D Auto Swatch Extraction")}</span>
                </h3>
                <span className="rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold text-fg tabular-nums">
                  {pick("조화", "Harmony")} {paletteReport.paletteHarmonyScore}pt
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {paletteReport.swatches.map((sw) => (
                  <div
                    key={sw.regionId}
                    data-testid={`oklch-swatch-${sw.regionId}`}
                    className="rounded-lg border border-line bg-canvas p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-5 w-5 shrink-0 rounded-full border border-line" style={{ backgroundColor: sw.base.oklchCss }} />
                      <span className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ backgroundColor: sw.celShadow.oklchCss }} />
                      <span className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ backgroundColor: sw.celHighlight.oklchCss }} />
                    </div>
                    <div className="mt-1.5 text-[11px] font-semibold text-fg">{isEn ? sw.labelEn : sw.labelKo}</div>
                    <div className="text-[10px] text-fg-3 tabular-nums">
                      L{sw.base.l.toFixed(2)} C{sw.base.c.toFixed(2)} H{sw.base.h.toFixed(0)}°
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "drawing-surpass" && <CharlabCspSurpassDrawingTab uid={uid} isEn={isEn} />}
      {activeTab === "watch-remote" && <CharlabCspSurpassWatchTab uid={uid} isEn={isEn} />}
    </section>
  );
}
