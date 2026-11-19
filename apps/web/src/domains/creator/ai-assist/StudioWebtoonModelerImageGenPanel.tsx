import { Camera, ImagePlus, Layers, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  WEBTOON_ART_STYLES,
  compileWebtoonModelerToImageGen,
  createDefaultWebtoonModelerScene,
  type CompiledWebtoonImageGenRequest,
  type WebtoonArtStyleId,
  type WebtoonCameraShot,
  type WebtoonCutAspectRatio,
  type WebtoonLightingPreset,
  type WebtoonModelerSceneSpec,
} from "./webtoon-modeler-imagegen";

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

  const compiled = useMemo(() => compileWebtoonModelerToImageGen(scene), [scene]);

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
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
      aria-label="웹툰 모델러 및 이미지 생성 패널"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium tracking-tight text-fg">웹툰 컷 모델러 · AI 이미지 생성</h3>
        </div>
        <span className="rounded-md border border-line bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-fg-2">
          {compiled.width}×{compiled.height} · {compiled.renderPasses.length}패스
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_216px]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span>웹툰 화풍</span>
              <select
                value={scene.artStyle}
                onChange={(e) =>
                  setScene((prev) => ({ ...prev, artStyle: e.target.value as WebtoonArtStyleId }))
                }
                className="h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
              >
                {WEBTOON_ART_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span>컷 비율</span>
              <select
                value={scene.aspectRatio}
                onChange={(e) =>
                  setScene((prev) => ({
                    ...prev,
                    aspectRatio: e.target.value as WebtoonCutAspectRatio,
                  }))
                }
                className="h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
              >
                {ASPECT_OPTIONS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span>카메라 샷</span>
              <select
                value={scene.cameraShot}
                onChange={(e) =>
                  setScene((prev) => ({
                    ...prev,
                    cameraShot: e.target.value as WebtoonCameraShot,
                  }))
                }
                className="h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
              >
                {CAMERA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span>조명 프리셋</span>
              <select
                value={scene.lighting}
                onChange={(e) =>
                  setScene((prev) => ({
                    ...prev,
                    lighting: e.target.value as WebtoonLightingPreset,
                  }))
                }
                className="h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
              >
                {LIGHTING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelKo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-fg-2">
            <span>배경 연출 프롬프트</span>
            <input
              type="text"
              value={scene.backgroundPrompt}
              onChange={(e) => setScene((prev) => ({ ...prev, backgroundPrompt: e.target.value }))}
              className="h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tabular-nums text-fg-2">
                배치 캐릭터 ({scene.characters.length}명)
              </span>
              <button
                type="button"
                onClick={handleAddCharacter}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised"
              >
                <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                캐릭터 추가
              </button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {scene.characters.map((ch) => (
                <li
                  key={ch.id}
                  className="flex h-9 items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 text-xs"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-medium text-fg">{ch.name}</span>{" "}
                    <span className="text-fg-3">({ch.consistencySeed}) · {ch.pose}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`${ch.name} 제거`}
                    onClick={() => handleRemoveCharacter(ch.id)}
                    className="text-fg-3 transition-colors duration-150 hover:text-bad"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-canvas p-2">
          <div
            className="w-full overflow-hidden rounded-md border border-line"
            aria-label="웹툰 모델러 컷 프리뷰"
            dangerouslySetInnerHTML={{ __html: compiled.previewSvg }}
          />
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90"
          >
            <ImagePlus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            웹툰 컷 생성 ({compiled.renderPasses.length}패스)
          </button>
          {historyCount > 0 && (
            <p className="inline-flex items-center gap-1 text-xs tabular-nums text-good" role="status">
              <Layers className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              생성 요청 {historyCount}건 전송됨
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
