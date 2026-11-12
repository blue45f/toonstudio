import { Building2, Lightbulb, Sparkles, User } from "lucide-react";
import React, { useMemo, useState } from "react";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  KITBASH_BACKGROUND_ARCHETYPES,
  buildParametricBackgroundKitbashPrimitives,
  buildParametricCharacterModelingPrimitives,
  generateKitbashCharacterModelingFreshIdeas,
  type CharacterModelingBuildId,
  type CharacterModelingHairId,
  type CharacterModelingOutfitId,
  type CharacterModelingPoseId,
  type CharacterModelingPropId,
  type KitbashBackgroundArchetypeId,
  type KitbashDetailDensity,
  type KitbashPaletteMood,
} from "./studio-bg3d-kitbash-character-modeler";

export interface StudioBg3dKitbashCharacterModelerPanelProps {
  readonly disabled?: boolean;
  readonly defaultMode?: "background" | "character" | "fresh-ideas";
  readonly onStatusChange?: (summaryKo: string) => void;
  readonly onInsertScenePrimitives?: (primitives: readonly BgPrimitive[], labelKo: string) => void;
}

const DENSITY_OPTIONS: readonly { readonly id: KitbashDetailDensity; readonly labelKo: string }[] = [
  { id: "clean", labelKo: "기본 골격 (Clean)" },
  { id: "rich", labelKo: "표준 디테일 (Rich)" },
  { id: "cluttered", labelKo: "고밀도 생활감 (Cluttered)" },
];

const MOOD_OPTIONS: readonly { readonly id: KitbashPaletteMood; readonly labelKo: string }[] = [
  { id: "daylight-warm", labelKo: "주간 스트리트" },
  { id: "night-neon", labelKo: "야간 네온" },
  { id: "ancient-stone", labelKo: "고전 석조·목조" },
  { id: "pastel-campus", labelKo: "파스텔 학원물" },
];

const BUILD_OPTIONS: readonly { readonly id: CharacterModelingBuildId; readonly labelKo: string }[] = [
  { id: "balanced-webtoon", labelKo: "표준 웹툰 체형" },
  { id: "slender-romance", labelKo: "슬렌더 로맨스" },
  { id: "heroic-muscular", labelKo: "근육질 액션 히어로" },
  { id: "compact-chibi", labelKo: "컴팩트 SD 체형" },
];

const HAIR_OPTIONS: readonly { readonly id: CharacterModelingHairId; readonly labelKo: string }[] = [
  { id: "short-layered", labelKo: "레이어드 숏컷" },
  { id: "long-flowing", labelKo: "롱 웨이브" },
  { id: "high-ponytail", labelKo: "액션 포니테일" },
  { id: "hooded-cloak", labelKo: "후드 망토" },
];

const OUTFIT_OPTIONS: readonly { readonly id: CharacterModelingOutfitId; readonly labelKo: string }[] = [
  { id: "noir-longcoat", labelKo: "하이칼라 롱코트" },
  { id: "school-blazer", labelKo: "학원물 블레이저" },
  { id: "knight-pauldrons", labelKo: "기사단 견장 아머" },
  { id: "street-hoodie", labelKo: "스트리트 후디" },
];

const POSE_OPTIONS: readonly { readonly id: CharacterModelingPoseId; readonly labelKo: string }[] = [
  { id: "contrapposto-idle", labelKo: "콘트라포스토 서기" },
  { id: "sword-guard", labelKo: "전투 가드 스탠스" },
  { id: "action-dash", labelKo: "전력 질주" },
  { id: "heroic-landing", labelKo: "히어로 착지" },
  { id: "desk-seated", labelKo: "착석 구도" },
];

const PROP_OPTIONS: readonly { readonly id: CharacterModelingPropId; readonly labelKo: string }[] = [
  { id: "none", labelKo: "소품 없음" },
  { id: "rune-greatsword", labelKo: "룬 양손 대검" },
  { id: "arcane-staff", labelKo: "마법 수정 스태프" },
  { id: "smartphone", labelKo: "스마트폰" },
  { id: "grimoire-book", labelKo: "마도서·단행본" },
];

