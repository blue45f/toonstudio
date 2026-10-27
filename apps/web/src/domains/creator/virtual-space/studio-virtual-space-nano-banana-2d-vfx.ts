/**
 * 나노 바나나 v15 슬림 소두(5.5등신) 다중 프레임 스프라이트 사이클러 & 2D Phaser 특수효과(VFX) 엔진.
 *
 * - 정적인 단일 이미지 대신 `idle ↔ work ↔ v15 슬림 액션/표정 프레임 ↔ v13 이모트 프레임`을
 *   시간차(Multi-Frame Cycle)로 순환시켜 2D 월드 내 모든 캐릭터가 살아 움직이고 표정이 변화하도록 한다.
 * - 2D Phaser 캔버스 위에서 실시간 홀로그램 오라·스타라이트 파티클·코믹 의성어(SFX) 팝업·충격파 링을 렌더링한다.
 */
import type * as Phaser from "phaser";

import type {
  CreatorPersonaPose,
  NanoBananaCreatorPersonaId,
} from "./studio-virtual-office-nextgen-engine-data";

export type NanoBananaV15ActionId =
  | "stride-draw"
  | "action-slash"
  | "focus-overdrive"
  | "cheer-coffee"
  | "pd-approve"
  | "colorist-magic"
  | "bg3d-holo"
  | "writer-oracle";

export const NANO_BANANA_V15_ACTION_SPRITES: Readonly<Record<NanoBananaV15ActionId, string>> =
  Object.freeze({
    "stride-draw": "/assets/virtual-studio/nano-banana-v15/actions/stride-draw.webp",
    "action-slash": "/assets/virtual-studio/nano-banana-v15/actions/action-slash.webp",
    "focus-overdrive": "/assets/virtual-studio/nano-banana-v15/actions/focus-overdrive.webp",
    "cheer-coffee": "/assets/virtual-studio/nano-banana-v15/actions/cheer-coffee.webp",
    "pd-approve": "/assets/virtual-studio/nano-banana-v15/actions/pd-approve.webp",
    "colorist-magic": "/assets/virtual-studio/nano-banana-v15/actions/colorist-magic.webp",
    "bg3d-holo": "/assets/virtual-studio/nano-banana-v15/actions/bg3d-holo.webp",
    "writer-oracle": "/assets/virtual-studio/nano-banana-v15/actions/writer-oracle.webp",
  });

export const NANO_BANANA_V15_ACTION_LABELS_KO: Readonly<Record<NanoBananaV15ActionId, string>> =
  Object.freeze({
    "stride-draw": "😄 총총 드로잉 보행",
    "action-slash": "😉 네온 펜슬래시",
    "focus-overdrive": "🔥 초집중 오버드라이브",
    "cheer-coffee": "☕ 라떼 치어스 & 냥이",
    "pd-approve": "✅ 총괄PD 승인 스탬프",
    "colorist-magic": "🌈 컬러 리본 블렌딩",
    "bg3d-holo": "🧊 3D 홀로그램 캐슬",
    "writer-oracle": "🔮 스토리 타로 오라클",
  });

export const nanoBananaV15ActionTextureKey = (actionId: NanoBananaV15ActionId): string =>
  `nb-v15-${actionId}`;

/** 페르소나별 대표 v15 슬림 5.5등신 액션/표정 프레임 매핑. */
export const PERSONA_PRIMARY_V15_ACTION: Readonly<
  Record<NanoBananaCreatorPersonaId, NanoBananaV15ActionId>
> = Object.freeze({
  "line-artist": "stride-draw",
  "chief-pd": "pd-approve",
  colorist: "colorist-magic",
  "cgi-director": "bg3d-holo",
  "story-writer": "writer-oracle",
  "action-mocap-actor": "action-slash",
  "sound-letterer": "focus-overdrive",
  "studio-cat-mascot": "cheer-coffee",
});

/** 페르소나별 보조 v15 슬림 액션/표정 프레임 매핑 (다중 프레임 교차 연출용). */
export const PERSONA_SECONDARY_V15_ACTION: Readonly<
  Record<NanoBananaCreatorPersonaId, NanoBananaV15ActionId>
