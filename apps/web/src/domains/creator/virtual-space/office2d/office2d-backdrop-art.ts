import { STUDIO_OFFICE_ENVIRONMENTS, studioOfficeEnvironment } from "../studio-virtual-space-office-environments";
/**
 * ToonOffice 2D 고품질 이미지 배경(룸 아트 뮤럴·테마 카펫), 실시간 공간 이펙트,
 * 가구 가림 반투명화(Occlusion Fade), 만화적 의성어(VFX Burst), 평면도(Schematic) 오버뷰 렌더러.
 *
 * 경쟁사 REA 벤치마크(Gather v2 룸 배경/포드, ZEP 이모트/오브젝트 연출, SoWork schematic 평면도·문 노크·자동 착석,
 * WorkAdventure ActionableItem 24px 전방 선택·프리팹 depth 보정, Kumospace 공간 테마)를 통합한다.
 */
import {
  ILLUSTRATED_2D_WORKSTATIONS,
  type Illustrated2dWorkstationPlacement,
} from "../studio-virtual-space-illustrated-2d-runtime";
import type { StudioSpaceThemeKey } from "../studio-virtual-space-theme";
import { TOON_HQ_ROOMS, type ToonHqRoom } from "./hq/toon-hq-blueprint";
import type { Office2dActor } from "./office2d-actors";
import type { Office2dCamera } from "./office2d-camera";
import { office2dRoundRect, type Office2dCanvas2D } from "./office2d-procedural-art";
import type { Office2dDrawable } from "./office2d-renderer";
import type { Office2dScene, Office2dSceneObject, Office2dWall } from "./office2d-scene";

const HQ_ROOM_BY_ID: ReadonlyMap<string, ToonHqRoom> = new Map(
  TOON_HQ_ROOMS.map((room) => [room.id, room] as const),
);

export interface Office2dRoomArtSpec {
  readonly roomId: string;
  readonly backdropUrl: string;
  readonly propUrl?: string;
  readonly workstationId: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly sfxKo: string;
  readonly sfxEn: string;
  readonly accent: string;
}

