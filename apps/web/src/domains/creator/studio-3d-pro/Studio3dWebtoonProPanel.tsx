import { useMemo, useState } from "react";
import { Brush, Check, Home, Sparkles, Sun, UserRound } from "lucide-react";

import {
  KWEBTOON_ARCHETYPE_STAGE_BRIDGE,
  KWEBTOON_CEL_PRESET_LIST,
  KWEBTOON_HERO_GLB_CATALOG,
  buildStageBridgePayload,
  computeScreenSpaceOutlineFactor,
  createUnifiedInkContract,
  type InkLightingMode,
  type KWebtoonArchetypeBridgeId,
  type KWebtoonCelPresetId,
  type KWebtoonHeroGlbAsset,
} from "./kwebtoon-npr-ink-contract";
import {
  INITIAL_DYNAMIC_STAGE_COMPONENTS,
  computeInferenceSnap,
  resolveSeasonTimeAtmosphere,
  updateDynamicStageComponents,
  type SeasonId,
  type TimeOfDayId,
} from "./blender-sketchup-vroid-pro-ops";
import {
  Studio3dProPoseHandTab,
  Studio3dProVroidBlenderTab,
} from "./Studio3dWebtoonProSecondaryTabs";

type ProTabId = "npr-hero" | "dynamic-bg" | "pose-hand" | "vroid-blender";

export interface Studio3dWebtoonProPanelProps {
  readonly onApplyCelContract?: (payload: {
    readonly presetId: KWebtoonCelPresetId;
    readonly inkPx: number;
    readonly toneBandCount: 3 | 4;
    readonly outlineFactor1080p: number;
  }) => void;
  readonly onPlaceHeroAsset?: (asset: KWebtoonHeroGlbAsset) => void;
}

const TABS: readonly { readonly id: ProTabId; readonly labelKo: string }[] = Object.freeze([
  { id: "npr-hero", labelKo: "웹툰 셰이더·히어로 3D" },
  { id: "dynamic-bg", labelKo: "동적 배경·SketchUp" },
  { id: "pose-hand", labelKo: "포즈·손가락 물리" },
  { id: "vroid-blender", labelKo: "VRoid·Blender 프로" },
]);

const SEASONS: readonly { readonly id: SeasonId; readonly labelKo: string }[] = Object.freeze([
  { id: "spring", labelKo: "봄" },
  { id: "summer", labelKo: "여름" },
  { id: "autumn", labelKo: "가을" },
  { id: "winter", labelKo: "겨울" },
]);

const TIMES_OF_DAY: readonly { readonly id: TimeOfDayId; readonly labelKo: string }[] =
  Object.freeze([
    { id: "dawn", labelKo: "새벽" },
    { id: "noon", labelKo: "정오" },
    { id: "sunset", labelKo: "노을" },
    { id: "night", labelKo: "밤" },
  ]);

const PANEL_BOX_CLS =
  "rounded-xl border border-[var(--color-line,oklch(0.86_0.012_75))] bg-[var(--color-panel,oklch(0.985_0.005_75))] p-3 text-[var(--color-fg,oklch(0.22_0.015_60))]";
const SUBCARD_CLS =
  "rounded-lg border border-[var(--color-line,oklch(0.88_0.010_75))] bg-[var(--color-raised,oklch(0.96_0.006_75))] p-2.5";
const BTN_BASE_CLS =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent,oklch(0.54_0.16_255))]";

function pillClass(active: boolean): string {
  return active
    ? `${BTN_BASE_CLS} border-[var(--color-accent,oklch(0.54_0.16_255))] bg-[var(--color-accent,oklch(0.54_0.16_255))] text-[var(--color-on-accent,oklch(0.99_0.003_75))]`
    : `${BTN_BASE_CLS} border-[var(--color-line,oklch(0.86_0.012_75))] bg-[var(--color-panel,oklch(0.99_0.004_75))] text-[var(--color-fg,oklch(0.24_0.015_60))] hover:bg-[var(--color-raised,oklch(0.95_0.008_75))]`;
}

