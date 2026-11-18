import { CAMERA_FRAMING_MODES } from "../../../../contracts";
import {
  MAX_PNG_EXPORT_DIMENSION,
  MAX_PSD_EXPORT_DIMENSION,
  MAX_SETTLE_STEPS,
  MIN_EXPORT_DIMENSION,
} from "../../../../export/export-session";
import { RECIPE_FILE_SUFFIX } from "../../../../export/recipe-file";
import { FRAMING_LABELS_KO, clampExportInt } from "../export-panel-helpers";

import { ExportPresetRows } from "./ExportStatusSection";
import { ExportStripDirectorSection } from "./ExportStripDirectorSection";
import { ExportWebtoonReaderPreview } from "./ExportWebtoonReaderPreview";

import type { CameraFramingMode } from "../../../../contracts";
import type { StripDirectorSession, StripDirectorState } from "../viewport-scene-director";
import type { ExportBusyKind } from "./ExportStatusSection";

interface ExportOutputControlsProps {
  readonly ids: string;
  readonly engineReady: boolean;
  readonly busy: ExportBusyKind | null;
  readonly busyRef: { readonly current: ExportBusyKind | null };
  readonly width: number;
  readonly height: number;
  readonly framing: CameraFramingMode;
  readonly settleSteps: number;
  readonly setWidth: (value: number) => void;
  readonly setHeight: (value: number) => void;
  readonly setFraming: (value: CameraFramingMode) => void;
  readonly setSettleSteps: (value: number) => void;
  readonly directorState: StripDirectorState;
  readonly stripDirector: StripDirectorSession;
  readonly onPng: () => void;
  readonly onTurnaroundPng: () => void;
  readonly onQuadSheetPng: () => void;
  readonly onWebtoonStripPng: () => void;
  readonly onOpenWebtoonReaderPreview: () => void;
  readonly onWebtoonMotionWebm: (playbackSpeed?: number) => void;
  readonly onGlb: () => void;
  readonly onRecipeSave: () => void;
  readonly onShaperPresetSave: () => void;
  readonly onCopyRecipeClipboard: () => void;
  readonly onPasteRecipeClipboard: () => void;
  readonly onRecipeFile: (file: File | undefined) => void;
  readonly readerPreview: { readonly url: string; readonly width: number; readonly height: number } | null;
  readonly onCloseReaderPreview: () => void;
  readonly includeIdMasks: boolean;
  readonly includeReferencePasses: boolean;
  readonly splitHairLayers: boolean;
  readonly useLuminanceToAlpha: boolean;
  readonly setIncludeIdMasks: (value: boolean) => void;
  readonly setIncludeReferencePasses: (value: boolean) => void;
  readonly setSplitHairLayers: (value: boolean) => void;
  readonly setUseLuminanceToAlpha: (value: boolean) => void;
  readonly hairSplitReason: string | null;
  readonly onPsd: () => void;
}