/** 13개 주요 스튜디오 방별 고해상도 WebP 배경 원화·2.5D 핵심 워크스테이션·만화 의성어 매핑. */
export const OFFICE2D_ROOM_ART_SPECS: Readonly<Record<string, Office2dRoomArtSpec>> = Object.freeze({
  "hq-story-room": {
    roomId: "hq-story-room",
    backdropUrl: "/assets/virtual-studio/studio-art-v14/rooms/tarot-story-oracle-pavilion.webp",
    propUrl: "/assets/virtual-studio/studio-art-v10/props/lofi-bookshelf-lounge.webp",
    workstationId: "nb-cowork-tarot-pavilion",
    badgeKo: "🔮 세계관·콘티 오라클",
    badgeEn: "Story Oracle",
    sfxKo: "번뜩—!! 💡",
    sfxEn: "EUREKA—!! 💡",
    accent: "#c084fc",
  },
  "hq-ink-bay": {
    roomId: "hq-ink-bay",
    backdropUrl: "/assets/virtual-studio/studio-art-v11/themes/seoul-editorial-hq.webp",
    propUrl: "/assets/virtual-studio/studio-art-v13/props/dual-cintiq-critique-pod.webp",
    workstationId: "nb-plaza-cintiq-pod",
    badgeKo: "✒️ 듀얼 신티크 펜선 포드",
    badgeEn: "Dual Cintiq Pod",
    sfxKo: "스슥— ✒️",
    sfxEn: "SKETCH— ✒️",
    accent: "#38bdf8",
  },
  "hq-color-lab": {
    roomId: "hq-color-lab",
    backdropUrl: "/assets/virtual-studio/studio-art-v11/themes/cyber-neon-lab.webp",
    propUrl: "/assets/virtual-studio/studio-art-v10/props/cintiq-drawing-desk.webp",
    workstationId: "nb-studio-main-cintiq",
    badgeKo: "🎨 HDR 컬러·역광 랩",
    badgeEn: "HDR Color Lab",
    sfxKo: "반짝— ✨",
    sfxEn: "GLOW— ✨",
    accent: "#f472b6",
  },
  "hq-bg3d-lab": {
    roomId: "hq-bg3d-lab",
    backdropUrl: "/assets/virtual-studio/studio-art-v13/themes/abyssal-bioluminescent-worldlab.webp",
    propUrl: "/assets/virtual-studio/studio-art-v13/props/blender-hologram-stage-table.webp",
    workstationId: "nb-plaza-hologram-table",
    badgeKo: "🧊 3D 배경 홀로그램 턴테이블",
    badgeEn: "3D Hologram Stage",
    sfxKo: "위이잉— 🧊",
    sfxEn: "RENDER— 🧊",
    accent: "#fbbf24",
  },
  "hq-reference-library": {
    roomId: "hq-reference-library",
    backdropUrl: "/assets/virtual-studio/studio-art-v13/themes/magic-academy-astral-library.webp",
    workstationId: "nb-cafe-lofi-storyhouse",
    badgeKo: "📚 아스트랄 설정 도서관",
    badgeEn: "Reference Library",
    sfxKo: "사락— 📖",
    sfxEn: "FLIP— 📖",
    accent: "#a78bfa",
  },
  "hq-focus-booths": {
    roomId: "hq-focus-booths",
    backdropUrl: "/assets/virtual-studio/studio-art-v11/themes/hanok-botanical-atelier.webp",
    workstationId: "nb-studio-main-cintiq",
    badgeKo: "🛡️ 1인 방음 몰입 부스",
    badgeEn: "Silent Focus Pod",
    sfxKo: "몰입 ON 🔥",
    sfxEn: "FOCUS ON 🔥",
    accent: "#34d399",
  },
  "hq-lettering-desk": {
    roomId: "hq-lettering-desk",
    backdropUrl: "/assets/virtual-studio/studio-art-v13/themes/dolby-sound-dubbing-studio.webp",
    propUrl: "/assets/virtual-studio/studio-art-v13/props/webtoon-sound-foley-booth.webp",
    workstationId: "nb-plaza-foley-booth",
    badgeKo: "🎧 의성어·폴리 사운드 부스",
    badgeEn: "SFX & Lettering",
    sfxKo: "콰아앙—!! ⚡",
    sfxEn: "BOOM—!! ⚡",
    accent: "#a855f7",
  },
  "hq-review-room": {
    roomId: "hq-review-room",
    backdropUrl: "/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
    propUrl: "/assets/virtual-studio/studio-art-v10/props/on-air-critique-booth.webp",
    workstationId: "nb-plaza-cintiq-pod",
    badgeKo: "🎬 5K 합평 시사회 스크린",
    badgeEn: "5K Review Stage",
    sfxKo: "승인 PASS ✅",
    sfxEn: "APPROVED ✅",
    accent: "#60a5fa",
  },
  "hq-war-room": {
    roomId: "hq-war-room",
    backdropUrl: "/assets/virtual-studio/studio-art-v12/themes/scifi-orbital-command.webp",
    workstationId: "nb-talk-ip-boardroom",
    badgeKo: "📡 마감 칸반 커맨드룸",
    badgeEn: "Deadline Command",
    sfxKo: "컷 전진 🚀",
    sfxEn: "CUT ADVANCE 🚀",
    accent: "#f97316",
  },
  "hq-lobby": {
    roomId: "hq-lobby",
    backdropUrl: "/assets/virtual-studio/studio-art-v14/rooms/recruit-interview-conservatory.webp",
    propUrl: "/assets/virtual-studio/studio-art-v10/props/biophilic-planter-set.webp",
    workstationId: "nb-lobby-recruit-conservatory",
    badgeKo: "🌿 바이오필릭 웰컴 로비",
    badgeEn: "Biophilic Lobby",
    sfxKo: "환영합니다 👋",
    sfxEn: "WELCOME 👋",
    accent: "#10b981",
  },
  "hq-lounge": {
    roomId: "hq-lounge",
    backdropUrl: "/assets/virtual-studio/studio-art-v11/themes/lofi-cat-storyhouse.webp",
    propUrl: "/assets/virtual-studio/studio-art-v13/props/deadline-espresso-cat-lounge.webp",
    workstationId: "nb-plaza-espresso-cat-lounge",
    badgeKo: "☕ 에스프레소 & 캣 라운지",
    badgeEn: "Espresso Cat Lounge",
    sfxKo: "보글보글 ☕",
    sfxEn: "BREWING ☕",
    accent: "#f59e0b",
  },
  "hq-meeting-room": {
    roomId: "hq-meeting-room",
    backdropUrl: "/assets/virtual-studio/studio-art-v14/rooms/global-ip-pitch-boardroom.webp",
    workstationId: "nb-talk-ip-boardroom",
    badgeKo: "🎬 글로벌 IP 피칭 보드룸",
    badgeEn: "IP Pitch Boardroom",
    sfxKo: "똑똑 · 노크 🔔",
    sfxEn: "KNOCK 🔔",
    accent: "#38bdf8",
  },
  "hq-publish-desk": {
    roomId: "hq-publish-desk",
    backdropUrl: "/assets/virtual-studio/studio-art-v12/themes/brooklyn-indie-comics-loft.webp",
    propUrl: "/assets/virtual-studio/studio-art-v10/props/hologram-pedestal.webp",
    workstationId: "nb-game-retro-arcade",
    badgeKo: "🚀 글로벌 연재 송고 데스크",
    badgeEn: "Global Publish Desk",
    sfxKo: "업로드 완료 🎉",
    sfxEn: "PUBLISHED 🎉",
    accent: "#ec4899",
  },
});

