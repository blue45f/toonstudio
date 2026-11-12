import type { BgPrimitive } from "../studio-background-3d-metadata";

export type SketchUpUrbanComponentKind =
  | "storefront-awning"
  | "rooftop-mechanical"
  | "street-bus-shelter";

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

function makeUrbanPrim(
  id: string,
  name: string,
  kind: BgPrimitive["kind"],
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  color: string,
  tag: string,
  rotation: readonly [number, number, number] = [0, 0, 0],
): BgPrimitive {
  return {
    id,
    name,
    kind,
    position: [position[0], position[1], position[2]],
    rotation: [rotation[0], rotation[1], rotation[2]],
    scale: [scale[0], scale[1], scale[2]],
    color,
    tags: [tag],
  };
}

/**
 * 도심 스트리트 상가 파사드·옥상 설비·버스정류장 파라메트릭 건축 컴포넌트 빌더.
 */
export function buildSketchUpUrbanArchitecturalPrimitives(options: {
  readonly kind: SketchUpUrbanComponentKind;
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly depthMeters: number;
  readonly count: number;
}): { readonly labelKo: string; readonly primitives: readonly BgPrimitive[] } {
  const { kind, widthMeters: w, heightMeters: h, depthMeters: d, count } = options;
  const primitives: BgPrimitive[] = [];

  switch (kind) {
    case "storefront-awning": {
      const labelKo = "어닝·간판·쇼윈도 상가 파사드 (Storefront)";
      primitives.push(
        makeUrbanPrim("skp-arch-shop-wall", "Storefront_Main_Wall", "box", [0, round3(h * 0.5), 0], [round3(w), round3(h), round3(d * 0.45)], "#f1faee", "Arch_Storefront"),
        makeUrbanPrim("skp-arch-shop-sign", "Storefront_Sign_Fascia", "box", [0, round3(h * 0.86), round3(d * 0.25)], [round3(w * 0.96), round3(h * 0.18), 0.18], "#1d3557", "Arch_Storefront"),
        makeUrbanPrim("skp-arch-shop-awning", "Storefront_Sloped_Awning", "box", [0, round3(h * 0.68), round3(d * 0.42)], [round3(w * 0.94), 0.12, round3(Math.max(0.65, d * 0.35))], "#e63946", "Arch_Storefront", [0.24, 0, 0]),
      );
      const bayW = (w * 0.88) / count;
      for (let i = 0; i < count; i++) {
        const bx = (i - (count - 1) * 0.5) * bayW;
        primitives.push(
          makeUrbanPrim(`skp-arch-shop-glass-${i}`, `Storefront_Glass_Bay_${i + 1}`, "box", [round3(bx), round3(h * 0.34), round3(d * 0.24)], [round3(bayW * 0.86), round3(h * 0.52), 0.08], "#a8dadc", "Arch_Storefront"),
          makeUrbanPrim(`skp-arch-shop-mullion-${i}`, `Storefront_Mullion_${i + 1}`, "box", [round3(bx + bayW * 0.48), round3(h * 0.34), round3(d * 0.25)], [0.06, round3(h * 0.56), 0.12], "#457b9d", "Arch_Storefront"),
        );
      }
      return { labelKo, primitives };
    }
    case "rooftop-mechanical": {
      const labelKo = "옥상 실외기·물탱크·배관 클러스터 (Rooftop)";
      primitives.push(
        makeUrbanPrim("skp-arch-roof-curb", "Rooftop_Concrete_Pad", "box", [0, 0.1, 0], [round3(w), 0.2, round3(d)], "#adb5bd", "Arch_Rooftop"),
        makeUrbanPrim("skp-arch-roof-tank", "Rooftop_Water_Tank", "cylinder", [round3(-w * 0.26), round3(0.2 + h * 0.48), 0], [round3(Math.min(w, d) * 0.36), round3(h * 0.78), round3(Math.min(w, d) * 0.36)], "#457b9d", "Arch_Rooftop"),
        makeUrbanPrim("skp-arch-roof-tank-dome", "Rooftop_Tank_Cap", "hemisphere", [round3(-w * 0.26), round3(0.2 + h * 0.87), 0], [round3(Math.min(w, d) * 0.36), round3(h * 0.18), round3(Math.min(w, d) * 0.36)], "#6c757d", "Arch_Rooftop"),
        makeUrbanPrim("skp-arch-roof-duct", "Rooftop_Main_Duct_Pipe", "cylinder", [0, round3(0.28 + h * 0.22), round3(-d * 0.32)], [0.22, round3(w * 0.88), 0.22], "#ced4da", "Arch_Rooftop", [0, 0, Math.PI / 2]),
      );
      const unitCount = clamp(count, 2, 6);
      for (let i = 0; i < unitCount; i++) {
        const uz = (i - (unitCount - 1) * 0.5) * ((d * 0.72) / Math.max(1, unitCount - 1));
        primitives.push(
          makeUrbanPrim(`skp-arch-roof-hvac-${i}`, `Rooftop_HVAC_Unit_${i + 1}`, "box", [round3(w * 0.24), round3(0.2 + h * 0.26), round3(uz)], [round3(w * 0.32), round3(h * 0.44), round3((d * 0.55) / unitCount)], "#dee2e6", "Arch_Rooftop"),
          makeUrbanPrim(`skp-arch-roof-fan-${i}`, `Rooftop_Fan_Shroud_${i + 1}`, "torus", [round3(w * 0.41), round3(0.2 + h * 0.28), round3(uz)], [0.28, 0.28, 0.08], "#343a40", "Arch_Rooftop", [0, Math.PI / 2, 0]),
        );
      }
      return { labelKo, primitives };
    }
    case "street-bus-shelter": {
      const labelKo = "현대식 유리 버스정류장 쉘터 (Bus Shelter)";
      primitives.push(
        makeUrbanPrim("skp-arch-bus-deck", "BusShelter_Platform", "box", [0, 0.08, 0], [round3(w), 0.16, round3(d)], "#ced4da", "Arch_BusShelter"),
        makeUrbanPrim("skp-arch-bus-canopy", "BusShelter_Canopy_Roof", "box", [0, round3(h), 0], [round3(w * 1.06), 0.14, round3(d * 1.08)], "#2b2d42", "Arch_BusShelter"),
        makeUrbanPrim("skp-arch-bus-bench", "BusShelter_Seat_Bench", "box", [round3(-w * 0.12), 0.48, round3(-d * 0.18)], [round3(w * 0.58), 0.1, 0.42], "#bc6c25", "Arch_BusShelter"),
        makeUrbanPrim("skp-arch-bus-adbox", "BusShelter_Ad_Lightbox", "box", [round3(w * 0.44), round3(h * 0.52), 0], [0.16, round3(h * 0.82), round3(d * 0.78)], "#4cc9f0", "Arch_BusShelter"),
        makeUrbanPrim("skp-arch-bus-totem", "BusShelter_Arrival_Totem", "box", [round3(-w * 0.46), round3(h * 0.55), round3(d * 0.38)], [0.28, round3(h * 0.92), 0.14], "#1d3557", "Arch_BusShelter"),
      );
      for (let i = 0; i < Math.min(count, 5); i++) {
        const gx = (i - (Math.min(count, 5) - 1) * 0.5) * ((w * 0.75) / Math.max(1, Math.min(count, 5) - 1));
        primitives.push(
          makeUrbanPrim(`skp-arch-bus-glass-${i}`, `BusShelter_BackGlass_${i + 1}`, "box", [round3(gx), round3(h * 0.52), round3(-d * 0.42)], [round3((w * 0.72) / Math.min(count, 5)), round3(h * 0.78), 0.05], "#a8dadc", "Arch_BusShelter"),
        );
      }
      return { labelKo, primitives };
    }
  }
}

