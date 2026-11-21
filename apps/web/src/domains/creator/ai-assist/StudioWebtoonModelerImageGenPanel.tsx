import { Camera, Check, Copy, ImagePlus, Layers, Plus, Sparkles, Trash2 } from "lucide-react";
import React, { Suspense, useId, useMemo, useState } from "react";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";

import {
  WEBTOON_ART_STYLES,
  compileWebtoonModelerToImageGen,
  createDefaultWebtoonModelerScene,
  getWebtoonArtStyle,
  type CompiledWebtoonImageGenRequest,
  type WebtoonCameraShot,
  type WebtoonCutAspectRatio,
  type WebtoonLightingPreset,
  type WebtoonModelerSceneSpec,
} from "./webtoon-modeler-imagegen";

const LazyStudioVisualAi4SuitesPanel = React.lazy(
  () => import("../ai-creative-suites/StudioVisualAi4SuitesPanel"),
);

export interface StudioWebtoonModelerImageGenPanelProps {
  readonly onGenerateCutImage?: (request: CompiledWebtoonImageGenRequest) => void;
}

const ASPECT_OPTIONS: readonly WebtoonCutAspectRatio[] = ["9:16", "4:5", "1:1", "16:9"];
const CAMERA_OPTIONS: readonly { value: WebtoonCameraShot; labelKo: string }[] = [
  { value: "extreme-closeup", labelKo: "익스트림 클로즈업" },
  { value: "bust-shot", labelKo: "바스트 샷" },
  { value: "waist-shot", labelKo: "웨이스트 샷" },
  { value: "full-body", labelKo: "전신 샷" },
  { value: "low-angle-hero", labelKo: "로우 앵글(영웅)" },
  { value: "high-angle-dramatic", labelKo: "하이 앵글(부감)" },
  { value: "over-the-shoulder", labelKo: "오버 더 숄더" },
];
const LIGHTING_OPTIONS: readonly { value: WebtoonLightingPreset; labelKo: string }[] = [
  { value: "sunlit-window", labelKo: "창가 자연광" },
  { value: "golden-hour-rim", labelKo: "노을 역광 림라이트" },
  { value: "moonlit-blue", labelKo: "달빛 블루" },
  { value: "neon-cyber", labelKo: "네온 사이버" },
  { value: "dramatic-chiaroscuro", labelKo: "극적 명암" },
  { value: "soft-studio-flat", labelKo: "스튜디오 균일광" },
];

