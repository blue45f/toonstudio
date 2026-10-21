/**
 * Studio BG3D 3D 표면 직접 그리기 2단계 — GLB 페인트 포인터 세션 컨트롤러.
 *
 * 뷰포트(R3F)의 포인터 이벤트를 대상 텍스처의 획으로 바꾸는 상태 기계. 호스트(에디터)는
 * down/move/up 이벤트와 교차 정보를 그대로 넘기고, 확정된 획은 콜백으로만 받는다 —
 * 프리미티브 1단계의 패널/뷰포트 결합보다 느슨하게 만들어, 대형 호스트 파일을 건드리지 않고
 * SceneNodes의 onPaintPointer 계약에 바로 연결할 수 있게 한 접점이다.
 *
 * 캐릭터 스킨 대응: 드래그 중 UV가 아일랜드를 건너뛰면(점프 임계값 초과) 진행 중 획을
 * 그 자리에서 확정하고 새 획을 시작한다. 텍스처를 가로지르는 번짐 획이 정본에 남지 않는다.
 */

import {
  beginStudioBg3dTexturePaintStroke,
  extendStudioBg3dTexturePaintStroke,
  extractStudioBg3dTexturePaintUv,
  finishStudioBg3dTexturePaintStroke,
  type StudioBg3dTexturePaintBrush,
  type StudioBg3dTexturePaintStroke,
  type StudioBg3dTexturePaintStrokeDraft,
} from "./studio-bg3d-texture-paint";
import { resolveStudioBg3dUvJumpThreshold } from "./studio-bg3d-glb-texture-paint";

export type StudioBg3dGlbPaintPointerPhase = "down" | "move" | "up";

export interface StudioBg3dGlbTexturePaintSessionOptions {
  readonly brush: StudioBg3dTexturePaintBrush;
  /** 획이 확정될 때마다 호출된다. 조각(점프 절단)이 생기면 조각 수만큼 호출된다. */
  readonly onCommitStroke: (targetKey: string, stroke: StudioBg3dTexturePaintStroke) => void;
  /** 교차마다 대상이 바뀔 수 있는 모델(멀티 메시)에서 현재 교차의 대상 키를 정한다. */
  readonly resolveTargetKey: (intersection: unknown) => string | null;
}

export class StudioBg3dGlbTexturePaintSession {
  private brush: StudioBg3dTexturePaintBrush;
  private readonly onCommitStroke: StudioBg3dGlbTexturePaintSessionOptions["onCommitStroke"];
  private readonly resolveTargetKey: StudioBg3dGlbTexturePaintSessionOptions["resolveTargetKey"];
  private draft: StudioBg3dTexturePaintStrokeDraft | null = null;
  private draftTargetKey: string | null = null;

  constructor(options: StudioBg3dGlbTexturePaintSessionOptions) {
    this.brush = options.brush;
    this.onCommitStroke = options.onCommitStroke;
    this.resolveTargetKey = options.resolveTargetKey;
  }

  setBrush(brush: StudioBg3dTexturePaintBrush): void {
    this.brush = brush;
  }

  get activeTargetKey(): string | null {
    return this.draftTargetKey;
  }

  get isDrawing(): boolean {
    return this.draft !== null;
  }

  private commitDraft(): void {
    if (!this.draft || !this.draftTargetKey) return;
    const stroke = finishStudioBg3dTexturePaintStroke(this.draft);
    const targetKey = this.draftTargetKey;
    this.draft = null;
    this.draftTargetKey = null;
    if (stroke) this.onCommitStroke(targetKey, stroke);
  }

  /**
   * 포인터 이벤트 1건을 처리한다. 처리했으면(그리기 모드가 이벤트를 소비했으면) true.
   * UV가 없는 표면에 닿으면 false — 호출자가 선택/스냅 등 다른 동선으로 넘길 수 있게 한다.
   */
  handlePointer(phase: StudioBg3dGlbPaintPointerPhase, intersection: unknown): boolean {
    if (phase === "up") {
      if (!this.draft) return false;
      this.commitDraft();
      return true;
    }
    const uv = extractStudioBg3dTexturePaintUv(intersection);
    if (!uv) return false;
    const targetKey = this.resolveTargetKey(intersection);
    if (!targetKey) return false;

    if (phase === "down") {
      this.commitDraft();
      this.draft = beginStudioBg3dTexturePaintStroke({
        color: this.brush.color,
        size: this.brush.size,
        opacity: this.brush.opacity,
        uv,
      });
      this.draftTargetKey = targetKey;
      return true;
    }

    // move
    if (!this.draft || !this.draftTargetKey) return false;
    if (targetKey !== this.draftTargetKey) {
      // 다른 메시/텍스처로 넘어간 드래그는 이전 대상 획을 확정하고 새 대상에서 시작한다.
      this.commitDraft();
      this.draft = beginStudioBg3dTexturePaintStroke({
        color: this.brush.color,
        size: this.brush.size,
        opacity: this.brush.opacity,
        uv,
      });
      this.draftTargetKey = targetKey;
      return true;
    }
    const last = this.draft.points[this.draft.points.length - 1]!;
    const jump = Math.hypot(uv[0] - last[0], uv[1] - last[1]);
    if (jump > resolveStudioBg3dUvJumpThreshold(this.draft.size)) {
      // UV 아일랜드 점프: 번짐을 막기 위해 끊고 새 획을 시작한다(심 보정 2층).
      this.commitDraft();
      this.draft = beginStudioBg3dTexturePaintStroke({
        color: this.brush.color,
        size: this.brush.size,
        opacity: this.brush.opacity,
        uv,
      });
      this.draftTargetKey = targetKey;
      return true;
    }
    this.draft = extendStudioBg3dTexturePaintStroke(this.draft, uv);
    return true;
  }

  /** 포인터 캡처 상실·모드 종료 시 진행 중 획을 버린다(확정하지 않는다). */
  cancel(): void {
    this.draft = null;
    this.draftTargetKey = null;
  }
}