const SPACE_THEME_BACKDROP_URLS: Readonly<Partial<Record<StudioSpaceThemeKey, string>>> = Object.freeze({
  "webtoon-atelier": "/assets/virtual-studio/studio-art-v11/themes/seoul-editorial-hq.webp",
  "modern-office": "/assets/virtual-studio/studio-art-v14/rooms/global-ip-pitch-boardroom.webp",
  "cozy-wood": "/assets/virtual-studio/studio-art-v11/themes/lofi-cat-storyhouse.webp",
  "neon-night": "/assets/virtual-studio/studio-art-v11/themes/cyber-neon-lab.webp",
  "garden-terrace": "/assets/virtual-studio/studio-art-v12/themes/murim-bamboo-pavilion.webp",
  "sakura-campus": "/assets/virtual-studio/studio-art-v12/themes/romance-palace-conservatory.webp",
  "sunset-harbor": "/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
  library: "/assets/virtual-studio/studio-art-v13/themes/magic-academy-astral-library.webp",
  "celestial-observatory": "/assets/virtual-studio/studio-art-v12/themes/scifi-orbital-command.webp",
  "cinema-screening": "/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
});

/** 지연 로딩할 고해상도 룸 배경·소품 이미지 URL 목록. */
export function office2dBackdropAssetUrls(): readonly string[] {
  const urls = new Set<string>([...Object.values(SPACE_THEME_BACKDROP_URLS).filter((url): url is string => Boolean(url)), ...STUDIO_OFFICE_ENVIRONMENTS.map((environment) => environment.previewUrl)]);
  for (const spec of Object.values(OFFICE2D_ROOM_ART_SPECS)) {
    urls.add(spec.backdropUrl);
    if (spec.propUrl) urls.add(spec.propUrl);
  }
  return [...urls];
}

/** 현재 방 ID 또는 상호작용 오브젝트 ID에 대응하는 라이브 워크스테이션 배치를 찾는다. */
export function resolveOffice2dWorkstation(
  roomId: string | null | undefined,
  objectId?: string | null,
): Illustrated2dWorkstationPlacement {
  if (objectId) {
    if (objectId.includes("3d")) return findStation("nb-plaza-hologram-table");
    if (objectId.includes("letter") || objectId.includes("foley")) return findStation("nb-plaza-foley-booth");
    if (objectId.includes("coffee") || objectId.includes("lounge")) return findStation("nb-plaza-espresso-cat-lounge");
    if (objectId.includes("story")) return findStation("nb-cowork-tarot-pavilion");
    if (objectId.includes("kanban") || objectId.includes("meeting")) return findStation("nb-talk-ip-boardroom");
    if (objectId.includes("color")) return findStation("nb-studio-main-cintiq");
  }
  const spec = roomId ? OFFICE2D_ROOM_ART_SPECS[roomId] : undefined;
  return findStation(spec?.workstationId ?? "nb-plaza-cintiq-pod");
}