> = Object.freeze({
  "line-artist": "action-slash",
  "chief-pd": "stride-draw",
  colorist: "cheer-coffee",
  "cgi-director": "focus-overdrive",
  "story-writer": "pd-approve",
  "action-mocap-actor": "focus-overdrive",
  "sound-letterer": "action-slash",
  "studio-cat-mascot": "colorist-magic",
});

/** 페르소나별 실시간 회전 표정 & 말풍선 대사 시퀀스. */
export const PERSONA_DYNAMIC_EXPRESSION_LINES: Readonly<
  Record<NanoBananaCreatorPersonaId, readonly string[]>
> = Object.freeze({
  "line-artist": [
    "✒️ 😄 18컷 펜선 하이라이트 완료!",
    "✒️ 🔥 초집중 펜터치 슬래시!",
    "✒️ 😉 신티크 듀얼뷰 레드라인 반영 중",
  ],
  "chief-pd": [
    "🎬 ✅ EP.34 콘티 최종 승인 PASS!",
    "🎬 😄 오늘 마감 페이스 최고예요!",
    "🎬 💬 19컷 시선 유도선만 살짝 보강!",
  ],
  colorist: [
    "🎨 🌈 역광 마법진 글로우 블렌딩 ✨",
    "🎨 😉 노을빛 그라데이션 맵 적용!",
    "🎨 ✨ 주인공 눈동자 보석광 추가 완료",
  ],
  "cgi-director": [
    "🧊 😎 판타지 성채 360° 홀로그램 회전",
    "🧊 ⚡ 28mm 광각 카메라 앵글 고정!",
    "🧊 ✨ 언리얼·블렌더 라이팅 동기화",
  ],
  "story-writer": [
    "🔮 😮 회귀 분기점 타로 오라클 전개!",
    "📖 ✨ 35화 엔딩 클리프행어 대사 완성",
    "🔮 😄 복선 회수율 98% 달성!",
  ],
  "action-mocap-actor": [
    "⚡ 😆 공중 회전 발차기 동세 캡처!",
    "⚡ 🔥 스피드선 + 잔상 이펙트 발동!",
    "⚡ 😉 액션 시퀀스 60fps 피직스 동기화",
  ],
  "sound-letterer": [
    "🎧 💥 ‘콰아앙—!!’ 폭발 의성어 배치!",
    "🎧 🔥 Dolby Atmos 공간음향 믹싱 중",
    "🎧 ✨ 심장박동 효과음 타이밍 정렬",
  ],
  "studio-cat-mascot": [
    "🐱 ☕ 아이스 라떼 치어스! 야옹~✨",
    "🐱 😸 마감 응원 골골송 버프 발동!",
    "🐱 💖 츄르 먹고 원고 대박 기원!",
  ],
});

/**
 * 다중 프레임 캐릭터 애니메이션 사이클러:
 * 정적인 단일 텍스처 대신 시간에 따라 `v15 슬림 액션 프레임 ↔ work 프레임 ↔ idle 프레임`을 순환한다.
 */
export function resolveMultiFramePersonaTextureKey(
  textures: { exists(key: string): boolean },
  personaId: NanoBananaCreatorPersonaId,
  basePose: CreatorPersonaPose,
  nowMs: number,
  seedOffset = 0,
): string | null {
  const primaryV15Key = nanoBananaV15ActionTextureKey(PERSONA_PRIMARY_V15_ACTION[personaId]);
  const secondaryV15Key = nanoBananaV15ActionTextureKey(PERSONA_SECONDARY_V15_ACTION[personaId]);
  const workKey = `nb-cast-${personaId}-work`;
  const idleKey = `nb-cast-${personaId}-idle`;

  // 1.5초 주기로 4단계 다중 프레임 순환 (슬림 v15 주액션 -> work -> 슬림 v15 보조액션 -> idle)
  const phase = Math.floor((nowMs + seedOffset * 430) / 1450) % 4;
  const candidates =
    basePose === "work"
      ? [primaryV15Key, workKey, secondaryV15Key, workKey]
      : [primaryV15Key, idleKey, workKey, secondaryV15Key];

  const chosen = candidates[phase] ?? workKey;
  if (textures.exists(chosen)) return chosen;
  if (textures.exists(primaryV15Key)) return primaryV15Key;
  if (textures.exists(workKey)) return workKey;
  if (textures.exists(idleKey)) return idleKey;
  return null;
}

