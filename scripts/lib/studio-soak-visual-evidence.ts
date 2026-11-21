export interface StudioSoakScreenshotEvidence {
  readonly phase: "periodic" | "final";
  readonly scheduledAtMs: number;
  readonly sessionAtMs: number;
  readonly file: string;
  readonly sha256: string;
}

interface ScreenshotFile {
  readonly file: string;
  readonly sha256: string;
}

interface VisualEvidenceFailure {
  readonly code: string;
  readonly file: string;
  readonly reason: string;
}

const CHECKPOINT_MS = 10 * 60_000;
const SHA256 = /^[0-9a-f]{64}$/u;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function screenshotEvidence(value: unknown): value is StudioSoakScreenshotEvidence {
  return record(value) && (value.phase === "periodic" || value.phase === "final")
    && nonnegative(value.scheduledAtMs) && nonnegative(value.sessionAtMs)
    && typeof value.file === "string" && typeof value.sha256 === "string"
    && SHA256.test(value.sha256);
}

/** 보고서가 요구하는 모든 시각 표본을 실제 PNG의 지문과 일대일로 대조한다. */
export function evaluateStudioSoakVisualCoverage(
  report: unknown,
  screenshots: readonly ScreenshotFile[],
) {
  const failures: VisualEvidenceFailure[] = [];
  const fail = (code: string, file: string, reason: string) => failures.push({ code, file, reason });
  let expected = 0;
  let recorded = 0;
  const verifiedSlots = new Set<string>();
  const result = () => ({
    ok: failures.length === 0,
    expected,
    recorded,
    observed: screenshots.length,
    verified: verifiedSlots.size,
    failures,
  });
  if (!record(report) || report.schemaVersion !== 2
    || typeof report.sessionId !== "string" || report.sessionId.trim().length === 0
    || typeof report.requestedMinutes !== "number" || !Number.isFinite(report.requestedMinutes)
    || report.requestedMinutes <= 0) {
    fail("invalid-report", "report.json", "유효한 소크 보고서의 버전·세션·요청 시간이 필요합니다.");
    return result();
  }
  const durationMs = report.requestedMinutes * 60_000;
  expected = Math.ceil(durationMs / CHECKPOINT_MS);
  if (!Number.isSafeInteger(expected) || expected < 1 || !Number.isFinite(durationMs)) {
    fail("invalid-duration", "report.json", "소크 요청 시간으로 필수 시각 표본 수를 계산할 수 없습니다.");
    return result();
  }
  if (!Array.isArray(report.screenshotEvidence)) {
    fail("missing-evidence", "report.json", "PNG 저장 시각과 SHA-256을 기록한 screenshotEvidence가 없습니다.");
    return result();
  }
  recorded = report.screenshotEvidence.length;
  const files = new Map<string, string>();
  for (const screenshot of screenshots) {
    if (files.has(screenshot.file) || !SHA256.test(screenshot.sha256)) {
      fail("invalid-file", screenshot.file, "실제 PNG 파일 목록이 중복되거나 SHA-256이 올바르지 않습니다.");
    }
    files.set(screenshot.file, screenshot.sha256);
  }
  const seenSlots = new Set<string>();
  const seenFiles = new Set<string>();
  for (const [index, candidate] of report.screenshotEvidence.entries()) {
    if (!screenshotEvidence(candidate)) {
      fail("invalid-evidence", "report.json", `시각 증거 ${index + 1}의 단계·시각·파일·SHA-256이 올바르지 않습니다.`);
      continue;
    }
    const { phase, scheduledAtMs, sessionAtMs, file, sha256 } = candidate;
    const slot = `${phase}:${scheduledAtMs}`;
    const failureCount = failures.length;
    const validSchedule = phase === "final" ? scheduledAtMs === durationMs
      : scheduledAtMs > 0 && scheduledAtMs < durationMs && scheduledAtMs % CHECKPOINT_MS === 0;
    if (!validSchedule || sessionAtMs < scheduledAtMs
      || phase === "periodic" && sessionAtMs >= scheduledAtMs + CHECKPOINT_MS) {
      fail("invalid-checkpoint", file, "시각 표본이 필수 체크포인트 또는 해당 측정 시간 창에 속하지 않습니다.");
    }
    const expectedFile = phase === "final" ? "final.png" : `checkpoint-${scheduledAtMs / 60_000}m.png`;
    if (file !== expectedFile) {
      fail("invalid-filename", file, `체크포인트의 정해진 상대 파일명 ${expectedFile}이 필요합니다.`);
    }
    if (seenSlots.has(slot) || seenFiles.has(file)) {
      fail("duplicate-evidence", file, "같은 체크포인트나 PNG 파일을 여러 번 증거로 사용할 수 없습니다.");
    }
    seenSlots.add(slot);
    seenFiles.add(file);
    if (!files.has(file)) fail("missing-file", file, "보고서에 기록된 필수 PNG가 없습니다.");
    else if (files.get(file) !== sha256) fail("hash-mismatch", file, "PNG의 실제 SHA-256이 저장 시점의 증거와 다릅니다.");
    if (failures.length === failureCount) verifiedSlots.add(slot);
  }
  for (const file of files.keys()) {
    if (!seenFiles.has(file)) fail("unrecorded-file", file, "현재 소크 보고서에 속하지 않는 체크포인트 PNG가 있습니다.");
  }
  // 유효한 슬롯만 세므로 긴 요청 시간도 거대한 기대 배열 없이 전체 구간을 검증한다.
  if (verifiedSlots.size !== expected) {
    fail("checkpoint-coverage", "report.json", `필수 시각 표본 ${expected}개 중 ${verifiedSlots.size}개만 검증됐습니다.`);
  }
  return result();
}
