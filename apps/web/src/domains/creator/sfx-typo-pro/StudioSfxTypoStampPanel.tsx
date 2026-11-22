/**
 * 컷별 자동 효과음(SFX) 타이포그래피 & 3D 원근 왜곡 벡터 스탬프 패널.
 *
 * 4종 스타일(붓글씨·메탈·충격파·공포), 2중 외곽 테두리, 아치·원근 테이퍼 왜곡 SVG를
 * 실시간 미리보기로 생성하고, 번역 텍스트 교체 시(`swapSfxLocalizedText`) 기존 스타일과
 * 컷 배치 좌표를 그대로 보존한다(₩0 브라우저 로컬).
 */

import { BookmarkPlus, Copy, Download, Languages, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  SFX_DISTORTION_LABELS,
  SFX_LOCALE_LABELS,
  SFX_PRESET_PHRASES,
  SFX_STYLE_PRESETS,
  buildSfxVectorStamp,
  createSfxStampSpec,
  findLocalizedPresetSuggestion,
  loadSavedSfxStamps,
  nextSfxStampId,
  saveSavedSfxStamps,
  swapSfxLocalizedText,
  type SfxDistortionMode,
  type SfxLocaleCode,
  type SfxStyleId,
  type SfxVectorStampSpec,
} from "./sfx-typo-engine";

import { cn } from "@/shared/lib/utils";

export interface StudioSfxTypoStampPanelProps {
  readonly projectId: string;
  readonly initialText?: string;
  readonly initialCutId?: string;
}

const DISTORTION_MODES: readonly SfxDistortionMode[] = [
  "none",
  "arch-up",
  "arch-down",
  "perspective-left",
  "perspective-right",
  "perspective-burst",
];

const SWAP_LOCALES: readonly SfxLocaleCode[] = ["en", "ja", "zh", "ko"];

