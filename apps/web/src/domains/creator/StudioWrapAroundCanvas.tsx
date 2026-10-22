/**
 * Studio Wrap-around Canvas — 라이브 랩 드로잉 미니 캔버스 (Krita Wrap-around 방식).
 *
 * 가운데 타일 1장과 그 둘레 8장의 고스트를 3×3으로 깔고, 가장자리를 넘어
 * 그으면 반대편 가장자리에 이어진 획이 고스트로 실시간으로 보인다. 손을 떼면
 * 획은 studio-wrap-around의 splitStrokeAtTileEdges로 타일 안에 들어가는
 * 조각들로 확정 저장된다(로컬 상태 — 문서에는 쓰지 않는 패널 로컬 도구로,
 * 심리스 타일 섹션과 같은 급). 순수 기하는 전부 studio-wrap-around가 담당하고
 * 이 컴포넌트는 포인터 수집과 캔버스 렌더만 한다.
 */
import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ghostWrapStrokes,
  isWrapStrokeInsideTile,
  splitStrokeAtTileEdges,
  type WrapAroundPoint,
  type WrapAroundTileSize,
} from "./studio-wrap-around";

import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export type StudioWrapAroundCanvasProps = {
  /** 타일 한 변의 표시 크기(px, 논리 좌표) — 캔버스는 이 값의 3×3. 기본 120. */
  tileDisplaySize?: number;
};

/** 포인터 샘플 최소 간격(px) — 이보다 촘촘한 이동은 한 점으로 합친다. */
const MIN_SAMPLE_DISTANCE_PX = 2;

function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: readonly WrapAroundPoint[],
  origin: number,
): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    const p = points[0]!;
    ctx.beginPath();
    ctx.arc(origin + p.x, origin + p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(origin + p.x, origin + p.y);
    else ctx.lineTo(origin + p.x, origin + p.y);
  });
  ctx.stroke();
}

export function StudioWrapAroundCanvas({
  tileDisplaySize = 120,
}: StudioWrapAroundCanvasProps): ReactElement {
  const tile: WrapAroundTileSize = useMemo(
    () => ({ width: tileDisplaySize, height: tileDisplaySize }),
    [tileDisplaySize],
  );
  const canvasSize = tileDisplaySize * 3;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 확정 저장된 타일 안 조각들 + 그리는 중인 획(고스트 영역까지 확장된 좌표).
  // draftRef가 확정 시점의 진실 원본이고 draft 상태는 렌더 미러다(업데이터 안에서
  // 다른 setState를 부르면 StrictMode 이중 호출로 조각이 중복 저장될 수 있다).
  const [pieces, setPieces] = useState<readonly (readonly WrapAroundPoint[])[]>([]);
  const [draft, setDraft] = useState<readonly WrapAroundPoint[]>([]);
  const draftRef = useRef<readonly WrapAroundPoint[]>([]);
  const drawingRef = useRef(false);

  const allInside = pieces.every((piece) => isWrapStrokeInsideTile(piece, tile));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const ctx = canvas.getContext("2d");
    if (ctx == null) return; // jsdom 등 2d 미지원 환경 — 그리지만 않을 뿐 동작은 유지.
    const ink = getComputedStyle(canvas).color;
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 3×3 타일 격자 — 가운데(실타일)는 진하게, 고스트는 흐리게.
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const center = row === 1 && col === 1;
        ctx.globalAlpha = center ? 0.55 : 0.18;
        ctx.strokeStyle = ink;
        ctx.lineWidth = center ? 1.5 : 1;
        ctx.strokeRect(col * tileDisplaySize, row * tileDisplaySize, tileDisplaySize, tileDisplaySize);
      }
    }

    // 확정 조각은 가운데 타일에만 — 전부 타일 안 좌표라 그대로 맞물린다.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 2.5;
    for (const piece of pieces) drawStroke(ctx, piece, tileDisplaySize);

    // 그리는 중인 획은 필요한 고스트 복사본까지 — 반대편 이어짐을 실시간으로.
    if (draft.length > 0) {
      ctx.lineWidth = 2.5;
      for (const ghost of ghostWrapStrokes(draft, tile)) {
        const isMain = ghost.offset.dx === 0 && ghost.offset.dy === 0;
        ctx.globalAlpha = isMain ? 1 : 0.35;
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        drawStroke(ctx, ghost.points, tileDisplaySize);
      }
    }
    ctx.globalAlpha = 1;
  }, [pieces, draft, tile, tileDisplaySize, canvasSize]);

  const toTilePoint = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): WrapAroundPoint => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX - tileDisplaySize,
        y: (event.clientY - rect.top) * scaleY - tileDisplaySize,
      };
    },
    [tileDisplaySize],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    draftRef.current = [toTilePoint(event)];
    setDraft(draftRef.current);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const next = toTilePoint(event);
    const last = draftRef.current[draftRef.current.length - 1];
    if (last != null && Math.hypot(next.x - last.x, next.y - last.y) < MIN_SAMPLE_DISTANCE_PX) {
      return;
    }
    draftRef.current = [...draftRef.current, next];
    setDraft(draftRef.current);
  };

  const finishStroke = (): void => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const finished = draftRef.current;
    draftRef.current = [];
    setDraft([]);
    if (finished.length > 0) {
      // 경계를 넘는 획은 타일 안 조각들로 나눠 저장 — 고스트로 보던 이어짐이 그대로 확정된다.
      setPieces((stored) => [...stored, ...splitStrokeAtTileEdges(finished, tile)]);
    }
  };

  return (
    <div className="space-y-2 border-t border-line/40 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold text-fg-3 uppercase tracking-wider">라이브 랩 드로잉</p>
        <button
          type="button"
          disabled={pieces.length === 0 && draft.length === 0}
          onClick={() => {
            drawingRef.current = false;
            draftRef.current = [];
            setPieces([]);
            setDraft([]);
          }}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="랩 캔버스에 그린 획을 전부 지웁니다."
        >
          <RotateCcw className="size-3.5" aria-hidden />
          획 지우기
        </button>
      </div>

      <p className="text-[0.72rem] text-fg-3">
        가운데 타일에 그리세요. 가장자리를 넘어 그으면 반대편에 이어진 획이 흐리게(고스트) 보이고,
        손을 떼면 타일 안에 들어가는 조각으로 나뉘어 저장됩니다.
      </p>

      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        aria-label="라이브 랩 드로잉 캔버스 — 가운데 타일과 3×3 고스트"
        className={cn(
          "block aspect-square w-full touch-none rounded-lg border border-line/60 bg-card text-fg",
          "cursor-crosshair",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      />

      <p className="text-[0.62rem] tabular-nums text-fg-3" role="status" aria-live="polite">
        {pieces.length === 0
          ? r3c07StatusText("studio.panelStatus.r3c07.wrapAround.piecesEmpty", "아직 저장된 조각이 없어요.")
          : allInside
            ? `저장된 조각 ${pieces.length}개 — 전부 타일 안에 들어가 반복해도 이음새가 이어져요.`
            : `저장된 조각 ${pieces.length}개`}
      </p>
    </div>
  );
}
