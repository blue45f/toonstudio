import type { CameraShotSpec, CompositionFrameInput, Rule180AuditInput } from "./cinematography-camera-engine";
import type { VerticalStripInput } from "./vertical-eyeflow-verifier";

export function requireFinite(values: readonly number[]): void {
  if (values.some((v) => !Number.isFinite(v))) throw new RangeError("계산 입력은 유한한 수여야 합니다.");
}

export function requirePositive(values: readonly number[]): void {
  requireFinite(values);
  if (values.some((v) => v <= 0)) throw new RangeError("크기·거리·배율은 양수여야 합니다.");
}

export function requireUnique(ids: readonly (string | number)[]): void {
  if (ids.some((id) => typeof id === "string" ? !id.trim() : !Number.isFinite(id)) || new Set(ids).size !== ids.length) {
    throw new RangeError("식별자는 각 범위에서 비어 있지 않고 고유해야 합니다.");
  }
}

export function requireChoice(value: string, choices: readonly string[]): void {
  if (!choices.includes(value)) throw new RangeError("등록되지 않은 계산 모드입니다.");
}

export function shotSignature(shots: readonly CameraShotSpec[]): string {
  return JSON.stringify(shots.map((s) => [s.shotId, s.labelKo, s.labelEn, s.cameraPosition.x,
    s.cameraPosition.z, s.focalLengthMm, s.apertureFStop ?? null, s.targetActorId ?? null, s.isNeutralBridgeCut ?? false]));
}

export function assertShots(shots: readonly CameraShotSpec[]): void {
  if (shots.length < 2) throw new RangeError("연속 컷 검사는 최소 두 샷이 필요합니다.");
  requireUnique(shots.map((s) => s.shotId));
  for (const s of shots) {
    requireFinite([s.cameraPosition.x, s.cameraPosition.z]);
    if (![24, 35, 50, 85, 135].includes(s.focalLengthMm)) throw new RangeError("미등록 렌즈입니다.");
    if (s.apertureFStop !== undefined) requirePositive([s.apertureFStop]);
    if (s.isNeutralBridgeCut !== undefined && typeof s.isNeutralBridgeCut !== "boolean") throw new RangeError("중립 컷 표시는 boolean이어야 합니다.");
  }
}

export function assertRule180Input(input: Rule180AuditInput): void {
  const a = input.actorA.position, b = input.actorB.position;
  requireFinite([a.x, a.z, b.x, b.z]);
  requireUnique([input.actorA.id, input.actorB.id]);
  if (!Number.isFinite(Math.hypot(b.x - a.x, b.z - a.z)) || Math.hypot(b.x - a.x, b.z - a.z) <= 1e-6) throw new RangeError("서로 다른 배우 위치로 시선 축을 정해야 합니다.");
  if (input.preferredSide !== undefined) requireChoice(input.preferredSide, ["positive", "negative"]);
  if (input.onAxisToleranceM !== undefined) requirePositive([input.onAxisToleranceM]);
  assertShots(input.shots);
}

export function assertComposition(input: CompositionFrameInput): void {
  const values = [input.subjectFocalPoint.x, input.subjectFocalPoint.y, input.headTopY];
  requireFinite(values);
  if (values.some((v) => v < 0 || v > 1)) throw new RangeError("정규화 구도 좌표는 0~1이어야 합니다.");
  requireChoice(input.gazeDirection, ["left", "right", "center"]);
  requireChoice(input.shotScale ?? "medium", ["extreme-closeup", "closeup", "medium", "wide"]);
  if (input.goldenSpiralCorner !== undefined) requireChoice(input.goldenSpiralCorner, ["auto", "top-left", "top-right", "bottom-left", "bottom-right"]);
}

export function nodeKey(panelId: string, nodeId: string): string { return JSON.stringify([panelId, nodeId]); }

/** 절대 픽셀 여백 규칙을 쓰는 이 예제의 지원 최소 크기. 작은 원본을 몰래 확대하지 않는다. */
export const MIN_EYEFLOW_PANEL_WIDTH_PX = 320;
export const MIN_EYEFLOW_PANEL_HEIGHT_PX = 180;

export function assertStrip(strip: VerticalStripInput): void {
  requireUnique([strip.stripId]);
  requirePositive([strip.stripWidthPx]);
  if (!strip.panels.length) throw new RangeError("시선 검사는 비어 있지 않은 패널이 필요합니다.");
  requireUnique(strip.panels.map((p) => p.panelId));
  requireFinite(strip.panels.map((p) => p.order));
  let nodeCount = 0;
  for (const panel of strip.panels) {
    requirePositive([panel.width, panel.height]);
    if (panel.width < MIN_EYEFLOW_PANEL_WIDTH_PX || panel.height < MIN_EYEFLOW_PANEL_HEIGHT_PX) {
      throw new RangeError("시선 분석 예제의 패널 최소 크기는 320×180px입니다. 원본 크기는 자동 확대하지 않습니다.");
    }
    requireFinite([panel.gutterAfterPx]);
    if (panel.gutterAfterPx < 0 || !panel.nodes.length) throw new RangeError("패널에는 앵커가 있고 여백은 음수가 아니어야 합니다.");
    requireChoice(panel.pacingIntent, ["fast-action", "dialogue-rhythm", "emotional-pause", "cliffhanger-reveal"]);
    requireUnique(panel.nodes.map((n) => n.id));
    requireFinite(panel.nodes.map((n) => n.readingOrder));
    for (const n of panel.nodes) {
      requireFinite([n.x, n.y, n.textLength ?? 0]);
      if (n.x < 0 || n.x > panel.width || n.y < 0 || n.y > panel.height || (n.textLength ?? 0) < 0) throw new RangeError("앵커는 패널 안에 있고 글자 수는 음수가 아니어야 합니다.");
      requireChoice(n.kind, ["speech-balloon", "character-gaze", "action-vector", "sfx-anchor"]);
      if (n.gazeVector) {
        requireFinite([n.gazeVector.dx, n.gazeVector.dy]);
        if (Math.hypot(n.gazeVector.dx, n.gazeVector.dy) <= 1e-6) throw new RangeError("시선 벡터는 영벡터가 아니어야 합니다.");
      }
      nodeCount += 1;
    }
  }
  if (nodeCount < 2) throw new RangeError("시선 흐름 검사는 최소 두 앵커가 필요합니다.");
}

/** 문자열·원문을 가공하지 않고 처방 대상 버전을 비교한다. */
export function stripSignature(strip: VerticalStripInput): string {
  return JSON.stringify([strip.stripId, strip.titleKo, strip.titleEn, strip.descriptionKo, strip.descriptionEn,
    strip.stripWidthPx, [...strip.panels].sort((a, b) => a.order - b.order).map((p) => [p.panelId, p.order, p.titleKo,
      p.titleEn, p.width, p.height, p.gutterAfterPx, p.pacingIntent, [...p.nodes].sort((a, b) => a.readingOrder - b.readingOrder)
        .map((n) => [n.id, n.kind, n.labelKo, n.labelEn, n.x, n.y, n.readingOrder, n.gazeVector?.dx ?? null, n.gazeVector?.dy ?? null, n.textLength ?? null])])]);
}