export function StudioWebtoonModelerImageGenPanel({
  onGenerateCutImage,
}: StudioWebtoonModelerImageGenPanelProps) {
  const [scene, setScene] = useState<WebtoonModelerSceneSpec>(() =>
    createDefaultWebtoonModelerScene(),
  );
  const [historyCount, setHistoryCount] = useState(0);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [visualSuitesLabOpen, setVisualSuitesLabOpen] = useState(false);
  const previewGradientId = useId();

  const compiled = useMemo(() => compileWebtoonModelerToImageGen(scene), [scene]);
  const artStyleMeta = useMemo(() => getWebtoonArtStyle(scene.artStyle), [scene.artStyle]);
  const previewViewBox = useMemo(() => {
    const vw = 360;
    const vh = Math.max(1, Math.round((vw * compiled.height) / Math.max(1, compiled.width)));
    return { vw, vh };
  }, [compiled.height, compiled.width]);

  const handleAddCharacter = () => {
    const nextIdx = scene.characters.length + 1;
    setScene((prev) => ({
      ...prev,
      characters: [
        ...prev.characters,
        {
          id: `char-${nextIdx}`,
          name: `등장인물 ${nextIdx}`,
          consistencySeed: `CHAR-SEED-${nextIdx}`,
          pose: "대화 자세",
          expression: "미소",
          x: Math.min(0.82, 0.25 + nextIdx * 0.2),
          y: 0.6,
          scale: 0.92,
        },
      ],
    }));
  };

  const handleRemoveCharacter = (id: string) => {
    setScene((prev) => ({
      ...prev,
      characters: prev.characters.filter((ch) => ch.id !== id),
    }));
  };

  const handleGenerate = () => {
    onGenerateCutImage?.(compiled);
    setHistoryCount((c) => c + 1);
    void studioEcosystemClient
      .compileModelerCut({
        artStyle: scene.artStyle,
        cameraShot: scene.cameraShot,
        lighting: scene.lighting,
        backgroundPrompt: scene.backgroundPrompt,
        preserveLineartPass: scene.preserveLineartPass,
      })
      .then((res) => {
        if (res?.renderPasses?.length) {
          setSyncLabel(`서버 컴파일 완료 (${res.renderPasses.length}패스)`);
        }
      })
      .catch(() => {
        setSyncLabel("로컬 컴파일 완료");
      });
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [overflow-wrap:break-word] [word-break:keep-all] sm:p-5"
      aria-label="웹툰 모델러 및 이미지 생성 패널"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Camera className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg">
            웹툰 컷 모델러 · AI 이미지 생성
          </h3>
        </div>
        <span className="rounded-md border border-line bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-fg-2">
          {compiled.width}×{compiled.height} · {compiled.renderPasses.length}패스
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="order-2 flex min-w-0 flex-col gap-3 md:order-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs leading-[1.4] text-fg-2">
              <span>웹툰 화풍</span>
              <select
                value={scene.artStyle}
                onChange={(e) => {
                  const matched = WEBTOON_ART_STYLES.find((style) => style.id === e.target.value);
                  if (matched) setScene((prev) => ({ ...prev, artStyle: matched.id }));
                }}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9"
              >
                {WEBTOON_ART_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs leading-[1.4] text-fg-2">
              <span>컷 비율</span>
              <select
                value={scene.aspectRatio}
                onChange={(e) => {
                  const matched = ASPECT_OPTIONS.find((ratio) => ratio === e.target.value);
                  if (matched) setScene((prev) => ({ ...prev, aspectRatio: matched }));
                }}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9"
              >
                {ASPECT_OPTIONS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs leading-[1.4] text-fg-2">
              <span>카메라 샷</span>
              <select
                value={scene.cameraShot}
                onChange={(e) => {
                  const matched = CAMERA_OPTIONS.find((opt) => opt.value === e.target.value);
                  if (matched) setScene((prev) => ({ ...prev, cameraShot: matched.value }));
                }}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9"
              >
                {CAMERA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs leading-[1.4] text-fg-2">
              <span>조명 프리셋</span>
              <select
                value={scene.lighting}
                onChange={(e) => {
                  const matched = LIGHTING_OPTIONS.find((opt) => opt.value === e.target.value);
                  if (matched) setScene((prev) => ({ ...prev, lighting: matched.value }));
                }}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9"
              >
                {LIGHTING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelKo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs leading-[1.4] text-fg-2">
            <span>배경 연출 프롬프트</span>
            <input
              type="text"
              value={scene.backgroundPrompt}
              onChange={(e) => setScene((prev) => ({ ...prev, backgroundPrompt: e.target.value }))}
              className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tabular-nums text-fg-2">
                배치 캐릭터 ({scene.characters.length}명)
              </span>
              <button
                type="button"
                onClick={handleAddCharacter}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-8"
              >
                <Plus className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                캐릭터 추가
              </button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {scene.characters.map((ch) => (
                <li
                  key={ch.id}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-xs sm:min-h-9"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-medium text-fg">{ch.name}</span>{" "}
                    <span className="text-fg-3">({ch.consistencySeed}) · {ch.pose}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`${ch.name} 제거`}
                    onClick={() => handleRemoveCharacter(ch.id)}
                    className="grid min-h-11 min-w-11 shrink-0 place-items-center text-fg-3 transition-colors duration-150 hover:text-bad sm:min-h-8 sm:min-w-8"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="order-1 flex flex-col items-center gap-2.5 rounded-lg border border-line bg-canvas p-2.5 md:order-2">
          <div
            className="max-w-[240px] w-full overflow-hidden rounded-md border border-line md:max-w-none"
            aria-label="웹툰 모델러 컷 프리뷰"
          >
            {/* 문자열 HTML 삽입 대신 React 선언적 SVG로 프리뷰를 렌더링해 DOM XSS 경로를 차단한다. */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox={`0 0 ${previewViewBox.vw} ${previewViewBox.vh}`}
              width={previewViewBox.vw}
              height={previewViewBox.vh}
              className="block h-auto w-full"
            >
              <defs>
                <linearGradient id={previewGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={artStyleMeta.paletteHex[0]} />
                  <stop offset="100%" stopColor={artStyleMeta.paletteHex[1]} stopOpacity="0.35" />
                </linearGradient>
              </defs>
              <rect
                x={0}
                y={0}
                width={previewViewBox.vw}
                height={previewViewBox.vh}
                fill={`url(#${previewGradientId})`}
              />
              <line
                x1={0}
                y1={Math.round(previewViewBox.vh * 0.68)}
                x2={previewViewBox.vw}
                y2={Math.round(previewViewBox.vh * 0.68)}
                stroke={artStyleMeta.paletteHex[2]}
                strokeDasharray="6 4"
                opacity={0.35}
              />
              {scene.characters.map((ch) => {
                const cx = Math.round(Math.min(0.9, Math.max(0.1, ch.x)) * previewViewBox.vw);
                const cy = Math.round(Math.min(0.88, Math.max(0.2, ch.y)) * previewViewBox.vh);
                const rHead = Math.round(22 * ch.scale);
                const bodyW = Math.round(62 * ch.scale);
                const bodyH = Math.round(110 * ch.scale);
                return (
                  <g key={ch.id} data-character-id={ch.id}>
                    <rect
                      x={cx - bodyW / 2}
                      y={cy}
                      width={bodyW}
                      height={bodyH}
                      rx={18}
                      fill={artStyleMeta.paletteHex[1]}
                      stroke={artStyleMeta.paletteHex[2]}
                      strokeWidth={2.5}
                      opacity={0.88}
                    />
                    <circle
                      cx={cx}
                      cy={cy - rHead - 4}
                      r={rHead}
                      fill={artStyleMeta.paletteHex[0]}
                      stroke={artStyleMeta.paletteHex[2]}
                      strokeWidth={2.5}
                    />
                    <text
                      x={cx}
                      y={cy + bodyH + 18}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill={artStyleMeta.paletteHex[2]}
                    >
                      {ch.name}
                    </text>
                  </g>
                );
              })}
              <rect
                x={10}
                y={10}
                width={previewViewBox.vw - 20}
                height={28}
                rx={6}
                className="fill-card"
                opacity={0.86}
              />
              <text x={20} y={28} fontSize={11} className="fill-fg">
                {`${artStyleMeta.labelKo} · ${scene.aspectRatio} · ${scene.cameraShot}`}
              </text>
            </svg>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-9"
          >
            <ImagePlus className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            웹툰 컷 생성 ({compiled.renderPasses.length}패스)
          </button>
          {historyCount > 0 && (
            <p className="inline-flex items-center gap-1 text-xs tabular-nums text-good" role="status">
              <Layers className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              생성 요청 {historyCount}건 전송됨{syncLabel ? ` · ${syncLabel}` : ""}
            </p>
          )}
        </div>
      </div>

      <details className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium text-fg-2 sm:min-h-8 [&::-webkit-details-marker]:hidden">
          <span>컴파일된 생성 프롬프트 · 4패스 스펙</span>
          <span className="tabular-nums text-fg-3">{compiled.renderPasses.join(" → ")}</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2.5">
          <p className="rounded-md border border-line bg-panel p-2.5 font-mono text-[11px] leading-[1.55] text-fg [word-break:normal]">
            {compiled.positivePrompt}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(compiled.positivePrompt).catch(() => {});
              setCopiedPrompt(true);
            }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-8 sm:w-auto sm:self-end"
          >
            {copiedPrompt ? (
              <Check className="size-3.5 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Copy className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            )}
            {copiedPrompt ? "프롬프트 복사됨" : "프롬프트 복사"}
          </button>
        </div>
      </details>

      <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
        <button
          type="button"
          aria-expanded={visualSuitesLabOpen}
          onClick={() => setVisualSuitesLabOpen((prev) => !prev)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left font-medium text-fg transition-colors duration-150 hover:text-accent"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Sparkles className="size-3.5 shrink-0 text-accent" strokeWidth={1.6} aria-hidden="true" />
            <span>비주얼 AI 4대 스튜디오 랩 (Firefly · CSP · Krita/ComfyUI · AI 페인터)</span>
          </span>
          <span className="shrink-0 text-fg-3">{visualSuitesLabOpen ? "접기" : "펼치기"}</span>
        </button>
        {visualSuitesLabOpen ? (
          <div className="mt-3 border-t border-line pt-3">
            <Suspense
              fallback={
                <p className="py-2 text-xs text-fg-3">비주얼 AI 4대 스튜디오 랩을 불러오는 중…</p>
              }
            >
              <LazyStudioVisualAi4SuitesPanel />
            </Suspense>
          </div>
        ) : null}
      </div>
    </section>
  );
}
