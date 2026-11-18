import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

import { studioWetInkBrushDepositsPigment } from "../../apps/web/src/domains/creator/brush/studio-wet-ink-brush-runtime";

export interface StudioArtistJourneySupportingEvidence {
  readonly longBrushResult: unknown;
  readonly artifactRoot: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** 투명 물붓은 안료 0px를 허용하되 실제 젖음·저장·Undo와 네 단계 PNG를 요구한다. */
export function studioArtistTransparentWashIssues(
  entry: Record<string, unknown>,
  expectedBrushes: number,
  supporting: StudioArtistJourneySupportingEvidence | undefined,
): string[] {
  const id = typeof entry.id === "string" ? entry.id : "unknown";
  const prefix = `live/commit: ${id}`;
  const issues: string[] = [];
  if (studioWetInkBrushDepositsPigment(id) || typeof entry.runtimeBrushId !== "string"
    || studioWetInkBrushDepositsPigment(entry.runtimeBrushId)) {
    issues.push(`${prefix} is not an authored transparent wash`);
  }
  const quality = record(entry.quality);
  const frames = record(quality?.frames);
  const live = record(frames?.live);
  const released = record(frames?.released);
  const settled = record(frames?.settled);
  const count = (value: unknown) => typeof value === "number"
    && Number.isSafeInteger(value) && value >= 0 ? value : -1;
  if (count(live?.visiblePixels) < 4) {
    issues.push(`${prefix} has no measured live wet hint`);
  }
  if ([released, settled].some(frame => count(frame?.visiblePixels) < 0 || count(frame?.visiblePixels) >= 4)) {
    issues.push(`${prefix} leaves pigment after its transparent wash`);
  }

  const result = record(supporting?.longBrushResult);
  const records = Array.isArray(result?.evidence) ? result.evidence : [];
  const matches = records.map(record).filter(value => value?.id === id);
  const persisted = matches.length === 1 ? matches[0] : null;
  if (result?.ok !== true || result.errorCount !== 0
    || result.presetCount !== expectedBrushes || records.length !== expectedBrushes
    || !persisted || persisted.operation !== "paint" || persisted.persistedMode !== "pen"
    || persisted.expectedRuntimeBrushId !== entry.runtimeBrushId
    || persisted.persistedBrushId !== entry.runtimeBrushId || persisted.persistedCatalogId !== id
    || typeof persisted.persistedPathDistance !== "number" || !Number.isFinite(persisted.persistedPathDistance)
    || persisted.persistedPathDistance < 300 || persisted.undoRestoredPixels !== true
    || persisted.qualityPolicy !== "record-only-transparent" || persisted.qualityOk !== true) {
    issues.push(`${prefix} lacks matching persisted long-stroke and Undo evidence`);
  }

  const artifacts = record(entry.artifacts);
  for (const phase of ["baseline", "live", "released", "settled"] as const) {
    const artifact = record(artifacts?.[phase]);
    let present = false;
    if (supporting && typeof artifact?.relativeToScratch === "string") {
      const root = resolve(supporting.artifactRoot);
      const path = resolve(root, artifact.relativeToScratch);
      if (path.startsWith(`${root}${sep}`)) {
        try {
          const stat = statSync(path);
          present = stat.isFile() && stat.size >= 8 && stat.size <= 16 * 1024 * 1024
            && readFileSync(path).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        } catch {
          // 누락·읽기 실패는 아래 원본 artifact 계약 위반으로 남긴다.
        }
      }
    }
    if (!present) issues.push(`${prefix} has no readable ${phase} PNG evidence`);
  }
  return issues;
}