export function Studio3dWebtoonProPanel({
  onApplyCelContract,
  onPlaceHeroAsset,
}: Studio3dWebtoonProPanelProps) {
  const [activeTab, setActiveTab] = useState<ProTabId>("npr-hero");
  const [celPresetId, setCelPresetId] = useState<KWebtoonCelPresetId>("rofan-pastel");
  const [inkPx, setInkPx] = useState<number>(1.6);
  const [inkLightingMode, setInkLightingMode] = useState<InkLightingMode>("flat");
  const [selectedArchetypeId, setSelectedArchetypeId] =
    useState<KWebtoonArchetypeBridgeId>("kwebtoon-rofan-princess");
  const [statusNoticeKo, setStatusNoticeKo] = useState<string>("");

  const [components, setComponents] = useState(INITIAL_DYNAMIC_STAGE_COMPONENTS);
  const [season, setSeason] = useState<SeasonId>("spring");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayId>("sunset");
  const [snapEnabled, setSnapEnabled] = useState(true);

  const inkContract = useMemo(
    () => createUnifiedInkContract(celPresetId, { inkPx, lightingMode: inkLightingMode }),
    [celPresetId, inkPx, inkLightingMode],
  );
  const outlineFactor1080 = useMemo(
    () => computeScreenSpaceOutlineFactor(inkContract.inkPx, 1080),
    [inkContract.inkPx],
  );
  const stageBridgePayload = useMemo(
    () => buildStageBridgePayload(selectedArchetypeId, undefined, celPresetId, 1080),
    [selectedArchetypeId, celPresetId],
  );
  const atmosphere = useMemo(
    () => resolveSeasonTimeAtmosphere(season, timeOfDay),
    [season, timeOfDay],
  );
  const snapPreview = useMemo(
    () =>
      computeInferenceSnap(
        { x: 0.04, y: 0.0, z: 0.98 },
        [{ id: "arch-edge", start: { x: 0, y: 0, z: 1 }, end: { x: 2, y: 0, z: 1 } }],
      ),
    [],
  );

  const handleApplyCelStyle = () => {
    onApplyCelContract?.({
      presetId: celPresetId,
      inkPx: inkContract.inkPx,
      toneBandCount: inkContract.toneBandCount,
      outlineFactor1080p: outlineFactor1080,
    });
    setStatusNoticeKo(
      `캐릭터와 배경 외곽선을 ${inkContract.inkPx.toFixed(1)}px (${inkContract.toneBandCount}단 웹툰 명암)으로 통일했습니다.`,
    );
  };

  const handlePlaceAsset = (asset: KWebtoonHeroGlbAsset) => {
    onPlaceHeroAsset?.(asset);
    setStatusNoticeKo(`"${asset.titleKo}" 3D 히어로 세트를 장면에 불러왔습니다.`);
  };

  return (
    <section
      className={`${PANEL_BOX_CLS} flex flex-col gap-3`}
      aria-label="한국 웹툰 3D 프로 랩"
      data-testid="studio-3d-webtoon-pro-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} aria-hidden />
          <h4 className="text-sm font-semibold [word-break:keep-all]">한국 웹툰 3D 프로 랩</h4>
        </div>
        <span className="rounded-full border border-[var(--color-line,oklch(0.86_0.012_75))] px-2 py-0.5 text-[11px] tabular-nums">
          선 굵기 {inkContract.inkPx.toFixed(1)}px · {inkContract.toneBandCount}단 셀
        </span>
      </header>

      <div role="tablist" aria-label="3D 웹툰 프로 도구 탭" className="grid grid-cols-2 gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${pillClass(activeTab === tab.id)} [word-break:keep-all]`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.labelKo}
          </button>
        ))}
      </div>

      {statusNoticeKo ? (
        <p
          role="status"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-accent,oklch(0.54_0.16_255))] bg-[var(--color-raised,oklch(0.95_0.014_255))] px-2.5 py-2 text-xs [word-break:keep-all]"
        >
          <Check size={14} aria-hidden />
          <span>{statusNoticeKo}</span>
        </p>
      ) : null}

      {activeTab === "npr-hero" ? (
        <div role="tabpanel" className="flex flex-col gap-3">
          <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs font-semibold [word-break:keep-all]">
                웹툰 3·4단 셀 셰이딩 & 통합 선 굵기
              </strong>
              <span className="text-[11px] opacity-80 tabular-nums">
                1080p 비율 {(outlineFactor1080 * 1000).toFixed(2)}‰
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {KWEBTOON_CEL_PRESET_LIST.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`${pillClass(celPresetId === preset.id)} flex-col items-start text-left`}
                  onClick={() => {
                    setCelPresetId(preset.id);
                    setInkPx(preset.inkPx);
                  }}
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: preset.badgeOklch }}
                      aria-hidden
                    />
                    {preset.labelKo}
                  </span>
                  <span className="text-[11px] opacity-80 tabular-nums">
                    {preset.toneBandCount}단 명암 · {preset.inkPx.toFixed(1)}px
                  </span>
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1 text-xs">
              <span className="flex justify-between [word-break:keep-all]">
                <span>캐릭터·배경 공통 선 굵기 (가로·세로 동일 비율)</span>
                <strong className="tabular-nums">{inkPx.toFixed(1)} px</strong>
              </span>
              <input
                type="range"
                min={0.8}
                max={3.2}
                step={0.1}
                value={inkPx}
                aria-label="캐릭터·배경 공통 선 굵기"
                className="min-h-11 w-full"
                onChange={(event) => setInkPx(Number(event.target.value))}
              />
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={pillClass(inkLightingMode === "flat")}
                onClick={() => setInkLightingMode("flat")}
              >
                깔끔한 단색 선화
              </button>
              <button
                type="button"
                className={pillClass(inkLightingMode === "lit")}
                onClick={() => setInkLightingMode("lit")}
              >
                조명 반응 선화
              </button>
              <button type="button" className={pillClass(true)} onClick={handleApplyCelStyle}>
                <Brush size={14} aria-hidden />
                장면에 선화·명암 통일 적용
              </button>
            </div>
          </div>

          <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
            <strong className="text-xs font-semibold [word-break:keep-all]">
              Blender 5.3 제작 웹툰 히어로 3D 세트 (4종)
            </strong>
            <div className="grid grid-cols-2 gap-2">
              {KWEBTOON_HERO_GLB_CATALOG.map((asset) => (
                <article
                  key={asset.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-line,oklch(0.86_0.012_75))] bg-[var(--color-panel,oklch(0.99_0.004_75))] p-2"
                >
                  <img
                    src={asset.previewUrl}
                    alt={asset.titleKo}
                    width={512}
                    height={512}
                    loading="lazy"
                    className="aspect-square w-full rounded-md object-cover"
                  />
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-xs font-semibold [word-break:keep-all]">
                      {asset.titleKo}
                    </strong>
                    <span className="text-[11px] opacity-75 tabular-nums">
                      {asset.triangles.toLocaleString("ko-KR")}면 · {Math.round(asset.glbBytes / 1024)}KB · 품질 {asset.glbforgeMobileScore}점
                    </span>
                  </div>
                  <button
                    type="button"
                    className={pillClass(false)}
                    onClick={() => handlePlaceAsset(asset)}
                  >
                    장면에 배치
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
            <strong className="flex items-center gap-1.5 text-xs font-semibold [word-break:keep-all]">
              <UserRound size={14} aria-hidden />
              웹툰 캐릭터 10종 ↔ 배경 즉시 연결
            </strong>
            <label className="flex flex-col gap-1 text-xs">
              <span>주인공 유형 선택</span>
              <select
                aria-label="주인공 유형 선택"
                value={selectedArchetypeId}
                className="min-h-11 rounded-lg border border-[var(--color-line,oklch(0.86_0.012_75))] bg-[var(--color-panel,oklch(0.99_0.004_75))] px-2.5 text-xs"
                onChange={(event) => {
                  const nextId = event.target.value as KWebtoonArchetypeBridgeId;
                  setSelectedArchetypeId(nextId);
                  const found = KWEBTOON_ARCHETYPE_STAGE_BRIDGE.find(
                    (item) => item.archetypeId === nextId,
                  );
                  if (found) {
                    setCelPresetId(found.recommendedCelPresetId);
                    setInkPx(found.defaultInkPx);
                  }
                }}
              >
                {KWEBTOON_ARCHETYPE_STAGE_BRIDGE.map((item) => (
                  <option key={item.archetypeId} value={item.archetypeId}>
                    {item.shortLabelKo} ({item.genreKo} · {item.headsTall}등신)
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
              추천 키 {stageBridgePayload.characterHeightScaleMeters}m · 추천 선 굵기{" "}
              {stageBridgePayload.contract.inkPx.toFixed(1)}px 자동 동기화 준비 완료
            </p>
          </div>
        </div>
      ) : null}

      {activeTab === "dynamic-bg" ? (
        <div role="tabpanel" className="flex flex-col gap-3">
          <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
            <strong className="flex items-center gap-1.5 text-xs font-semibold [word-break:keep-all]">
              <Home size={14} aria-hidden />
              문·창문·커튼·조명 실시간 여닫기
            </strong>
            <label className="flex flex-col gap-1 text-xs">
              <span className="flex justify-between">
                <span>문 열림 각도</span>
                <strong className="tabular-nums">{components.doorOpenDeg}°</strong>
              </span>
              <input
                type="range"
                min={0}
                max={110}
                value={components.doorOpenDeg}
                aria-label="문 열림 각도"
                className="min-h-11 w-full"
                onChange={(e) =>
                  setComponents((prev) =>
                    updateDynamicStageComponents(prev, { doorOpenDeg: Number(e.target.value) }),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="flex justify-between">
                <span>창문 열기</span>
                <strong className="tabular-nums">{components.windowOpenPercent}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={components.windowOpenPercent}
                aria-label="창문 열기"
                className="min-h-11 w-full"
                onChange={(e) =>
                  setComponents((prev) =>
                    updateDynamicStageComponents(prev, { windowOpenPercent: Number(e.target.value) }),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="flex justify-between">
                <span>커튼 걷기</span>
                <strong className="tabular-nums">{components.curtainOpenPercent}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={components.curtainOpenPercent}
                aria-label="커튼 걷기"
                className="min-h-11 w-full"
                onChange={(e) =>
                  setComponents((prev) =>
                    updateDynamicStageComponents(prev, { curtainOpenPercent: Number(e.target.value) }),
                  )
                }
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={pillClass(components.lampOn)}
                onClick={() =>
                  setComponents((prev) =>
                    updateDynamicStageComponents(prev, { lampOn: !prev.lampOn }),
                  )
                }
              >
                실내·테라스 조명 {components.lampOn ? "켜짐" : "꺼짐"}
              </button>
              <button
                type="button"
                className={pillClass(snapEnabled)}
                onClick={() => setSnapEnabled((v) => !v)}
              >
                자석 맞춤 안내 {snapEnabled ? "사용 중" : "꺼짐"}
              </button>
            </div>
            {snapEnabled ? (
              <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
                맞춤 상태: {snapPreview.guideKo} (좌표 {snapPreview.snapped.x}, {snapPreview.snapped.z}m)
              </p>
            ) : null}
          </div>

          <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
            <strong className="flex items-center gap-1.5 text-xs font-semibold [word-break:keep-all]">
              <Sun size={14} aria-hidden />
              계절 · 시간대 분위기 전환 ({atmosphere.titleKo})
            </strong>
            <div className="grid grid-cols-4 gap-1.5">
              {SEASONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={pillClass(season === item.id)}
                  onClick={() => setSeason(item.id)}
                >
                  {item.labelKo}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TIMES_OF_DAY.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={pillClass(timeOfDay === item.id)}
                  onClick={() => setTimeOfDay(item.id)}
                >
                  {item.labelKo}
                </button>
              ))}
            </div>
            <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
              태양 고도 {atmosphere.sunElevationDeg}° · 색온도 {atmosphere.kelvin}K · 연출 효과:{" "}
              {atmosphere.weatherParticleKo}
            </p>
          </div>
        </div>
      ) : null}

      <Studio3dProPoseHandTab active={activeTab === "pose-hand"} />
      <Studio3dProVroidBlenderTab active={activeTab === "vroid-blender"} inkPx={inkPx} />
    </section>
  );
}

export default Studio3dWebtoonProPanel;
