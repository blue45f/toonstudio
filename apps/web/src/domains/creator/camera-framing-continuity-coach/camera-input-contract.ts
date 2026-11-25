import type {
  CameraFramingCoachInput, CameraFramingProposal, PreviousCutCameraState,
} from "./camera-framing-coach-engine";

export const MAX_CAMERA_DIALOGUE_LENGTH = 8192;
const sides = ["left", "center", "right"];
const gazes = ["left-to-right", "right-to-left", "camera", "down"];
const scales = ["wide", "medium", "closeup", "extreme-closeup"];
const tensions = ["calm", "confrontation", "reveal", "impact", "intimacy"];

export function assertCameraCut(input: PreviousCutCameraState): void {
  if (!Number.isFinite(input.prevCameraYawDeg)) throw new RangeError("카메라 방위각은 유한한 수여야 합니다.");
  if (!sides.includes(input.prevSubjectSide) || !gazes.includes(input.prevGazeDirection) || !scales.includes(input.prevShotScale)) {
    throw new TypeError("지원하지 않는 컷 구도 값입니다.");
  }
}

export function assertCameraInput(input: CameraFramingCoachInput): void {
  assertCameraCut(input);
  if (input.speakerCount !== 1 && input.speakerCount !== 2 || !tensions.includes(input.dialogueTension)) {
    throw new TypeError("지원하지 않는 대사 조건입니다.");
  }
  if (typeof input.dialogueText !== "string" || input.dialogueText.length > MAX_CAMERA_DIALOGUE_LENGTH) {
    throw new RangeError("카메라 예제의 대사 길이 상한을 넘었습니다.");
  }
}

export function assertCameraProposals(proposals: readonly CameraFramingProposal[]): void {
  if (!Array.isArray(proposals) || proposals.length > 3 || new Set(proposals.map((item) => item.id)).size !== proposals.length) {
    throw new RangeError("서로 다른 카메라 구도 제안은 최대 3개입니다.");
  }
}

/** 유한한 값과 제한된 크기의 JSON 자료만 내보내기와 외부 회신에 사용한다. */
export function assertCameraData(value: unknown): void {
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  function visit(item: unknown, depth: number): void {
    if (++nodes > 1500 || depth > 12) throw new RangeError("카메라 예제 자료의 크기 상한을 넘었습니다.");
    if (typeof item === "number" && !Number.isFinite(item)) throw new RangeError("카메라 예제 수치는 유한해야 합니다.");
    if (typeof item === "string" && item.length > MAX_CAMERA_DIALOGUE_LENGTH) throw new RangeError("카메라 예제 문자열이 너무 깁니다.");
    if (typeof item === "bigint" || typeof item === "symbol" || typeof item === "function") throw new TypeError("JSON으로 내보낼 수 없는 값입니다.");
    if (item === null || typeof item !== "object") return;
    if (ancestors.has(item)) throw new TypeError("순환 참조가 있는 카메라 예제 자료입니다.");
    ancestors.add(item);
    for (const child of Object.values(item)) visit(child, depth + 1);
    ancestors.delete(item);
  }
  visit(value, 0);
}