/**
 * SketchUp LayOut 스타일 2D 벡터 단면도(Section Cutaway + Poché) SVG 생성기.
 */
export function buildSketchUpLayOutVectorCutawaySvg(options: {
  readonly title: string;
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly sectionElevationMeters: number;
  readonly pocheFillHex?: string;
}): { readonly svg: string; readonly byteLength: number } {
  const fill = options.pocheFillHex ?? "#262626";
  const wPx = Math.round(options.widthMeters * 80);
  const hPx = Math.round(options.heightMeters * 80);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wPx + 120} ${hPx + 120}" width="${wPx + 120}" height="${hPx + 120}">`,
    `  <rect width="100%" height="100%" fill="#ffffff"/>`,
    `  <g transform="translate(60,60)">`,
    `    <rect x="0" y="0" width="${wPx}" height="${hPx}" fill="none" stroke="#000000" stroke-width="3"/>`,
    `    <rect x="16" y="16" width="${Math.max(20, wPx - 32)}" height="${Math.max(20, hPx - 32)}" fill="${fill}" fill-opacity="0.18" stroke="#000000" stroke-width="2"/>`,
    `    <text x="12" y="-16" font-family="monospace" font-size="14" fill="#111111">${options.title} — Section @ EL +${options.sectionElevationMeters.toFixed(2)}m</text>`,
    `  </g>`,
    `</svg>`,
  ].join("\n");
  return {
    svg,
    byteLength: new TextEncoder().encode(svg).byteLength,
  };
}
