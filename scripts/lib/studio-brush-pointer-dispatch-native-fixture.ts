import {
  isStudioBrushPointerDispatchBoundaryValid,
  studioBrushPointerDispatchInitSource,
  type StudioBrushPointerDispatchMeasurement,
  type StudioBrushPointerDispatchWindow,
} from "./studio-brush-pointer-dispatch-probe";

import type { Browser } from "playwright";

type FixtureKind = "whole-dispatch" | "stop-propagation" | "stop-immediate"
  | "late-bubble" | "late-object-capture" | "late-setter" | "untrusted";
interface WorkObservation {
  readonly type: string;
  readonly phase: string;
  readonly start: number;
  readonly end: number;
  readonly trusted: boolean;
}
interface NativeObservation {
  readonly measurement: StudioBrushPointerDispatchMeasurement;
  readonly work: readonly WorkObservation[];
  readonly legacyMoveMs: readonly number[];
  readonly legacyUpMs: number | null;
}
interface NativeCase extends NativeObservation {
  readonly kind: FixtureKind;
  readonly rearm?: NativeObservation;
}
interface FixtureWindow extends StudioBrushPointerDispatchWindow {
  __studioPointerFixture?: {
    work: WorkObservation[]; legacyMoveMs: number[]; legacyUpMs: number | null;
  };
}
export interface StudioBrushPointerDispatchNativeFixture {
  readonly method: "native-mouse-dispatch-boundary-regression-v1";
  readonly browserVersion: string;
  readonly inputEvidence: "playwright-mouse-trusted-events";
  readonly syntheticDispatchProvesTiming: false;
  readonly productPerformanceEvidence: false;
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly cases: readonly NativeCase[];
}

