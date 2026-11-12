/**
 * ExportPanel 하위 프리셋 칩 행 + 진행률·미저장 백업·영수증·안내·실패/재시도 피드백 섹션.
 */
import { useRef } from "react";

import { describeReceipt } from "../export-panel-helpers";

import type { CameraFramingMode, LabFailure } from "../../../../contracts";
import type { ExportKind, ExportReceipt } from "../../../../export/export-session";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

export type ExportBusyKind =
  | ExportKind
  | "turnaround"
  | "quad-sheet"
  | "import"
  | "clipboard-copy"
  | "clipboard-paste";

export const BUSY_ACTION_LABELS_KO: Readonly<Record<ExportBusyKind, string>> = {
  png: "투명 PNG 저장",
  turnaround: "4방향 설정시트 PNG 저장",
  "quad-sheet": "2×2 종합 설정시트 PNG 저장",
  glb: "GLB 저장",
  psd: "레이어 PSD 저장",
  recipe: "레시피 저장",
  "shaper-preset": "SHAPER 프리셋 저장",
  import: "레시피 불러오기",
  "clipboard-copy": "레시피 클립보드 복사",
  "clipboard-paste": "클립보드 레시피 붙여넣기",
};

const RESOLUTION_PRESETS = [
  { id: "webtoon-cut", label: "웹툰 컷 (800×1200)", w: 800, h: 1200 },
  { id: "square-1k", label: "정방형 기본 (1024×1024)", w: 1024, h: 1024 },
  { id: "manuscript-2k", label: "고해상도 원고 (2048×2048)", w: 2048, h: 2048 },
] as const;

const VRM_FRAMING_PRESETS = [
  { id: "vrm-full", label: "VRM 전신 턴어라운드 (1024×1536)", w: 1024, h: 1536, mode: "full-body" as const },
  { id: "vrm-bust", label: "VRM 상반신 소개컷 (1024×1024)", w: 1024, h: 1024, mode: "bust" as const },
  { id: "vrm-face", label: "VRM 표정 시트 클로즈업 (1024×1024)", w: 1024, h: 1024, mode: "face" as const },
] as const;

function handleChipGroupKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  index: number,
  refs: ReadonlyArray<HTMLButtonElement | null>,
  onActivateIndex: (nextIndex: number) => void,
): void {
  const len = refs.length;
  if (len === 0) return;
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (index + 1) % len;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (index + len - 1) % len;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = len - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  onActivateIndex(nextIndex);
  refs[nextIndex]?.focus();
}

export function formatBusyProgressKo(busy: ExportBusyKind, stepDetail: string | null): string {
  const suffix = stepDetail ? ` (${stepDetail})` : "";
  switch (busy) {
    case "import":
      return `레시피 불러오는 중…${suffix}`;
    case "turnaround":
      return `4방향 설정시트 내보내는 중…${suffix}`;
    case "quad-sheet":
      return `2×2 종합 설정시트 내보내는 중…${suffix}`;
    case "clipboard-copy":
      return "클립보드로 레시피 복사 중…";
    case "clipboard-paste":
      return "클립보드 레시피 붙여넣는 중…";
    default:
      return `${busy.toUpperCase()} 내보내는 중…${suffix}`;
  }
}

export interface ExportPresetRowsProps {
  readonly width: number;
  readonly height: number;
  readonly framing: CameraFramingMode;
  readonly onSelectPreset: (nextWidth: number, nextHeight: number, nextFraming: CameraFramingMode) => void;
}

