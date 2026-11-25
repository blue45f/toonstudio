import type { BalloonShapeId, ThoughtBubbleDot } from "./korean-balloon-typesetter";

function round2(value: number): number { return Math.round(value * 100) / 100; }

/** 5종 말풍선 SVG 벡터 외곽선 경로와 꼬리/구름 방울을 생성한다. */
export function buildBalloonSvgGeometry(
  shape: BalloonShapeId,
  widthPx: number,
  heightPx: number,
  tailSide: "left" | "right" | "none" = "left",
): { readonly outlinePath: string; readonly tailPath: string; readonly thoughtDots: readonly ThoughtBubbleDot[] } {
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  const rx = Math.max(24, widthPx / 2 - 10);
  const ry = Math.max(20, heightPx / 2 - 16);
  const dir = tailSide === "right" ? 1 : -1;

  if (shape === "caption") {
    const x = 10;
    const y = 12;
    const w = Math.max(40, widthPx - 20);
    const h = Math.max(36, heightPx - 24);
    const r = 6;
    const outlinePath = `M ${round2(x + r)} ${round2(y)} H ${round2(x + w - r)} Q ${round2(x + w)} ${round2(y)} ${round2(x + w)} ${round2(y + r)} V ${round2(y + h - r)} Q ${round2(x + w)} ${round2(y + h)} ${round2(x + w - r)} ${round2(y + h)} H ${round2(x + r)} Q ${round2(x)} ${round2(y + h)} ${round2(x)} ${round2(y + h - r)} V ${round2(y + r)} Q ${round2(x)} ${round2(y)} ${round2(x + r)} ${round2(y)} Z`;
    return { outlinePath, tailPath: "", thoughtDots: [] };
  }

  if (shape === "burst") {
    const spikes = 16;
    const points: string[] = [];
    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const boost = i % 2 === 0 ? 1.03 : 0.84;
      points.push(`${i === 0 ? "M" : "L"} ${round2(cx + Math.cos(angle) * rx * boost)} ${round2(cy + Math.sin(angle) * ry * boost)}`);
    }
    const tailPath =
      tailSide === "none"
        ? ""
        : `M ${round2(cx + dir * rx * 0.24)} ${round2(cy + ry * 0.78)} L ${round2(cx + dir * rx * 0.44)} ${round2(heightPx - 2)} L ${round2(cx + dir * rx * 0.08)} ${round2(cy + ry * 0.82)} Z`;
    return { outlinePath: `${points.join(" ")} Z`, tailPath, thoughtDots: [] };
  }

  if (shape === "thought") {
    const bumps = 12;
    const segs: string[] = [];
    for (let i = 0; i < bumps; i += 1) {
      const a0 = (i / bumps) * Math.PI * 2;
      const a1 = ((i + 1) / bumps) * Math.PI * 2;
      const aMid = (a0 + a1) / 2;
      if (i === 0) segs.push(`M ${round2(cx + Math.cos(a0) * rx * 0.92)} ${round2(cy + Math.sin(a0) * ry * 0.92)}`);
      segs.push(`Q ${round2(cx + Math.cos(aMid) * rx * 1.1)} ${round2(cy + Math.sin(aMid) * ry * 1.1)} ${round2(cx + Math.cos(a1) * rx * 0.92)} ${round2(cy + Math.sin(a1) * ry * 0.92)}`);
    }
    const thoughtDots: ThoughtBubbleDot[] =
      tailSide === "none"
        ? []
        : [
            { cx: round2(cx + dir * rx * 0.28), cy: round2(cy + ry * 0.96), r: 6.5 },
            { cx: round2(cx + dir * rx * 0.39), cy: round2(cy + ry * 1.07), r: 4.5 },
            { cx: round2(cx + dir * rx * 0.48), cy: round2(cy + ry * 1.15), r: 3.0 },
          ];
    return { outlinePath: `${segs.join(" ")} Z`, tailPath: "", thoughtDots };
  }

  const outlinePath = `M ${round2(cx - rx)} ${round2(cy)} A ${round2(rx)} ${round2(ry)} 0 1 0 ${round2(cx + rx)} ${round2(cy)} A ${round2(rx)} ${round2(ry)} 0 1 0 ${round2(cx - rx)} ${round2(cy)} Z`;
  const tailPath =
    tailSide === "none"
      ? ""
      : `M ${round2(cx + dir * rx * 0.16)} ${round2(cy + ry * 0.9)} Q ${round2(cx + dir * rx * 0.28)} ${round2(heightPx - 3)} ${round2(cx + dir * rx * 0.4)} ${round2(heightPx - 2)} Q ${round2(cx + dir * rx * 0.2)} ${round2(cy + ry * 0.96)} ${round2(cx + dir * rx * 0.04)} ${round2(cy + ry * 0.94)} Z`;
  return { outlinePath, tailPath, thoughtDots: [] };
}
