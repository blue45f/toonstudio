import { CheckCircle2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { MARKET_KINDS, MARKET_LICENSES } from "../models/market-kind";
import {
  AUTHORING_KIND_BY_RESOURCE_KIND,
  DEFAULT_MANIFEST_BUILDER_SWATCHES,
  MANIFEST_BUILDER_ENGINE_OPTIONS,
  buildMarketMultiKindManifest,
} from "../models/market-multi-kind-manifest";

import { MarketResourceCard } from "./MarketResourceCard";
import { MarketplaceAssetQualityMatrix } from "./MarketplaceAssetQualityMatrix";
import { MarketplaceBrushRecipeAccelerator } from "./MarketplaceBrushRecipeAccelerator";

import {
  createCreatorMarketplaceAuthoringDraft,
  type CreatorMarketplaceAuthoringDraft,
} from "@/shared/lib/creator-marketplace-authoring-workshop";
import type {
  CreatorMarketplaceResourceEngine,
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface MarketMultiKindManifestBuilderProps {
  readonly publisherName?: string;
  readonly publisherId?: string;
  readonly onApplyManifest: (manifestJson: string, fileLabel: string) => void;
}

const DEFAULT_BUILDER_PUBLISHER_ID = [
  "00000000",
  "0000",
  "4000",
  "8000",
  "000000000000",
].join("-");

/**
 * 7종 마켓 리소스 전체(brush, palette, filter, template, asset, 3d-preset, 3d-asset)를
 * 시각 폼으로 설계해 계약 검증을 통과하는 공개 manifest JSON으로 변환하고 실시간 카드를 미리 보는 빌더.
 * 주의: 상위 페이지의 단일 role="status" / role="alert" 불변식을 해치지 않도록 내부에서 status/alert role을 쓰지 않는다.
 */
export function MarketMultiKindManifestBuilder({
  publisherName = "내 크리에이터 스튜디오",
  publisherId = DEFAULT_BUILDER_PUBLISHER_ID,
  onApplyManifest,
}: MarketMultiKindManifestBuilderProps) {
  const t = useBilingual("MarketMultiKindManifestBuilder");
  const [kind, setKind] = useState<CreatorMarketplaceResourceKind>("palette");
  const [builderName, setBuilderName] = useState("웹툰 감성 노을 컬러 팔레트");
  const [slug, setSlug] = useState("sunset-webtoon-pack");
  const [version, setVersion] = useState("1.0.0");
  const [minStudioVersion, setMinStudioVersion] = useState("1.0.0");
  const [description, setDescription] = useState(
    "세로 스크롤 웹툰의 노을·회상 컷에 바로 적용할 수 있는 검증된 소재 패키지입니다.",
  );
  const [tagsRaw, setTagsRaw] = useState("웹툰, 노을, 채색");
  const [license, setLicense] =
    useState<CreatorMarketplaceResourceLicense>("toonspectrum-standard");
  const [attributionText, setAttributionText] = useState("");
  const [containsAi, setContainsAi] = useState(false);
  const [origin, setOrigin] = useState<"original" | "permissive">("original");
  const [sourceName, setSourceName] = useState("Poly Haven");
  const [sourceUrl, setSourceUrl] = useState("https://polyhaven.com");
  const [sourceLicenseUrl, setSourceLicenseUrl] = useState(
    "https://creativecommons.org/publicdomain/zero/1.0/",
  );
  const [engines, setEngines] = useState<CreatorMarketplaceResourceEngine[]>(["canvas2d"]);

  // Kind-specific visual state
  const [swatches, setSwatches] = useState<string[]>(DEFAULT_MANIFEST_BUILDER_SWATCHES);
  const [newSwatch, setNewSwatch] = useState("#7950f2");
  const [filterEngine, setFilterEngine] = useState("color-grade");
  const [filterStrength, setFilterStrength] = useState(72);
  const [filterWarmth, setFilterWarmth] = useState(18);
  const [templateId, setTemplateId] = useState("vertical-webtoon-4cut");
  const [recipeMode, setRecipeMode] = useState<"procedural-recipe" | "builtin-ref">(
    "procedural-recipe",
  );
  const [recipeId, setRecipeId] = useState("procedural-studio-kit-v1");
  const [detailLevel, setDetailLevel] = useState(2);
  const [brushSize, setBrushSize] = useState(14);
  const [brushSmoothing, setBrushSmoothing] = useState(16);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityDraft, setQualityDraft] = useState<CreatorMarketplaceAuthoringDraft>(() =>
    createCreatorMarketplaceAuthoringDraft("palette"),
  );

  const handleSelectKind = (nextKind: CreatorMarketplaceResourceKind) => {
    setKind(nextKind);
    setQualityDraft(
      createCreatorMarketplaceAuthoringDraft(AUTHORING_KIND_BY_RESOURCE_KIND[nextKind]),
    );
    if (nextKind === "3d-preset" || nextKind === "3d-asset") {
      setEngines(["three", "webgl2"]);
    } else if (nextKind === "filter") {
      setEngines(["canvas2d", "webgl2"]);
    } else {
      setEngines(["canvas2d"]);
    }
  };

  const toggleEngine = (engine: CreatorMarketplaceResourceEngine) => {
    setEngines((prev) => {
      if (prev.includes(engine)) {
        return prev.length > 1 ? prev.filter((item) => item !== engine) : prev;
      }
      return [...prev, engine];
    });
  };

  const handleOriginChange = (nextOrigin: "original" | "permissive") => {
    setOrigin(nextOrigin);
    if (nextOrigin === "permissive" && license === "toonspectrum-standard") {
      setLicense("cc0-1.0");
    }
  };

  const builtResult = useMemo(
    () =>
      buildMarketMultiKindManifest({
        kind,
        builderName,
        slug,
        version,
        minStudioVersion,
        description,
        tagsRaw,
        license,
        attributionText,
        containsAi,
        origin,
        sourceName,
        sourceUrl,
        sourceLicenseUrl,
        engines,
        swatches,
        filterEngine,
        filterStrength,
        filterWarmth,
        templateId,
        recipeMode,
        recipeId,
        detailLevel,
        brushSize,
        brushSmoothing,
        brushPresetFamily: qualityDraft.brush.presetFamily,
        brushEngineCount: qualityDraft.brush.engineNodes.length,
        publisherId,
        publisherName,
      }),
    [
      attributionText,
      brushSize,
      brushSmoothing,
      builderName,
      containsAi,
      description,
      detailLevel,
      engines,
      filterEngine,
      filterStrength,
      filterWarmth,
      kind,
      license,
      minStudioVersion,
      origin,
      publisherId,
      publisherName,
      qualityDraft.brush.engineNodes.length,
      qualityDraft.brush.presetFamily,
      recipeId,
      recipeMode,
      slug,
      sourceLicenseUrl,
      sourceName,
      sourceUrl,
      swatches,
      tagsRaw,
      templateId,
      version,
    ],
  );

  const addSwatch = () => {
    const normalized = newSwatch.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/u.test(normalized)) return;
    if (swatches.includes(normalized) || swatches.length >= 24) return;
    setSwatches((prev) => [...prev, normalized]);
  };

  return (
    <section
      data-testid="market-multikind-manifest-builder"
      aria-labelledby="market-multikind-builder-heading"
      className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="eyebrow text-accent">7-KIND VISUAL MANIFEST BUILDER</p>
          <h2 id="market-multikind-builder-heading" className="mt-1 text-lg font-bold text-fg">
            {t("7종 리소스 시각 명세서(Manifest) 빌더", "7-Kind visual manifest builder")}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-2">
            {t(
              "브러시뿐만 아니라 팔레트·필터·템플릿·2D 에셋·3D 배경·3D 오브젝트까지 Studio 런타임 계약을 만족하는 공개 manifest JSON을 시각 폼으로 즉시 생성하고 카드 모습을 미리 확인합니다.",
              "Visually author contract-valid public manifests across all 7 marketplace resource kinds with live card preview.",
            )}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={qualityOpen}
          onClick={() => setQualityOpen((prev) => !prev)}
          className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
          {qualityOpen
            ? t("품질 시나리오·레시피 닫기", "Hide quality matrix")
            : t("품질 시나리오·레시피 열기", "Quality matrix & recipe lab")}
        </button>
      </div>

      {/* 7-Kind Selector */}
      <div
        role="group"
        aria-label={t("빌더 리소스 종류 선택", "Select builder resource kind")}
        className="mt-4 flex flex-wrap gap-1.5"
      >
        {MARKET_KINDS.map((meta) => {
          const Icon = meta.icon;
          const active = kind === meta.kind;
          return (
            <button
              key={meta.kind}
              type="button"
              aria-pressed={active}
              onClick={() => handleSelectKind(meta.kind)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-fg">
              {t("빌더 에셋 이름", "Builder asset name")}
              <input
                value={builderName}
                onChange={(event) => setBuilderName(event.target.value)}
                maxLength={80}
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-3 text-xs text-fg"
              />
            </label>
            <label className="block text-xs font-semibold text-fg">
              {t("빌더 패키지 슬러그", "Builder package slug")}
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                maxLength={64}
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-3 font-mono text-xs text-fg"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-semibold text-fg">
              {t("빌더 릴리스 버전 (SemVer)", "Release SemVer")}
              <input
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="1.0.0"
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-3 font-mono text-xs text-fg"
              />
            </label>
            <label className="block text-xs font-semibold text-fg">
              {t("최소 Studio 버전", "Min Studio SemVer")}
              <input
                value={minStudioVersion}
                onChange={(event) => setMinStudioVersion(event.target.value)}
                placeholder="1.0.0"
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-3 font-mono text-xs text-fg"
              />
            </label>
            <label className="block text-xs font-semibold text-fg">
              {t("빌더 사용권", "License")}
              <select
                value={origin === "permissive" && license === "toonspectrum-standard" ? "cc0-1.0" : license}
                onChange={(event) =>
                  setLicense(event.target.value as CreatorMarketplaceResourceLicense)
                }
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
              >
                {MARKET_LICENSES.filter(
                  (item) =>
                    !(origin === "permissive" && item.license === "toonspectrum-standard"),
                ).map((item) => (
                  <option key={item.license} value={item.license}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-fg">
              {t("빌더 에셋 소개", "Builder summary")}
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={300}
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-3 text-xs text-fg"
              />
            </label>
            <label className="block text-xs font-semibold text-fg">
              {t("빌더 태그 목록 (쉼표 구분)", "Tags (comma-separated)")}
              <input
                value={tagsRaw}
                onChange={(event) => setTagsRaw(event.target.value)}
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-3 text-xs text-fg"
              />
            </label>
          </div>

          {/* Provenance & AI disclosure */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel/60 p-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-fg">{t("출처 구분:", "Provenance:")}</span>
              <button
                type="button"
                aria-pressed={origin === "original"}
                onClick={() => handleOriginChange("original")}
                className={cn(
                  "rounded-md border px-2 py-1 font-semibold",
                  origin === "original"
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-card text-fg-2",
                )}
              >
                {t("직접 제작 (Original)", "Original")}
              </button>
              <button
                type="button"
                aria-pressed={origin === "permissive"}
                onClick={() => handleOriginChange("permissive")}
                className={cn(
                  "rounded-md border px-2 py-1 font-semibold",
                  origin === "permissive"
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-card text-fg-2",
                )}
              >
                {t("외부 허용 출처", "Permissive")}
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 font-medium text-fg-2">
              <input
                type="checkbox"
                checked={containsAi}
                onChange={(event) => setContainsAi(event.target.checked)}
              />
              {t("AI 생성·보조 포함 공개", "Contains AI assistance")}
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-fg">{t("엔진:", "Engines:")}</span>
              {MANIFEST_BUILDER_ENGINE_OPTIONS.map((engine) => (
                <button
                  key={engine.id}
                  type="button"
                  aria-pressed={engines.includes(engine.id)}
                  onClick={() => toggleEngine(engine.id)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-[11px] font-semibold",
                    engines.includes(engine.id)
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg-3",
                  )}
                >
                  {engine.label}
                </button>
              ))}
            </div>
          </div>

          {(license === "cc-by-4.0" || license === "cc-by-nc-4.0" || attributionText) ? (
            <label className="block text-xs font-semibold text-fg">
              {t("출처 표기문 (CC BY 필수)", "Attribution line")}
              <input
                value={attributionText}
                onChange={(event) => setAttributionText(event.target.value)}
                placeholder={`© ${publisherName}`}
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-panel px-3 text-xs text-fg"
              />
            </label>
          ) : null}

          {origin === "permissive" ? (
            <div className="grid gap-2.5 rounded-xl border border-line bg-panel/50 p-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-fg">
                {t("원본 출처명", "Source name")}
                <input
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                  className="mt-1 block h-8 w-full rounded border border-line bg-card px-2 text-xs text-fg"
                />
              </label>
              <label className="block text-xs font-semibold text-fg">
                {t("원본 HTTPS URL", "Source HTTPS URL")}
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  className="mt-1 block h-8 w-full rounded border border-line bg-card px-2 font-mono text-xs text-fg"
                />
              </label>
              <label className="block text-xs font-semibold text-fg">
                {t("원본 라이선스 HTTPS URL", "License HTTPS URL")}
                <input
                  value={sourceLicenseUrl}
                  onChange={(event) => setSourceLicenseUrl(event.target.value)}
                  className="mt-1 block h-8 w-full rounded border border-line bg-card px-2 font-mono text-xs text-fg"
                />
              </label>
            </div>
          ) : null}

          {/* Kind-specific visual payload editor */}
          <div className="rounded-xl border border-accent/25 bg-panel/60 p-3.5">
            {kind === "palette" ? (
              <div className="space-y-2.5">
                <strong className="block text-xs font-bold text-fg">
                  {t("팔레트 컬러 스와치 구성", "Palette hex swatches")} ({swatches.length}/64)
                </strong>
                <div className="flex flex-wrap items-center gap-1.5">
                  {swatches.map((hex) => (
                    <span
                      key={hex}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1 font-mono text-[11px] text-fg"
                    >
                      <span
                        aria-hidden="true"
                        className="size-3.5 rounded border border-line"
                        style={{ backgroundColor: hex }}
                      />
                      {hex}
                      {swatches.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`${hex} 색상 제거`}
                          onClick={() =>
                            setSwatches((prev) => prev.filter((item) => item !== hex))
                          }
                          className="text-fg-3 hover:text-bad"
                        >
                          <Trash2 className="size-3" aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t("추가할 스와치 색상 선택", "Pick swatch color")}
                    value={/^#[0-9a-f]{6}$/iu.test(newSwatch) ? newSwatch : "#7950f2"}
                    onChange={(event) => setNewSwatch(event.target.value.toLowerCase())}
                    className="h-8 w-10 cursor-pointer rounded border border-line bg-card p-0.5"
                  />
                  <input
                    value={newSwatch}
                    onChange={(event) => setNewSwatch(event.target.value.toLowerCase())}
                    aria-label={t("추가할 스와치 HEX 코드", "New swatch HEX code")}
                    className="h-8 w-28 rounded border border-line bg-card px-2 font-mono text-xs text-fg"
                  />
                  <button
                    type="button"
                    onClick={addSwatch}
                    className={buttonClass({ variant: "outline", size: "sm", className: "min-h-8 gap-1 text-xs" })}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t("색상 추가", "Add swatch")}
                  </button>
                </div>
              </div>
            ) : kind === "filter" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-semibold text-fg">
                  {t("필터 파이프라인 엔진", "Filter engine")}
                  <select
                    value={filterEngine}
                    onChange={(event) => setFilterEngine(event.target.value)}
                    className="mt-1 block h-8 w-full rounded border border-line bg-card px-2 text-xs text-fg"
                  >
                    <option value="color-grade">color-grade (색보정)</option>
                    <option value="halftone-screen">halftone-screen (스크린톤)</option>
                    <option value="bloom-atmosphere">bloom-atmosphere (발광·무드)</option>
                    <option value="ink-contrast">ink-contrast (선화 대비)</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-fg">
                  {t("적용 강도 (%)", "Strength (%)")}: {filterStrength}%
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={filterStrength}
                    onChange={(event) => setFilterStrength(Number(event.target.value))}
                    className="mt-2 block w-full"
                  />
                </label>
                <label className="block text-xs font-semibold text-fg">
                  {t("색온도 오프셋", "Warmth offset")}: {filterWarmth}
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={filterWarmth}
                    onChange={(event) => setFilterWarmth(Number(event.target.value))}
                    className="mt-2 block w-full"
                  />
                </label>
              </div>
            ) : kind === "template" ? (
              <label className="block text-xs font-semibold text-fg">
                {t("장면 템플릿 식별자 (templateId)", "Scene templateId")}
                <input
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-1 block h-8 w-full rounded border border-line bg-card px-2.5 font-mono text-xs text-fg"
                />
              </label>
            ) : kind === "brush" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg">
                  {t("기본 브러시 크기 (px)", "Default size (px)")}
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={brushSize}
                    onChange={(event) => setBrushSize(Number(event.target.value) || 12)}
                    className="mt-1 block h-8 w-full rounded border border-line bg-card px-2.5 font-mono text-xs text-fg"
                  />
                </label>
                <label className="block text-xs font-semibold text-fg">
                  {t("손떨림 보정 기본값", "Stabilization")}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={brushSmoothing}
                    onChange={(event) => setBrushSmoothing(Number(event.target.value) || 15)}
                    className="mt-1 block h-8 w-full rounded border border-line bg-card px-2.5 font-mono text-xs text-fg"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-semibold text-fg">
                  {t("전달 모드", "Delivery mode")}
                  <select
                    value={recipeMode}
                    onChange={(event) =>
                      setRecipeMode(event.target.value as "procedural-recipe" | "builtin-ref")
                    }
                    className="mt-1 block h-8 w-full rounded border border-line bg-card px-2 text-xs text-fg"
                  >
                    <option value="procedural-recipe">procedural-recipe (절차형 레시피)</option>
                    <option value="builtin-ref">builtin-ref (내장 런타임 참조)</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-fg">
                  {t("레시피 / 런타임 슬러그", "Recipe / runtime slug")}
                  <input
                    value={recipeId}
                    onChange={(event) => setRecipeId(event.target.value)}
                    className="mt-1 block h-8 w-full rounded border border-line bg-card px-2.5 font-mono text-xs text-fg"
                  />
                </label>
                {recipeMode === "procedural-recipe" ? (
                  <label className="block text-xs font-semibold text-fg">
                    {t("디테일 단계 (1~5)", "Detail level (1–5)")}
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={detailLevel}
                      onChange={(event) => setDetailLevel(Number(event.target.value) || 2)}
                      className="mt-1 block h-8 w-full rounded border border-line bg-card px-2.5 font-mono text-xs text-fg"
                    />
                  </label>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {builtResult.ok ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-good">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t(
                  `계약 검증 통과 · ${builtResult.previewRecord.packageId} (${builtResult.previewRecord.manifestByteSize}B)`,
                  `Contract valid · ${builtResult.previewRecord.packageId}`,
                )}
              </span>
            ) : (
              <span className="text-xs font-medium text-warn">{builtResult.issue}</span>
            )}

            <button
              type="button"
              disabled={!builtResult.ok}
              onClick={() => {
                if (!builtResult.ok) return;
                onApplyManifest(
                  JSON.stringify(builtResult.manifest, null, 2),
                  builtResult.fileName,
                );
              }}
              className={buttonClass({
                variant: "solid",
                size: "sm",
                className: "gap-1.5 disabled:opacity-45",
              })}
            >
              <Wand2 className="size-3.5" aria-hidden="true" />
              {t("공개 Manifest JSON에 반영", "Apply to public manifest JSON")}
            </button>
          </div>
        </div>

        {/* Live Market Card Preview */}
        <div className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-wider text-fg-3">
            {t("카탈로그 카드 실시간 미리보기", "Live catalog card preview")}
          </span>
          {builtResult.ok ? (
            <div className="pointer-events-none select-none">
              <MarketResourceCard record={builtResult.previewRecord} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-panel/40 p-6 text-center text-xs text-fg-3">
              {t(
                "필수 항목을 채우면 마켓 카드 미리보기가 활성화됩니다.",
                "Complete required fields to preview the market card.",
              )}
            </div>
          )}
        </div>
      </div>

      {qualityOpen ? (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          {kind === "brush" ? (
            <MarketplaceBrushRecipeAccelerator
              draft={qualityDraft}
              onChange={setQualityDraft}
            />
          ) : null}
          <MarketplaceAssetQualityMatrix
            draft={qualityDraft}
            onChange={setQualityDraft}
          />
        </div>
      ) : null}
    </section>
  );
}
