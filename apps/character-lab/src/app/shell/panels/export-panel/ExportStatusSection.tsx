/**
 * ExportPanel 하위 프리셋 칩 행 + 진행률·미저장 백업·영수증·안내·실패/재시도 피드백 섹션.
 */
import { useEffect, useRef } from "react";

import { WEBTOON_STRIP_ACTING_ARCS, WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO, WEBTOON_STRIP_FONT_SCALE_LABELS_KO } from "../../../../export/webtoon-strip-composer";
import { describeReceipt } from "../export-panel-helpers";
import { WEBTOON_SFX_STAMPS } from "../viewport-hand-prop-controls";

import type { CameraFramingMode, LabFailure } from "../../../../contracts";
import type { ExportKind, ExportReceipt } from "../../../../export/export-session";
import type { WebtoonSfxStampOption, WebtoonStripActingArcId, WebtoonStripBubbleFontScale, WebtoonStripBubbleShape, WebtoonStripFxLinesKind } from "../../../../export/webtoon-strip-composer";
import type { StripDirectorSession, StripDirectorState } from "../viewport-scene-director";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

export type ExportBusyKind =
  | ExportKind
  | "turnaround"
  | "quad-sheet"
  | "webtoon-strip"
  | "import"
  | "clipboard-copy"
  | "clipboard-paste";

export const BUSY_ACTION_LABELS_KO: Readonly<Record<ExportBusyKind, string>> = {
  png: "투명 PNG 저장",
  turnaround: "4방향 설정시트 PNG 저장",
  "quad-sheet": "2×2 종합 설정시트 PNG 저장",
  "webtoon-strip": "세로 4컷 웹툰 스트립 PNG 저장",
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
    case "webtoon-strip":
      return `세로 4컷 웹툰 콘티 스트립 내보내는 중…${suffix}`;
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
  useEffect(() => {
    if (failure) failureAlertRef.current?.focus();
  }, [failure, failureAlertRef]);

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


interface ExportStripDirectorControlsProps {
  readonly ids: string;
  readonly directorState: StripDirectorState;
  readonly stripDirector: Pick<StripDirectorSession, "update" | "setDialogueLine" | "setBubbleShape" | "setBubbleFontScale" | "setSfxStamp">;
}

/** 같은 디렉터 상태와 콜백으로 컷별 연기·말풍선·대사·효과음 설정을 표시한다. */
export function ExportStripDirectorControls({ ids, directorState, stripDirector }: ExportStripDirectorControlsProps) {
  const { actingArc: stripActingArc, bakeStripFx, stripFxLines, dialogueLines, bubbleShapes, bubbleFontScales, sfxStamps } = directorState;
  return (
    <div className="cl-export-strip-director" role="group" aria-label="세로 4컷 스트립 연기·연출 디렉터">
      <div className="cl-export-row">
        <label htmlFor={`${ids}-strip-acting-arc`}>4컷 연기 시퀀스</label>
        <select
          id={`${ids}-strip-acting-arc`}
          data-testid="export-strip-acting-arc"
          value={stripActingArc}
          onChange={(event) => stripDirector.update({ actingArc: event.target.value as WebtoonStripActingArcId })}
        >
          <option value="none">고정 표정·시선 (단일 포즈 유지)</option>
          {WEBTOON_STRIP_ACTING_ARCS.map((arc) => (
            <option key={arc.id} value={arc.id}>
              {arc.labelKo}
            </option>
          ))}
        </select>
      </div>
      <div className="cl-export-row">
        <label htmlFor={`${ids}-strip-bake-fx`}>
          <input
            id={`${ids}-strip-bake-fx`}
            data-testid="export-strip-bake-fx"
            type="checkbox"
            checked={bakeStripFx}
            onChange={(event) => stripDirector.update({ bakeStripFx: event.target.checked })}
          />{" "}
          4컷 말풍선·효과선 베이킹
        </label>
        <label htmlFor={`${ids}-strip-fx-lines`}>효과선</label>
        <select
          id={`${ids}-strip-fx-lines`}
          data-testid="export-strip-fx-lines"
          value={stripFxLines}
          disabled={!bakeStripFx}
          onChange={(event) => stripDirector.update({ stripFxLines: event.target.value as WebtoonStripFxLinesKind })}
        >
          <option value="focus-radial">집중선 (방사형)</option>
          <option value="speed-diagonal">속도선 (대각선)</option>
          <option value="romance-sparkle">로맨스 스파클</option>
          <option value="none">말풍선만 (효과선 없음)</option>
        </select>
      </div>
      <div className="cl-export-dialogue-grid" role="group" aria-label="1~4컷 말풍선 모양·강조·효과음·한국어 대사">
        {([0, 1, 2, 3] as const).map((cutIdx) => (
          <div key={cutIdx} className="cl-export-dialogue-item">
            <label htmlFor={`${ids}-strip-dialogue-${cutIdx}`}>{`${cutIdx + 1}컷 대사·연출`}</label>
            <div className="cl-export-cut-controls-row">
              <select
                aria-label={`${cutIdx + 1}컷 말풍선 모양`}
                data-testid={`export-strip-bubble-shape-${cutIdx}`}
                disabled={!bakeStripFx}
                value={bubbleShapes[cutIdx]}
                onChange={(event) => stripDirector.setBubbleShape(cutIdx, event.target.value as WebtoonStripBubbleShape)}
              >
                {(Object.keys(WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO) as WebtoonStripBubbleShape[]).map((shape) => (
                  <option key={shape} value={shape}>
                    {WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO[shape]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${cutIdx + 1}컷 대사 폰트 배율`}
                data-testid={`export-strip-font-scale-${cutIdx}`}
                disabled={!bakeStripFx || bubbleShapes[cutIdx] === "none"}
                value={bubbleFontScales[cutIdx]}
                onChange={(event) => stripDirector.setBubbleFontScale(cutIdx, event.target.value as WebtoonStripBubbleFontScale)}
              >
                {(Object.keys(WEBTOON_STRIP_FONT_SCALE_LABELS_KO) as WebtoonStripBubbleFontScale[]).map((scale) => (
                  <option key={scale} value={scale}>
                    {WEBTOON_STRIP_FONT_SCALE_LABELS_KO[scale]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${cutIdx + 1}컷 효과음 스탬프`}
                data-testid={`export-strip-sfx-stamp-${cutIdx}`}
                disabled={!bakeStripFx}
                value={sfxStamps[cutIdx]}
                onChange={(event) => stripDirector.setSfxStamp(cutIdx, event.target.value as WebtoonSfxStampOption)}
              >
                <option value="none">효과음 없음</option>
                {WEBTOON_SFX_STAMPS.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.glyphKo}
                  </option>
                ))}
              </select>
            </div>
            <input
              id={`${ids}-strip-dialogue-${cutIdx}`}
              data-testid={`export-strip-dialogue-${cutIdx}`}
              type="text"
              maxLength={42}
              disabled={!bakeStripFx || bubbleShapes[cutIdx] === "none"}
              value={dialogueLines[cutIdx]}
              onChange={(event) => stripDirector.setDialogueLine(cutIdx, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
