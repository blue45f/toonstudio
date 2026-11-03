/**
 * StudioHiggsfieldMangakaPanel.tsx
 *
 * REA 역공학 기반 Higgsfield Mangaka (https://higgsfield.ai/mangaka) 특화 UI 워크벤치 패널:
 * - 4종 만화/웹툰 비주얼 스타일 (`B&W manga`, `Color manga`, `Western comics`, `Webtoon`)
 * - 8종 글로벌 연재 포털 규격 (`WEBTOON Canvas`, `Naver KR`, `Daum/Kakao`, `Tapas`, `LINE Manga Indies`, `comico JP`, `KR 700px`, `KR 720px`)
 * - 최대 6인(`IDEA_PEOPLE_MAX = 6`) 캐릭터 레퍼런스 시트 & 룩 시트(`Base look` / `Base state`) 잠금
 * - 대본 → 세로 스트립 스테이징 & 말풍선/효과음 자동 식자 (`WT-*` 22개 핵심 QA 규칙 실시간 판정)
 * - SketchUp 3D 배경(`bg3d`) ↔ Mangaka 씬 설정 컷 & 캐릭터 앵글 자동 동기화 브리지
 */
import { useMemo, useState, type ReactElement } from "react";

import { studioSegmentChipClass } from "../studio-panel-ui";