export function StudioBg3dKitbashCharacterModelerPanel({
  disabled = false,
  defaultMode = "background",
  onStatusChange,
  onInsertScenePrimitives,
}: StudioBg3dKitbashCharacterModelerPanelProps): React.JSX.Element {
  const [mode, setMode] = useState<"background" | "character" | "fresh-ideas">(defaultMode);

  // 배경 킷배시 상태
  const [archetype, setArchetype] = useState<KitbashBackgroundArchetypeId>("korean-commercial-facade");
  const [bayCount, setBayCount] = useState<number>(3);
  const [floorCount, setFloorCount] = useState<number>(2);
  const [detailDensity, setDetailDensity] = useState<KitbashDetailDensity>("cluttered");
  const [bevelTrimAccent, setBevelTrimAccent] = useState<boolean>(true);
  const [paletteMood, setPaletteMood] = useState<KitbashPaletteMood>("daylight-warm");

  // 캐릭터 조형 상태
  const [headRatio, setHeadRatio] = useState<number>(7.8);
  const [build, setBuild] = useState<CharacterModelingBuildId>("balanced-webtoon");
  const [hair, setHair] = useState<CharacterModelingHairId>("short-layered");
  const [outfit, setOutfit] = useState<CharacterModelingOutfitId>("noir-longcoat");
  const [pose, setPose] = useState<CharacterModelingPoseId>("contrapposto-idle");
  const [handProp, setHandProp] = useState<CharacterModelingPropId>("rune-greatsword");

  const bgResult = useMemo(
    () =>
      buildParametricBackgroundKitbashPrimitives({
        archetype,
        bayCount,
        floorCount,
        detailDensity,
        bevelTrimAccent,
        paletteMood,
      }),
    [archetype, bayCount, bevelTrimAccent, detailDensity, floorCount, paletteMood],
  );

  const charResult = useMemo(
    () =>
      buildParametricCharacterModelingPrimitives({
        headRatio,
        build,
        hair,
        outfit,
        pose,
        handProp,
      }),
    [build, hair, handProp, headRatio, outfit, pose],
  );

  const freshIdeas = useMemo(
    () => generateKitbashCharacterModelingFreshIdeas(bgResult, charResult),
    [bgResult, charResult],
  );

  return (
    <section
      data-testid="bg3d-kitbash-character-modeler-panel"
      aria-label="파라메트릭 배경 킷배시 및 캐릭터 조형 모델러"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel/60 p-2.5 text-xs text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-bold text-fg">
          <Building2 className="size-3.5 text-accent" aria-hidden />
          <span>고밀도 배경 킷배시 & 3D 캐릭터 아나토미 모델러</span>
        </span>
        <div className="flex gap-1" role="tablist" aria-label="킷배시 및 캐릭터 모델러 모드">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "background"}
            disabled={disabled}
            data-testid="bg3d-kitbash-tab-background"
            onClick={() => setMode("background")}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[0.63rem] font-bold ${
              mode === "background"
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-card text-fg-2"
            }`}
          >
            <Building2 className="size-3" aria-hidden />
            배경 킷배시 ({bgResult.subAssemblyCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "character"}
            disabled={disabled}
            data-testid="bg3d-kitbash-tab-character"
            onClick={() => setMode("character")}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[0.63rem] font-bold ${
              mode === "character"
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-card text-fg-2"
            }`}
          >
            <User className="size-3" aria-hidden />
            캐릭터 조형 ({charResult.primitives.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "fresh-ideas"}
            disabled={disabled}
            data-testid="bg3d-kitbash-tab-fresh-ideas"
            onClick={() => setMode("fresh-ideas")}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[0.63rem] font-bold ${
              mode === "fresh-ideas"
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-card text-fg-2"
            }`}
          >
            <Lightbulb className="size-3" aria-hidden />
            5-Lens 아이디어
          </button>
        </div>
      </div>

      {mode === "background" ? (
        <div className="space-y-2" data-testid="bg3d-kitbash-background-surface">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {KITBASH_BACKGROUND_ARCHETYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-kitbash-arch-${item.id}`}
                onClick={() => setArchetype(item.id)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  archetype === item.id
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                <div className="text-[0.66rem]">{item.labelKo}</div>
                <div className="mt-0.5 text-[0.58rem] font-normal text-fg-3">{item.descriptionKo}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="flex items-center justify-between font-semibold">
                <span>가로 경간(Bay) 수</span>
                <span className="font-mono text-accent">{bayCount}경간</span>
              </span>
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                disabled={disabled}
                aria-label="배경 킷배시 경간 수"
                data-testid="bg3d-kitbash-bay-slider"
                value={bayCount}
                onChange={(e) => setBayCount(Number(e.target.value))}
                className="mt-1 w-full accent-accent"
              />
            </label>

            <label className="rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="flex items-center justify-between font-semibold">
                <span>수직 층수 / 높이 단</span>
                <span className="font-mono text-accent">{floorCount}단</span>
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                disabled={disabled}
                aria-label="배경 킷배시 층수"
                data-testid="bg3d-kitbash-floor-slider"
                value={floorCount}
                onChange={(e) => setFloorCount(Number(e.target.value))}
                className="mt-1 w-full accent-accent"
              />
            </label>

            <div className="flex flex-col justify-between rounded border border-line bg-card p-2 text-[0.62rem]">
              <label className="flex items-center justify-between gap-1">
                <span className="font-semibold">배색 무드</span>
                <select
                  aria-label="배경 배색 무드"
                  disabled={disabled}
                  value={paletteMood}
                  onChange={(e) => setPaletteMood(e.target.value as KitbashPaletteMood)}
                  className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.6rem]"
                >
                  {MOOD_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.labelKo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-1 inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={bevelTrimAccent}
                  disabled={disabled}
                  onChange={(e) => setBevelTrimAccent(e.target.checked)}
                  className="accent-accent"
                />
                <span>코니스 몰딩·주초 베벨 디테일 추가</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card p-2">
            <div className="flex flex-wrap gap-1">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-kitbash-density-${opt.id}`}
                  onClick={() => setDetailDensity(opt.id)}
                  className={`rounded border px-2 py-0.5 text-[0.6rem] ${
                    detailDensity === opt.id
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {opt.labelKo}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span data-testid="bg3d-kitbash-bg-summary" className="font-mono text-[0.6rem] text-fg-2">
                {bgResult.summaryKo}
              </span>
              <button
                type="button"
                disabled={disabled || !onInsertScenePrimitives}
                data-testid="bg3d-kitbash-insert-bg-btn"
                onClick={() => {
                  onStatusChange?.(bgResult.summaryKo);
                  onInsertScenePrimitives?.(bgResult.primitives, bgResult.summaryKo);
                }}
                className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[0.64rem] font-bold text-on-accent disabled:opacity-45"
              >
                <Sparkles className="size-3" aria-hidden />
                <span>현재 3D 장면에 고밀도 배경 배치</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "character" ? (
        <div className="space-y-2" data-testid="bg3d-kitbash-character-surface">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="flex items-center justify-between font-semibold">
                <span>웹툰 등신대 비율</span>
                <span className="font-mono text-accent">
                  {headRatio.toFixed(1)}등신 ({charResult.totalHeightMeters}m)
                </span>
              </span>
              <input
                type="range"
                min={4.5}
                max={8.5}
                step={0.1}
                disabled={disabled}
                aria-label="캐릭터 등신대 비율"
                data-testid="bg3d-kitbash-char-ratio-slider"
                value={headRatio}
                onChange={(e) => setHeadRatio(Number(e.target.value))}
                className="mt-1 w-full accent-accent"
              />
            </label>

            <label className="flex flex-col justify-between rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="font-semibold">체형 골격 (Anatomy Build)</span>
              <select
                aria-label="캐릭터 체형 골격"
                disabled={disabled}
                value={build}
                onChange={(e) => setBuild(e.target.value as CharacterModelingBuildId)}
                className="mt-1 rounded border border-line bg-panel px-2 py-1 text-[0.62rem]"
              >
                {BUILD_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.labelKo}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col justify-between rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="font-semibold">헤어 볼륨 실루엣</span>
              <select
                aria-label="캐릭터 헤어 볼륨"
                disabled={disabled}
                value={hair}
                onChange={(e) => setHair(e.target.value as CharacterModelingHairId)}
                className="mt-1 rounded border border-line bg-panel px-2 py-1 text-[0.62rem]"
              >
                {HAIR_OPTIONS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.labelKo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col justify-between rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="font-semibold">의상 아우터 조형</span>
              <select
                aria-label="캐릭터 의상 조형"
                disabled={disabled}
                value={outfit}
                onChange={(e) => setOutfit(e.target.value as CharacterModelingOutfitId)}
                className="mt-1 rounded border border-line bg-panel px-2 py-1 text-[0.62rem]"
              >
                {OUTFIT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.labelKo}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col justify-between rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="font-semibold">키 포즈 (Key Pose)</span>
              <select
                aria-label="캐릭터 키 포즈"
                disabled={disabled}
                value={pose}
                onChange={(e) => setPose(e.target.value as CharacterModelingPoseId)}
                className="mt-1 rounded border border-line bg-panel px-2 py-1 text-[0.62rem]"
              >
                {POSE_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.labelKo}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col justify-between rounded border border-line bg-card p-2 text-[0.62rem]">
              <span className="font-semibold">오른손 장착 소품</span>
              <select
                aria-label="캐릭터 오른손 소품"
                disabled={disabled}
                value={handProp}
                onChange={(e) => setHandProp(e.target.value as CharacterModelingPropId)}
                className="mt-1 rounded border border-line bg-panel px-2 py-1 text-[0.62rem]"
              >
                {PROP_OPTIONS.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.labelKo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card p-2">
            <span data-testid="bg3d-kitbash-char-summary" className="font-mono text-[0.6rem] text-fg-2">
              {charResult.summaryKo}
            </span>
            <button
              type="button"
              disabled={disabled || !onInsertScenePrimitives}
              data-testid="bg3d-kitbash-insert-char-btn"
              onClick={() => {
                onStatusChange?.(charResult.summaryKo);
                onInsertScenePrimitives?.(charResult.primitives, charResult.summaryKo);
              }}
              className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[0.64rem] font-bold text-on-accent disabled:opacity-45"
            >
              <Sparkles className="size-3" aria-hidden />
              <span>현재 3D 장면에 캐릭터 조형 배치</span>
            </button>
          </div>
        </div>
      ) : null}

      {mode === "fresh-ideas" ? (
        <div className="space-y-1.5" data-testid="bg3d-kitbash-fresh-ideas-surface">
          <p className="font-mono text-[0.6rem] font-semibold text-accent">{freshIdeas.headerKo}</p>
          {freshIdeas.remixes.map((lens) => (
            <div key={lens.id} className="rounded-lg border border-line bg-card p-2">
              <div className="text-[0.62rem] font-bold text-accent">{lens.badgeKo}</div>
              <div className="mt-0.5 text-[0.65rem] font-semibold text-fg">{lens.lensTitle}</div>
              <p className="mt-0.5 text-[0.6rem] leading-relaxed text-fg-2">{lens.angleKo}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
