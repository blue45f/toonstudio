/**
 * VARCO 3D 한국형 웹툰 소품(21종) 및 아이소메트릭 디오라마(22종) 다중 파츠 프로시저럴 빌더.
 *
 * 단일 박스 플레이스홀더를 대체하여, 각 소품은 대표(Anchor) 1개 + 세부 구조 파츠 4~7개로,
 * 각 디오라마는 컷어웨이 3면 쉘 + 걸레받이·코니스 몰딩 + REA 천장 조명·창호 + 장르별 시그니처 구조물로
 * 합성해 실제 웹툰 배경 원고에 즉시 사용할 수 있는 밀도를 제공한다.
 */

import {
  STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES,
  STUDIO_ASSET3D_LOCAL_GLB_ASSETS,
  STUDIO_ASSET3D_WEBTOON_PROP_ASSETS,
  type StudioAsset3dIsometricDioramaEntry,
  type StudioAsset3dWebtoonPropEntry,
} from "../scene-3d/studio-asset3d-character-lab-diorama-catalog";
import {
  makeReaBg3dPrim,
  STUDIO_BG3D_REA_COMPETITOR_PROFILES,
  type Bg3dGlbItem,
  type Bg3dPrimitiveItem,
  type Bg3dPrimitiveShape,
  type StudioBg3dReaCompetitorId,
  type StudioBg3dReaCompetitorProfile,
  type Vec3,
} from "./studio-bg3d-rea-webtoon-background-engine";

interface SubPartBlueprint {
  readonly suffix: string;
  readonly shape: Bg3dPrimitiveShape;
  readonly relPos: Vec3;
  readonly relScale: Vec3;
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly rotation?: Vec3;
}

/**
 * VARCO 3D 한국형 웹툰 소품 21종을 단일 박스 대신 실제 웹툰 원고에 즉시 쓸 수 있는
 * 다중 파츠(Anchor 1개 + 세부 구조물 4~7개)로 생성한다.
 *
 * 중요 불변식:
 * - 각 소품당 정확히 1개의 대표(anchor) 프리미티브만 `tags: ["varco3d-prop", prop.category, prop.id]`를 가진다.
 * - 나머지 세부 파츠는 `tags: ["varco3d-prop-detail", prop.category, prop.id]`를 가진다.
 */
