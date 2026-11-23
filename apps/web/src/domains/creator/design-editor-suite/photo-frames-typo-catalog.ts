/**
 * 8종 포토 마스크 프레임 SVG 기하학 & 6종 한글 타이포 효과 카탈로그
 */

export type PhotoMaskFrameId =
  | "circle"
  | "arch"
  | "polaroid"
  | "filmstrip"
  | "smartphone"
  | "comic-balloon"
  | "postage-stamp"
  | "hexagon";

export type KoreanTypoEffectId =
  | "curved-arch"
  | "sticker-outline"
  | "neon-glow"
  | "extrude-3d"
  | "ribbon-badge"
  | "gradient-ink";

export interface PhotoMaskFramePreset {
  readonly id: PhotoMaskFrameId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
}

export interface PhotoMaskSvgGeometry {
  readonly clipPathD: string;
  readonly borderPathD: string;
  readonly decorPaths: readonly string[];
  readonly innerImageRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface KoreanTypoEffectPreset {
  readonly id: KoreanTypoEffectId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly cssClass: string;
}

export const PHOTO_MASK_FRAMES: readonly PhotoMaskFramePreset[] = [
  { id: "circle", nameKo: "원형", nameEn: "Circle", hintKo: "프로필·굿즈 버튼 배지용 원형 클립", hintEn: "Circular clip for avatars and pin badges" },
  { id: "arch", nameKo: "아치", nameEn: "Arch", hintKo: "로판 표지·포스터용 창문 아치 프레임", hintEn: "Cathedral arch window for covers and posters" },
  { id: "polaroid", nameKo: "폴라로이드", nameEn: "Polaroid", hintKo: "하단 여백이 넓은 즉석 인화 사진 프레임", hintEn: "Instant photo border with bottom caption margin" },
  { id: "filmstrip", nameKo: "필름스트립", nameEn: "Filmstrip", hintKo: "좌우 천공 홀이 있는 시네마 컷 프레임", hintEn: "Cinema frame with sprocket perforations" },
  { id: "smartphone", nameKo: "스마트폰 목업", nameEn: "Smartphone Mockup", hintKo: "노치 베젤이 포함된 모바일 화면 목업", hintEn: "Mobile device bezel with top notch bar" },
  { id: "comic-balloon", nameKo: "만화 말풍선", nameEn: "Comic Speech Balloon", hintKo: "꼬리가 달린 웹툰 대사·컷아웃 프레임", hintEn: "Speech bubble contour with pointed tail" },
  { id: "postage-stamp", nameKo: "우표", nameEn: "Postage Stamp", hintKo: "톱니 테두리 우표·스티커 수집 프레임", hintEn: "Perforated postage stamp collectible edge" },
  { id: "hexagon", nameKo: "육각형", nameEn: "Hexagon", hintKo: "캐릭터 스탯·배지용 정육각형 마스크", hintEn: "Geometric six-sided emblem mask" },
] as const;

export const KOREAN_TYPO_EFFECTS: readonly KoreanTypoEffectPreset[] = [
  { id: "curved-arch", nameKo: "곡선 아치 텍스트", nameEn: "Curved Arch Text", descriptionKo: "포스터·굿즈 스티커에 어울리는 부드러운 아치형 곡선 배치", descriptionEn: "Arched baseline curve ideal for posters and stickers", cssClass: "des-typo-curved-arch" },
  { id: "sticker-outline", nameKo: "외곽선 스티커", nameEn: "Sticker Outline", descriptionKo: "두꺼운 외곽 테두리로 배경 위 가독성을 높이는 썸네일 스티커 효과", descriptionEn: "Bold outer contour stroke for crisp thumbnail contrast", cssClass: "des-typo-sticker-outline" },
  { id: "neon-glow", nameKo: "네온 글로우", nameEn: "Neon Glow", descriptionKo: "야경·스릴러·릴스 예고편용 발광 후광 타이포", descriptionEn: "Luminous edge halo suited for dark trailers and reels", cssClass: "des-typo-neon-glow" },
  { id: "extrude-3d", nameKo: "3D 압출 그림자", nameEn: "3D Extruded Shadow", descriptionKo: "다층 입체 오프셋으로 시선을 고정하는 타이틀 압출 효과", descriptionEn: "Multi-step directional block shadow for poster depth", cssClass: "des-typo-extrude-3d" },
  { id: "ribbon-badge", nameKo: "리본 배지", nameEn: "Ribbon Badge", descriptionKo: "양쪽 끝이 접힌 리본 띠 위에 헤드라인을 얹는 공지 스타일", descriptionEn: "Notched ribbon banner framing headline announcements", cssClass: "des-typo-ribbon-badge" },
  { id: "gradient-ink", nameKo: "그라데이션 잉크", nameEn: "Gradient Ink", descriptionKo: "브랜드 키트 주색과 보조색이 자연스럽게 번지는 잉크 타이포", descriptionEn: "Dual-token gradient ink fill mapped to the active brand kit", cssClass: "des-typo-gradient-ink" },
] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 8종 포토 마스크 프레임 SVG 클립 경로 및 프레임 장식 경로 생성기.
 */
export function buildPhotoMaskSvgGeometry(
  frameId: PhotoMaskFrameId,
  x: number,
  y: number,
  width: number,
  height: number,
): PhotoMaskSvgGeometry {
  const safeW = Math.max(10, Number.isFinite(width) ? width : 100);
  const safeH = Math.max(10, Number.isFinite(height) ? height : 100);
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  const cx = sx + safeW / 2;
  const cy = sy + safeH / 2;

  if (frameId === "circle") {
    const r = Math.min(safeW, safeH) / 2;
    const d = `M ${round2(cx - r)} ${round2(cy)} A ${round2(r)} ${round2(r)} 0 1 0 ${round2(cx + r)} ${round2(cy)} A ${round2(r)} ${round2(r)} 0 1 0 ${round2(cx - r)} ${round2(cy)} Z`;
    return { clipPathD: d, borderPathD: d, decorPaths: [], innerImageRect: { x: round2(cx - r), y: round2(cy - r), width: round2(r * 2), height: round2(r * 2) } };
  }

  if (frameId === "arch") {
    const rx = safeW / 2;
    const archH = Math.min(rx, safeH * 0.55);
    const d = `M ${round2(sx)} ${round2(sy + safeH)} L ${round2(sx)} ${round2(sy + archH)} A ${round2(rx)} ${round2(archH)} 0 0 1 ${round2(sx + safeW)} ${round2(sy + archH)} L ${round2(sx + safeW)} ${round2(sy + safeH)} Z`;
    return { clipPathD: d, borderPathD: d, decorPaths: [], innerImageRect: { x: round2(sx), y: round2(sy), width: round2(safeW), height: round2(safeH) } };
  }

  if (frameId === "polaroid") {
    const side = Math.max(4, Math.min(safeW, safeH) * 0.065);
    const bottom = Math.max(12, safeH * 0.2);
    const innerW = Math.max(4, safeW - side * 2);
    const innerH = Math.max(4, safeH - side - bottom);
    const outerD = `M ${round2(sx)} ${round2(sy)} H ${round2(sx + safeW)} V ${round2(sy + safeH)} H ${round2(sx)} Z`;
    const innerD = `M ${round2(sx + side)} ${round2(sy + side)} H ${round2(sx + side + innerW)} V ${round2(sy + side + innerH)} H ${round2(sx + side)} Z`;
    return { clipPathD: innerD, borderPathD: outerD, decorPaths: [innerD], innerImageRect: { x: round2(sx + side), y: round2(sy + side), width: round2(innerW), height: round2(innerH) } };
  }

  if (frameId === "filmstrip") {
    const rail = Math.max(8, safeW * 0.11);
    const innerW = Math.max(4, safeW - rail * 2);
    const innerY = sy + safeH * 0.06;
    const innerH = Math.max(4, safeH * 0.88);
    const outerD = `M ${round2(sx)} ${round2(sy)} H ${round2(sx + safeW)} V ${round2(sy + safeH)} H ${round2(sx)} Z`;
    const innerD = `M ${round2(sx + rail)} ${round2(innerY)} H ${round2(sx + rail + innerW)} V ${round2(innerY + innerH)} H ${round2(sx + rail)} Z`;
    const holes: string[] = [];
    const holeW = rail * 0.48;
    const holeH = Math.max(4, safeH * 0.09);
    for (let i = 0; i < 4; i += 1) {
      const hy = sy + ((i + 0.5) / 4) * safeH - holeH / 2;
      const lx = sx + (rail - holeW) / 2;
      const rxPos = sx + safeW - rail + (rail - holeW) / 2;
      holes.push(`M ${round2(lx)} ${round2(hy)} H ${round2(lx + holeW)} V ${round2(hy + holeH)} H ${round2(lx)} Z`);
      holes.push(`M ${round2(rxPos)} ${round2(hy)} H ${round2(rxPos + holeW)} V ${round2(hy + holeH)} H ${round2(rxPos)} Z`);
    }
    return { clipPathD: innerD, borderPathD: outerD, decorPaths: [innerD, ...holes], innerImageRect: { x: round2(sx + rail), y: round2(innerY), width: round2(innerW), height: round2(innerH) } };
  }

  if (frameId === "smartphone") {
    const r = Math.min(safeW, safeH) * 0.12;
    const bezel = Math.max(5, Math.min(safeW, safeH) * 0.05);
    const notchW = safeW * 0.34;
    const notchH = Math.max(4, bezel * 1.15);
    const outerD = `M ${round2(sx + r)} ${round2(sy)} H ${round2(sx + safeW - r)} Q ${round2(sx + safeW)} ${round2(sy)} ${round2(sx + safeW)} ${round2(sy + r)} V ${round2(sy + safeH - r)} Q ${round2(sx + safeW)} ${round2(sy + safeH)} ${round2(sx + safeW - r)} ${round2(sy + safeH)} H ${round2(sx + r)} Q ${round2(sx)} ${round2(sy + safeH)} ${round2(sx)} ${round2(sy + safeH - r)} V ${round2(sy + r)} Q ${round2(sx)} ${round2(sy)} ${round2(sx + r)} ${round2(sy)} Z`;
    const ix = sx + bezel;
    const iy = sy + bezel * 1.6;
    const iw = Math.max(4, safeW - bezel * 2);
    const ih = Math.max(4, safeH - bezel * 3.2);
    const innerD = `M ${round2(ix)} ${round2(iy)} H ${round2(ix + iw)} V ${round2(iy + ih)} H ${round2(ix)} Z`;
    const notchD = `M ${round2(cx - notchW / 2)} ${round2(sy + bezel * 0.55)} H ${round2(cx + notchW / 2)} V ${round2(sy + bezel * 0.55 + notchH)} H ${round2(cx - notchW / 2)} Z`;
    return { clipPathD: innerD, borderPathD: outerD, decorPaths: [notchD, innerD], innerImageRect: { x: round2(ix), y: round2(iy), width: round2(iw), height: round2(ih) } };
  }

  if (frameId === "comic-balloon") {
    const bodyH = safeH * 0.84;
    const r = Math.min(safeW, bodyH) * 0.14;
    const tailBaseX = sx + safeW * 0.28;
    const tailTipX = sx + safeW * 0.16;
    const d = [
      `M ${round2(sx + r)} ${round2(sy)} H ${round2(sx + safeW - r)}`,
      `Q ${round2(sx + safeW)} ${round2(sy)} ${round2(sx + safeW)} ${round2(sy + r)}`,
      `V ${round2(sy + bodyH - r)}`,
      `Q ${round2(sx + safeW)} ${round2(sy + bodyH)} ${round2(sx + safeW - r)} ${round2(sy + bodyH)}`,
      `H ${round2(tailBaseX + safeW * 0.12)} L ${round2(tailTipX)} ${round2(sy + safeH)} L ${round2(tailBaseX)} ${round2(sy + bodyH)}`,
      `H ${round2(sx + r)} Q ${round2(sx)} ${round2(sy + bodyH)} ${round2(sx)} ${round2(sy + bodyH - r)}`,
      `V ${round2(sy + r)} Q ${round2(sx)} ${round2(sy)} ${round2(sx + r)} ${round2(sy)} Z`,
    ].join(" ");
    return { clipPathD: d, borderPathD: d, decorPaths: [], innerImageRect: { x: round2(sx), y: round2(sy), width: round2(safeW), height: round2(bodyH) } };
  }

  if (frameId === "postage-stamp") {
    const inset = Math.max(6, Math.min(safeW, safeH) * 0.08);
    const tooth = Math.max(6, Math.min(safeW, safeH) * 0.075);
    const cols = Math.max(4, Math.floor(safeW / tooth));
    const rows = Math.max(4, Math.floor(safeH / tooth));
    const stepX = safeW / cols;
    const stepY = safeH / rows;
    const notch = Math.min(stepX, stepY) * 0.28;
    const parts: string[] = [`M ${round2(sx)} ${round2(sy)}`];
    for (let i = 0; i < cols; i += 1) parts.push(`L ${round2(sx + (i + 0.5) * stepX)} ${round2(sy + notch)} L ${round2(sx + (i + 1) * stepX)} ${round2(sy)}`);
    for (let j = 0; j < rows; j += 1) parts.push(`L ${round2(sx + safeW - notch)} ${round2(sy + (j + 0.5) * stepY)} L ${round2(sx + safeW)} ${round2(sy + (j + 1) * stepY)}`);
    for (let i = cols - 1; i >= 0; i -= 1) parts.push(`L ${round2(sx + (i + 0.5) * stepX)} ${round2(sy + safeH - notch)} L ${round2(sx + i * stepX)} ${round2(sy + safeH)}`);
    for (let j = rows - 1; j >= 0; j -= 1) parts.push(`L ${round2(sx + notch)} ${round2(sy + (j + 0.5) * stepY)} L ${round2(sx)} ${round2(sy + j * stepY)}`);
    parts.push("Z");
    const outerD = parts.join(" ");
    const innerD = `M ${round2(sx + inset)} ${round2(sy + inset)} H ${round2(sx + safeW - inset)} V ${round2(sy + safeH - inset)} H ${round2(sx + inset)} Z`;
    return { clipPathD: innerD, borderPathD: outerD, decorPaths: [innerD], innerImageRect: { x: round2(sx + inset), y: round2(sy + inset), width: round2(Math.max(4, safeW - inset * 2)), height: round2(Math.max(4, safeH - inset * 2)) } };
  }

  const rx = safeW / 2;
  const ry = safeH / 2;
  const hexPts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    hexPts.push(`${i === 0 ? "M" : "L"} ${round2(cx + rx * Math.cos(angle))} ${round2(cy + ry * Math.sin(angle))}`);
  }
  hexPts.push("Z");
  const d = hexPts.join(" ");
  return { clipPathD: d, borderPathD: d, decorPaths: [], innerImageRect: { x: round2(sx), y: round2(sy), width: round2(safeW), height: round2(safeH) } };
}
