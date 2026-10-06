/**
 * 빌드 모드 직접 배치 고스트 렌더러 (VS 120 웨이브 4 B 후속).
 *
 * 배치 지점을 고르는 동안 월드 지도에 반투명 고스트를 띄운다. 고스트는
 * 오브젝트 국소 표현이다 — 화면 전체 틴트·워시는 만들지 않는다.
 * - 발밑 footprint: 놓을 수 있으면 초록, 없으면 빨강에 ✕를 겹친다.
 * - 반응 프레임(studioBuildPlacementGhostFrame)의 채널을 실제 배치 렌더러
 *   (interaction-fx)와 같은 시각 값으로 되살린다: 조명은 빛 웅덩이(glow),
 *   미디어 보드는 안쪽 밝기(swing). 가능 지점에서는 켜진·열린 모습, 불가
 *   지점에서는 꺼진·닫힌 모습이라 고스트만 봐도 판정을 읽을 수 있다.
 * - 상태 문구 라벨은 배치된 가구 배지와 같은 판(plate) 색으로 띄운다.
 */
import type * as Phaser from "phaser";

import type { StudioBuildPlacementGhostFrame } from "./studio-virtual-space-build-placement";
import { COLORS } from "./studio-virtual-space-interaction-fx-types";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 배치된 고정물과 같은 앵커 리프트(px). interaction-fx의 PLACED_ANCHOR_LIFT와 같은 값이다. */
const GHOST_ANCHOR_LIFT = 54;
/** 상태 라벨 판의 depth. 배치 배지(BADGE_DEPTH)와 같은 층이다. */
const GHOST_LABEL_DEPTH = 160_120;
/** 발밑 footprint 크기(px). 배치 고정물 footprint(46×32)에 맞춘 값이다. */
const FOOTPRINT_WIDTH = 48;
const FOOTPRINT_HEIGHT = 20;

/** 이름표 색(16진수 숫자). 캔버스의 studioCanvasNameplateColors가 주는 값과 같은 형태다. */
export interface StudioBuildGhostBadgeColors {
  readonly plate: number;
  readonly text: number;
}

function badgeCssColor(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(6, "0")}`;
}

export interface StudioBuildGhostRenderInput {
  readonly point: StudioVirtualSpacePoint;
  /** 마주보는 방향(도). 0은 위쪽이다. */
  readonly rotation: number;
  readonly frame: StudioBuildPlacementGhostFrame;
  /** 불가 확정 직후의 흔들림 버스트 오프셋(px). 프레임 흔들림에 더해진다. */
  readonly burstShakeX: number;
}

export class StudioBuildPlacementGhostRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private rendered = false;

  constructor(
    scene: Phaser.Scene,
    badgeColors: StudioBuildGhostBadgeColors,
    private readonly translate: (ko: string, en: string) => string,
  ) {
    this.graphics = scene.add.graphics();
    this.graphics.setVisible(false);
    this.label = scene.add.text(0, 0, "", {
      fontFamily: "sans-serif",
      fontSize: "11px",
      color: badgeCssColor(badgeColors.text),
      backgroundColor: badgeCssColor(badgeColors.plate),
      padding: { x: 6, y: 3 },
    });
    this.label.setOrigin(0.5, 1);
    this.label.setDepth(GHOST_LABEL_DEPTH);
    this.label.setVisible(false);
  }

  show(input: StudioBuildGhostRenderInput): void {
    const { point, frame } = input;
    const x = Math.round(point.x + frame.shakeX + input.burstShakeX);
    const baseY = Math.round(point.y);
    const anchorY = baseY - GHOST_ANCHOR_LIFT;
    const depth = Math.round(baseY) + 1004;
    const g = this.graphics;
    g.clear();
    g.setDepth(depth);
    const tint = frame.valid ? COLORS.green : COLORS.red;
    // 발밑 footprint — 배치 판정을 색으로 먼저 읽힌다.
    g.fillStyle(tint, 0.26);
    g.fillRoundedRect(x - FOOTPRINT_WIDTH / 2, baseY - FOOTPRINT_HEIGHT / 2, FOOTPRINT_WIDTH, FOOTPRINT_HEIGHT, 6);
    g.lineStyle(2, tint, 0.9);
    g.strokeRoundedRect(x - FOOTPRINT_WIDTH / 2, baseY - FOOTPRINT_HEIGHT / 2, FOOTPRINT_WIDTH, FOOTPRINT_HEIGHT, 6);
    if (!frame.valid) {
      g.lineBetween(x - 8, baseY - 5, x + 8, baseY + 5);
      g.lineBetween(x + 8, baseY - 5, x - 8, baseY + 5);
    }
    // 마주보는 방향 표시 — 회전(R)이 어디를 향하는지 보인다.
    const radians = (input.rotation * Math.PI) / 180;
    g.lineStyle(2, tint, 0.75);
    g.lineBetween(x, baseY, x + Math.sin(radians) * 15, baseY - Math.cos(radians) * 15);
    const reaction = frame.reaction;
    if (frame.kind === "light-switch") {
      const glow = reaction?.glow ?? 0;
      if (glow > 0.01) {
        g.fillStyle(COLORS.lamp, 0.1 * glow);
        g.fillEllipse(x, baseY - 2, 92, 34);
        g.fillStyle(COLORS.lamp, 0.16 * glow);
        g.fillEllipse(x, baseY - 2, 56, 22);
      }
      g.lineStyle(2, 0x3d4656, 0.75);
      g.lineBetween(x, baseY - 6, x, anchorY + 10);
      g.fillStyle(COLORS.lamp, 0.35 + 0.55 * glow);
      g.fillCircle(x, anchorY + 4, 7);
      g.lineStyle(1.5, 0x3d4656, 0.75);
      g.strokeCircle(x, anchorY + 4, 7);
    } else if (frame.kind === "whiteboard" || frame.kind === "youtube") {
      const swing = reaction?.swing ?? 0;
      g.fillStyle(0x2b3444, 0.55);
      g.fillRoundedRect(x - 32, anchorY - 16, 64, 34, 4);
      g.fillStyle(COLORS.cyan, 0.12 + 0.4 * swing);
      g.fillRoundedRect(x - 27, anchorY - 11, 54, 24, 3);
      g.lineStyle(2, 0x3d4656, 0.8);
      g.strokeRoundedRect(x - 32, anchorY - 16, 64, 34, 4);
      g.lineStyle(2, 0x3d4656, 0.6);
      g.lineBetween(x, anchorY + 18, x, baseY - 4);
    } else {
      // 반응 없는 가구는 발자국 다이아몬드만으로 고스트를 표시한다.
      g.fillStyle(tint, 0.4);
      g.beginPath();
      g.moveTo(x, baseY - 26);
      g.lineTo(x + 10, baseY - 16);
      g.lineTo(x, baseY - 6);
      g.lineTo(x - 10, baseY - 16);
      g.closePath();
      g.fillPath();
    }
    g.setVisible(true);
    const labelText = reaction?.label ? this.translate(reaction.label.ko, reaction.label.en) : null;
    if (labelText) {
      this.label.setText(labelText);
      this.label.setPosition(x, anchorY - 24);
      this.label.setVisible(true);
    } else {
      this.label.setVisible(false);
    }
    this.rendered = true;
  }

  hide(): void {
    if (!this.rendered) return;
    this.graphics.clear();
    this.graphics.setVisible(false);
    this.label.setVisible(false);
    this.rendered = false;
  }

  destroy(): void {
    this.graphics.destroy();
    this.label.destroy();
  }
}