export function buildAsset3dPropDetailedPrimitives(
  prop: StudioAsset3dWebtoonPropEntry,
  anchorCenterXZ: readonly [number, number],
  idPrefix = "varco-prop",
): readonly Bg3dPrimitiveItem[] {
  const [cx, cz] = anchorCenterXZ;
  const [fw, fd, fh] = prop.footprintMeters;
  const compRef = { id: `varco3d-prop:${prop.id}`, name: prop.labelKo };
  const anchorTag = ["varco3d-prop", prop.category, prop.id] as const;
  const detailTag = ["varco3d-prop-detail", prop.category, prop.id] as const;
  const baseId = `${idPrefix}-${prop.id}`;

  const emit = (
    anchor: {
      shape: Bg3dPrimitiveShape;
      pos: Vec3;
      scale: Vec3;
      color: string;
      roughness?: number;
      metalness?: number;
    },
    details: readonly SubPartBlueprint[],
  ): readonly Bg3dPrimitiveItem[] => {
    const items: Bg3dPrimitiveItem[] = [
      makeReaBg3dPrim(
        baseId,
        anchor.shape,
        anchor.pos,
        anchor.scale,
        anchor.color,
        anchor.roughness ?? 0.5,
        anchor.metalness ?? 0.12,
        anchorTag,
        compRef,
      ),
    ];
    for (const d of details) {
      items.push(
        makeReaBg3dPrim(
          `${baseId}-${d.suffix}`,
          d.shape,
          [cx + d.relPos[0], d.relPos[1], cz + d.relPos[2]],
          d.relScale,
          d.color,
          d.roughness,
          d.metalness,
          detailTag,
          compRef,
          d.rotation ?? [0, 0, 0],
        ),
      );
    }
    return items;
  };

  switch (prop.id) {
    case "prop_school_desk_chair":
      return emit(
        { shape: "box", pos: [cx, 0.73, cz - 0.12], scale: [0.68, 0.05, 0.48], color: "#d4a373", roughness: 0.45, metalness: 0.08 },
        [
          { suffix: "book-box", shape: "box", relPos: [0, 0.64, -0.12], relScale: [0.58, 0.11, 0.4], color: "#94a3b8", roughness: 0.4, metalness: 0.45 },
          { suffix: "desk-leg-l", shape: "box", relPos: [-0.28, 0.36, -0.12], relScale: [0.05, 0.7, 0.42], color: "#64748b", roughness: 0.35, metalness: 0.6 },
          { suffix: "desk-leg-r", shape: "box", relPos: [0.28, 0.36, -0.12], relScale: [0.05, 0.7, 0.42], color: "#64748b", roughness: 0.35, metalness: 0.6 },
          { suffix: "chair-seat", shape: "box", relPos: [0, 0.44, 0.24], relScale: [0.44, 0.05, 0.42], color: "#b5835a", roughness: 0.48, metalness: 0.08 },
          { suffix: "chair-back", shape: "box", relPos: [0, 0.68, 0.43], relScale: [0.44, 0.28, 0.05], color: "#b5835a", roughness: 0.48, metalness: 0.08 },
          { suffix: "chair-base", shape: "box", relPos: [0, 0.22, 0.24], relScale: [0.4, 0.42, 0.38], color: "#475569", roughness: 0.35, metalness: 0.6 },
          { suffix: "textbook", shape: "box", relPos: [-0.1, 0.77, -0.1], relScale: [0.22, 0.03, 0.28], color: "#f8fafc", roughness: 0.6, metalness: 0.02 },
        ],
      );

    case "prop_school_steel_lockers":
      return emit(
        { shape: "box", pos: [cx, fh * 0.5, cz], scale: [fw, fh, fd], color: "#cbd5e1", roughness: 0.38, metalness: 0.52 },
        [
          { suffix: "door-col1", shape: "box", relPos: [-fw * 0.31, fh * 0.52, fd * 0.51], relScale: [fw * 0.29, fh * 0.88, 0.03], color: "#94a3b8", roughness: 0.34, metalness: 0.58 },
          { suffix: "door-col2", shape: "box", relPos: [0, fh * 0.52, fd * 0.51], relScale: [fw * 0.29, fh * 0.88, 0.03], color: "#94a3b8", roughness: 0.34, metalness: 0.58 },
          { suffix: "door-col3", shape: "box", relPos: [fw * 0.31, fh * 0.52, fd * 0.51], relScale: [fw * 0.29, fh * 0.88, 0.03], color: "#94a3b8", roughness: 0.34, metalness: 0.58 },
          { suffix: "vent-strip", shape: "box", relPos: [0, fh * 0.82, fd * 0.53], relScale: [fw * 0.86, 0.08, 0.02], color: "#475569", roughness: 0.3, metalness: 0.65 },
          { suffix: "handle-row", shape: "box", relPos: [0, fh * 0.5, fd * 0.53], relScale: [fw * 0.82, 0.05, 0.03], color: "#1e293b", roughness: 0.25, metalness: 0.7 },
        ],
      );

    case "prop_commuter_bicycle":
      return emit(
        { shape: "box", pos: [cx, 0.56, cz], scale: [0.92, 0.42, 0.14], color: "#38bdf8", roughness: 0.28, metalness: 0.62 },
        [
          { suffix: "wheel-front", shape: "cylinder", relPos: [-0.55, 0.34, 0], relScale: [0.66, 0.08, 0.66], color: "#1e293b", roughness: 0.65, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "wheel-rear", shape: "cylinder", relPos: [0.55, 0.34, 0], relScale: [0.66, 0.08, 0.66], color: "#1e293b", roughness: 0.65, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "handlebar", shape: "cylinder", relPos: [-0.42, 0.94, 0], relScale: [0.06, 0.52, 0.06], color: "#e2e8f0", roughness: 0.2, metalness: 0.8, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "basket", shape: "box", relPos: [-0.54, 0.76, 0], relScale: [0.28, 0.24, 0.36], color: "#78350f", roughness: 0.55, metalness: 0.15 },
          { suffix: "saddle", shape: "box", relPos: [0.22, 0.84, 0], relScale: [0.26, 0.08, 0.18], color: "#451a03", roughness: 0.6, metalness: 0.05 },
        ],
      );

    case "prop_bus_stop_shelter":
      return emit(
        { shape: "box", pos: [cx, fh - 0.12, cz], scale: [fw, 0.16, fd], color: "#1e293b", roughness: 0.32, metalness: 0.68 },
        [
          { suffix: "back-glass", shape: "box", relPos: [0, fh * 0.48, -fd * 0.44], relScale: [fw * 0.92, fh * 0.84, 0.06], color: "#bae6fd", roughness: 0.12, metalness: 0.25 },
          { suffix: "pillar-l", shape: "cylinder", relPos: [-fw * 0.45, fh * 0.48, -fd * 0.42], relScale: [0.1, fh * 0.94, 0.1], color: "#334155", roughness: 0.3, metalness: 0.75 },
          { suffix: "pillar-r", shape: "cylinder", relPos: [fw * 0.45, fh * 0.48, -fd * 0.42], relScale: [0.1, fh * 0.94, 0.1], color: "#334155", roughness: 0.3, metalness: 0.75 },
          { suffix: "route-lightbox", shape: "box", relPos: [fw * 0.38, fh * 0.48, 0], relScale: [0.18, fh * 0.82, fd * 0.78], color: "#f8fafc", roughness: 0.22, metalness: 0.15 },
          { suffix: "waiting-bench", shape: "box", relPos: [-0.25, 0.44, -fd * 0.2], relScale: [fw * 0.56, 0.08, 0.42], color: "#b45309", roughness: 0.5, metalness: 0.1 },
          { suffix: "totem-sign", shape: "box", relPos: [-fw * 0.58, 1.15, fd * 0.35], relScale: [0.36, 2.2, 0.14], color: "#0284c7", roughness: 0.35, metalness: 0.4 },
        ],
      );

    case "prop_street_lamp_post":
      return emit(
        { shape: "cylinder", pos: [cx, fh * 0.48, cz], scale: [0.14, fh * 0.92, 0.14], color: "#1e293b", roughness: 0.35, metalness: 0.72 },
        [
          { suffix: "pedestal", shape: "cylinder", relPos: [0, 0.32, 0], relScale: [0.34, 0.64, 0.34], color: "#0f172a", roughness: 0.4, metalness: 0.68 },
          { suffix: "arch-arm", shape: "box", relPos: [0.24, fh - 0.22, 0], relScale: [0.56, 0.08, 0.08], color: "#1e293b", roughness: 0.35, metalness: 0.72 },
          { suffix: "lantern-globe", shape: "sphere", relPos: [0.46, fh - 0.38, 0], relScale: [0.34, 0.38, 0.34], color: "#fef08a", roughness: 0.15, metalness: 0.05 },
          { suffix: "lantern-cap", shape: "cone", relPos: [0.46, fh - 0.16, 0], relScale: [0.4, 0.16, 0.4], color: "#0f172a", roughness: 0.35, metalness: 0.75 },
        ],
      );

    case "prop_wooden_park_bench":
      return emit(
        { shape: "box", pos: [cx, 0.44, cz], scale: [fw, 0.08, fd * 0.62], color: "#b45309", roughness: 0.55, metalness: 0.08 },
        [
          { suffix: "backrest", shape: "box", relPos: [0, 0.68, -fd * 0.26], relScale: [fw, 0.34, 0.07], color: "#92400e", roughness: 0.55, metalness: 0.08 },
          { suffix: "arm-l", shape: "box", relPos: [-fw * 0.46, 0.38, 0], relScale: [0.08, 0.72, fd * 0.7], color: "#1e293b", roughness: 0.38, metalness: 0.68 },
          { suffix: "arm-r", shape: "box", relPos: [fw * 0.46, 0.38, 0], relScale: [0.08, 0.72, fd * 0.7], color: "#1e293b", roughness: 0.38, metalness: 0.68 },
          { suffix: "support-bar", shape: "box", relPos: [0, 0.22, 0], relScale: [fw * 0.88, 0.06, 0.12], color: "#334155", roughness: 0.4, metalness: 0.65 },
        ],
      );

    case "prop_hanok_main_gate":
      return emit(
        { shape: "box", pos: [cx, fh - 0.45, cz], scale: [fw * 1.08, 0.55, fd * 1.15], color: "#334155", roughness: 0.62, metalness: 0.14 },
        [
          { suffix: "giwa-ridge", shape: "box", relPos: [0, fh - 0.1, 0], relScale: [fw * 1.14, 0.22, 0.38], color: "#1e293b", roughness: 0.58, metalness: 0.18 },
          { suffix: "pillar-l", shape: "cylinder", relPos: [-fw * 0.38, (fh - 0.6) * 0.5, 0], relScale: [0.28, fh - 0.6, 0.28], color: "#7c2d12", roughness: 0.52, metalness: 0.08 },
          { suffix: "pillar-r", shape: "cylinder", relPos: [fw * 0.38, (fh - 0.6) * 0.5, 0], relScale: [0.28, fh - 0.6, 0.28], color: "#7c2d12", roughness: 0.52, metalness: 0.08 },
          { suffix: "door-leaf-l", shape: "box", relPos: [-fw * 0.18, (fh - 0.75) * 0.5, 0], relScale: [fw * 0.34, fh - 0.78, 0.12], color: "#92400e", roughness: 0.55, metalness: 0.1 },
          { suffix: "door-leaf-r", shape: "box", relPos: [fw * 0.18, (fh - 0.75) * 0.5, 0], relScale: [fw * 0.34, fh - 0.78, 0.12], color: "#92400e", roughness: 0.55, metalness: 0.1 },
          { suffix: "stone-threshold", shape: "box", relPos: [0, 0.08, 0], relScale: [fw * 0.96, 0.16, fd * 0.7], color: "#94a3b8", roughness: 0.75, metalness: 0.05 },
        ],
      );

    case "prop_red_torii_gate":
      return emit(
        { shape: "box", pos: [cx, fh - 0.18, cz], scale: [fw * 1.12, 0.26, fd * 0.7], color: "#dc2626", roughness: 0.38, metalness: 0.15 },
        [
          { suffix: "nuki-beam", shape: "box", relPos: [0, fh - 0.78, 0], relScale: [fw * 0.96, 0.18, fd * 0.45], color: "#dc2626", roughness: 0.38, metalness: 0.15 },
          { suffix: "pillar-l", shape: "cylinder", relPos: [-fw * 0.34, fh * 0.48, 0], relScale: [0.28, fh * 0.95, 0.28], color: "#dc2626", roughness: 0.38, metalness: 0.15 },
          { suffix: "pillar-r", shape: "cylinder", relPos: [fw * 0.34, fh * 0.48, 0], relScale: [0.28, fh * 0.95, 0.28], color: "#dc2626", roughness: 0.38, metalness: 0.15 },
          { suffix: "base-l", shape: "cylinder", relPos: [-fw * 0.34, 0.24, 0], relScale: [0.38, 0.48, 0.38], color: "#1e293b", roughness: 0.6, metalness: 0.2 },
          { suffix: "base-r", shape: "cylinder", relPos: [fw * 0.34, 0.24, 0], relScale: [0.38, 0.48, 0.38], color: "#1e293b", roughness: 0.6, metalness: 0.2 },
          { suffix: "plaque", shape: "box", relPos: [0, fh - 0.48, 0], relScale: [0.36, 0.46, 0.16], color: "#facc15", roughness: 0.28, metalness: 0.65 },
        ],
      );

    case "prop_cherry_blossom_tree":
      return emit(
        { shape: "cylinder", pos: [cx, 1.35, cz], scale: [0.42, 2.7, 0.42], color: "#5c4033", roughness: 0.78, metalness: 0.04 },
        [
          { suffix: "crown-main", shape: "sphere", relPos: [0, 3.25, 0], relScale: [2.7, 2.1, 2.7], color: "#fbcfe8", roughness: 0.65, metalness: 0.02 },
          { suffix: "crown-left", shape: "sphere", relPos: [-1.05, 2.85, 0.35], relScale: [1.85, 1.55, 1.85], color: "#f9a8d4", roughness: 0.65, metalness: 0.02 },
          { suffix: "crown-right", shape: "sphere", relPos: [1.0, 2.95, -0.3], relScale: [1.9, 1.6, 1.9], color: "#f472b6", roughness: 0.65, metalness: 0.02 },
          { suffix: "crown-top", shape: "sphere", relPos: [0.15, 4.05, 0.1], relScale: [1.7, 1.3, 1.7], color: "#fce7f3", roughness: 0.65, metalness: 0.02 },
          { suffix: "petal-ring", shape: "cylinder", relPos: [0, 0.03, 0], relScale: [2.4, 0.05, 2.4], color: "#fbcfe8", roughness: 0.75, metalness: 0.02 },
        ],
      );

    case "prop_autumn_ginkgo_tree":
      return emit(
        { shape: "cylinder", pos: [cx, 1.45, cz], scale: [0.4, 2.9, 0.4], color: "#4a3728", roughness: 0.8, metalness: 0.04 },
        [
          { suffix: "canopy-core", shape: "sphere", relPos: [0, 3.35, 0], relScale: [2.5, 2.4, 2.5], color: "#facc15", roughness: 0.62, metalness: 0.04 },
          { suffix: "canopy-upper", shape: "sphere", relPos: [0, 4.25, 0], relScale: [1.8, 1.6, 1.8], color: "#fde047", roughness: 0.62, metalness: 0.04 },
          { suffix: "canopy-side-l", shape: "sphere", relPos: [-0.9, 3.0, 0.25], relScale: [1.65, 1.5, 1.65], color: "#eab308", roughness: 0.62, metalness: 0.04 },
          { suffix: "canopy-side-r", shape: "sphere", relPos: [0.9, 3.05, -0.25], relScale: [1.65, 1.5, 1.65], color: "#eab308", roughness: 0.62, metalness: 0.04 },
          { suffix: "leaf-carpet", shape: "cylinder", relPos: [0, 0.03, 0], relScale: [2.3, 0.05, 2.3], color: "#facc15", roughness: 0.75, metalness: 0.02 },
        ],
      );

    case "prop_apartment_keypad_door":
      return emit(
        { shape: "box", pos: [cx, fh * 0.5, cz], scale: [fw, fh, fd], color: "#334155", roughness: 0.36, metalness: 0.58 },
        [
          { suffix: "door-frame", shape: "box", relPos: [0, fh * 0.51, -0.02], relScale: [fw + 0.12, fh + 0.08, fd + 0.04], color: "#1e293b", roughness: 0.4, metalness: 0.62 },
          { suffix: "digital-keypad", shape: "box", relPos: [fw * 0.32, 1.12, fd * 0.55], relScale: [0.1, 0.28, 0.05], color: "#0f172a", roughness: 0.2, metalness: 0.8 },
          { suffix: "keypad-led", shape: "box", relPos: [fw * 0.32, 1.16, fd * 0.58], relScale: [0.07, 0.12, 0.02], color: "#38bdf8", roughness: 0.1, metalness: 0.2 },
          { suffix: "lever-handle", shape: "box", relPos: [fw * 0.28, 1.02, fd * 0.58], relScale: [0.16, 0.04, 0.06], color: "#cbd5e1", roughness: 0.22, metalness: 0.85 },
          { suffix: "unit-plate", shape: "box", relPos: [0, 1.68, fd * 0.54], relScale: [0.24, 0.1, 0.03], color: "#facc15", roughness: 0.28, metalness: 0.72 },
        ],
      );

    case "prop_convenience_snack_shelf":
      return emit(
        { shape: "box", pos: [cx, fh * 0.5, cz - fd * 0.35], scale: [fw, fh, 0.12], color: "#f8fafc", roughness: 0.4, metalness: 0.25 },
        [
          { suffix: "tier-1", shape: "box", relPos: [0, 0.32, 0], relScale: [fw * 0.96, 0.06, fd * 0.85], color: "#cbd5e1", roughness: 0.35, metalness: 0.4 },
          { suffix: "tier-2", shape: "box", relPos: [0, 0.76, 0], relScale: [fw * 0.96, 0.06, fd * 0.85], color: "#cbd5e1", roughness: 0.35, metalness: 0.4 },
          { suffix: "tier-3", shape: "box", relPos: [0, 1.2, 0], relScale: [fw * 0.96, 0.06, fd * 0.85], color: "#cbd5e1", roughness: 0.35, metalness: 0.4 },
          { suffix: "snacks-row-a", shape: "box", relPos: [-0.25, 0.92, 0.04], relScale: [fw * 0.42, 0.24, fd * 0.62], color: "#ef4444", roughness: 0.48, metalness: 0.08 },
          { suffix: "snacks-row-b", shape: "box", relPos: [0.25, 0.92, 0.04], relScale: [fw * 0.42, 0.24, fd * 0.62], color: "#f59e0b", roughness: 0.48, metalness: 0.08 },
          { suffix: "drinks-row", shape: "box", relPos: [0, 1.36, 0.04], relScale: [fw * 0.86, 0.24, fd * 0.62], color: "#38bdf8", roughness: 0.32, metalness: 0.2 },
          { suffix: "header-sign", shape: "box", relPos: [0, fh - 0.1, 0], relScale: [fw, 0.18, fd * 0.5], color: "#0284c7", roughness: 0.3, metalness: 0.2 },
        ],
      );

    case "prop_pojangmacha_cart":
      return emit(
        { shape: "box", pos: [cx, 0.55, cz], scale: [fw * 0.88, 0.85, fd * 0.76], color: "#94a3b8", roughness: 0.42, metalness: 0.55 },
        [
          { suffix: "tent-canopy", shape: "box", relPos: [0, fh - 0.32, 0], relScale: [fw, 0.55, fd], color: "#ea580c", roughness: 0.58, metalness: 0.06 },
          { suffix: "tent-roof", shape: "box", relPos: [0, fh - 0.02, 0], relScale: [fw * 0.92, 0.16, fd * 0.9], color: "#c2410c", roughness: 0.6, metalness: 0.06 },
          { suffix: "cooking-bar", shape: "box", relPos: [0, 0.98, fd * 0.22], relScale: [fw * 0.9, 0.08, 0.48], color: "#e2e8f0", roughness: 0.28, metalness: 0.72 },
          { suffix: "broth-pot", shape: "cylinder", relPos: [-0.38, 1.12, fd * 0.18], relScale: [0.36, 0.22, 0.36], color: "#cbd5e1", roughness: 0.25, metalness: 0.78 },
          { suffix: "stool-1", shape: "cylinder", relPos: [-0.65, 0.24, fd * 0.62], relScale: [0.32, 0.46, 0.32], color: "#dc2626", roughness: 0.45, metalness: 0.08 },
          { suffix: "stool-2", shape: "cylinder", relPos: [0, 0.24, fd * 0.62], relScale: [0.32, 0.46, 0.32], color: "#dc2626", roughness: 0.45, metalness: 0.08 },
          { suffix: "stool-3", shape: "cylinder", relPos: [0.65, 0.24, fd * 0.62], relScale: [0.32, 0.46, 0.32], color: "#dc2626", roughness: 0.45, metalness: 0.08 },
        ],
      );

    case "prop_city_bus":
      return emit(
        { shape: "box", pos: [cx, fh * 0.52, cz], scale: [fw, fh * 0.82, fd], color: "#2563eb", roughness: 0.28, metalness: 0.48 },
        [
          { suffix: "window-band", shape: "box", relPos: [0, fh * 0.64, 0], relScale: [fw * 0.96, fh * 0.34, fd * 1.02], color: "#bae6fd", roughness: 0.14, metalness: 0.3 },
          { suffix: "roof-ac", shape: "box", relPos: [0, fh * 0.96, 0], relScale: [fw * 0.55, 0.24, fd * 0.72], color: "#f8fafc", roughness: 0.35, metalness: 0.3 },
          { suffix: "wheel-fl", shape: "cylinder", relPos: [-fw * 0.32, 0.48, fd * 0.48], relScale: [0.92, 0.28, 0.92], color: "#0f172a", roughness: 0.7, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "wheel-fr", shape: "cylinder", relPos: [-fw * 0.32, 0.48, -fd * 0.48], relScale: [0.92, 0.28, 0.92], color: "#0f172a", roughness: 0.7, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "wheel-rl", shape: "cylinder", relPos: [fw * 0.32, 0.48, fd * 0.48], relScale: [0.92, 0.28, 0.92], color: "#0f172a", roughness: 0.7, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "wheel-rr", shape: "cylinder", relPos: [fw * 0.32, 0.48, -fd * 0.48], relScale: [0.92, 0.28, 0.92], color: "#0f172a", roughness: 0.7, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "led-dest", shape: "box", relPos: [-fw * 0.49, fh * 0.82, 0], relScale: [0.08, 0.28, fd * 0.65], color: "#f59e0b", roughness: 0.15, metalness: 0.2 },
        ],
      );

    case "prop_yellow_sedan_taxi":
      return emit(
        { shape: "box", pos: [cx, 0.52, cz], scale: [fw, 0.62, fd], color: "#f59e0b", roughness: 0.24, metalness: 0.55 },
        [
          { suffix: "cabin", shape: "box", relPos: [0.1, 1.05, 0], relScale: [fw * 0.54, 0.52, fd * 0.88], color: "#fde047", roughness: 0.22, metalness: 0.45 },
          { suffix: "windshield", shape: "box", relPos: [0.08, 1.06, 0], relScale: [fw * 0.58, 0.42, fd * 0.9], color: "#38bdf8", roughness: 0.12, metalness: 0.35 },
          { suffix: "taxi-crown", shape: "box", relPos: [0.05, 1.38, 0], relScale: [0.46, 0.18, 0.26], color: "#fef08a", roughness: 0.15, metalness: 0.1 },
          { suffix: "wheel-f", shape: "cylinder", relPos: [-fw * 0.31, 0.32, 0], relScale: [0.64, fd * 1.04, 0.64], color: "#0f172a", roughness: 0.7, metalness: 0.25, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "wheel-r", shape: "cylinder", relPos: [fw * 0.31, 0.32, 0], relScale: [0.64, fd * 1.04, 0.64], color: "#0f172a", roughness: 0.7, metalness: 0.25, rotation: [Math.PI / 2, 0, 0] },
        ],
      );

    case "prop_white_hatchback_car":
      return emit(
        { shape: "box", pos: [cx, 0.52, cz], scale: [fw, 0.62, fd], color: "#f8fafc", roughness: 0.24, metalness: 0.52 },
        [
          { suffix: "hatch-cabin", shape: "box", relPos: [0.25, 1.06, 0], relScale: [fw * 0.62, 0.56, fd * 0.88], color: "#e2e8f0", roughness: 0.24, metalness: 0.48 },
          { suffix: "glass-band", shape: "box", relPos: [0.22, 1.06, 0], relScale: [fw * 0.64, 0.42, fd * 0.9], color: "#7dd3fc", roughness: 0.12, metalness: 0.35 },
          { suffix: "wheel-f", shape: "cylinder", relPos: [-fw * 0.31, 0.32, 0], relScale: [0.62, fd * 1.04, 0.62], color: "#0f172a", roughness: 0.7, metalness: 0.25, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "wheel-r", shape: "cylinder", relPos: [fw * 0.31, 0.32, 0], relScale: [0.62, fd * 1.04, 0.62], color: "#0f172a", roughness: 0.7, metalness: 0.25, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "headlamp", shape: "box", relPos: [-fw * 0.5, 0.58, 0], relScale: [0.06, 0.16, fd * 0.78], color: "#fef9c3", roughness: 0.15, metalness: 0.2 },
        ],
      );

    case "prop_delivery_scooter":
      return emit(
        { shape: "box", pos: [cx, 0.48, cz], scale: [1.18, 0.44, 0.46], color: "#e2e8f0", roughness: 0.3, metalness: 0.5 },
        [
          { suffix: "front-shield", shape: "box", relPos: [-0.42, 0.72, 0], relScale: [0.24, 0.68, 0.48], color: "#f8fafc", roughness: 0.28, metalness: 0.45 },
          { suffix: "delivery-box", shape: "box", relPos: [0.52, 0.88, 0], relScale: [0.48, 0.46, 0.5], color: "#06b6d4", roughness: 0.35, metalness: 0.25 },
          { suffix: "seat", shape: "box", relPos: [0.05, 0.74, 0], relScale: [0.48, 0.12, 0.34], color: "#1e293b", roughness: 0.6, metalness: 0.1 },
          { suffix: "wheel-f", shape: "cylinder", relPos: [-0.58, 0.25, 0], relScale: [0.48, 0.18, 0.48], color: "#0f172a", roughness: 0.7, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
          { suffix: "wheel-r", shape: "cylinder", relPos: [0.52, 0.25, 0], relScale: [0.48, 0.18, 0.48], color: "#0f172a", roughness: 0.7, metalness: 0.2, rotation: [Math.PI / 2, 0, 0] },
        ],
      );

    case "prop_cafe_table_set":
      return emit(
        { shape: "cylinder", pos: [cx, 0.72, cz], scale: [0.78, 0.06, 0.78], color: "#92400e", roughness: 0.42, metalness: 0.12 },
        [
          { suffix: "table-post", shape: "cylinder", relPos: [0, 0.36, 0], relScale: [0.1, 0.7, 0.1], color: "#1e293b", roughness: 0.32, metalness: 0.7 },
          { suffix: "table-disc", shape: "cylinder", relPos: [0, 0.03, 0], relScale: [0.46, 0.05, 0.46], color: "#1e293b", roughness: 0.32, metalness: 0.7 },
          { suffix: "chair-l-seat", shape: "cylinder", relPos: [-0.56, 0.44, 0], relScale: [0.42, 0.06, 0.42], color: "#d97706", roughness: 0.48, metalness: 0.1 },
          { suffix: "chair-l-back", shape: "box", relPos: [-0.74, 0.68, 0], relScale: [0.06, 0.36, 0.38], color: "#b45309", roughness: 0.48, metalness: 0.1 },
          { suffix: "chair-r-seat", shape: "cylinder", relPos: [0.56, 0.44, 0], relScale: [0.42, 0.06, 0.42], color: "#d97706", roughness: 0.48, metalness: 0.1 },
          { suffix: "chair-r-back", shape: "box", relPos: [0.74, 0.68, 0], relScale: [0.06, 0.36, 0.38], color: "#b45309", roughness: 0.48, metalness: 0.1 },
          { suffix: "coffee-cups", shape: "cylinder", relPos: [0, 0.8, 0], relScale: [0.16, 0.1, 0.16], color: "#f8fafc", roughness: 0.25, metalness: 0.05 },
        ],
      );

    case "prop_teal_fabric_sofa":
      return emit(
        { shape: "box", pos: [cx, 0.28, cz], scale: [fw, 0.32, fd], color: "#0d9488", roughness: 0.68, metalness: 0.04 },
        [
          { suffix: "backrest", shape: "box", relPos: [0, 0.62, -fd * 0.34], relScale: [fw * 0.94, 0.44, fd * 0.26], color: "#0f766e", roughness: 0.7, metalness: 0.04 },
          { suffix: "arm-l", shape: "box", relPos: [-fw * 0.45, 0.48, 0], relScale: [0.18, 0.42, fd * 0.92], color: "#115e59", roughness: 0.68, metalness: 0.04 },
          { suffix: "arm-r", shape: "box", relPos: [fw * 0.45, 0.48, 0], relScale: [0.18, 0.42, fd * 0.92], color: "#115e59", roughness: 0.68, metalness: 0.04 },
          { suffix: "cushion-1", shape: "box", relPos: [-fw * 0.26, 0.46, 0.06], relScale: [fw * 0.27, 0.12, fd * 0.68], color: "#14b8a6", roughness: 0.65, metalness: 0.03 },
          { suffix: "cushion-2", shape: "box", relPos: [0, 0.46, 0.06], relScale: [fw * 0.27, 0.12, fd * 0.68], color: "#14b8a6", roughness: 0.65, metalness: 0.03 },
          { suffix: "cushion-3", shape: "box", relPos: [fw * 0.26, 0.46, 0.06], relScale: [fw * 0.27, 0.12, fd * 0.68], color: "#14b8a6", roughness: 0.65, metalness: 0.03 },
        ],
      );

    case "prop_wooden_single_bed":
      return emit(
        { shape: "box", pos: [cx, 0.24, cz], scale: [fw, 0.26, fd], color: "#b45309", roughness: 0.52, metalness: 0.08 },
        [
          { suffix: "headboard", shape: "box", relPos: [0, 0.56, -fd * 0.46], relScale: [fw, 0.64, 0.1], color: "#92400e", roughness: 0.5, metalness: 0.08 },
          { suffix: "mattress", shape: "box", relPos: [0, 0.44, 0.02], relScale: [fw * 0.94, 0.18, fd * 0.9], color: "#f8fafc", roughness: 0.72, metalness: 0.02 },
          { suffix: "duvet", shape: "box", relPos: [0, 0.54, 0.22], relScale: [fw * 0.95, 0.08, fd * 0.62], color: "#bae6fd", roughness: 0.75, metalness: 0.02 },
          { suffix: "pillow", shape: "box", relPos: [0, 0.58, -fd * 0.3], relScale: [fw * 0.62, 0.12, 0.34], color: "#ffffff", roughness: 0.7, metalness: 0.02 },
        ],
      );

    case "prop_dual_monitor_office_desk":
    default:
      return emit(
        { shape: "box", pos: [cx, 0.74, cz], scale: [fw, 0.06, fd], color: "#e2e8f0", roughness: 0.38, metalness: 0.18 },
        [
          { suffix: "leg-l", shape: "box", relPos: [-fw * 0.44, 0.36, 0], relScale: [0.06, 0.72, fd * 0.86], color: "#334155", roughness: 0.32, metalness: 0.68 },
          { suffix: "leg-r", shape: "box", relPos: [fw * 0.44, 0.36, 0], relScale: [0.06, 0.72, fd * 0.86], color: "#334155", roughness: 0.32, metalness: 0.68 },
          { suffix: "monitor-l", shape: "box", relPos: [-0.32, 1.02, -fd * 0.22], relScale: [0.56, 0.34, 0.04], color: "#0f172a", roughness: 0.18, metalness: 0.6, rotation: [0, 0.16, 0] },
          { suffix: "monitor-r", shape: "box", relPos: [0.32, 1.02, -fd * 0.22], relScale: [0.56, 0.34, 0.04], color: "#0f172a", roughness: 0.18, metalness: 0.6, rotation: [0, -0.16, 0] },
          { suffix: "keyboard", shape: "box", relPos: [0, 0.79, 0.12], relScale: [0.42, 0.03, 0.16], color: "#1e293b", roughness: 0.35, metalness: 0.4 },
          { suffix: "task-chair", shape: "box", relPos: [0, 0.52, fd * 0.58], relScale: [0.52, 0.86, 0.48], color: "#1e293b", roughness: 0.48, metalness: 0.3 },
        ],
      );
  }
}

/**
 * VARCO 3D 아이소메트릭 디오라마 22종을 빈 박스 3개가 아닌
 * 장르별 건축 디테일(걸레받이·천장 몰딩·창호·천장 조명·디오라마별 핵심 구조물)이 완비된
 * 실전 웹툰 배경 스테이지로 생성한다.
 */
export function buildAsset3dDioramaDetailedPrimitives(
  diorama: StudioAsset3dIsometricDioramaEntry,
  options?: {
    readonly competitorId?: StudioBg3dReaCompetitorId;
  },
): readonly Bg3dPrimitiveItem[] {
  const competitor =
    STUDIO_BG3D_REA_COMPETITOR_PROFILES.find((c) => c.id === options?.competitorId) ??
    STUDIO_BG3D_REA_COMPETITOR_PROFILES[0]!;

  const paletteByGenre: Record<
    StudioAsset3dIsometricDioramaEntry["genre"],
    { floor: string; wallBack: string; wallLeft: string; trim: string; accent: string; light: string }
  > = {
    "daily-school": { floor: "#d8c3a5", wallBack: "#f4f1ea", wallLeft: "#eae4dc", trim: "#94a3b8", accent: "#38bdf8", light: "#fef9c3" },
    "romance-fantasy": { floor: "#f5ebe0", wallBack: "#faf3dd", wallLeft: "#f3e9d2", trim: "#d4af37", accent: "#fbbf24", light: "#fef08a" },
    murim: { floor: "#94a3b8", wallBack: "#e2e8f0", wallLeft: "#cbd5e1", trim: "#475569", accent: "#0d9488", light: "#fde68a" },
    "hunter-action": { floor: "#1e293b", wallBack: "#0f172a", wallLeft: "#1e293b", trim: "#334155", accent: "#8b5cf6", light: "#38bdf8" },
    cyberpunk: { floor: "#0f172a", wallBack: "#1e1b4b", wallLeft: "#172554", trim: "#06b6d4", accent: "#ec4899", light: "#22d3ee" },
    "joseon-historical": { floor: "#b08968", wallBack: "#ede0d4", wallLeft: "#e6ccb2", trim: "#7f5539", accent: "#b91c1c", light: "#fde68a" },
  };

  const pal = paletteByGenre[diorama.genre];
  const compRef = { id: `varco3d-diorama:${diorama.id}`, name: diorama.labelKo };
  const baseTag = ["varco3d-diorama", diorama.genre, diorama.id] as const;
  const archTag = ["varco3d-diorama-detail", diorama.genre, diorama.id, `rea:${competitor.id}`] as const;

  const items: Bg3dPrimitiveItem[] = [
    makeReaBg3dPrim(`varco-diorama-floor-${diorama.id}`, "box", [0, -0.06, 0], [10, 0.12, 8], pal.floor, 0.58, 0.08, baseTag, compRef),
    makeReaBg3dPrim(`varco-diorama-wall-back-${diorama.id}`, "box", [0, 1.8, -3.9], [10, 3.6, 0.2], pal.wallBack, 0.68, 0.05, baseTag, compRef),
    makeReaBg3dPrim(`varco-diorama-wall-left-${diorama.id}`, "box", [-4.9, 1.8, 0], [0.2, 3.6, 8], pal.wallLeft, 0.68, 0.05, baseTag, compRef),
    makeReaBg3dPrim(`varco-diorama-baseboard-back-${diorama.id}`, "box", [0, 0.1, -3.76], [9.8, 0.18, 0.06], pal.trim, 0.42, 0.28, archTag, compRef),
    makeReaBg3dPrim(`varco-diorama-baseboard-left-${diorama.id}`, "box", [-4.76, 0.1, 0], [0.06, 0.18, 7.8], pal.trim, 0.42, 0.28, archTag, compRef),
    makeReaBg3dPrim(`varco-diorama-cornice-back-${diorama.id}`, "box", [0, 3.48, -3.72], [9.9, 0.18, 0.16], pal.trim, 0.36, 0.35, archTag, compRef),
    makeReaBg3dPrim(`varco-diorama-cornice-left-${diorama.id}`, "box", [-4.72, 3.48, 0], [0.16, 0.18, 7.9], pal.trim, 0.36, 0.35, archTag, compRef),
  ];

  if (competitor.architecturalDressingFlags.ceilingLightGrid) {
    items.push(
      makeReaBg3dPrim(`varco-diorama-light-beam-l-${diorama.id}`, "box", [-2.2, 3.46, -1.2], [2.4, 0.06, 0.36], pal.light, 0.15, 0.1, archTag, compRef),
      makeReaBg3dPrim(`varco-diorama-light-beam-r-${diorama.id}`, "box", [2.2, 3.46, -1.2], [2.4, 0.06, 0.36], pal.light, 0.15, 0.1, archTag, compRef),
    );
  }

  if (competitor.architecturalDressingFlags.windowMullionsAndBlinds) {
    items.push(
      makeReaBg3dPrim(`varco-diorama-win-glass-${diorama.id}`, "box", [-4.76, 1.95, -1.4], [0.04, 1.65, 2.6], pal.accent, 0.12, 0.3, archTag, compRef),
      makeReaBg3dPrim(`varco-diorama-win-sill-${diorama.id}`, "box", [-4.68, 1.08, -1.4], [0.18, 0.08, 2.76], pal.trim, 0.38, 0.35, archTag, compRef),
      makeReaBg3dPrim(`varco-diorama-win-mullion-${diorama.id}`, "box", [-4.73, 1.95, -1.4], [0.06, 1.68, 0.08], pal.trim, 0.38, 0.45, archTag, compRef),
    );
  }

  switch (diorama.id) {
    case "diorama_school_hallway":
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-door-${diorama.id}`, "box", [-2.4, 1.15, -3.74], [1.6, 2.2, 0.08], "#b45309", 0.5, 0.1, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-board-${diorama.id}`, "box", [1.6, 1.65, -3.74], [2.8, 1.2, 0.06], "#15803d", 0.65, 0.05, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-wainscot-${diorama.id}`, "box", [0, 0.6, -3.77], [9.6, 1.1, 0.04], "#cbd5e1", 0.55, 0.12, archTag, compRef),
      );
      break;
    case "diorama_school_rooftop":
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-penthouse-${diorama.id}`, "box", [-2.8, 1.45, -2.5], [2.8, 2.9, 2.2], "#cbd5e1", 0.62, 0.12, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-watertank-${diorama.id}`, "cylinder", [2.6, 1.6, -2.3], [1.8, 2.4, 1.8], "#0284c7", 0.38, 0.35, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-fence-${diorama.id}`, "box", [0, 1.1, 3.8], [9.6, 2.1, 0.08], "#64748b", 0.35, 0.72, archTag, compRef),
      );
      break;
    case "diorama_subway_car":
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-seat-back-${diorama.id}`, "box", [-2.2, 0.48, -3.2], [3.8, 0.52, 0.62], "#0284c7", 0.45, 0.2, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-subway-door-${diorama.id}`, "box", [2.2, 1.25, -3.72], [1.8, 2.3, 0.08], "#94a3b8", 0.25, 0.75, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-handrail-${diorama.id}`, "cylinder", [0, 2.35, -1.6], [0.06, 8.8, 0.06], "#e2e8f0", 0.2, 0.85, archTag, compRef, [0, 0, Math.PI / 2]),
      );
      break;
    case "diorama_joseon_palace_hall":
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-dais-${diorama.id}`, "box", [0, 0.28, -2.4], [4.4, 0.56, 2.4], "#7f1d1d", 0.45, 0.18, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-throne-${diorama.id}`, "box", [0, 1.15, -2.5], [1.6, 1.2, 1.1], "#dc2626", 0.35, 0.4, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-screen-${diorama.id}`, "box", [0, 1.85, -3.35], [3.6, 2.2, 0.14], "#d4af37", 0.38, 0.55, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-pillar-l-${diorama.id}`, "cylinder", [-3.2, 1.75, -2.2], [0.38, 3.5, 0.38], "#991b1b", 0.42, 0.15, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-pillar-r-${diorama.id}`, "cylinder", [3.2, 1.75, -2.2], [0.38, 3.5, 0.38], "#991b1b", 0.42, 0.15, archTag, compRef),
      );
      break;
    case "diorama_rofan_imperial_ballroom":
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-carpet-${diorama.id}`, "box", [0, 0.03, 0], [2.6, 0.04, 7.2], "#991b1b", 0.65, 0.08, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-chandelier-${diorama.id}`, "sphere", [0, 3.05, -0.5], [1.6, 0.9, 1.6], "#fef08a", 0.12, 0.75, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-col-l-${diorama.id}`, "cylinder", [-3.0, 1.75, -2.8], [0.42, 3.5, 0.42], "#fef3c7", 0.28, 0.35, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-col-r-${diorama.id}`, "cylinder", [3.0, 1.75, -2.8], [0.42, 3.5, 0.42], "#fef3c7", 0.28, 0.35, archTag, compRef),
      );
      break;
    case "diorama_hunter_boss_dungeon":
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-altar-${diorama.id}`, "cylinder", [0, 0.32, -1.6], [3.2, 0.64, 3.2], "#312e81", 0.45, 0.5, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-mana-core-${diorama.id}`, "sphere", [0, 1.65, -1.6], [1.1, 1.5, 1.1], "#a855f7", 0.1, 0.8, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-obelisk-l-${diorama.id}`, "box", [-3.2, 1.6, -2.2], [0.65, 3.2, 0.65], "#1e1b4b", 0.35, 0.65, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-obelisk-r-${diorama.id}`, "box", [3.2, 1.6, -2.2], [0.65, 3.2, 0.65], "#1e1b4b", 0.35, 0.65, archTag, compRef),
      );
      break;
    case "diorama_cyberpunk_neon_alley":
    case "diorama_pc_bang":
    case "diorama_kpop_concert_stage":
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-led-wall-${diorama.id}`, "box", [0, 1.95, -3.68], [5.4, 2.4, 0.12], "#06b6d4", 0.14, 0.65, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-neon-bar-${diorama.id}`, "box", [0, 3.15, -3.58], [6.8, 0.22, 0.16], "#ec4899", 0.12, 0.55, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-stage-deck-${diorama.id}`, "box", [0, 0.18, -1.8], [5.8, 0.36, 2.8], "#1e293b", 0.3, 0.65, archTag, compRef),
      );
      break;
    default:
      items.push(
        makeReaBg3dPrim(`varco-diorama-focal-counter-${diorama.id}`, "box", [0, 0.55, -2.6], [4.2, 1.1, 0.9], pal.trim, 0.42, 0.25, archTag, compRef),
        makeReaBg3dPrim(`varco-diorama-focal-backdrop-${diorama.id}`, "box", [0, 2.05, -3.72], [4.6, 1.6, 0.1], pal.accent, 0.32, 0.22, archTag, compRef),
      );
      break;
  }

  return items;
}

export function resolveReaDioramaSummaryKo(
  dioramaId: string,
  selectedPropIds: readonly string[],
  competitorId: StudioBg3dReaCompetitorId = "acon3d-carpenstreet",
): {
  readonly diorama: StudioAsset3dIsometricDioramaEntry;
  readonly props: readonly StudioAsset3dWebtoonPropEntry[];
  readonly competitor: StudioBg3dReaCompetitorProfile;
  readonly totalEstimatedPrimitives: number;
} {
  const diorama =
    STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES.find((d) => d.id === dioramaId) ??
    STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES[0]!;
  const props = STUDIO_ASSET3D_WEBTOON_PROP_ASSETS.filter((p) => selectedPropIds.includes(p.id));
  const competitor =
    STUDIO_BG3D_REA_COMPETITOR_PROFILES.find((c) => c.id === competitorId) ??
    STUDIO_BG3D_REA_COMPETITOR_PROFILES[0]!;
  const dioramaPrimCount = buildAsset3dDioramaDetailedPrimitives(diorama, { competitorId }).length;
  const propPrimCount = props.reduce(
    (acc, p, idx) => acc + buildAsset3dPropDetailedPrimitives(p, [idx * 1.5, 0]).length,
    0,
  );
  return {
    diorama,
    props,
    competitor,
    totalEstimatedPrimitives: dioramaPrimCount + propPrimCount,
  };
}

export interface StudioBg3dAsset3dGlbCalibrationSpec {
  readonly assetId: string;
  readonly labelKo: string;
  readonly url: `/models/varco3d/${string}.glb`;
  readonly rawSizeMeters: readonly [number, number, number];
  readonly rawMinY: number;
  readonly pivotAtBase: boolean;
  readonly calibratedScale: number;
  readonly groundYOffset: number;
  readonly humanScaleDimensionsMeters: readonly [number, number, number];
  readonly recommendedAnchorPosition: Vec3;
  readonly linkedUniverseId: string;
}

export const STUDIO_BG3D_ASSET3D_GLB_CALIBRATION_CATALOG: readonly StudioBg3dAsset3dGlbCalibrationSpec[] =
  Object.freeze([
    {
      assetId: "varco_diorama_hallway_remesh_quad",
      labelKo: "VARCO 3D 고등학교 복도 디오라마 (Quad 리메쉬 150k Tri)",
      url: "/models/varco3d/varco_diorama_hallway_remesh_quad.glb",
      rawSizeMeters: [0.999, 0.874, 0.677], rawMinY: -0.434, pivotAtBase: false,
      calibratedScale: 4.2, groundYOffset: 1.82, humanScaleDimensionsMeters: [4.2, 3.67, 2.84],
      recommendedAnchorPosition: [-1.4, 1.82, -1.6], linkedUniverseId: "school-romance",
    },
    {
      assetId: "varco_prop_school_desk_remesh_quad",
      labelKo: "VARCO 3D 교실 책걸상 프롭 (Quad 리메쉬 150k Tri)",
      url: "/models/varco3d/varco_prop_school_desk_remesh_quad.glb",
      rawSizeMeters: [0.692, 0.999, 0.643], rawMinY: -0.5, pivotAtBase: false,
      calibratedScale: 0.95, groundYOffset: 0.48, humanScaleDimensionsMeters: [0.66, 0.95, 0.61],
      recommendedAnchorPosition: [1.1, 0.48, -0.4], linkedUniverseId: "school-romance",
    },
    {
      assetId: "classroom-podium-desk",
      labelKo: "VARCO 3D 학원물 교탁 & 출석부·노트북·마이크 월드빌드",
      url: "/models/varco3d/classroom-podium-desk.glb",
      rawSizeMeters: [1.2, 0.95, 0.65], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [1.2, 0.95, 0.65],
      recommendedAnchorPosition: [0, 0, -2.4], linkedUniverseId: "school-romance",
    },
    {
      assetId: "rofan-golden-throne",
      labelKo: "VARCO 3D 로판 황실 3단 대리석 단상 & 금장 벨벳 권좌",
      url: "/models/varco3d/rofan-golden-throne.glb",
      rawSizeMeters: [1.4, 2.1, 1.1], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [1.4, 2.1, 1.1],
      recommendedAnchorPosition: [0, 0, -2.8], linkedUniverseId: "romance-fantasy-palace",
    },
    {
      assetId: "murim-sword-rack",
      labelKo: "VARCO 3D 무림 문파 흑단 3단 병장기 거치대 & 오검 세트",
      url: "/models/varco3d/murim-sword-rack.glb",
      rawSizeMeters: [1.5, 1.35, 0.45], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [1.5, 1.35, 0.45],
      recommendedAnchorPosition: [-1.6, 0, -2.2], linkedUniverseId: "murim-martial-courtyard",
    },
    {
      assetId: "noir-neon-streetlamp",
      labelKo: "VARCO 3D 현대 느와르 주철 듀얼 랜턴 가로등 & 네온 사인",
      url: "/models/varco3d/noir-neon-streetlamp.glb",
      rawSizeMeters: [0.6, 3.4, 0.6], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [0.6, 3.4, 0.6],
      recommendedAnchorPosition: [1.8, 0, -1.8], linkedUniverseId: "modern-office-noir",
    },
    {
      assetId: "hunter-awakening-altar",
      labelKo: "VARCO 3D 헌터 던전 3단 룬 제단 & 마석 오벨리스크",
      url: "/models/varco3d/hunter-awakening-altar.glb",
      rawSizeMeters: [2.2, 2.8, 2.2], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [2.2, 2.8, 2.2],
      recommendedAnchorPosition: [0, 0, -2.5], linkedUniverseId: "hunter-dungeon-altar",
    },
    {
      assetId: "cyberpunk-holo-kiosk",
      labelKo: "VARCO 3D 사이버펑크 3단 홀로그램 단말기 키오스크",
      url: "/models/varco3d/cyberpunk-holo-kiosk.glb",
      rawSizeMeters: [1.1, 2.0, 0.75], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [1.1, 2.0, 0.75],
      recommendedAnchorPosition: [-1.5, 0, -2.1], linkedUniverseId: "cyberpunk-neon-alley",
    },
    {
      assetId: "medical-iv-monitor",
      labelKo: "VARCO 3D 메디컬 이동식 수액 폴대 & 심전도 바이탈 모니터 카트",
      url: "/models/varco3d/medical-iv-monitor.glb",
      rawSizeMeters: [0.65, 1.65, 0.65], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [0.65, 1.65, 0.65],
      recommendedAnchorPosition: [1.2, 0, -1.6], linkedUniverseId: "medical-drama-ward",
    },
    {
      assetId: "cafe-espresso-bar",
      labelKo: "VARCO 3D 일상물 에스프레소 머신·그라인더·쇼케이스 바 카운터",
      url: "/models/varco3d/cafe-espresso-bar.glb",
      rawSizeMeters: [1.8, 1.15, 0.8], rawMinY: 0, pivotAtBase: true,
      calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [1.8, 1.15, 0.8],
      recommendedAnchorPosition: [0, 0, -2.2], linkedUniverseId: "daily-cafe-street",
    },
  ]);

export function resolveAsset3dBg3dGlbIdForDiorama(dioramaId: string): string {
  if (dioramaId === "diorama_school_hallway") return "varco_diorama_hallway_remesh_quad";
  if (dioramaId.includes("school") || dioramaId.includes("academy")) return "classroom-podium-desk";
  if (dioramaId.includes("rofan") || dioramaId.includes("palace") || dioramaId.includes("throne")) {
    return "rofan-golden-throne";
  }
  if (dioramaId.includes("murim") || dioramaId.includes("hanok") || dioramaId.includes("temple")) {
    return "murim-sword-rack";
  }
  if (dioramaId.includes("dungeon") || dioramaId.includes("hunter") || dioramaId.includes("boss")) {
    return "hunter-awakening-altar";
  }
  if (dioramaId.includes("cyberpunk") || dioramaId.includes("lab") || dioramaId.includes("subway")) {
    return "cyberpunk-holo-kiosk";
  }
  if (dioramaId.includes("hospital") || dioramaId.includes("surgery") || dioramaId.includes("ward")) {
    return "medical-iv-monitor";
  }
  if (dioramaId.includes("office") || dioramaId.includes("court") || dioramaId.includes("detective") || dioramaId.includes("interrogation")) {
    return "noir-neon-streetlamp";
  }
  return "cafe-espresso-bar";
}

export function getStudioBg3dAsset3dGlbCalibration(
  assetIdOrDioramaId: string,
): StudioBg3dAsset3dGlbCalibrationSpec {
  const direct = STUDIO_BG3D_ASSET3D_GLB_CALIBRATION_CATALOG.find(
    (item) => item.assetId === assetIdOrDioramaId || item.linkedUniverseId === assetIdOrDioramaId,
  );
  if (direct) return direct;
  const mappedId = resolveAsset3dBg3dGlbIdForDiorama(assetIdOrDioramaId);
  return (
    STUDIO_BG3D_ASSET3D_GLB_CALIBRATION_CATALOG.find((item) => item.assetId === mappedId) ??
    STUDIO_BG3D_ASSET3D_GLB_CALIBRATION_CATALOG[0]!
  );
}

export function buildCalibratedAsset3dBg3dGlbPlacement(
  assetIdOrDioramaId: string,
  options?: {
    readonly positionOffset?: Vec3;
    readonly scaleMultiplier?: number;
    readonly rotationYRad?: number;
    readonly idPrefix?: string;
  },
): Bg3dGlbItem {
  const spec = getStudioBg3dAsset3dGlbCalibration(assetIdOrDioramaId);
  const localAsset = STUDIO_ASSET3D_LOCAL_GLB_ASSETS.find((a) => a.id === spec.assetId);
  const mult = Math.max(0.25, Math.min(3.0, options?.scaleMultiplier ?? 1));
  const finalScale = Number((spec.calibratedScale * mult).toFixed(3));
  const offset = options?.positionOffset ?? [0, 0, 0];
  const groundedY = Number((spec.groundYOffset * mult + offset[1]).toFixed(3));
  const idPrefix = options?.idPrefix ?? "varco3d-glb";

  return {
    id: `${idPrefix}-${spec.assetId}`,
    name: localAsset?.labelKo ?? spec.labelKo,
    kind: "glb",
    url: spec.url,
    position: [
      Number((spec.recommendedAnchorPosition[0] + offset[0]).toFixed(3)),
      groundedY,
      Number((spec.recommendedAnchorPosition[2] + offset[2]).toFixed(3)),
    ],
    rotation: [0, options?.rotationYRad ?? 0, 0],
    scale: [finalScale, finalScale, finalScale],
    visible: true,
    locked: false,
  };
}