function findStation(id: string): Illustrated2dWorkstationPlacement {
  return ILLUSTRATED_2D_WORKSTATIONS.find((station) => station.id === id) ?? ILLUSTRATED_2D_WORKSTATIONS[0]!;
}

/**
 * 바닥 청크에 방별 고품질 아트 카펫(타피스트리)을 은은하게 합성한다.
 * 가구와 캐릭터 가독성을 해치지 않도록 라운드 프레임과 비네팅 알파(0.24)로 블렌딩한다.
 */
export function paintOffice2dRoomFloorBackdrops(
  ctx: Office2dCanvas2D,
  scene: Office2dScene,
  originX: number,
  originY: number,
  chunkSize: number,
  getImage: (url: string) => Office2dDrawable | null,
  spaceTheme?: StudioSpaceThemeKey | null,
): void {
  if (scene.kind !== "toon-hq") return;
  const themeUrl = spaceTheme ? studioOfficeEnvironment(spaceTheme)?.previewUrl ?? SPACE_THEME_BACKDROP_URLS[spaceTheme] : null;
  const themeImg = themeUrl ? getImage(themeUrl) : null;
  for (const room of TOON_HQ_ROOMS) {
    const spec = OFFICE2D_ROOM_ART_SPECS[room.id];
    if (!spec) continue;
    const insetX = room.x + Math.max(44, room.width * 0.14);
    const insetY = room.y + 108;
    const insetW = Math.max(120, room.width - Math.max(88, room.width * 0.28));
    const insetH = Math.max(84, room.height - 148);
    if (insetX >= originX + chunkSize || insetX + insetW <= originX || insetY >= originY + chunkSize || insetY + insetH <= originY) {
      continue;
    }
    const img = themeImg ?? getImage(spec.backdropUrl);
    ctx.save();
    office2dRoundRect(ctx, insetX, insetY, insetW, insetH, 16);
    ctx.clip();
    if (img) {
      ctx.globalAlpha = 0.24;
      ctx.drawImage(img, insetX, insetY, insetW, insetH);
    } else {
      ctx.fillStyle = spec.accent;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(insetX, insetY, insetW, insetH);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = spec.accent;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1.5;
    office2dRoundRect(ctx, insetX, insetY, insetW, insetH, 16);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 북쪽 벽에 고해상도 스튜디오 콘셉트 아트 윈도우(액자형 파노라마 뮤럴)를 그린다.
 */
export function paintOffice2dNorthWallArtMural(
  ctx: Office2dCanvas2D,
  wall: Office2dWall,
  getImage: (url: string) => Office2dDrawable | null,
  time: number,
  reducedMotion: boolean,
): void {
  const spec = OFFICE2D_ROOM_ART_SPECS[wall.roomId];
  if (!spec || wall.width < 220) return;
  const img = getImage(spec.backdropUrl);
  if (!img) return;
  const muralW = Math.min(136, wall.width * 0.26);
  const muralH = Math.min(52, wall.height - 26);
  const mx = wall.x + wall.width - muralW - 22;
  const my = wall.y + 14;
  if (wall.signX !== undefined && Math.abs(mx + muralW / 2 - wall.signX) < muralW * 0.85) return;

  ctx.save();
  ctx.fillStyle = "#181512";
  office2dRoundRect(ctx, mx - 3, my - 3, muralW + 6, muralH + 6, 8);
  ctx.fill();
  office2dRoundRect(ctx, mx, my, muralW, muralH, 6);
  ctx.clip();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(img, mx, my, muralW, muralH);
  ctx.restore();

  const glow = reducedMotion ? 0.45 : 0.4 + Math.sin(time * 2.2 + wall.x * 0.01) * 0.15;
  ctx.save();
  ctx.strokeStyle = spec.accent;
  ctx.globalAlpha = glow;
  ctx.lineWidth = 1.6;
  office2dRoundRect(ctx, mx - 2, my - 2, muralW + 4, muralH + 4, 7);
  ctx.stroke();
  ctx.restore();
}

/**
 * 각 방의 제작 파이프라인 성격을 살리는 실시간 공간 배경 이펙트(홀로그램·프리즘·타로 오라클·사운드 파형)를 렌더링한다.
 */
export function paintOffice2dRoomAmbientEffects(
  ctx: Office2dCanvas2D,
  scene: Office2dScene,
  visible: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number },
  time: number,
  reducedMotion: boolean,
  getImage: (url: string) => Office2dDrawable | null,
): void {
  if (scene.kind !== "toon-hq") return;
  for (const room of TOON_HQ_ROOMS) {
    if (room.x > visible.maxX || room.x + room.width < visible.minX || room.y > visible.maxY || room.y + room.height < visible.minY) {
      continue;
    }
    const spec = OFFICE2D_ROOM_ART_SPECS[room.id];
    if (!spec) continue;
    const cx = room.x + room.width * 0.5;
    const cy = room.y + room.height * 0.56;
    const pulse = reducedMotion ? 0.5 : 0.5 + Math.sin(time * 2.4 + room.x * 0.02) * 0.25;

    ctx.save();
    if (room.id === "hq-bg3d-lab") {
      // 3D 배경 랩: 회전하는 홀로그램 투영 링 + 아이소메트릭 와이어프레임 큐브
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.24 + pulse * 0.18})`;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.ellipse(cx, cy + 16, 56, 24, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const angle = reducedMotion ? 0.4 : time * 0.9;
      const r = 18;
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.35 + pulse * 0.2})`;
      ctx.beginPath();
      for (let i = 0; i < 4; i += 1) {
        const a = angle + (i * Math.PI) / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy - 6 + Math.sin(a) * (r * 0.45);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (room.id === "hq-story-room") {
      // 콘티·시나리오 룸: 황금빛 타로·플롯 성좌 링
      ctx.strokeStyle = `rgba(192, 132, 252, ${0.22 + pulse * 0.15})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 10, 52, 22, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (room.id === "hq-color-lab") {
      // 채색 랩: 프리즘 오로라 글로우
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 74);
      grad.addColorStop(0, `rgba(244, 114, 182, ${0.14 + pulse * 0.08})`);
      grad.addColorStop(0.5, `rgba(56, 189, 248, ${0.1 + pulse * 0.06})`);
      grad.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 74, 0, Math.PI * 2);
      ctx.fill();
    } else if (room.id === "hq-lettering-desk") {
      // 식자·사운드실: 폴리 사운드 이퀄라이저 파형
      ctx.fillStyle = `rgba(168, 85, 247, ${0.28 + pulse * 0.2})`;
      for (let i = -3; i <= 3; i += 1) {
        const barH = reducedMotion ? 10 : 6 + Math.abs(Math.sin(time * 4.5 + i * 0.9)) * 14;
        ctx.fillRect(cx + i * 8 - 2, cy + 20 - barH, 4, barH);
      }
    } else if (room.id === "hq-war-room") {
      // 마감 워룸: 레이더 스윕 링
      ctx.strokeStyle = `rgba(249, 115, 22, ${0.22 + pulse * 0.16})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 12, 48, 20, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 북쪽 벽 창문에서 바닥으로 드리우는 대각선 볼류메트릭 채광(Sunbeam / Neon Light Shaft)
    const beamGrad = ctx.createLinearGradient(room.x + 28, room.y + 72, room.x + 124, room.y + 216);
    beamGrad.addColorStop(0, `${spec.accent}1f`);
    beamGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(room.x + 24, room.y + 74);
    ctx.lineTo(room.x + 106, room.y + 74);
    ctx.lineTo(room.x + 150, room.y + 214);
    ctx.lineTo(room.x + 48, room.y + 214);
    ctx.closePath();
    ctx.fill();

    // 2.5D 특화 소품 아이콘 배지(방 우하단 코너 홀로그램 스탬프)
    if (spec.propUrl) {
      const propImg = getImage(spec.propUrl);
      if (propImg) {
        const pw = 54;
        const ph = 48;
        const px = room.x + room.width - pw - 18;
        const py = room.y + room.height - ph - 22;
        ctx.globalAlpha = 0.86;
        ctx.drawImage(propImg, px, py, pw, ph);
      }
    }
    ctx.restore();
  }
}

/**
 * 키 큰 가구(책장·파티션·부스·보드·자판기) 뒤로 배우가 들어갈 때 가구를 부드럽게 반투명화(Occlusion Fade)한다.
 * 배우가 가려진 경우 true와 낮아진 알파(0.44)를 돌려준다.
 */
export function computeOffice2dObjectOcclusion(
  object: Office2dSceneObject,
  drawnHeight: number,
  actors: readonly Office2dActor[],
): { readonly occluded: boolean; readonly alpha: number; readonly actor: Office2dActor | null } {
  if (!object.footprint && object.sprite !== "partition" && object.sprite !== "bookshelf") {
    return { occluded: false, alpha: 1, actor: null };
  }
  const halfW = object.width * 0.48;
  const topY = object.y - Math.max(28, drawnHeight * 0.88);
  for (const actor of actors) {
    if (actor.seat) continue;
    if (actor.y < object.y - 4 && actor.y > topY && Math.abs(actor.x - object.x) < halfW) {
      return { occluded: true, alpha: 0.44, actor };
    }
  }
  return { occluded: false, alpha: 1, actor: null };
}

export interface Office2dComicBurst {
  readonly id: number;
  readonly text: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly createdAt: number;
  readonly durationMs: number;
}

/**
 * ZEP/웹툰 스타일 만화적 의성어·특수효과 팝업(상승 + 스케일 + 페이드아웃)을 화면 좌표계에 그린다.
 */
export function paintOffice2dComicBursts(
  ctx: Office2dCanvas2D,
  camera: Office2dCamera,
  bursts: readonly Office2dComicBurst[],
  now: number,
  reducedMotion: boolean,
): void {
  if (bursts.length === 0) return;
  ctx.save();
  ctx.font = "900 13px Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const burst of bursts) {
    const age = now - burst.createdAt;
    if (age < 0 || age > burst.durationMs) continue;
    const progress = age / burst.durationMs;
    const rise = reducedMotion ? 16 : Math.min(1, progress * 1.25) * 44;
    const alpha = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.2) / 0.8);
    const screen = camera.worldToScreen({ x: burst.x, y: burst.y - rise });
    const textWidth = ctx.measureText(burst.text).width;
    const pillW = textWidth + 22;
    const pillH = 26;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    office2dRoundRect(ctx, screen.x - pillW / 2, screen.y - pillH / 2, pillW, pillH, 999);
    ctx.fill();
    ctx.strokeStyle = burst.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(burst.text, screen.x, screen.y + 0.5);
  }
  ctx.restore();
}