/** 실제 mouse 입력으로만 시간 경계를 검증한다. 합성 입력은 거절 경로에만 사용한다. */
export async function verifyStudioBrushPointerDispatchNativeFixture(
  browser: Browser,
): Promise<StudioBrushPointerDispatchNativeFixture> {
  const context = await browser.newContext({ viewport: { width: 360, height: 240 } });
  const cases: NativeCase[] = [];
  const failures: string[] = [];
  try {
    for (const kind of ["whole-dispatch", "stop-propagation", "stop-immediate", "late-bubble",
      "late-object-capture", "late-setter", "untrusted"] as const) {
      const page = await context.newPage();
      try {
        // 저장소 verifier와 동일한 단일 init이며 앱/fixture listener보다 먼저 설치한다.
        await page.addInitScript({ content: studioBrushPointerDispatchInitSource() });
        await page.goto("data:text/html,<main id='parent'><div id='stage' style='margin:20px;width:180px;height:160px;background:navy'></div></main>");
        await page.evaluate("globalThis.__name ??= (target) => target");
        await page.evaluate(({ kind }) => {
          const host = window as FixtureWindow;
          const target = document.querySelector("#stage");
          const parent = document.querySelector("#parent");
          if (!target || !parent) throw new Error("native 경계 fixture의 실제 입력 영역이 없습니다.");
          const state: NonNullable<FixtureWindow["__studioPointerFixture"]> = {
            work: [], legacyMoveMs: [], legacyUpMs: null,
          };
          host.__studioPointerFixture = state;
          const busy = (ms: number): void => {
            const start = performance.now();
            while (performance.now() - start < ms) { /* 명시한 handler 작업을 실제 main thread에서 수행한다. */ }
          };
          const work = (phase: string, ms: number) => (event: PointerEvent): void => {
            if (event.type === "pointermove" && event.buttons !== 1) return;
            const start = performance.now(); busy(ms);
            state.work.push({ type: event.type, phase, start, end: performance.now(), trusted: event.isTrusted });
            if (phase === "target") queueMicrotask(() => {
              const start = performance.now(); busy(5);
              state.work.push({ type: event.type, phase: "target-microtask", start,
                end: performance.now(), trusted: event.isTrusted });
            });
          };
          if (kind === "whole-dispatch") {
            // 제품 transport와 같이 down target에서 매획 새 capture를 등록하고 up에서 제거한다.
            target.addEventListener("pointerdown", () => {
              const move = work("window-capture", 4);
              const end = (event: PointerEvent): void => {
                work("window-capture", 4)(event);
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", end, true);
                window.removeEventListener("pointercancel", end, true);
              };
              window.addEventListener("pointermove", move, true);
              window.addEventListener("pointerup", end, true);
              window.addEventListener("pointercancel", end, true);
            });
            for (const type of ["pointermove", "pointerup"] as const) {
              target.addEventListener(type, work("target", type === "pointerup" ? 55 : 8) as EventListener);
              parent.addEventListener(type, work("ancestor-bubble", 4) as EventListener);
              window.addEventListener(type, work("window-bubble", 5));
              window.addEventListener(type, event => {
                if (type === "pointermove" && event.buttons !== 1) return;
                const start = performance.now();
                queueMicrotask(() => {
                  const elapsed = performance.now() - start;
                  if (type === "pointermove") state.legacyMoveMs.push(elapsed);
                  else state.legacyUpMs = elapsed;
                });
              }, true);
            }
          }
          if (kind === "stop-propagation") target.addEventListener("pointermove", event => event.stopPropagation());
          if (kind === "stop-immediate") window.addEventListener("pointermove", event => event.stopImmediatePropagation());
        }, { kind });
        const exercise = async (): Promise<NativeObservation> => {
          await page.mouse.move(50, 50);
          await page.evaluate(({ kind }) => {
            const host = window as FixtureWindow;
            const probe = host.__studioBrushPointerDispatch;
            const state = host.__studioPointerFixture;
            if (!probe || !state) throw new Error("native fixture의 init 계측이 없습니다.");
            state.work.length = 0; state.legacyMoveMs.length = 0; state.legacyUpMs = null;
            probe.arm({ expectedPointerMoves: 3, stageSelector: "#stage", captureSamples: true });
            if (kind === "late-bubble" || kind === "late-object-capture") {
              window.addEventListener("pointermove", () => undefined, { capture: kind === "late-object-capture" });
            }
            if (kind === "late-setter") window.onpointerup = () => undefined;
            if (kind === "untrusted") document.querySelector("#stage")?.dispatchEvent(new PointerEvent("pointerdown", {
              bubbles: true, pointerId: 1, pointerType: "mouse",
            }));
          }, { kind });
          await page.mouse.down();
          for (const coordinate of [70, 90, 110]) await page.mouse.move(coordinate, 60);
          await page.mouse.up();
          return page.evaluate(() => {
            const host = window as FixtureWindow;
            if (!host.__studioBrushPointerDispatch || !host.__studioPointerFixture) {
              throw new Error("native 경계 fixture의 결과가 없습니다.");
            }
            return { measurement: host.__studioBrushPointerDispatch.finish(), ...host.__studioPointerFixture };
          });
        };
        const result = await exercise();
        const rearm = kind === "whole-dispatch" ? await exercise() : undefined;
        cases.push({ kind, ...result, ...(rearm ? { rearm } : {}) });
      } catch (error) {
        failures.push(`${kind}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
  failures.push(...evaluateStudioBrushPointerDispatchNativeCases(cases));
  return { method: "native-mouse-dispatch-boundary-regression-v1", browserVersion: browser.version(),
    inputEvidence: "playwright-mouse-trusted-events", syntheticDispatchProvesTiming: false,
    productPerformanceEvidence: false, ok: failures.length === 0, failures, cases };
}

/** 포트 단위 검사와 원격 native 실행이 같은 fail-closed 판정을 사용한다. */
export function evaluateStudioBrushPointerDispatchNativeCases(cases: readonly NativeCase[]): string[] {
  const failures: string[] = [];
  const whole = cases.find(item => item.kind === "whole-dispatch");
  if (cases.length !== 7 || new Set(cases.map(item => item.kind)).size !== 7) failures.push("native fixture 7개가 모두 완료되지 않았습니다.");
  if (!whole) failures.push("전체 native dispatch 경계가 유효하지 않습니다.");
  else {
    failures.push(...evaluateWholeDispatch(whole));
    if (!whole.rearm || whole.rearm.measurement.boundary.pageEpoch !== whole.measurement.boundary.pageEpoch) {
      failures.push("같은 document에서 release 뒤 재arm한 실제 획의 증거가 없습니다.");
    } else failures.push(...evaluateWholeDispatch(whole.rearm));
  }
  for (const item of cases.filter(candidate => candidate.kind !== "whole-dispatch")) {
    const expected = item.kind.startsWith("stop-") ? "missing-event-end"
      : item.kind === "untrusted" ? "untrusted-event" : "late-window-listener-change";
    if (item.measurement.boundary.complete || !item.measurement.boundary.errors.includes(expected)) {
      failures.push(`${item.kind}: 불완전한 native 경계를 수락했습니다.`);
    }
  }
  return failures;
}

function evaluateWholeDispatch(whole: NativeObservation): string[] {
  const failures: string[] = [];
  if (!isStudioBrushPointerDispatchBoundaryValid(whole.measurement.boundary, 3, 3)) {
    failures.push("전체 native dispatch 경계가 유효하지 않습니다.");
  } else {
    const moves = whole.measurement.samples.filter(sample => sample.type === "pointermove");
    const up = whole.measurement.samples.find(sample => sample.type === "pointerup");
    if (moves.length !== 3 || !up || whole.legacyMoveMs.length !== 3 || whole.legacyUpMs === null) {
      failures.push("native/legacy 비교 표본이 누락됐습니다.");
    } else {
      if (whole.measurement.pointerAppendDurationsMs.length !== 3
        || moves.some((sample, index) => whole.measurement.pointerAppendDurationsMs[index] !== sample.durationMs)
        || whole.measurement.pointerUpMainThreadMs !== up.durationMs) {
        failures.push("공개 판정 수치가 검증한 dispatch 경계 표본과 다릅니다.");
      }
      for (const [index, sample] of moves.entries()) {
        if (!(sample.durationMs > 16.7 && sample.durationMs - whole.legacyMoveMs[index] > 16.7)) {
          failures.push(`move ${index}: 이전 microtask 측정의 누락을 실제 native 입력으로 재현하지 못했습니다.`);
        }
      }
      if (!(up.durationMs > 50 && up.durationMs - whole.legacyUpMs > 50)) failures.push("50ms 초과 pointerup 작업의 기존 누락을 재현하지 못했습니다.");
      for (const sample of [...moves, up]) {
        const work = whole.work.filter(item => item.type === sample.type
          && item.start >= sample.startedAt && item.end <= sample.endedAt);
        if (work.length !== 5 || new Set(work.map(item => item.phase)).size !== 5 || work.some(item => !item.trusted)) {
          failures.push(`${sample.type} ${sample.sequence}: capture/target/microtask/ancestor/window 작업 전체가 경계 안에 없습니다.`);
        }
      }
    }
  }
  return failures;
}