/** 출력 설정과 실행 입구를 표시한다. 상태·캡처·저장·미리보기 URL 수명주기는 부모가 소유한다. */
export function ExportOutputControls({
  ids,
  engineReady,
  busy,
  busyRef,
  width,
  height,
  framing,
  settleSteps,
  setWidth,
  setHeight,
  setFraming,
  setSettleSteps,
  directorState,
  stripDirector,
  onPng,
  onTurnaroundPng,
  onQuadSheetPng,
  onWebtoonStripPng,
  onOpenWebtoonReaderPreview,
  onWebtoonMotionWebm,
  onGlb,
  onRecipeSave,
  onShaperPresetSave,
  onCopyRecipeClipboard,
  onPasteRecipeClipboard,
  onRecipeFile,
  readerPreview,
  onCloseReaderPreview,
  includeIdMasks,
  includeReferencePasses,
  splitHairLayers,
  useLuminanceToAlpha,
  setIncludeIdMasks,
  setIncludeReferencePasses,
  setSplitHairLayers,
  setUseLuminanceToAlpha,
  hairSplitReason,
  onPsd,
}: ExportOutputControlsProps) {
  const { manuscriptMood, gutterPaces, includePsdMangaFx } = directorState;

  return (
    <>
      <ExportPresetRows
        width={width}
        height={height}
        framing={framing}
        onSelectPreset={(w, h, mode) => {
          setWidth(w);
          setHeight(h);
          setFraming(mode);
        }}
      />
      <div className="cl-export-row">
        <label htmlFor={`${ids}-width`}>너비(px)</label>
        <input id={`${ids}-width`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={width} onChange={(event) => setWidth(clampExportInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, width))} />
        <label htmlFor={`${ids}-height`}>높이(px)</label>
        <input id={`${ids}-height`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={height} onChange={(event) => setHeight(clampExportInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, height))} />
      </div>
      <div className="cl-export-row">
        <label htmlFor={`${ids}-framing`}>프레이밍</label>
        <select id={`${ids}-framing`} value={framing} onChange={(event) => setFraming(event.target.value as CameraFramingMode)}>
          {CAMERA_FRAMING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {FRAMING_LABELS_KO[mode]}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-settle`}>물리 settle 스텝</label>
        <input id={`${ids}-settle`} type="number" min={0} max={MAX_SETTLE_STEPS} value={settleSteps} onChange={(event) => setSettleSteps(clampExportInt(event.target.value, 0, MAX_SETTLE_STEPS, 0))} />
      </div>
      <ExportStripDirectorSection idsPrefix={ids} state={directorState} session={stripDirector} />
      <div className="cl-export-actions">
        <button type="button" onClick={onPng} disabled={!engineReady || busy !== null}>
          투명 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-turnaround-sheet-png"
          title="0° 정면 · 35° 반측면 · 90° 측면 · 180° 후면을 가로 한 장으로 이어 붙인 투명 캐릭터 설정시트 PNG를 저장합니다"
          onClick={onTurnaroundPng}
          disabled={!engineReady || busy !== null}
        >
          4방향 설정시트 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-quad-sheet-png"
          aria-keyshortcuts="Control+Shift+Q Meta+Shift+Q"
          title="전신 정면 · 전신 35° 반측면 · 상반신 바스트컷 · 얼굴 클로즈업을 종횡비 유지·잘림 방지 마진이 적용된 2×2 투명 PNG로 저장합니다 (단축키 Ctrl/Cmd+Shift+Q)"
          onClick={onQuadSheetPng}
          disabled={!engineReady || busy !== null}
        >
          2×2 종합 설정시트 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-strip-png"
          title="1컷 등장 로우앵글 · 2컷 대화 반측면 · 3컷 감정 클로즈업 · 4컷 여운 하이앵글을 원고 먹선 프레임과 스크롤 호흡 간격·할프톤 스크린톤·말풍선 안전 여백으로 합성한 세로 웹툰 콘티 스트립 PNG를 저장합니다"
          onClick={onWebtoonStripPng}
          disabled={!engineReady || busy !== null}
        >
          세로 4컷 웹툰 스트립 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-reader-preview-btn"
          title="세로 4컷 스트립을 합성해 모바일 스마트폰 폭 리더에서 컷간 스크롤 호흡(빠른 템포·서스펜스·클리프행어)에 맞춘 자동 패닝(Auto-Pan)을 미리 확인합니다"
          onClick={onOpenWebtoonReaderPreview}
          disabled={!engineReady || busy !== null}
        >
          모바일 스크롤·오토패닝 미리보기
        </button>
        <button
          type="button"
          data-testid="export-webtoon-motion-webm"
          title="스크롤 여백 호흡(빠른 템포·서스펜스·클리프행어)과 할프톤 스크린톤·다국어 대사가 적용된 9:16 숏폼 홍보용 WebM 모션 코믹 비디오를 저장합니다"
          onClick={() => onWebtoonMotionWebm(1)}
          disabled={!engineReady || busy !== null}
        >
          9:16 숏폼 WebM 모션 티저 저장
        </button>
        <button type="button" onClick={onGlb} disabled={!engineReady || busy !== null}>
          GLB 저장
        </button>
        <button type="button" onClick={onRecipeSave} disabled={busy !== null}>
          레시피 저장
        </button>
        <button type="button" onClick={onShaperPresetSave} disabled={busy !== null}>
          SHAPER 프리셋 저장
        </button>
        <button
          type="button"
          data-testid="export-copy-recipe-clipboard"
          title="외부 서버 전송 없이 로컬 클립보드로 현재 캐릭터 레시피 JSON(다중 페인트 서브레이어 포함)을 즉시 복사합니다"
          onClick={onCopyRecipeClipboard}
          disabled={busy !== null}
        >
          레시피 클립보드 복사
        </button>
        <button
          type="button"
          data-testid="export-paste-recipe-clipboard"
          title="클립보드에 복사된 레시피(.character.json) 또는 SHAPER 프리셋(.preset) 텍스트를 즉시 불러옵니다"
          onClick={onPasteRecipeClipboard}
          disabled={busy !== null}
        >
          클립보드 레시피 붙여넣기
        </button>
        <label className="cl-export-file" htmlFor={`${ids}-file`}>
          레시피 불러오기
          <input
            id={`${ids}-file`}
            data-testid="export-recipe-file-input"
            type="file"
            accept={`${RECIPE_FILE_SUFFIX},.json,.preset,application/json,text/plain`}
            disabled={busy !== null}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && busyRef.current === null) {
                event.preventDefault();
                event.currentTarget.click();
              }
            }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              onRecipeFile(file);
            }}
          />
        </label>
      </div>
      {readerPreview ? (
        <ExportWebtoonReaderPreview
          stripImageUrl={readerPreview.url}
          stripWidth={readerPreview.width}
          stripHeight={readerPreview.height}
          manuscriptMood={manuscriptMood}
          gutterPaces={gutterPaces}
          exportBusy={busy !== null}
          onExportMotionWebm={(speed) => onWebtoonMotionWebm(speed)}
          onClose={onCloseReaderPreview}
        />
      ) : null}
      <fieldset className="cl-export-psd">
        <legend>레이어 PSD (최대 {MAX_PSD_EXPORT_DIMENSION}px)</legend>
        <label htmlFor={`${ids}-idmask`}>
          <input id={`${ids}-idmask`} type="checkbox" checked={includeIdMasks} onChange={(event) => setIncludeIdMasks(event.target.checked)} /> 부위 ID 마스크 포함
        </label>
        <label htmlFor={`${ids}-ref`}>
          <input id={`${ids}-ref`} type="checkbox" checked={includeReferencePasses} onChange={(event) => setIncludeReferencePasses(event.target.checked)} /> 참조 패스(깊이·법선) 포함
        </label>
        <label htmlFor={`${ids}-hairsplit`}>
          <input id={`${ids}-hairsplit`} type="checkbox" checked={splitHairLayers} onChange={(event) => setSplitHairLayers(event.target.checked)} /> 헤어 3-레이어 분리(Hair Base·Shadow·Line)
        </label>
        <label htmlFor={`${ids}-lumalpha`}>
          <input id={`${ids}-lumalpha`} type="checkbox" checked={useLuminanceToAlpha} onChange={(event) => setUseLuminanceToAlpha(event.target.checked)} /> SHAPER 휘도 반전 선화 추출(a = 1 - r)
        </label>
        <label htmlFor={`${ids}-psdmangafx`}>
          <input
            id={`${ids}-psdmangafx`}
            data-testid="export-psd-manga-fx"
            type="checkbox"
            checked={includePsdMangaFx}
            onChange={(event) => stripDirector.update({ includePsdMangaFx: event.target.checked })}
          />{" "}
          만화 연출 분리 레이어 포함(스크린톤·말풍선·대사·효과음·효과선)
        </label>
        {splitHairLayers && hairSplitReason ? <p role="status">{hairSplitReason}</p> : null}
        <p>기본 PBR·툰의 불투명·컷아웃 헤어를 분리하며, 만화 연출 포함 시 최상단 &quot;웹툰 만화 연출&quot; 그룹에 스크린톤 망점·효과선·말풍선 프레임·대사 식자·효과음 스탬프 5개 투명 레이어가 개별 저장됩니다.</p>
        <button type="button" onClick={onPsd} disabled={!engineReady || busy !== null || (splitHairLayers && hairSplitReason !== null)}>
          레이어 PSD 저장
        </button>
      </fieldset>
    </>
  );
}