export function StudioSfxTypoStampPanel({
  projectId,
  initialText = "쾅!",
  initialCutId = "cut-01",
}: StudioSfxTypoStampPanelProps) {
  const [spec, setSpec] = useState<SfxVectorStampSpec>(() =>
    createSfxStampSpec({
      text: initialText,
      styleId: "shockwave",
      distortion: { mode: "perspective-burst" },
      placement: { cutId: initialCutId },
    }),
  );
  const [targetLocale, setTargetLocale] = useState<SfxLocaleCode>("en");
  const [swapInput, setSwapInput] = useState<string>(
    () => findLocalizedPresetSuggestion(initialText, "en") ?? "BOOM!",
  );
  const [savedStamps, setSavedStamps] = useState<readonly SfxVectorStampSpec[]>(() =>
    loadSavedSfxStamps(projectId),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const model = useMemo(() => buildSfxVectorStamp(spec), [spec]);

  const handleSelectPhrase = (phraseId: string) => {
    const found = SFX_PRESET_PHRASES.find((item) => item.id === phraseId);
    if (!found) return;
    const next = createSfxStampSpec({
      id: nextSfxStampId(found.id),
      text: found.textKo,
      locale: "ko",
      styleId: found.recommendedStyle,
      distortion: { mode: found.recommendedDistortion },
      placement: spec.placement,
      seed: spec.seed,
    });
    setSpec(next);
    setSwapInput(found.translations[targetLocale]);
    setNotice(`"${found.textKo}" 추천 스타일을 적용했습니다.`);
  };

  const handleChangeStyle = (styleId: SfxStyleId) => {
    const preset = SFX_STYLE_PRESETS.find((item) => item.id === styleId);
    if (!preset) return;
    setSpec((prev) => ({
      ...prev,
      styleId,
      distortion: {
        ...prev.distortion,
        skewDeg: preset.defaultSkewDeg,
      },
      doubleStroke: { ...preset.defaultDoubleStroke },
    }));
  };

  const handleChangeTargetLocale = (nextLocale: SfxLocaleCode) => {
    setTargetLocale(nextLocale);
    const suggestion = findLocalizedPresetSuggestion(spec.originalText, nextLocale);
    if (suggestion) {
      setSwapInput(suggestion);
    }
  };

  const handleSwapLocalized = () => {
    const clean = swapInput.trim();
    if (!clean) {
      setNotice("교체할 번역 효과음을 입력해 주세요.");
      return;
    }
    const swapped = swapSfxLocalizedText(spec, clean, targetLocale);
    setSpec(swapped);
    setNotice(
      `스타일·배치(${swapped.placement.x}, ${swapped.placement.y})를 유지한 채 "${swapped.text}"(${SFX_LOCALE_LABELS[targetLocale]})로 교체했습니다.`,
    );
  };

  const handleRestoreOriginal = () => {
    const restored = swapSfxLocalizedText(spec, spec.originalText, "ko");
    setSpec(restored);
    setNotice(`원문 "${spec.originalText}"으로 복원했습니다.`);
  };

  const handleSaveStamp = () => {
    const stampToSave: SfxVectorStampSpec = {
      ...spec,
      id: nextSfxStampId(spec.styleId),
    };
    const nextList = [stampToSave, ...savedStamps.filter((item) => item.id !== stampToSave.id)].slice(0, 24);
    setSavedStamps(nextList);
    saveSavedSfxStamps(projectId, nextList);
    setNotice(`"${stampToSave.text}" 스탬프를 로컬 보관함에 저장했습니다.`);
  };

  const handleDeleteStamp = (stampId: string) => {
    const nextList = savedStamps.filter((item) => item.id !== stampId);
    setSavedStamps(nextList);
    saveSavedSfxStamps(projectId, nextList);
  };

  const handleCopySvg = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(model.svgMarkup);
        setNotice("벡터 SVG 코드를 클립보드에 복사했습니다.");
      } else {
        setNotice("이 환경에서는 클립보드 복사가 제한됩니다. SVG 저장을 사용해 주세요.");
      }
    } catch {
      setNotice("클립보드 복사에 실패했습니다. SVG 저장 버튼을 사용해 주세요.");
    }
  };

  const handleDownloadSvg = () => {
    if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof document === "undefined") {
      return;
    }
    const blob = new Blob([model.svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sfx-${spec.placement.cutId}-${spec.styleId}.svg`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("벡터 SVG 스탬프 파일을 내려받았습니다.");
  };

  return (
    <section
      aria-label="자동 효과음(SFX) 타이포그래피 스탬프"
      data-testid="studio-sfx-typo-stamp-panel"
      className="space-y-4 rounded-xl border border-line bg-card p-4 text-fg"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-fg [word-break:keep-all]">
            <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
            컷별 자동 효과음(SFX) 타이포 & 원근 벡터 스탬프
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2 [word-break:keep-all]">
            의성어에 4종 스타일·2중 외곽선·아치/원근 테이퍼를 적용하고 번역 교체 시 스타일과 컷 배치를 그대로 유지합니다.
          </p>
        </div>
        <span className="rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-semibold tabular-nums text-fg-2">
          로컬 SVG · ₩0
        </span>
      </header>

      {/* 빠른 의성어 프리셋 */}
      <div className="space-y-2">
        <span className="block text-xs font-semibold text-fg-2">자주 쓰는 효과음 프리셋</span>
        <div className="flex flex-wrap gap-2">
          {SFX_PRESET_PHRASES.map((phrase) => {
            const active = spec.originalText === phrase.textKo;
            return (
              <button
                key={phrase.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectPhrase(phrase.id)}
                className={cn(
                  "min-h-11 min-w-11 rounded-lg border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all] motion-reduce:transition-none",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg hover:bg-raised",
                )}
              >
                {phrase.textKo}
                <span className="ml-1.5 font-normal text-fg-3">{phrase.labelKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 실시간 벡터 SVG 미리보기 */}
      <div className="rounded-xl border border-line bg-panel p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
          <span className="font-semibold text-fg">
            실시간 2중 외곽선 SVG 미리보기 ({model.style.labelKo} · {SFX_DISTORTION_LABELS[spec.distortion.mode]})
          </span>
          <span className="tabular-nums text-fg-3">
            컷 {spec.placement.cutId} · ({spec.placement.x}, {spec.placement.y}) · {spec.placement.width}×{spec.placement.height} · 회전 {spec.placement.rotationDeg}°
          </span>
        </div>
        <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-lg border border-line/70 bg-canvas p-2">
          <svg
            data-testid="sfx-typo-preview-svg"
            viewBox={`0 0 ${model.viewBoxWidth} ${model.viewBoxHeight}`}
            role="img"
            aria-label={`효과음 미리보기 ${spec.text}`}
            className="max-h-40 w-full max-w-md"
          >
            <defs>
              <linearGradient
                id={model.gradientId}
                gradientTransform={`rotate(${model.style.gradientAngleDeg} 0.5 0.5)`}
              >
                {model.style.fillGradientStops.map((stop) => (
                  <stop key={`${stop.offset}-${stop.color}`} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
            </defs>
            <g>
              {model.decorations.map((deco, idx) => {
                if (deco.kind === "line") {
                  return (
                    <line
                      key={`line-${idx}`}
                      x1={deco.x1}
                      y1={deco.y1}
                      x2={deco.x2}
                      y2={deco.y2}
                      stroke={deco.stroke}
                      strokeWidth={deco.strokeWidth}
                      strokeLinecap="round"
                      opacity={deco.opacity}
                    />
                  );
                }
                if (deco.kind === "circle") {
                  return (
                    <circle
                      key={`circle-${idx}`}
                      cx={deco.cx}
                      cy={deco.cy}
                      r={deco.r}
                      fill={deco.fill}
                      opacity={deco.opacity}
                    />
                  );
                }
                return (
                  <path
                    key={`path-${idx}`}
                    d={deco.d}
                    stroke={deco.stroke}
                    strokeWidth={deco.strokeWidth}
                    fill={deco.fill}
                    strokeLinecap="round"
                    opacity={deco.opacity}
                  />
                );
              })}
            </g>
            <g>
              {model.glyphs.map((glyph) => {
                const transform = `translate(${glyph.x} ${glyph.y}) rotate(${glyph.rotateDeg}) skewX(${glyph.skewXDeg}) skewY(${glyph.skewYDeg}) scale(${glyph.scaleX} ${glyph.scaleY})`;
                return (
                  <g key={`glyph-${glyph.index}`} transform={transform}>
                    <text
                      x={model.style.shadowOffsetX}
                      y={model.style.shadowOffsetY}
                      fontSize={glyph.fontSize}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily={model.style.fontFamily}
                      fontWeight={model.style.fontWeight}
                      fill={model.style.shadowColor}
                      opacity={0.34}
                    >
                      {glyph.char}
                    </text>
                    <text
                      x={0}
                      y={0}
                      fontSize={glyph.fontSize}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily={model.style.fontFamily}
                      fontWeight={model.style.fontWeight}
                      fill="none"
                      stroke={spec.doubleStroke.outerColor}
                      strokeWidth={spec.doubleStroke.outerWidth}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                    >
                      {glyph.char}
                    </text>
                    <text
                      x={0}
                      y={0}
                      fontSize={glyph.fontSize}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily={model.style.fontFamily}
                      fontWeight={model.style.fontWeight}
                      fill="none"
                      stroke={spec.doubleStroke.innerColor}
                      strokeWidth={spec.doubleStroke.innerWidth}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                    >
                      {glyph.char}
                    </text>
                    <text
                      x={0}
                      y={0}
                      fontSize={glyph.fontSize}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily={model.style.fontFamily}
                      fontWeight={model.style.fontWeight}
                      fill={`url(#${model.gradientId})`}
                    >
                      {glyph.char}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* 텍스트 입력 + 4종 스타일 선택 */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-fg-2">
          <span>효과음 원문 텍스트</span>
          <input
            type="text"
            aria-label="효과음 원문 텍스트"
            value={spec.text}
            maxLength={24}
            onChange={(event) => {
              const nextText = event.target.value;
              setSpec((prev) => ({
                ...prev,
                text: nextText || "쾅!",
                originalText: prev.locale === "ko" ? nextText || "쾅!" : prev.originalText,
              }));
            }}
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent"
          />
        </label>

        <div className="space-y-1">
          <span className="block text-xs font-semibold text-fg-2">타이포그래피 스타일 4종</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SFX_STYLE_PRESETS.map((preset) => {
              const selected = spec.styleId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  title={preset.summaryKo}
                  onClick={() => handleChangeStyle(preset.id)}
                  className={cn(
                    "min-h-11 rounded-lg border px-2.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all] motion-reduce:transition-none",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg hover:bg-raised",
                  )}
                >
                  {preset.labelKo}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 아치 · 원근 테이퍼 왜곡 & 2중 테두리 조절 */}
      <div className="space-y-3 border-t border-line/60 pt-3">
        <div className="space-y-1">
          <span className="block text-xs font-semibold text-fg-2">아치 · 3D 원근 테이퍼 왜곡</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DISTORTION_MODES.map((mode) => {
              const selected = spec.distortion.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setSpec((prev) => ({
                      ...prev,
                      distortion: { ...prev.distortion, mode },
                    }))
                  }
                  className={cn(
                    "min-h-11 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all] motion-reduce:transition-none",
                    selected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {SFX_DISTORTION_LABELS[mode]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-fg-2">
            <span className="flex justify-between">
              <span>아치 곡률</span>
              <span className="tabular-nums text-fg">{Math.round(spec.distortion.archStrength * 100)}%</span>
            </span>
            <input
              type="range"
              aria-label="아치 곡률"
              min={-100}
              max={100}
              step={5}
              value={Math.round(spec.distortion.archStrength * 100)}
              onChange={(event) =>
                setSpec((prev) => ({
                  ...prev,
                  distortion: { ...prev.distortion, archStrength: Number(event.target.value) / 100 },
                }))
              }
              className="min-h-11 w-full accent-accent"
            />
          </label>
          <label className="space-y-1 text-xs text-fg-2">
            <span className="flex justify-between">
              <span>원근 테이퍼 배율</span>
              <span className="tabular-nums text-fg">{spec.distortion.taperRatio.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              aria-label="원근 테이퍼 배율"
              min={50}
              max={180}
              step={5}
              value={Math.round(spec.distortion.taperRatio * 100)}
              onChange={(event) =>
                setSpec((prev) => ({
                  ...prev,
                  distortion: { ...prev.distortion, taperRatio: Number(event.target.value) / 100 },
                }))
              }
              className="min-h-11 w-full accent-accent"
            />
          </label>
          <label className="space-y-1 text-xs text-fg-2">
            <span className="flex justify-between">
              <span>2중 외곽선 두께</span>
              <span className="tabular-nums text-fg">
                {spec.doubleStroke.innerWidth} / {spec.doubleStroke.outerWidth}px
              </span>
            </span>
            <input
              type="range"
              aria-label="2중 외곽선 두께"
              min={8}
              max={26}
              step={1}
              value={spec.doubleStroke.outerWidth}
              onChange={(event) => {
                const outer = Number(event.target.value);
                setSpec((prev) => ({
                  ...prev,
                  doubleStroke: {
                    ...prev.doubleStroke,
                    outerWidth: outer,
                    innerWidth: Math.max(2, Math.round(outer * 0.48)),
                  },
                }));
              }}
              className="min-h-11 w-full accent-accent"
            />
          </label>
        </div>
      </div>

      {/* 번역 텍스트 교체 (스타일·배치 자동 보존) */}
      <div className="space-y-2 border-t border-line/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Languages className="size-4 text-accent" aria-hidden="true" />
            번역 효과음 교체 (스타일·배치 자동 보존)
          </span>
          <span className="text-xs tabular-nums text-fg-3">
            원문 "{spec.originalText}" · 자동 폭 보정 {Math.round(spec.localizedFitScale * 100)}%
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]">
          <select
            aria-label="번역 언어 선택"
            value={targetLocale}
            onChange={(event) => handleChangeTargetLocale(event.target.value as SfxLocaleCode)}
            className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg"
          >
            {SWAP_LOCALES.map((code) => (
              <option key={code} value={code}>
                {SFX_LOCALE_LABELS[code]}
              </option>
            ))}
          </select>

          <input
            type="text"
            aria-label="교체할 번역 효과음"
            value={swapInput}
            maxLength={28}
            onChange={(event) => setSwapInput(event.target.value)}
            placeholder="예: BOOM! / ドォン!"
            className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
          />

          <button
            type="button"
            onClick={handleSwapLocalized}
            className="min-h-11 rounded-lg border border-accent bg-accent px-3.5 text-xs font-bold text-on-accent transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]"
          >
            번역 교체 적용
          </button>

          <button
            type="button"
            onClick={handleRestoreOriginal}
            disabled={spec.text === spec.originalText && spec.locale === "ko"}
            className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg hover:bg-raised disabled:opacity-50 [word-break:keep-all]"
          >
            원문 복원
          </button>
        </div>
      </div>

      {/* 액션 바 */}
      <div className="flex flex-wrap gap-2 border-t border-line/60 pt-3">
        <button
          type="button"
          onClick={handleSaveStamp}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3.5 text-xs font-bold text-accent hover:bg-accent hover:text-on-accent"
        >
          <BookmarkPlus className="size-4" aria-hidden="true" />
          컷 스탬프 저장
        </button>
        <button
          type="button"
          onClick={() => void handleCopySvg()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3.5 text-xs font-semibold text-fg hover:bg-raised"
        >
          <Copy className="size-4" aria-hidden="true" />
          SVG 복사
        </button>
        <button
          type="button"
          onClick={handleDownloadSvg}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3.5 text-xs font-semibold text-fg hover:bg-raised"
        >
          <Download className="size-4" aria-hidden="true" />
          SVG 파일 저장
        </button>
      </div>

      {notice ? (
        <p role="status" className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg-2">
          {notice}
        </p>
      ) : null}

      {/* 로컬 저장된 스탬프 보관함 */}
      {savedStamps.length > 0 ? (
        <div className="space-y-2 border-t border-line/60 pt-3">
          <span className="block text-xs font-semibold text-fg-2">
            저장한 효과음 스탬프 ({savedStamps.length})
          </span>
          <ul className="grid gap-2 sm:grid-cols-2">
            {savedStamps.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => setSpec(item)}
                  className="min-h-11 min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs font-bold text-fg">{item.text}</span>
                  <span className="block text-[0.6875rem] tabular-nums text-fg-3">
                    {SFX_STYLE_PRESETS.find((s) => s.id === item.styleId)?.labelKo} · {SFX_DISTORTION_LABELS[item.distortion.mode]} · {item.locale.toUpperCase()}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`${item.text} 스탬프 삭제`}
                  onClick={() => handleDeleteStamp(item.id)}
                  className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 hover:border-bad hover:text-bad"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