import { useT } from "@/shared/lib/i18n";
import { defineBilingualText, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

import {
  buildMangakaBg3dSceneBridgePlan,
  createMangakaCharacterCastLock,
  evaluateMangakaStripRules,
  MANGAKA_IDEA_PEOPLE_MAX,
  MANGAKA_PORTAL_SPECS,
  MANGAKA_STYLE_CONFIGS,
  stageMangakaEpisodeStrip,
  type MangakaGutterFillId,
  type MangakaPanelInputSpec,
  type MangakaPortalPresetId,
  type MangakaVisualStyleId,
  type MangakaWidthStyleId,
} from "./higgsfield-mangaka-engine";

const COPY = {
  presets: defineBilingualText("MangakaPlanning", "presets", "장르별 스트립 설정 프리셋", "Genre strip setting presets"),
  romance: defineBilingualText("MangakaPlanning", "romance", "로맨스 판타지 · Naver · 흰 여백", "Romance fantasy · Naver · white gutters"),
  noir: defineBilingualText("MangakaPlanning", "noir", "액션 느와르 · Daum · 어두운 여백", "Action noir · Daum · dark gutters"),
  shonen: defineBilingualText("MangakaPlanning", "shonen", "소년만화 · LINE · 흑백", "Shonen · LINE · monochrome"),
  comics: defineBilingualText("MangakaPlanning", "comics", "코믹스 · Tapas · 전체 너비", "Comics · Tapas · full width"),
  lore: defineBilingualText("MangakaPlanning", "lore", "샘플 대본·세계관 참조", "Sample script and lore reference"),
  sample: defineBilingualText("MangakaPlanning", "sample", "예제 자료", "Example data"),
  loreScope: defineBilingualText("MangakaPlanning", "loreScope", "아래 세계관과 대사는 이 패널의 예제입니다. 현재 작품의 대본이나 외부 로어북을 동기화하지 않습니다.", "The lore and dialogue below are examples for this panel. They do not sync the current work or an external lorebook."),
  world: defineBilingualText("MangakaPlanning", "world", "세계관 예제: Hollowmere Canal · 황혼 안개와 황동 가스등 · 긴박 → 충격 → 서스펜스", "Example lore: Hollowmere Canal · dusk fog and brass gas lamps · hook → impact → cliffhanger"),
  panelPlan: defineBilingualText("MangakaPlanning", "panelPlan", "예제 컷의 대사·지문과 종횡비 계획", "Example panel dialogue, action notes, and aspect ratio plan"),
  effects: defineBilingualText("MangakaPlanning", "effects", "무빙툰 효과 계획 선택", "Moving comic effect planning"),
  effectScope: defineBilingualText("MangakaPlanning", "effectScope", "선택한 트리거는 이 미리보기에서만 유지됩니다. 현재 원고·카메라·내보내기에는 적용되지 않습니다.", "The trigger selection stays in this preview. It is not applied to the current document, camera, or export."),
  parallax: defineBilingualText("MangakaPlanning", "parallax", "스크롤 패럴랙스", "Scroll parallax"),
  shake: defineBilingualText("MangakaPlanning", "shake", "임팩트 셰이크", "Impact shake"),
  bounce: defineBilingualText("MangakaPlanning", "bounce", "효과음 바운스", "Sound effect bounce"),
};

const GENRE_PRESETS = [
  { id: "kr-romance-fantasy", label: COPY.romance, style: "webtoon", portal: "naver", widthStyle: "auto", gutter: "white", capPx: 26 },
  { id: "kr-action-noir", label: COPY.noir, style: "webtoon", portal: "daum", widthStyle: "full", gutter: "dark", capPx: 28 },
  { id: "jp-shonen-bw", label: COPY.shonen, style: "manga-bw", portal: "line", widthStyle: "mixed", gutter: "white", capPx: 24 },
  { id: "us-superhero", label: COPY.comics, style: "comics", portal: "tapas", widthStyle: "full", gutter: "dark", capPx: 27 },
] as const;

const DEFAULT_DEMO_PANELS: readonly MangakaPanelInputSpec[] = Object.freeze([
  {
    pageId: "ep1-p1-hook",
    sceneId: "canal-bridge-dusk",
    role: "hook",
    aspect: "9:16",
    widthClass: "full",
    gapBefore: "action",
    background: "detailed",
    faceBoxes: [{ x: 260, y: 380, w: 220, h: 240 }],
    lines: [
      {
        id: "line-1",
        kind: "speech",
        speaker: "Mira",
        text: "Six bells already?! Bram is going to bury me in lamp oil.",
      },
      {
        id: "line-2",
        kind: "sfx",
        text: "CLANG!",
      },
    ],
  },
  {
    pageId: "ep1-p2-establishing",
    sceneId: "canal-bridge-dusk",
    role: "establishing",
    aspect: "4:5",
    widthClass: "inset",
    gapBefore: "beat",
    background: "detailed",
    lines: [
      {
        id: "line-3",
        kind: "caption",
        text: "EXT. HOLLOWMERE CANAL BRIDGES — DUSK",
      },
      {
        id: "line-4",
        kind: "speech",
        speaker: "Boy",
        text: "Lantern girl! You are late!",
      },
    ],
  },
  {
    pageId: "ep1-p3-impact",
    sceneId: "fishmarket-alley-night",
    role: "impact",
    aspect: "9:16",
    widthClass: "full",
    gapBefore: "pause",
    background: "detailed",
    keyBeat: true,
    lines: [
      {
        id: "line-5",
        kind: "speech",
        speaker: "Krail",
        shout: true,
        text: "Every lamp you light late is a door you leave open!",
      },
    ],
  },
  {
    pageId: "ep1-p4-reveal",
    sceneId: "fishmarket-alley-night",
    role: "reveal",
    aspect: "16:27",
    widthClass: "inset",
    gapBefore: "reveal",
    background: "motion",
    lines: [
      {
        id: "line-6",
        kind: "thought",
        speaker: "Mira",
        text: "A cracked white porcelain mask hangs in the fog...",
      },
    ],
  },
  {
    pageId: "ep1-p5-cliffhanger",
    sceneId: "clock-tower-workshop",
    role: "cliffhanger",
    aspect: "9:16",
    widthClass: "full",
    gapBefore: "scene",
    background: "detailed",
    keyBeat: true,
    lines: [
      {
        id: "line-7",
        kind: "speech",
        speaker: "Hollow King",
        text: "Found you, little light.",
      },
    ],
  },
]);

const DEFAULT_CAST_CANDIDATES = Object.freeze([
  {
    id: "cast-mira",
    name: "Mira Vale",
    appearancePrompt: "Copper-red short messy braid, freckles, amber eyes, navy coat with brass buttons",
    baseLookLabel: "Lamplighter Coat (Base look)",
    baseStateLabel: "Determined (Base state)",
    sourcePhotoMime: "image/webp",
    sourcePhotoBytes: 1_240_000,
  },
  {
    id: "cast-krail",
    name: "Captain Odessa Krail",
    appearancePrompt: "Silver-gray undercut, nose bridge scar, black greatcoat, mechanical brass right hand",
    baseLookLabel: "Lantern Guard Uniform",
    baseStateLabel: "Combat Ready",
    sourcePhotoMime: "image/png",
    sourcePhotoBytes: 2_150_000,
  },
  {
    id: "cast-bram",
    name: "Old Bram",
    appearancePrompt: "Long white beard, round blue-tinted spectacles, wheelchair hung with tiny lanterns",
    baseLookLabel: "Workshop Master",
    baseStateLabel: "Seated",
    sourcePhotoMime: "image/jpeg",
    sourcePhotoBytes: 980_000,
  },
]);

export function StudioHiggsfieldMangakaPanel(): ReactElement {
  const t = useT();
  useBilingualI18nRevision();
  const [style, setStyle] = useState<MangakaVisualStyleId>("webtoon");
  const [portal, setPortal] = useState<MangakaPortalPresetId>("naver");
  const [widthStyle, setWidthStyle] = useState<MangakaWidthStyleId>("auto");
  const [gutter, setGutter] = useState<MangakaGutterFillId>("auto");
  const [capPx, setCapPx] = useState<number>(26);
  const [cameraYawDeg, setCameraYawDeg] = useState<number>(42);
  const [movingToonTrigger, setMovingToonTrigger] = useState<
    "scroll-parallax" | "tap-shake" | "sfx-bounce"
  >("scroll-parallax");

  const applyOneClickGenrePreset = (preset: (typeof GENRE_PRESETS)[number]) => {
    setStyle(preset.style);
    setPortal(preset.portal);
    setWidthStyle(preset.widthStyle);
    setGutter(preset.gutter);
    setCapPx(preset.capPx);
  };

  const activeStyleConfig = MANGAKA_STYLE_CONFIGS[style];
  const activePortalSpec = MANGAKA_PORTAL_SPECS[portal];

  const castLockResult = useMemo(
    () => createMangakaCharacterCastLock(DEFAULT_CAST_CANDIDATES),
    [],
  );

  const stagedStrip = useMemo(
    () =>
      stageMangakaEpisodeStrip({
        episodeId: "ep-1-hollowmere",
        panels: DEFAULT_DEMO_PANELS,
        style,
        portal,
        widthStyle,
        gutter,
        capPx,
        titleCard: true,
        endCard: true,
      }),
    [style, portal, widthStyle, gutter, capPx],
  );

  const qaReport = useMemo(
    () =>
      evaluateMangakaStripRules(stagedStrip, [
        "line-1",
        "line-2",
        "line-3",
        "line-4",
        "line-5",
        "line-6",
        "line-7",
      ]),
    [stagedStrip],
  );

  const bg3dBridgePlan = useMemo(
    () =>
      buildMangakaBg3dSceneBridgePlan({
        sceneId: "canal-bridge-dusk",
        panels: DEFAULT_DEMO_PANELS,
        visualStyle: style,
        sketchUpArchetypeId: "rooftop-exterior-pack",
        cameraYawByPanelId: {
          "ep1-p1-hook": cameraYawDeg,
          "ep1-p2-establishing": (cameraYawDeg + 90) % 360,
        },
        isInteriorScene: false,
        solarTimePresetId: "golden-hour-sunset",
      }),
    [style, cameraYawDeg],
  );

  return (
    <div
      data-testid="higgsfield-mangaka-section"
      className="min-w-0 space-y-2.5 text-[0.66rem] text-fg"
    >
      {/* 1-Click 장르·연출 퀵 프리셋 바 */}
      <div
        data-testid="mangaka-one-click-preset-bar"
        className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-accent/30 bg-accent-soft/20 px-2.5 py-1.5"
      >
        <span className="font-bold text-fg">
          {t(COPY.presets)}
        </span>
        <div className="flex flex-wrap gap-1">
          {GENRE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`mangaka-genre-preset-${preset.id}`}
              onClick={() => applyOneClickGenrePreset(preset)}
              aria-pressed={style === preset.style && portal === preset.portal && widthStyle === preset.widthStyle && gutter === preset.gutter && capPx === preset.capPx}
              className="rounded border border-line bg-card px-2 py-0.5 text-[0.6rem] font-semibold text-fg hover:border-accent hover:text-accent"
            >
              {t(preset.label)} · {MANGAKA_PORTAL_SPECS[preset.portal].widthPx}px
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold text-fg-2">만화/웹툰 비주얼 스타일</span>
          <select
            aria-label="Mangaka 비주얼 스타일"
            data-testid="mangaka-style-select"
            value={style}
            onChange={(e) => setStyle(e.target.value as MangakaVisualStyleId)}
            className="min-w-0 w-full rounded border border-line bg-raised px-1.5 py-1 text-fg"
          >
            {Object.values(MANGAKA_STYLE_CONFIGS).map((cfg) => (
              <option key={cfg.id} value={cfg.id}>
                {cfg.labelKo} ({cfg.reading.defaultDirection.toUpperCase()})
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold text-fg-2">글로벌 연재 포털 규격 (8종)</span>
          <select
            aria-label="Mangaka 연재 포털 규격"
            data-testid="mangaka-portal-select"
            value={portal}
            onChange={(e) => setPortal(e.target.value as MangakaPortalPresetId)}
            className="min-w-0 w-full rounded border border-line bg-raised px-1.5 py-1 text-fg"
          >
            {Object.values(MANGAKA_PORTAL_SPECS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.labelKo} · 슬라이스 {p.sliceMaxPx}px
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold text-fg-2">패널 폭 스타일 & 여백 톤</span>
          <div className="flex gap-1">
            <select
              aria-label="Mangaka 패널 폭 스타일"
              value={widthStyle}
              onChange={(e) => setWidthStyle(e.target.value as MangakaWidthStyleId)}
              className="min-w-0 flex-1 rounded border border-line bg-raised px-1 py-1 text-fg"
            >
              <option value="auto">Auto 혼용</option>
              <option value="full">Full 와이드 중심</option>
              <option value="inset">Inset 인셋 중심</option>
              <option value="mixed">Mixed 균등</option>
            </select>
            <select
              aria-label="Mangaka 여백 배경색"
              value={gutter}
              onChange={(e) => setGutter(e.target.value as MangakaGutterFillId)}
              className="min-w-0 flex-1 rounded border border-line bg-raised px-1 py-1 text-fg"
            >
              <option value="auto">Auto (#FFFFFF)</option>
              <option value="white">White (#FFFFFF)</option>
              <option value="dark">Dark (#0B0B10)</option>
            </select>
          </div>
        </label>

        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold text-fg-2">대사 Cap Height (22~34px)</span>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              aria-label="Mangaka 대사 폰트 크기"
              min={22}
              max={34}
              step={1}
              value={capPx}
              onChange={(e) => setCapPx(Number(e.target.value))}
              className="min-w-0 flex-1 accent-accent"
            />
            <span className="shrink-0 whitespace-nowrap font-mono text-accent">{capPx}px</span>
          </div>
        </label>
      </div>

      {/* 캐릭터 레퍼런스 시트 & 룩 시트 잠금 (IDEA_PEOPLE_MAX = 6) */}
      <div className="rounded border border-line bg-raised/40 p-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-bold text-fg">
            캐릭터 시트 & 룩 시트 잠금 ({castLockResult.acceptedCast.length}/{MANGAKA_IDEA_PEOPLE_MAX}명 · 실사 사진 → 만화 캐릭터 변환)
          </span>
          <span className="font-mono text-[0.6rem] text-accent">
            레지스터: {activeStyleConfig.registers.join(" · ")}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {castLockResult.acceptedCast.map((actor) => (
            <div
              key={actor.id}
              data-testid={`mangaka-cast-card-${actor.id}`}
              className="rounded border border-line bg-card p-1.5"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 font-bold text-fg">
                <span>{actor.name}</span>
                <span className="shrink-0 whitespace-nowrap rounded bg-accent-soft px-1 py-0.5 font-mono text-[0.56rem] text-accent">
                  180° {actor.screenSidePreference.toUpperCase()} 고정
                </span>
              </div>
              <div className="mt-0.5 text-[0.6rem] text-fg-2">
                {actor.baseLookLabel} · {actor.baseStateLabel}
              </div>
              <div className="mt-0.5 truncate text-[0.58rem] text-fg-3">
                {actor.appearancePrompt}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 스트립 스테이징 메트릭 & WT-* QA 규칙 검증 리포트 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded border border-line bg-raised/40 p-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
            <span className="min-w-0 font-bold text-fg">
              자동 스테이징 & 식자(Lettering) 스트립 요약
            </span>
            <span
              data-testid="mangaka-qa-score-badge"
              className="shrink-0 whitespace-nowrap rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-accent"
            >
              WT-* QA {qaReport.passedChecks}/{qaReport.totalChecks} 통과
            </span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-[0.6rem] text-fg-2">
            <div>
              포털 참조 설정: {activePortalSpec.widthPx}px (슬라이스 {activePortalSpec.sliceMaxPx}px)
            </div>
            <div>
              총 스트립 높이: {stagedStrip.width}×{stagedStrip.height}px ({stagedStrip.metrics.screens}화면)
            </div>
            <div>
              화면당 밀도: {stagedStrip.metrics.panelsPerScreen}컷/1600px (간격 중앙값{" "}
              {stagedStrip.metrics.gapMedianPx}px)
            </div>
            <div>
              안전 절단 구간: {stagedStrip.safeSliceIntervals.length}개 · 대사{" "}
              {stagedStrip.letters.length}개
            </div>
          </div>
        </div>

        {/* SketchUp 3D 배경 ↔ Mangaka 씬 합성 브리지 */}
        <div className="rounded border border-line bg-raised/40 p-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
            <span className="min-w-0 font-bold text-fg">
              SketchUp 3D 배경 ↔ Mangaka 컷 앵글 브리지 (WT-L10 · WT-L11)
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {[0, 42, 110, 240].map((yaw) => (
                <button
                  key={yaw}
                  type="button"
                  onClick={() => setCameraYawDeg(yaw)}
                  className={studioSegmentChipClass(cameraYawDeg === yaw)}
                >
                  Yaw {yaw}°
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 font-mono text-[0.6rem] text-fg-2">
            <div>
              설정 샷(Establishing): [{bg3dBridgePlan.establishingPanelId}] · 3D 스타일 [
              {bg3dBridgePlan.sketchUpStylePresetId}]
            </div>
            <div>
              2점 투시 잠금: {bg3dBridgePlan.twoPointPerspectiveLocked ? "ON" : "OFF"} · 태양광 [
              {bg3dBridgePlan.solarTimePresetId}] · 캐릭터 시트 앵글 [
              {bg3dBridgePlan.characterAnchorAnglesByPanel["ep1-p1-hook"]}]
            </div>
          </div>
        </div>
      </div>

      {/* NovelAI / Scrivener 듀얼페인 대본·로어북 시트 & Rive / Spine 무빙툰 상태머신 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div
          data-testid="mangaka-dual-pane-script-lore"
          className="rounded border border-line bg-raised/40 p-2"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 font-bold text-fg">
            <span className="min-w-0">{t(COPY.lore)}</span>
            <span className="shrink-0 whitespace-nowrap font-mono text-[0.58rem] text-accent">{t(COPY.sample)}</span>
          </div>
          <p className="mt-1 text-fg-2">{t(COPY.loreScope)}</p>
          <div className="mt-1 font-mono text-[0.58rem] text-fg-2">
            <div>
              {t(COPY.world)}
            </div>
            <div>
              {DEFAULT_DEMO_PANELS.length} · {t(COPY.panelPlan)}
            </div>
          </div>
        </div>

        <div
          data-testid="mangaka-moving-toon-state-machine"
          className="rounded border border-line bg-raised/40 p-2"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 font-bold text-fg">
            <span className="min-w-0">{t(COPY.effects)}</span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {(
                [
                  { id: "scroll-parallax", label: COPY.parallax },
                  { id: "tap-shake", label: COPY.shake },
                  { id: "sfx-bounce", label: COPY.bounce },
                ] as const
              ).map((trig) => (
                <button
                  key={trig.id}
                  type="button"
                  data-testid={`mangaka-moving-toon-${trig.id}`}
                  onClick={() => setMovingToonTrigger(trig.id)}
                  aria-pressed={movingToonTrigger === trig.id}
                  className={studioSegmentChipClass(movingToonTrigger === trig.id)}
                >
                  {t(trig.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 font-mono text-[0.58rem] text-fg-2">
            [{movingToonTrigger}] · {t(COPY.effectScope)}
          </div>
        </div>
      </div>
    </div>
  );
}