export function getPartnerDynamicExpressionLine(
  personaId: NanoBananaCreatorPersonaId,
  nowMs: number,
  seedOffset = 0,
): string {
  const lines = PERSONA_DYNAMIC_EXPRESSION_LINES[personaId];
  const idx = Math.floor((nowMs + seedOffset * 900) / 2800) % lines.length;
  return lines[idx] ?? lines[0];
}

export interface NanoBanana2dVfxBurstEvent {
  readonly id: number;
  readonly label: string;
  readonly color: number;
  readonly actionId?: NanoBananaV15ActionId;
  readonly worldX?: number;
  readonly worldY?: number;
}

let vfxSeq = 1;
const vfxListeners = new Set<(event: NanoBanana2dVfxBurstEvent) => void>();
const modalListeners = new Set<(workstationId: string) => void>();

export function subscribeNanoBanana2dVfxBurst(
  listener: (event: NanoBanana2dVfxBurstEvent) => void,
): () => void {
  vfxListeners.add(listener);
  return () => {
    vfxListeners.delete(listener);
  };
}

export function subscribeNanoBananaWorkstationModal(
  listener: (workstationId: string) => void,
): () => void {
  modalListeners.add(listener);
  return () => {
    modalListeners.delete(listener);
  };
}

export function requestOpenNanoBananaWorkstationModal(workstationId: string): void {
  for (const listener of modalListeners) listener(workstationId);
}

interface ActiveBurstParticle {
  readonly ring: Phaser.GameObjects.Graphics;
  readonly text: Phaser.GameObjects.Text;
  readonly originX: number;
  readonly originY: number;
  readonly color: number;
  readonly startMs: number;
  readonly durationMs: number;
}

type CampusSceneLike = Pick<Phaser.Scene, "add" | "textures">;

/**
 * 2D Phaser 캠퍼스 위에서 실시간으로 돌아가는 홀로그램 오라·스타라이트 파티클·코믹 SFX 팝업 렌더러.
 */
export class StudioNanoBanana2dVfxEngine {
  private readonly ambientGraphics: Phaser.GameObjects.Graphics | null = null;
  private readonly bursts: ActiveBurstParticle[] = [];
  private lastPlayerX = 1472;
  private lastPlayerY = 1210;
  private disposed = false;
  private unsubscribeVfx: (() => void) | null = null;

  constructor(
    private readonly scene: CampusSceneLike,
    private readonly workstationCoords: readonly {
      readonly x: number;
      readonly y: number;
      readonly accentColor: number;
    }[],
  ) {
    if (typeof scene.add?.graphics !== "function") return;
    this.ambientGraphics = scene.add.graphics().setDepth(2450).setBlendMode("ADD");
    this.unsubscribeVfx = subscribeNanoBanana2dVfxBurst((event) => {
      if (this.disposed) return;
      this.spawnBurst(
        event.worldX ?? this.lastPlayerX,
        event.worldY ?? this.lastPlayerY - 46,
        event.label,
        event.color,
      );
    });
  }

