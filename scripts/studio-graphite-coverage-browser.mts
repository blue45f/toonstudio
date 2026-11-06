import type { DrawEl } from "@/domains/creator/studio-element-model";

import { serializeStudioBrushDynamicsSettingsCanonical } from "@/domains/creator/brush/studio-brush-dynamics";
import { materializeStudioBrushPackSelection } from "@/domains/creator/brush/studio-brush-pack-runtime";
import { planStudioDynamicBrushCoverageAndLegacyMarks, renderStudioDynamicBrushCoverage } from "@/domains/creator/studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "@/domains/creator/studio-dynamic-brush-render-plan";


type Mode = "white" | "transparent";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
interface Session {
  reset(mode: Mode): void;
  draw(x: number, y: number): { mode: Mode; x: number; y: number };
  finish(): { draws: number; canonicalStable: true };
  dispose(): void;
}
let session: Session | undefined;
function active() { check(session, "probe가 초기화되지 않았습니다."); return session; }
async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function initializeGraphiteProbe() {
  check(!session, "기존 probe를 먼저 해제해야 합니다.");
  const selected = materializeStudioBrushPackSelection("material-graphite-platelets");
  check(selected?.brushDynamics, "canonical Graphite factory가 없습니다.");
  const dynamics = selected.brushDynamics;
  const width = selected.defaultWidth, opacity = selected.defaultOpacity;
  check(width === 15 && opacity === 0.82 && dynamics.seed === 4026803820,
    "공개 fixture의 폭/불투명도/material seed가 다릅니다.");
  const canonical = serializeStudioBrushDynamicsSettingsCanonical(dynamics);
  // 현재 factory snapshot 그대로다. flow override나 실험 snapshot을 만들지 않는다.
  const source: DrawEl = {
    id: "graphite-ci-weak-coverage-vQB4mN", type: "draw", kind: "freehand", mode: "pen",
    brush: selected.runtimeBrushId, brushCatalogId: selected.catalogId,
    points: [502.9195088676671, 301.69238528985335, 494.07912687585264, 298.74425123164633],
    pressures: [0.55, 0.7235368596214342], stroke: "#7c5cfc", strokeWidth: width, opacity,
    brushDynamics: dynamics, paintModel: "bounded-flow-v2", paperModel: "contact-tooth-v2",
  };
  const planned = planStudioDynamicBrushRender(source, selected.runtimeBrushId, false);
  check(planned.status === "ready", "retained plan이 거부됐습니다.");
  const plan = planned.plan;
  check(plan.seed === 372699818, "public fixture의 target seed가 다릅니다.");
  const { coveragePlan } = planStudioDynamicBrushCoverageAndLegacyMarks({
    dabVariations: plan.dabVariations, dynamics: plan.dynamics, materialIdentity: plan.materialIdentity,
    dynamicSeed: plan.seed, stroke: source.stroke, stampGrid: plan.renderBudget.stampGrid,
    markBudget: plan.markBudget, ...(plan.paper ? { paper: plan.paper } : {}),
  });
  check(coveragePlan.ok, "coverage plan이 거부됐습니다.");
  const marks = coveragePlan.marks;
  check(marks.length === 4, "고정 fixture의 mark 개수가 다릅니다.");
  const signature = () => JSON.stringify(marks.map((m) => ({
    x: m.x, y: m.y, radiusX: m.radiusX, radiusY: m.radiusY, angleRadians: m.angleRadians, alpha: m.alpha,
  })));
  const markSignature = signature();
  const canvas = document.createElement("canvas");
  canvas.width = 733; canvas.height = 769;
  Object.assign(canvas.style, { position: "absolute", left: "0px", top: "0px",
    width: "733px", height: "769px", display: "block" });
  const context = canvas.getContext("2d");
  check(context, "실제 Canvas2D context가 없습니다.");
  document.body.append(canvas);
  let pendingMode: Mode | undefined;
  let draws = 0;
  session = {
    reset(mode) {
      check(mode === "white" || mode === "transparent", "알 수 없는 destination입니다.");
      context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over"; context.clearRect(0, 0, 733, 769);
      if (mode === "white") { context.fillStyle = "#fff"; context.fillRect(0, 0, 733, 769); }
      pendingMode = mode;
    },
    draw(x, y) {
      check(pendingMode, "각 draw에 새 baseline reset이 필요합니다.");
      check(Number.isInteger(x) && x >= 0 && x < 8 && Number.isInteger(y) && y >= 0 && y < 8,
        "고정64개 위상 이외의 입력입니다.");
      const mode = pendingMode; pendingMode = undefined;
      const scale = 1.0180555582046509;
      context.setTransform(scale, 0, 0, scale, x / 8, y / 8);
      const receipt = renderStudioDynamicBrushCoverage(context, marks, { activeDraft: false, opacity });
      check(receipt.status === "rendered", "실제 coverage draw가 완료되지 않았습니다.");
      check(signature() === markSignature, "coverage mark가 변경됐습니다.");
      draws += 1; return { mode, x: x / 8, y: y / 8 };
    },
    finish() {
      check(draws === 128, "두 destination의128개 draw가 모두 실행되지 않았습니다.");
      check(serializeStudioBrushDynamicsSettingsCanonical(dynamics) === canonical, "factory snapshot이 변경됐습니다.");
      check(signature() === markSignature, "coverage mark가 변경됐습니다.");
      return { draws, canonicalStable: true };
    },
    dispose() { canvas.remove(); canvas.width = 1; canvas.height = 1; },
  };
  return { source, flow: dynamics.flow.base, seed: plan.seed, markCount: marks.length,
    canonicalSha256: await hash(canonical), markSha256: await hash(markSignature) };
}
export function resetGraphiteProbe(mode: Mode) { active().reset(mode); }
export function drawGraphiteProbe(x: number, y: number) { return active().draw(x, y); }
export function finishGraphiteProbe() { return active().finish(); }
export function disposeGraphiteProbe() { session?.dispose(); session = undefined; }
