import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useReviewCompareViewport } from "./use-review-compare-viewport";

const scales = ["fit-page", "fit-width", "125", "150", "200", "300", "400"] as const;
type Scale = typeof scales[number];
const isScale = (value: string): value is Scale => scales.some((scale) => scale === value);

/** 배율과 스크롤은 표시 계층에만 두며 이미지와 주석 stage를 함께 확대한다. */
export function StudioReviewImageViewport({ renderWidth, renderHeight, label, children, actions, onViewChange, focusPoint, panning = false }: {
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly label: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly onViewChange?: () => void;
  readonly focusPoint?: { readonly x: number; readonly y: number; readonly request: number };
  readonly panning?: boolean;
}) {
  const bt = useBilingual("StudioReviewImageViewport"), id = useId();
  const viewport = useRef<HTMLDivElement | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [scale, setScale] = useState<Scale>(renderHeight > renderWidth * 2 ? "fit-width" : "fit-page");
  const cancelViewGesture = () => { pan.current = null; onViewChange?.(); };
  const position = useReviewCompareViewport(scale, false, cancelViewGesture);
  useLayoutEffect(() => { if (!panning) pan.current = null; }, [panning]);
  const focusedRequest = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!focusPoint || focusedRequest.current === focusPoint.request) return;
    const node = viewport.current, stage = node?.firstElementChild;
    if (!node || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pan.current = null;
    focusedRequest.current = focusPoint.request;
    node.scrollTo({ left: Math.max(0, focusPoint.x * rect.width - node.clientWidth / 2),
      top: Math.max(0, focusPoint.y * rect.height - node.clientHeight / 2) });
    node.focus();
  }, [focusPoint]);
  const width = scale === "fit-page" ? `min(100%, ${70 * renderWidth / renderHeight}dvh)`
    : scale === "fit-width" ? "100%" : `${scale}%`;
  const change = (value: string) => {
    if (!isScale(value) || value === scale) return;
    cancelViewGesture();
    setScale(value);
  };
  return <div className="w-full min-w-0 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${id}-scale`} className="flex flex-wrap items-center gap-2 text-sm">
        {bt("원고 배율", "Manuscript scale")}
        <select id={`${id}-scale`} value={scale} onChange={(event) => change(event.target.value)}
          className="min-h-11 rounded-lg border border-line bg-card px-3 text-sm">
          <option value="fit-page">{bt("전체 보기", "Fit page")}</option>
          <option value="fit-width">{bt("폭 맞춤", "Fit width")}</option>
          {scales.filter((value) => value !== "fit-page" && value !== "fit-width").map((value) =>
            <option key={value} value={value}>{value}%</option>)}
        </select>
      </label>
      <button type="button" className="min-h-11 rounded-lg border border-line bg-card px-3 text-sm" onClick={() => {
        cancelViewGesture();
        position.reset();
        viewport.current?.scrollTo({ top: 0, left: 0 });
        viewport.current?.focus();
      }}>{bt("원고 맨 위로", "Top of manuscript")}</button>
      {actions}
    </div>
    <p id={`${id}-hint`} className="text-sm leading-relaxed text-fg-2">
      {bt("긴 원고는 폭을 맞춘 뒤 아래로 스크롤하며 확인하세요. 배율은 화면 폭을 기준으로 합니다.",
        "Fit long manuscripts to the width and scroll down to review. Percentages are relative to the viewport width.")}
    </p>
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 원고 스크롤 영역은 키보드 이동을 위해 초점을 받는다. */}
    <div tabIndex={0} ref={(node) => { viewport.current = node; position.setNode("left", node); }}
      role="region" aria-label={label} aria-describedby={`${id}-hint`}
      onLoadCapture={() => position.restore("left")}
      onScroll={(event) => { onViewChange?.(); position.onScroll("left", event); }}
      onDragStart={(event) => { if (panning) event.preventDefault(); }}
      onPointerDown={(event) => {
        if (!panning || event.button !== 0 || event.pointerType === "touch") return;
        event.preventDefault();
        const node = event.currentTarget;
        node.focus();
        pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop };
        node.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = pan.current;
        if (!panning || !current || current.pointerId !== event.pointerId) return;
        event.currentTarget.scrollLeft = current.left - (event.clientX - current.x);
        event.currentTarget.scrollTop = current.top - (event.clientY - current.y);
      }}
      onPointerUp={(event) => {
        if (pan.current?.pointerId !== event.pointerId) return;
        pan.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onPointerCancel={() => { pan.current = null; }}
      className={`max-h-[70dvh] min-w-0 overflow-auto overscroll-contain rounded-lg bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent${panning ? " cursor-grab active:cursor-grabbing" : ""}`}>
      <div className="mx-auto" data-review-image-scale={scale} style={{ width, aspectRatio: `${renderWidth} / ${renderHeight}` }}>
        {children}
      </div>
    </div>
  </div>;
}