export function ExportPresetRows({ width, height, framing, onSelectPreset }: ExportPresetRowsProps) {
  const resChipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const vrmChipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <>
      <div className="cl-export-row" role="group" aria-label="빠른 해상도 프리셋" data-testid="export-resolution-presets">
        {RESOLUTION_PRESETS.map((preset, idx) => (
          <button
            key={preset.id}
            ref={(el) => {
              resChipRefs.current[idx] = el;
            }}
            type="button"
            className="cl-preset-chip"
            aria-pressed={width === preset.w && height === preset.h && framing === "full-body"}
            onClick={() => onSelectPreset(preset.w, preset.h, "full-body")}
            onKeyDown={(event) =>
              handleChipGroupKeyDown(event, idx, resChipRefs.current, (nextIdx) => {
                const target = RESOLUTION_PRESETS[nextIdx];
                if (target) onSelectPreset(target.w, target.h, "full-body");
              })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="cl-export-row" role="group" aria-label="VRM 4-View 턴어라운드 및 프레이밍 프리셋" data-testid="export-vrm-framing-presets">
        {VRM_FRAMING_PRESETS.map((preset, idx) => (
          <button
            key={preset.id}
            ref={(el) => {
              vrmChipRefs.current[idx] = el;
            }}
            type="button"
            className="cl-preset-chip"
            data-testid={`export-preset-${preset.id}`}
            aria-pressed={width === preset.w && height === preset.h && framing === preset.mode}
            onClick={() => onSelectPreset(preset.w, preset.h, preset.mode)}
            onKeyDown={(event) =>
              handleChipGroupKeyDown(event, idx, vrmChipRefs.current, (nextIdx) => {
                const target = VRM_FRAMING_PRESETS[nextIdx];
                if (target) onSelectPreset(target.w, target.h, target.mode);
              })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
    </>
  );
}

export interface ExportStatusSectionProps {
  readonly busy: ExportBusyKind | null;
  readonly progressDetail: string | null;
  readonly hasPreImportBackup: boolean;
  readonly onRestorePreImportBackup: () => void;
  readonly onDismissPreImportBackup: () => void;
  readonly receipt: ExportReceipt | null;
  readonly notices: readonly string[];
  readonly failure: LabFailure | null;
  readonly failedKind: ExportBusyKind | null;
  readonly retryDisabled: boolean;
  readonly onRetryLastFailed: () => void;
  readonly failureAlertRef: RefObject<HTMLParagraphElement | null>;
}

export function ExportStatusSection({
  busy,
  progressDetail,
  hasPreImportBackup,
  onRestorePreImportBackup,
  onDismissPreImportBackup,
  receipt,
  notices,
  failure,
  failedKind,
  retryDisabled,
  onRetryLastFailed,
  failureAlertRef,
}: ExportStatusSectionProps) {
  return (
    <>
      {busy ? (
        <p className="cl-export-progress" role="status" aria-live="polite" data-tone="busy" data-testid="export-progress">
          {formatBusyProgressKo(busy, progressDetail)}
        </p>
      ) : null}
      {hasPreImportBackup ? (
        <div className="cl-export-experiment-summary" role="status" data-testid="export-unsaved-backup-banner">
          <p className="cl-export-experiment-source">
            저장하지 않은 이전 작업(포즈·외형·6단 페인트 서브레이어)을 임시 보관했습니다. 실수로 불러왔다면 바로 되돌릴 수 있습니다.
          </p>
          <div className="cl-export-nav-actions">
            <button
              type="button"
              className="cl-button cl-export-nav-btn"
              data-testid="export-restore-pre-import"
              disabled={busy !== null}
              onClick={onRestorePreImportBackup}
            >
              이전 작업으로 되돌리기
            </button>
            <button
              type="button"
              className="cl-button cl-export-nav-btn"
              data-testid="export-dismiss-pre-import"
              disabled={busy !== null}
              onClick={onDismissPreImportBackup}
            >
              보관 닫기
            </button>
          </div>
        </div>
      ) : null}
      {receipt ? (
        <p className="cl-export-receipt" role="status" data-testid="export-receipt">
          저장됨: {describeReceipt(receipt)}
        </p>
      ) : null}
      {notices.length > 0 ? (
        <div className="cl-export-notices" role="status">
          <ul aria-label="레시피 불러오기 안내">
            {notices.map((notice) => (
              <li key={notice} className="cl-export-notice">
                {notice}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {failure ? (
        <div className="cl-export-row">
          <p
            ref={failureAlertRef}
            className="cl-export-failure"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            data-testid="export-failure-alert"
          >
            실패({failure.code}): {failure.reasonKo}
          </p>
          {failedKind ? (
            <button
              type="button"
              className="cl-button cl-export-nav-btn"
              data-testid="export-retry-last-action"
              disabled={retryDisabled}
              onClick={onRetryLastFailed}
            >
              {BUSY_ACTION_LABELS_KO[failedKind]} 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
