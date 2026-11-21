import { Suspense, useId, useState, type CSSProperties } from "react";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { studioCharacterStaticAsset } from "./studio-virtual-space-character-assets";
import { studioCharacterBustFrame, studioCharacterPreviewFrame } from "./studio-virtual-space-character-preview";
import type { StudioCharacterMotionState, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import "./studio-virtual-space-character-preview.css";

const LazyStudioScene3dExpansionPanel = lazyRetry(
  () =>
    import("../scene3d-expansion-pro/StudioScene3dExpansionPanel").then((module) => ({
      default: module.StudioScene3dExpansionPanel,
    })),
  "StudioScene3dExpansionPanel",
);

export function StudioVirtualCharacterPreview({ skin, facing = "down", motion = "idle", frameIndex, crop = "frame", className, style, alt = "" }: {
  readonly skin: StudioCharacterSkin;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly motion?: StudioCharacterMotionState;
  /**
   * 표시할 시트 프레임 인덱스 강제 지정 (예: 프로시저럴 시트의 idle 호흡 프레임).
   * 생략하면 skin의 idleFrames/클립에서 계산된 기본 프레임을 사용한다.
   */
  readonly frameIndex?: number;
  /**
   * "bust"면 프레임 전체가 아니라 머리·어깨만 잘라 보여 준다(NPC 대화 초상화).
   * atlas형은 viewBox 크롭, 단일 이미지형은 CSS 확대 크롭(studio-character-preview--bust)으로 처리한다.
   */
  readonly crop?: "frame" | "bust";
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly alt?: string;
}) {
  const clipId = useId();
  const [expansionOpen, setExpansionOpen] = useState(false);
  const base = studioCharacterStaticAsset(skin, facing, motion);
  const asset = frameIndex !== undefined && Number.isSafeInteger(frameIndex) && frameIndex >= 0
    ? { ...base, frame: frameIndex }
    : base;
  const bust = crop === "bust";
  const classes = ["studio-character-preview", bust ? "studio-character-preview--bust" : undefined, className].filter(Boolean).join(" ");
  const frame = asset.type === "image" && !skin.sharedAtlas ? null : studioCharacterPreviewFrame(asset);
  const viewFrame = bust ? (frame ? studioCharacterBustFrame(asset) : null) : frame;
  // 축소 사본은 원본과 같은 비율이라 같은 좌표계(atlas 크기)에 늘려 그려도 칸 좌표가 그대로 맞는다. 원본 시트를 쓰는 자산에만 적용한다.
  const previewHref = skin.previewTextureUrl && asset.url === skin.directional[facing] ? skin.previewTextureUrl : asset.url;
  const previewNode = asset.type === "image" && !skin.sharedAtlas
    ? <img className={classes} style={style} src={asset.url} alt={alt} draggable={false} decoding="async" data-character-crop={bust ? "bust" : undefined} />
    : <svg className={classes} style={style} viewBox={viewFrame ? `${viewFrame.x} ${viewFrame.y} ${viewFrame.width} ${viewFrame.height}` : "0 0 1 1"}
      preserveAspectRatio={bust ? "xMidYMid slice" : "xMidYMax meet"} overflow="hidden" focusable="false" role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined}
      data-character-sheet={skin.key} data-character-art-style={skin.nativeArtStyle} data-character-pixel-art={skin.pixelArt}
      data-character-frame={frame?.index} data-character-crop={bust ? "bust" : undefined} data-character-invalid={!frame || undefined}>
      {viewFrame && asset.atlas ? <>
        <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={viewFrame.x} y={viewFrame.y} width={viewFrame.width} height={viewFrame.height} /></clipPath></defs>
        <image href={previewHref} x="0" y="0" width={asset.atlas.width} height={asset.atlas.height} preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
      </> : null}
    </svg>;
  return (
    <>
      {previewNode}
      <details
        data-testid="studio-scene3d-expansion-disclosure"
        className="mt-2 rounded-xl border border-line bg-panel p-2 text-left"
        onToggle={(event) => setExpansionOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-fg">
          <span className="min-w-0 [word-break:keep-all]">
            3D 웹툰 확장 7선: 선화 추출 · 히어로 렌즈 · 커플 자석 포즈 · Face SDF · 계절/데칼 · 사진 포즈 복제
          </span>
        </summary>
        {expansionOpen ? (
          <div className="mt-2 border-t border-line pt-2">
            <Suspense
              fallback={
                <div role="status" className="rounded-lg border border-line bg-card p-3 text-xs text-fg-2">
                  3D 웹툰 확장 7선 작업실을 불러오는 중입니다.
                </div>
              }
            >
              <LazyStudioScene3dExpansionPanel />
            </Suspense>
          </div>
        ) : null}
      </details>
    </>
  );
}
