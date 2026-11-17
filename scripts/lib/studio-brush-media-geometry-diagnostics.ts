import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { readDurableStudioAutosaveDocument } from "./studio-verify-durable-autosave.mjs";

import type { StudioDurableAutosaveDocument } from "./studio-verify-durable-autosave.mjs";
import type { Page } from "playwright";

interface Point { readonly x: number; readonly y: number }
interface Rect extends Point { readonly width: number; readonly height: number }
interface GeometryFrame {
  readonly label: string; readonly at: number; readonly stage: Rect | null;
  readonly clientSize: readonly number[] | null; readonly transform: readonly number[] | null;
  readonly scroll: readonly number[]; readonly viewport: Rect | null; readonly viewportScroll: readonly number[] | null;
  readonly workspace: Rect | null;
}
interface PointerObservation extends Point {
  readonly kind: string; readonly at: number; readonly trusted: boolean;
  readonly pointerId: number; readonly buttons: number; readonly geometryIndex: number;
}
interface GeometryEvidence {
  readonly schema: 1; readonly scope: "first-stroke-observation-only";
  route: readonly Point[]; readonly frames: GeometryFrame[]; readonly pointers: PointerObservation[];
  frameReads: number; truncated: boolean; stopped: boolean;
}
interface BrowserProbe {
  readonly evidence: GeometryEvidence;
  arm(points: readonly Point[]): void;
  stop(): void;
}
type ProbeWindow = Window & { __studioBrushMediaGeometry?: BrowserProbe };

/** 출시된 DOM과 Konva 읽기 API만 관측한다. 입력 처리·표시·기존 검증 기준을 바꾸지 않는다. */
export function installStudioBrushMediaGeometryProbe(): void {
  const target = window as ProbeWindow;
  target.__studioBrushMediaGeometry?.stop();
  const evidence: GeometryEvidence = { schema: 1, scope: "first-stroke-observation-only", route: [], frames: [], pointers: [],
    frameReads: 0, truncated: false, stopped: false };
  let armed = false, started = false, pointerId: number | null = null, frameId = 0;
  let lastSignature = "";
  const rectOf = (element: Element | null): Rect | null => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  const capture = (label: string, force = false): void => {
    if (evidence.frames.length >= 240) { evidence.truncated = true; return; }
    const content = Array.from(document.querySelectorAll<HTMLElement>(".konvajs-content"))
      .find(element => element.getClientRects().length > 0) ?? null;
    const viewport = content?.closest<HTMLElement>("[data-studio-canvas-viewport]") ?? null;
    const runtime = (window as Window & { Konva?: { stages?: Array<{
      container(): HTMLElement; getAbsoluteTransform(): { getMatrix(): number[] };
    }> } }).Konva;
    const stage = runtime?.stages?.find(candidate => content !== null && candidate.container().contains(content));
    const geometry = { stage: rectOf(content), clientSize: content ? [content.clientWidth, content.clientHeight] : null,
      transform: stage?.getAbsoluteTransform().getMatrix().slice(0, 6) ?? null,
      scroll: [window.scrollX, window.scrollY], viewport: rectOf(viewport),
      viewportScroll: viewport ? [viewport.scrollLeft, viewport.scrollTop] : null,
      workspace: rectOf(content?.closest("#studio-workspace") ?? null) };
    evidence.frameReads += 1;
    const signature = JSON.stringify(geometry);
    if (force || signature !== lastSignature) evidence.frames.push({ label, at: performance.now(), ...geometry });
    lastSignature = signature;
  };
  const frame = (): void => {
    frameId = 0;
    if (evidence.stopped) return;
    capture("animation-frame");
    if (evidence.frameReads >= 600 || evidence.frames.length >= 240) { evidence.truncated = true; stop(); return; }
    frameId = requestAnimationFrame(frame);
  };
  const observe = (event: PointerEvent): void => {
    if (!armed || evidence.stopped) return;
    if (event.type === "pointerdown") {
      if (started || !(event.target instanceof Element) || !event.target.closest(".konvajs-content")) return;
      started = true; pointerId = event.pointerId; capture("pointerdown", true);
      frameId = requestAnimationFrame(frame);
    }
    if (event.pointerId !== pointerId) return;
    if (evidence.pointers.length < 256) evidence.pointers.push({ kind: event.type, at: event.timeStamp,
      x: event.clientX, y: event.clientY, trusted: event.isTrusted, pointerId: event.pointerId,
      buttons: event.buttons, geometryIndex: evidence.frames.length - 1 });
    else evidence.truncated = true;
    if (event.type === "pointerup" || event.type === "pointercancel") {
      capture(event.type, true); pointerId = null;
    }
  };
  function stop(): void {
    if (evidence.stopped) return;
    capture(started ? "after-first-settled" : "stopped-before-first-stroke", true); evidence.stopped = true;
    if (frameId) cancelAnimationFrame(frameId);
    for (const kind of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) document.removeEventListener(kind, observe as EventListener, true);
  }
  for (const kind of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) document.addEventListener(kind, observe as EventListener, { capture: true, passive: true });
  capture("before-catalog", true);
  target.__studioBrushMediaGeometry = { evidence, stop, arm(points) {
    evidence.route = points.map(point => ({ x: point.x, y: point.y }));
    capture("after-catalog-before-first-stroke", true); armed = true;
  } };
}