  spawnBurst(x: number, y: number, label: string, color: number): void {
    if (this.disposed || typeof this.scene.add?.graphics !== "function") return;
    const ring = this.scene.add
      .graphics()
      .setDepth(2600)
      .setPosition(x, y)
      .setBlendMode("ADD");
    const text = this.scene.add
      .text(x, y - 18, label, {
        fontFamily: "Pretendard, 'Noto Sans KR', Inter, sans-serif",
        fontSize: "13px",
        fontStyle: "900",
        color: "#ffffff",
        backgroundColor: "#090d1ae8",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(2605);

    this.bursts.push({
      ring,
      text,
      originX: x,
      originY: y,
      color,
      startMs: performance.now(),
      durationMs: 1350,
    });
  }

  update(time: number, playerX: number, playerY: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.lastPlayerX = playerX;
    this.lastPlayerY = playerY;

    // 1. 플레이어 및 10대 워크스테이션 주변 실시간 스타라이트 & 홀로그램 궤도 파티클 렌더링
    if (this.ambientGraphics) {
      this.ambientGraphics.clear();
      if (!reducedMotion) {
        // 내 캐릭터 주변 네온 오라 & 회전 스타라이트 4점
        for (let i = 0; i < 4; i += 1) {
          const angle = time * 0.0032 + (i * Math.PI) / 2;
          const px = playerX + Math.cos(angle) * 34;
          const py = playerY - 38 + Math.sin(angle * 1.5) * 14;
          const color = i % 2 === 0 ? 0x38bdf8 : 0xfbbf24;
          this.ambientGraphics.fillStyle(color, 0.72).fillCircle(px, py, 3.2);
          this.ambientGraphics.lineStyle(1.2, color, 0.35).strokeCircle(px, py, 6.5);
        }

        // 각 워크스테이션 상공에 떠오르는 홀로그램 스파클 링 & 에너지 입자
        for (let idx = 0; idx < this.workstationCoords.length; idx += 1) {
          const ws = this.workstationCoords[idx];
          const floatOffset = Math.sin(time * 0.004 + idx * 1.3) * 10;
          const orbitAngle = time * 0.0026 + idx;
          const ox = ws.x + Math.cos(orbitAngle) * 48;
          const oy = ws.y - 56 + floatOffset;
          this.ambientGraphics.fillStyle(ws.accentColor, 0.65).fillCircle(ox, oy, 3.4);
          this.ambientGraphics
            .lineStyle(1.4, ws.accentColor, 0.32)
            .strokeEllipse(ws.x, ws.y - 44 + floatOffset * 0.4, 86, 22);
        }
      }
    }

    // 2. 활성 코믹 SFX / 스탬프 충격파 버스트 업데이트
    const now = performance.now();
    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const b = this.bursts[i];
      const progress = Math.min(1, Math.max(0, (now - b.startMs) / b.durationMs));
      if (progress >= 1) {
        b.ring.destroy();
        b.text.destroy();
        this.bursts.splice(i, 1);
        continue;
      }
      const alpha = 1 - progress;
      const radius = 18 + progress * 92;
      b.ring.clear();
      b.ring.lineStyle(3.2 * alpha, b.color, alpha * 0.9).strokeCircle(0, 0, radius);
      b.ring.lineStyle(1.8 * alpha, 0xffffff, alpha * 0.7).strokeCircle(0, 0, radius * 0.68);
      for (let s = 0; s < 6; s += 1) {
        const ang = (s * Math.PI) / 3 + progress * 2.4;
        const sx = Math.cos(ang) * radius * 0.95;
        const sy = Math.sin(ang) * radius * 0.65;
        b.ring.fillStyle(b.color, alpha).fillCircle(sx, sy, 3.8 * alpha);
      }
      b.text
        .setPosition(b.originX, b.originY - 18 - progress * 44)
        .setAlpha(alpha)
        .setScale(1 + Math.sin(progress * Math.PI) * 0.18);
    }
  }

  destroy(): void {
    this.disposed = true;
    this.unsubscribeVfx?.();
    this.unsubscribeVfx = null;
    this.ambientGraphics?.destroy();
    for (const b of this.bursts.splice(0)) {
      b.ring.destroy();
      b.text.destroy();
    }
  }
}

export function emitNanoBanana2dVfxBurstEvent(
  label: string,
  color = 0x38bdf8,
  actionId?: NanoBananaV15ActionId,
  worldX?: number,
  worldY?: number,
): void {
  const event: NanoBanana2dVfxBurstEvent = {
    id: vfxSeq++,
    label,
    color,
    actionId,
    worldX,
    worldY,
  };
  for (const listener of vfxListeners) listener(event);
}