/**
 * SoWork `workspot_schematic` 스타일 평면도(Schematic) 오버뷰 레이어.
 * 평면도 모드가 켜졌거나 줌이 멀어졌을 때 방별 공정 번호·인원·내 작업석 코어 비콘을 한눈에 보여준다.
 */
export function paintOffice2dSchematicOverlay(
  ctx: Office2dCanvas2D,
  scene: Office2dScene,
  actors: readonly Office2dActor[],
  selfId: string,
  language: "ko" | "en",
  claimedSeatId: string | null = null,
): void {
  if (scene.kind !== "toon-hq") return;
  ctx.save();
  for (const room of TOON_HQ_ROOMS) {
    const hqRoom = HQ_ROOM_BY_ID.get(room.id) ?? room;
    const spec = OFFICE2D_ROOM_ART_SPECS[room.id];
    const accent = spec?.accent ?? "#38bdf8";
    const occupants = actors.filter(
      (a) => a.x >= room.x && a.x <= room.x + room.width && a.y >= room.y && a.y <= room.y + room.height,
    );
    const hasSelf = occupants.some((a) => a.id === selfId);

    ctx.fillStyle = hasSelf ? "rgba(15, 23, 42, 0.72)" : "rgba(15, 23, 42, 0.56)";
    office2dRoundRect(ctx, room.x + 8, room.y + 8, room.width - 16, room.height - 16, 14);
    ctx.fill();

    ctx.strokeStyle = hasSelf ? "#38bdf8" : accent;
    ctx.lineWidth = hasSelf ? 3.5 : 2;
    ctx.stroke();

    const cx = room.x + room.width / 2;
    const cy = room.y + room.height / 2;
    const title = language === "en" ? (hqRoom?.labelEn ?? spec?.badgeEn ?? room.id) : (hqRoom?.labelKo ?? spec?.badgeKo ?? room.id);
    const stepBadge =
      hqRoom && hqRoom.pipelineStep !== null
        ? `STEP 0${hqRoom.pipelineStep + 1}`
        : (hqRoom?.privacy ?? "zone").toUpperCase();

    ctx.fillStyle = accent;
    ctx.font = "800 12px Pretendard, 'Noto Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(stepBadge, cx, cy - 18);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 18px Pretendard, 'Noto Sans KR', sans-serif";
    ctx.fillText(title, cx, cy + 4);

    ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
    ctx.font = "700 12px Pretendard, 'Noto Sans KR', sans-serif";
    const countLabel = language === "en" ? `${occupants.length} active · click to move` : `상주 ${occupants.length}명 · 클릭 이동`;
    ctx.fillText(countLabel, cx, cy + 26);
  }

  // 좌석 마커 (SoWork workspot_schematic / user_workspot_schematic_core / SetMyWorkSpotModal)
  const self = actors.find((a) => a.id === selfId);
  for (const seat of scene.seats) {
    const isSelfSeat = self?.seat?.id === seat.id;
    const isClaimedSeat = claimedSeatId === seat.id;
    const isOccupied = actors.some((a) => a.seat?.id === seat.id);
    ctx.beginPath();
    ctx.arc(seat.anchor.x, seat.anchor.y, isSelfSeat || isClaimedSeat ? 10 : 6, 0, Math.PI * 2);
    ctx.fillStyle = isClaimedSeat ? "#a855f7" : isSelfSeat ? "#38bdf8" : isOccupied ? "#fbbf24" : "rgba(148, 163, 184, 0.45)";
    ctx.fill();
    if (isSelfSeat || isClaimedSeat) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface Office2dSchematicTarget {
  readonly kind: "seat" | "room";
  readonly roomId: string;
  readonly seatId?: string;
  readonly point: { readonly x: number; readonly y: number };
}

/**
 * 평면도(Schematic) 모드에서 클릭한 월드 좌표를 가장 가까운 좌석 또는 방 스폰 지점으로 변환한다(SoWork `useGoToZone`).
 */
export function resolveOffice2dSchematicClickTarget(
  scene: Office2dScene,
  worldPoint: { readonly x: number; readonly y: number },
): Office2dSchematicTarget | null {
  if (scene.kind !== "toon-hq" || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)) return null;
  const roomAt = (point: { readonly x: number; readonly y: number }) =>
    TOON_HQ_ROOMS.find(
      (room) => point.x >= room.x && point.x <= room.x + room.width && point.y >= room.y && point.y <= room.y + room.height,
    ) ?? null;
  // 좌석 마커(반지름 10px)보다 넉넉한 28px 안이면 좌석을 우선한다. 손가락 탭도 맞히기 쉽게 하기 위함이다.
  let bestSeat: Office2dScene["seats"][number] | null = null;
  let bestDist = 28;
  for (const seat of scene.seats) {
    const dist = Math.hypot(worldPoint.x - seat.anchor.x, worldPoint.y - seat.anchor.y);
    if (dist <= bestDist) {
      bestDist = dist;
      bestSeat = seat;
    }
  }
  if (bestSeat) {
    const seatRoom = roomAt(bestSeat.anchor);
    if (seatRoom) return { kind: "seat", roomId: seatRoom.id, seatId: bestSeat.id, point: bestSeat.anchor };
  }
  const room = roomAt(worldPoint);
  return room ? { kind: "room", roomId: room.id, point: room.spawn } : null;
}

/**
 * WorkAdventure `ActionableItem` 패턴(ev_9115337a): 바라보는 방향 24px 앞 지점에서의 거리 제곱(activationRadiusSquared)으로
 * 가장 가까운 상호작용 오브젝트를 찾는다.
 */
export function findOffice2dActionableObjectAhead(
  objects: readonly Office2dSceneObject[],
  actor: Pick<Office2dActor, "x" | "y" | "facing">,
): Office2dSceneObject | null {
  const dirX = actor.facing === "left" ? -1 : actor.facing === "right" ? 1 : 0;
  const dirY = actor.facing === "up" ? -1 : actor.facing === "down" ? 1 : 0;
  const probeX = actor.x + dirX * 24;
  const probeY = actor.y + dirY * 24;
  let best: Office2dSceneObject | null = null;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (const obj of objects) {
    if (!obj.interactionId) continue;
    const radius = Math.max(76, obj.width * 0.72);
    const dx = probeX - obj.x;
    const dy = probeY - obj.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radius * radius && distSq < bestDistSq) {
      bestDistSq = distSq;
      best = obj;
    }
  }
  return best;
}

