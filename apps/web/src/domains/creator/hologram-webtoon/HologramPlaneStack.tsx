import type { CSSProperties } from "react";

import { HologramSceneLayerArt } from "./HologramSceneArtwork";
import type { HologramDemoScenePreset } from "./hologram-demo-scenes";
import type { HologramLayerSpec, HologramLayerTransform } from "./hologram-spatial-projection";

export interface HologramPlaneStackProps {
  readonly scene: HologramDemoScenePreset;
  readonly layers: readonly HologramLayerSpec[];
  readonly transforms: readonly HologramLayerTransform[];
  readonly locale: "ko" | "en";
  readonly idPrefix: string;
  readonly showPrismaticSheen?: boolean;
  readonly holofoilIntensity?: number;
  readonly eyeXMm?: number;
  readonly eyeYMm?: number;
  readonly reducedMotion?: boolean;
}

function buildLayerTransformCss(transform: HologramLayerTransform, reducedMotion: boolean): string {
  if (reducedMotion) {
    return "translate3d(0px, 0px, 0px) scale(1)";
  }
  return [
    `translate3d(${transform.translateX}px, ${transform.translateY}px, ${transform.effectiveZMm * 0.25}px)`,
    `rotateX(${transform.rotateX}deg)`,
    `rotateY(${transform.rotateY}deg)`,
    `scale(${transform.scale})`,
  ].join(" ");
}

function buildLayerFilterCss(transform: HologramLayerTransform, reducedMotion: boolean): string | undefined {
  if (reducedMotion) return undefined;
  const parts: string[] = [];
  if (transform.depthBlurPx > 0.05) {
    parts.push(`blur(${transform.depthBlurPx.toFixed(2)}px)`);
  }
  if (transform.prismaticShiftPx > 0.1) {
    const shift = Math.min(transform.prismaticShiftPx * 0.35, 3.2).toFixed(2);
    parts.push(`drop-shadow(${shift}px 0 0 color-mix(in oklch, var(--color-cool) 42%, transparent))`);
    parts.push(`drop-shadow(-${shift}px 0 0 color-mix(in oklch, var(--color-accent) 38%, transparent))`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function HologramPlaneStack({
  scene,
  layers,
  transforms,
  locale,
  idPrefix,
  showPrismaticSheen = false,
  holofoilIntensity = 0.65,
  eyeXMm = 0,
  eyeYMm = 0,
  reducedMotion = false,
}: HologramPlaneStackProps): React.JSX.Element {
  const transformById = new Map<string, HologramLayerTransform>();
  for (const item of transforms) {
    transformById.set(item.layerId, item);
  }

  const sheenAngleDeg = Math.round(125 + eyeXMm * 0.18 - eyeYMm * 0.15);
  const sheenOpacity = reducedMotion ? 0 : Number((holofoilIntensity * 0.42).toFixed(3));
  const sheenStyle = {
    "--holo-sheen-angle": `${sheenAngleDeg}deg`,
    "--holo-sheen-opacity": String(sheenOpacity),
  } as CSSProperties;

  return (
    <div className="holo-viewport-scene">
      {layers.map((layer) => {
        if (layer.visible === false) return null;
        const transform = transformById.get(layer.id);
        if (!transform) return null;

        const layerStyle: CSSProperties = {
          zIndex: transform.zIndex,
          opacity: layer.opacity ?? 1,
          transform: buildLayerTransformCss(transform, reducedMotion),
          filter: buildLayerFilterCss(transform, reducedMotion),
        };

        return (
          <div
            key={layer.id}
            className="holo-plane-layer"
            data-plane-role={layer.role}
            data-effective-z-mm={transform.effectiveZMm}
            data-translate-x={transform.translateX}
            data-translate-y={transform.translateY}
            style={layerStyle}
          >
            <HologramSceneLayerArt
              scene={scene}
              role={layer.role}
              locale={locale}
              idPrefix={`${idPrefix}-${layer.role}`}
            />
          </div>
        );
      })}
      {showPrismaticSheen ? (
        <div className="holo-prism-sheen" style={sheenStyle} aria-hidden="true" />
      ) : null}
    </div>
  );
}
