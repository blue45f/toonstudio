import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { formatI18nTemplate, useBilingual } from "../../../shared/lib/i18n-bilingual-copy";

import {
  formatStudioFaceModelingDistance,
  parseStudioFaceDrawCoordinate,
  snapStudioFaceDrawPoint,
  studioFaceDrawClientToPoint,
  studioFaceDrawGridStep,
  studioFaceDrawViewBox,
} from "./studio-hybrid-dcc-face-modeling-session";

import type { StudioHybridDccFaceModelingModel } from "./useStudioHybridDccFaceModeling";

const BUTTON =
  "min-h-9 pointer-coarse:min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";
const FIELD =
  "min-h-9 pointer-coarse:min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 면 그리기 패드: 선택한 면을 법선 쪽에서 본 모습(가로 u, 세로 v, 단위 m)에 점을 찍는다.
 * 마우스·터치로는 면 안쪽을 눌러 점을 찍고, 키보드로는 아래 좌표 입력칸으로 같은 일을 한다.
 * 점이 규칙을 어기면 어떤 점이 문제인지 붉게 표시하고 이유를 알림 영역에 보여 준다.
 */
export function StudioHybridDccFaceDrawPad({ model }: { readonly model: StudioHybridDccFaceModelingModel }) {
  const bt = useBilingual("StudioHybridDccFaceModeling");
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [snap, setSnap] = useState(true);
  const [uText, setUText] = useState("");
  const [vText, setVText] = useState("");
  const [entryError, setEntryError] = useState("");
  const { guide, drawPoints } = model;
  const viewBox = useMemo(() => (guide ? studioFaceDrawViewBox(guide.outline) : null), [guide]);
  const gridStep = useMemo(() => (guide ? studioFaceDrawGridStep(guide.outline) : 0.1), [guide]);
  const disabled = Boolean(model.unavailable) || Boolean(model.unusable) || !guide;
  if (!guide || !viewBox) return null;

  const toSvg = (point: readonly [number, number]) => `${point[0]},${-point[1]}`;
  const marker = Math.max(viewBox.width, viewBox.height) * 0.018;
  const gridPath: string[] = [];
  const lastX = viewBox.x + viewBox.width;
  const lastY = viewBox.y + viewBox.height;
  for (let index = Math.ceil(viewBox.x / gridStep); index * gridStep <= lastX; index += 1) {
    gridPath.push(`M${index * gridStep} ${viewBox.y}V${lastY}`);
  }
  for (let index = Math.ceil(viewBox.y / gridStep); index * gridStep <= lastY; index += 1) {
    gridPath.push(`M${viewBox.x} ${index * gridStep}H${lastX}`);
  }
  const place = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (disabled || !svg) return;
    const point = studioFaceDrawClientToPoint(viewBox, svg.getBoundingClientRect(), clientX, clientY);
    if (!point) return;
    setEntryError("");
    model.addDrawPoint(snap ? snapStudioFaceDrawPoint(point, gridStep) : point);
  };
  const addTyped = () => {
    const u = parseStudioFaceDrawCoordinate(uText);
    const v = parseStudioFaceDrawCoordinate(vText);
    if (u === null || v === null) {
      setEntryError(bt(
        "좌표를 읽을 수 없습니다. 가로(u)와 세로(v)에 숫자를 입력하세요. 예: 0.1 · -25cm",
        "Could not read the coordinates. Enter numbers for u and v. Examples: 0.1, -25cm",
      ));
      return;
    }
    setEntryError("");
    model.addDrawPoint([u, v]);
    setUText("");
    setVText("");
  };
  const onEntryKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    addTyped();
  };

  return (
    <div className="space-y-2" data-studio-hybrid-dcc-face-draw-pad="true">
      <p className="text-[11px] leading-relaxed text-fg-3" id={`${id}-rules`}>
        {bt(
          "규칙: 점 3~64개, 모든 점이 면 안쪽(가장자리에 닿지 않음), 선이 서로 교차하지 않는 볼록 도형만 가능합니다. 구멍은 만들지 않고 면을 도형과 그 둘레 면으로 나눕니다.",
          "Rules: 3 to 64 points, every point strictly inside the face, and the outline must be convex without crossings. No holes: the face is split into the shape and the faces around it.",
        )}
      </p>
      <svg
        ref={svgRef}
        role="img"
        aria-label={bt(
          "면 그리기 패드. 면을 법선 쪽에서 본 모습이며 면 안쪽을 눌러 점을 찍습니다. 키보드는 아래 좌표 입력칸을 쓰세요.",
          "Face drawing pad, seen along the face normal. Click inside the face to place points; use the coordinate fields below for the keyboard.",
        )}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className={`block max-h-72 w-full touch-manipulation rounded-lg border border-line bg-canvas/35 text-fg-3 ${disabled ? "opacity-50" : "cursor-crosshair"}`}
        style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}` }}
        onClick={(event) => place(event.clientX, event.clientY)}
        data-studio-hybrid-dcc-face-draw-surface="true"
      >
        <path d={gridPath.join("")} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <polygon points={guide.outline.map(toSvg).join(" ")} fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {drawPoints.length >= 3 ? (
          <polygon points={drawPoints.map(toSvg).join(" ")} className="text-accent" fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ) : (
          <polyline points={drawPoints.map(toSvg).join(" ")} className="text-accent" fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
        {drawPoints.map((point, index) => (
          <g key={index} className={model.problemPoints.includes(index) ? "text-bad" : "text-accent"} aria-hidden="true">
            <circle cx={point[0]} cy={-point[1]} r={marker} fill="currentColor" />
            <text x={point[0] + marker * 1.6} y={-point[1] - marker * 1.2} fontSize={marker * 3} fill="currentColor">{index + 1}</text>
          </g>
        ))}
      </svg>
      <label className="flex min-h-9 items-center gap-2 text-[11px] text-fg-2 pointer-coarse:min-h-11">
        <input type="checkbox" checked={snap} disabled={disabled} onChange={(event) => setSnap(event.target.checked)} />
        {formatI18nTemplate(bt("격자에 붙이기 (간격 {step} m, 면 중심 기준)", "Snap to grid (step {step} m, from the face centre)"), {
          step: formatStudioFaceModelingDistance(gridStep),
        })}
      </label>
      <fieldset disabled={disabled} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <legend className="mb-1 text-[11px] text-fg-3">{bt("좌표로 점 찍기 (면 중심 기준, m)", "Place a point by coordinates (from the face centre, m)")}</legend>
        <div className="grid gap-1">
          <label htmlFor={`${id}-u`} className="text-[11px] text-fg-2">{bt("가로 u (m)", "u across (m)")}</label>
          <input id={`${id}-u`} className={FIELD} value={uText} inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={96}
            aria-invalid={entryError ? true : undefined} aria-describedby={entryError ? `${id}-entry-error` : `${id}-rules`}
            onChange={(event) => setUText(event.target.value)} onKeyDown={onEntryKeyDown} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-v`} className="text-[11px] text-fg-2">{bt("세로 v (m)", "v up (m)")}</label>
          <input id={`${id}-v`} className={FIELD} value={vText} inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={96}
            aria-invalid={entryError ? true : undefined} aria-describedby={entryError ? `${id}-entry-error` : `${id}-rules`}
            onChange={(event) => setVText(event.target.value)} onKeyDown={onEntryKeyDown} />
        </div>
        <button type="button" className={BUTTON} onClick={addTyped}>{bt("점 추가", "Add point")}</button>
      </fieldset>
      {entryError ? <p id={`${id}-entry-error`} role="alert" className="text-xs text-bad">{entryError}</p> : null}
      <ol aria-label={bt("찍은 점 목록", "Placed points")} className="grid gap-0.5 text-[11px] tabular-nums text-fg-3 sm:grid-cols-2">
        {drawPoints.map((point, index) => (
          <li key={index} className={model.problemPoints.includes(index) ? "text-bad" : undefined}>
            {formatI18nTemplate(bt("점 {n}: u {u} · v {v} m", "Point {n}: u {u} · v {v} m"), {
              n: index + 1,
              u: formatStudioFaceModelingDistance(point[0]),
              v: formatStudioFaceModelingDistance(point[1]),
            })}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BUTTON} disabled={disabled || drawPoints.length === 0} onClick={model.removeLastDrawPoint}>
          {bt("마지막 점 지우기", "Remove last point")}
        </button>
        <span className="text-[11px] tabular-nums text-fg-3">
          {formatI18nTemplate(bt("점 {n}개", "{n} points"), { n: drawPoints.length })}
        </span>
      </div>
    </div>
  );
}