/** 격리된 QA 문서의 draw 좌표만 발췌하고 전체 payload·사용자 텍스트·이미지는 기록하지 않는다. */
export function summarizeStudioBrushMediaDraws(document: StudioDurableAutosaveDocument | null) {
  if (!document) return { status: "unavailable", reason: "durable snapshot not available" };
  const page = document.pagesList.find(candidate => candidate.id === document.currentPageId) ?? document.pagesList[0];
  const draws = (page?.elements ?? []).flatMap((value) => {
    if (!value || typeof value !== "object" || !("type" in value) || value.type !== "draw") return [];
    const draw = value as Record<string, unknown>, points = Array.isArray(draw.points) ? draw.points : [];
    const numeric = Object.fromEntries(["x", "y", "scaleX", "scaleY", "rotation", "offsetX", "offsetY", "strokeWidth"]
      .flatMap(key => typeof draw[key] === "number" && Number.isFinite(draw[key]) ? [[key, draw[key]]] : []));
    return [{ ...numeric, id: typeof draw.id === "string" ? draw.id : null, pointCount: Math.floor(points.length / 2),
      points: points.slice(0, 512).map(value => typeof value === "number" && Number.isFinite(value) ? value : null),
      truncated: points.length > 512 }];
  });
  return { status: "available", savedAt: document.savedAt, drawCount: draws.length, draws: draws.slice(0, 3) };
}

/** 저장 좌표는 픽셀·Undo 측정이 모두 끝난 뒤 한 번 읽으며, 실패도 진단 JSON에 남긴다. */
export function createStudioBrushMediaGeometryDiagnostics(page: Page, id: string, directory: string) {
  let installed = false;
  return {
    async install() { await page.evaluate(installStudioBrushMediaGeometryProbe); installed = true; },
    async arm(points: readonly Point[]) {
      await page.evaluate(value => (window as ProbeWindow).__studioBrushMediaGeometry?.arm(value), points);
    },
    async stop() { await page.evaluate(() => (window as ProbeWindow).__studioBrushMediaGeometry?.stop()); },
    async save() {
      if (!installed) return;
      let observation: unknown, stored: unknown, timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        observation = await page.evaluate(() => {
          const probe = (window as ProbeWindow).__studioBrushMediaGeometry;
          probe?.stop(); return probe?.evidence ?? null;
        });
      } catch (error) { observation = { unavailable: String(error) }; }
      try {
        const snapshot = await Promise.race([
          readDurableStudioAutosaveDocument(page, "toonstudio-studio-autosave:v12:guest:new"),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("저장 좌표 관측 2초 기한 초과")), 2_000); }),
        ]);
        stored = summarizeStudioBrushMediaDraws(snapshot);
      } catch (error) { stored = { status: "unavailable", reason: String(error) }; }
      finally { if (timeout) clearTimeout(timeout); }
      writeFileSync(join(directory, `studio-brush-media-${id}-geometry.json`), `${JSON.stringify({ id, observation, stored }, null, 2)}\n`);
    },
  };
}