/**
 * SoWork 문 열림/노크 파동(bo 함수, ev_6da4daa4) 및 근접 빈 좌석 자동 착석 예고 링.
 */
export function paintOffice2dDoorwayAndSeatPreview(
  ctx: Office2dCanvas2D,
  scene: Office2dScene,
  self: Office2dActor | null,
  occupiedSeats: ReadonlySet<string>,
  time: number,
  language: "ko" | "en",
  claimedSeatId: string | null = null,
): void {
  if (!self) return;
  ctx.save();
  // 0) 내 지정석(SoWork SetMyWorkSpotModal / Gather AssignedDesk) 상시 비콘 링
  if (claimedSeatId) {
    const claimedSeat = scene.seats.find((s) => s.id === claimedSeatId);
    if (claimedSeat) {
      const pulse = 0.55 + Math.sin(time * 3.2) * 0.25;
      ctx.strokeStyle = `rgba(192, 132, 252, ${pulse})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(claimedSeat.anchor.x, claimedSeat.anchor.y + 4, 21, 10, 0, 0, Math.PI * 2);
      ctx.stroke();

      const tag = language === "en" ? "★ MY DESK" : "★ 내 지정석";
      ctx.font = "800 9.5px Pretendard, 'Noto Sans KR', sans-serif";
      const tw = ctx.measureText(tag).width + 12;
      ctx.fillStyle = "rgba(88, 28, 135, 0.9)";
      office2dRoundRect(ctx, claimedSeat.anchor.x - tw / 2, claimedSeat.anchor.y - 26, tw, 15, 7);
      ctx.fill();
      ctx.fillStyle = "#f5d0fe";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tag, claimedSeat.anchor.x, claimedSeat.anchor.y - 18.5);
    }
  }
  // 1) 비공개/정숙 방 출입구 근접 시 노크·개방 음향 파동 링 표시
  for (const room of TOON_HQ_ROOMS) {
    if (room.privacy === "public") continue;
    for (const side of ["north", "south"] as const) {
      const doorX = room.doors[side];
      if (doorX === undefined) continue;
      const doorY = side === "north" ? room.y : room.y + room.height;
      const dist = Math.hypot(self.x - doorX, self.y - doorY);
      if (dist > 110) continue;
      const wave = (time * 1.4) % 1;
      const accent = room.privacy === "private" ? "245, 158, 11" : "52, 211, 153";
      ctx.strokeStyle = `rgba(${accent}, ${(1 - wave) * 0.65})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(doorX, doorY, 18 + wave * 28, 8 + wave * 12, 0, 0, Math.PI * 2);
      ctx.stroke();

      const pillText =
        room.privacy === "private"
          ? language === "en" ? "🔔 Knock / Enter Room" : "🔔 노크 · 회의실 입장"
          : language === "en" ? "🔇 Quiet Zone · Auto Mute" : "🔇 정숙 구역 · 자동 음소거";
      ctx.font = "700 10px Pretendard, 'Noto Sans KR', sans-serif";
      const tw = ctx.measureText(pillText).width + 14;
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      office2dRoundRect(ctx, doorX - tw / 2, doorY - 26, tw, 18, 9);
      ctx.fill();
      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pillText, doorX, doorY - 17);
    }
  }

  // 2) 빈 좌석 근접 시 착석 가능 프리뷰 링 (SoWork AutoSit / seat target affordance)
  if (!self.seat) {
    let closestSeat = null;
    let closestDist = 72;
    for (const seat of scene.seats) {
      if (occupiedSeats.has(seat.id)) continue;
      const d = Math.hypot(self.x - seat.anchor.x, self.y - seat.anchor.y);
      if (d < closestDist) {
        closestDist = d;
        closestSeat = seat;
      }
    }
    if (closestSeat) {
      const pulse = 0.55 + Math.sin(time * 4) * 0.25;
      ctx.strokeStyle = `rgba(56, 189, 248, ${pulse})`;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(closestSeat.anchor.x, closestSeat.anchor.y + 4, 18, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}
