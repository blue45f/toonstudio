/**
 * ExportPanel 액션 버튼 클러스터 · 단행본 출판 세트(4컷 내지 · 표지 · 목차 · 양면 펼침면) · 모바일 리더 · WebM / WAV / WebVTT · 레이어 PSD 옵션 섹션.
 */
import { MAX_PSD_EXPORT_DIMENSION } from "../../../../export/export-session";
import { RECIPE_FILE_SUFFIX } from "../../../../export/recipe-file";

import { DeviceDraftSection } from "./DeviceDraftSection";
import { ExportWebtoonReaderPreview } from "./ExportWebtoonReaderPreview";

import type { WebtoonManuscriptMoodId, WebtoonStripGutterPaces } from "../../../../export/webtoon-strip-composer";
import type { useRecipeStorage } from "./DeviceDraftSection";

export interface ExportReaderPreviewSnapshot {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface ExportActionsAndPsdSectionProps {
  readonly ids: string;
  readonly engineReady: boolean;
  readonly busy: boolean;
  readonly storage: ReturnType<typeof useRecipeStorage>;
  readonly canTriggerFileKeyDown: () => boolean;
  readonly onPng: () => void;
  readonly onTurnaroundPng: () => void;
  readonly onQuadSheetPng: () => void;
  readonly onWebtoonStripPng: () => void;
  readonly onWebtoonTankobonPng: () => void;
  readonly onWebtoonTankobonCoverPng: () => void;
  readonly onWebtoonTankobonTocPng: () => void;
  readonly onWebtoonTankobonSpreadPng: () => void;
  readonly onOpenWebtoonReaderPreview: () => void;
  readonly onWebtoonMotionWebm: (playbackSpeed?: number) => void;
  readonly onWebtoonMotionWav: () => void;
  readonly onWebtoonMotionVtt: () => void;
  readonly onGlb: () => void;
  readonly onShaperPresetSave: () => void;
  readonly onCopyRecipeClipboard: () => void;
  readonly onPasteRecipeClipboard: () => void;
  readonly onRecipeFile: (file: File | undefined) => void;
  readonly readerPreview: ExportReaderPreviewSnapshot | null;
  readonly manuscriptMood: WebtoonManuscriptMoodId;
  readonly gutterPaces: WebtoonStripGutterPaces;
  readonly onCloseReaderPreview: () => void;
  readonly includeIdMasks: boolean;
  readonly onChangeIncludeIdMasks: (checked: boolean) => void;
  readonly includeReferencePasses: boolean;
  readonly onChangeIncludeReferencePasses: (checked: boolean) => void;
  readonly splitHairLayers: boolean;
  readonly onChangeSplitHairLayers: (checked: boolean) => void;
  readonly useLuminanceToAlpha: boolean;
  readonly onChangeUseLuminanceToAlpha: (checked: boolean) => void;
  readonly includePsdMangaFx: boolean;
  readonly onChangeIncludePsdMangaFx: (checked: boolean) => void;
  readonly hairSplitReason: string | null;
  readonly onPsd: () => void;
}

export function ExportActionsAndPsdSection({
  ids,
  engineReady,
  busy,
  storage,
  canTriggerFileKeyDown,
  onPng,
  onTurnaroundPng,
  onQuadSheetPng,
  onWebtoonStripPng,
  onWebtoonTankobonPng,
  onWebtoonTankobonCoverPng,
  onWebtoonTankobonTocPng,
  onWebtoonTankobonSpreadPng,
  onOpenWebtoonReaderPreview,
  onWebtoonMotionWebm,
  onWebtoonMotionWav,
  onWebtoonMotionVtt,
  onGlb,
  onShaperPresetSave,
  onCopyRecipeClipboard,
  onPasteRecipeClipboard,
  onRecipeFile,
  readerPreview,
  manuscriptMood,
  gutterPaces,
  onCloseReaderPreview,
  includeIdMasks,
  onChangeIncludeIdMasks,
  includeReferencePasses,
  onChangeIncludeReferencePasses,
  splitHairLayers,
  onChangeSplitHairLayers,
  useLuminanceToAlpha,
  onChangeUseLuminanceToAlpha,
  includePsdMangaFx,
  onChangeIncludePsdMangaFx,
  hairSplitReason,
  onPsd,
}: ExportActionsAndPsdSectionProps) {
  return (
    <>
      <div className="cl-export-actions">
        <button type="button" onClick={onPng} disabled={!engineReady || busy}>
          투명 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-turnaround-sheet-png"
          title="0° 정면 · 35° 반측면 · 90° 측면 · 180° 후면을 가로 한 장으로 이어 붙인 투명 캐릭터 설정시트 PNG를 저장합니다"
          onClick={onTurnaroundPng}
          disabled={!engineReady || busy}
        >
          4방향 설정시트 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-quad-sheet-png"
          aria-keyshortcuts="Control+Shift+Q Meta+Shift+Q"
          title="전신 정면 · 전신 35° 반측면 · 상반신 바스트컷 · 얼굴 클로즈업을 종횡비 유지·잘림 방지 마진이 적용된 2×2 투명 PNG로 저장합니다 (단축키 Ctrl/Cmd+Shift+Q)"
          onClick={onQuadSheetPng}
          disabled={!engineReady || busy}
        >
          2×2 종합 설정시트 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-strip-png"
          title="1컷 등장 로우앵글 · 2컷 대화 반측면 · 3컷 감정 클로즈업 · 4컷 여운 하이앵글을 원고 먹선 프레임과 스크롤 호흡 간격·할프톤 스크린톤·말풍선 안전 여백으로 합성한 세로 웹툰 콘티 스트립 PNG를 저장합니다"
          onClick={onWebtoonStripPng}
          disabled={!engineReady || busy}
        >
          세로 4컷 웹툰 스트립 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-tankobon-png"
          aria-keyshortcuts="Control+Shift+B Meta+Shift+B"
          title="선택한 단행본 읽기 순서(우→좌 일본 단행본 표준 또는 좌→우 한국 단행본)·재단선·쪽번호(Folio)·제본 책등 여백이 반영된 B5 비율 2×2 출판 페이지 PNG를 저장합니다 (단축키 Ctrl/Cmd+Shift+B)"
          onClick={onWebtoonTankobonPng}
          disabled={!engineReady || busy}
        >
          단행본 4컷 출판 페이지 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-tankobon-cover-png"
          title="단행본 권수(VOL.XX)·에피소드 제목·작가 크레딧·할프톤 망점·인쇄 재단선·ISBN 박스가 조판된 B5 단행본 표지 PNG를 저장합니다"
          onClick={onWebtoonTankobonCoverPng}
          disabled={!engineReady || busy}
        >
          단행본 표지 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-tankobon-toc-png"
          title="에피소드 큐시트 비트 목록과 연동된 챕터 번호·점선 리더·쪽번호(P.03..)가 조판된 B5 단행본 목차 내지 PNG를 저장합니다"
          onClick={onWebtoonTankobonTocPng}
          disabled={!engineReady || busy}
        >
          단행본 목차 내지 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-tankobon-spread-png"
          aria-keyshortcuts="Control+Shift+K Meta+Shift+K"
          title="단행본 표지와 목차 내지를 중앙 책등 접지선(Spine Fold Marks)이 포함된 양면 펼침면 인쇄 교정 대지 PNG로 저장합니다 (단축키 Ctrl/Cmd+Shift+K)"
          onClick={onWebtoonTankobonSpreadPng}
          disabled={!engineReady || busy}
        >
          단행본 표지·목차 펼침면 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-reader-preview-btn"
          title="세로 4컷 스트립을 합성해 모바일 스마트폰 폭 리더에서 컷간 스크롤 호흡(빠른 템포·서스펜스·클리프행어)에 맞춘 자동 패닝(Auto-Pan)을 미리 확인합니다"
          onClick={onOpenWebtoonReaderPreview}
          disabled={!engineReady || busy}
        >
          모바일 스크롤·오토패닝 미리보기
        </button>
        <button
          type="button"
          data-testid="export-webtoon-motion-webm"
          aria-keyshortcuts="Control+Shift+M Meta+Shift+M"
          title="컷 진입 말풍선 팝인·효과음 미세 진동·절차적 효과음 및 무드 앰비언트 BGM 패드가 동기화된 9:16 숏폼 홍보용 WebM 모션 코믹 비디오를 저장합니다 (단축키 Ctrl/Cmd+Shift+M)"
          onClick={() => onWebtoonMotionWebm(1)}
          disabled={!engineReady || busy}
        >
          9:16 숏폼 WebM 모션 티저 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-motion-wav"
          title="영상 편집기(Premiere·CapCut·DaVinci) 믹싱용 무손실 16-bit RIFF WAV 효과음·무드 BGM 마스터 트랙을 단독 저장합니다"
          onClick={onWebtoonMotionWav}
          disabled={busy}
        >
          9:16 무손실 음원(.wav) 저장
        </button>
        <button
          type="button"
          data-testid="export-webtoon-motion-vtt"
          title="9:16 숏폼 모션 티저의 컷 체류 타임코드와 다국어 발화자·효과음이 동기화된 WebVTT(.vtt) 자막 파일을 저장합니다"
          onClick={onWebtoonMotionVtt}
          disabled={busy}
        >
          9:16 모션 자막(.vtt) 저장
        </button>
        <button type="button" onClick={onGlb} disabled={!engineReady || busy}>
          GLB 저장
        </button>
        <button type="button" onClick={storage.saveRecipe} disabled={busy}>
          레시피 저장
        </button>
        <button type="button" onClick={onShaperPresetSave} disabled={busy}>
          SHAPER 프리셋 저장
        </button>
        <button
          type="button"
          data-testid="export-copy-recipe-clipboard"
          title="외부 서버 전송 없이 로컬 클립보드로 현재 캐릭터 레시피 JSON(다중 페인트 서브레이어 포함)을 즉시 복사합니다"
          onClick={onCopyRecipeClipboard}
          disabled={busy}
        >
          레시피 클립보드 복사
        </button>
        <button
          type="button"
          data-testid="export-paste-recipe-clipboard"
          title="클립보드에 복사된 레시피(.character.json) 또는 SHAPER 프리셋(.preset) 텍스트를 즉시 불러옵니다"
          onClick={onPasteRecipeClipboard}
          disabled={busy}
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
            disabled={busy}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && canTriggerFileKeyDown()) {
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
      <DeviceDraftSection storage={storage} busy={busy} />
      {readerPreview ? (
        <ExportWebtoonReaderPreview
          stripImageUrl={readerPreview.url}
          stripWidth={readerPreview.width}
          stripHeight={readerPreview.height}
          manuscriptMood={manuscriptMood}
          gutterPaces={gutterPaces}
          exportBusy={busy}
          onExportMotionWebm={(speed) => onWebtoonMotionWebm(speed)}
          onClose={onCloseReaderPreview}
        />
      ) : null}
      <fieldset className="cl-export-psd">
        <legend>레이어 PSD (최대 {MAX_PSD_EXPORT_DIMENSION}px)</legend>
        <label htmlFor={`${ids}-idmask`}>
          <input id={`${ids}-idmask`} type="checkbox" checked={includeIdMasks} onChange={(event) => onChangeIncludeIdMasks(event.target.checked)} /> 부위 ID 마스크 포함
        </label>
        <label htmlFor={`${ids}-ref`}>
          <input id={`${ids}-ref`} type="checkbox" checked={includeReferencePasses} onChange={(event) => onChangeIncludeReferencePasses(event.target.checked)} /> 참조 패스(깊이·법선) 포함
        </label>
        <label htmlFor={`${ids}-hairsplit`}>
          <input id={`${ids}-hairsplit`} type="checkbox" checked={splitHairLayers} onChange={(event) => onChangeSplitHairLayers(event.target.checked)} /> 헤어 3-레이어 분리(Hair Base·Shadow·Line)
        </label>
        <label htmlFor={`${ids}-lumalpha`}>
          <input id={`${ids}-lumalpha`} type="checkbox" checked={useLuminanceToAlpha} onChange={(event) => onChangeUseLuminanceToAlpha(event.target.checked)} /> SHAPER 휘도 반전 선화 추출(a = 1 - r)
        </label>
        <label htmlFor={`${ids}-psdmangafx`}>
          <input
            id={`${ids}-psdmangafx`}
            data-testid="export-psd-manga-fx"
            type="checkbox"
            checked={includePsdMangaFx}
            onChange={(event) => onChangeIncludePsdMangaFx(event.target.checked)}
          />{" "}
          만화 연출 분리 레이어 포함(스크린톤·말풍선·대사·효과음·효과선)
        </label>
        {splitHairLayers && hairSplitReason ? <p role="status">{hairSplitReason}</p> : null}
        <p>기본 PBR·툰의 불투명·컷아웃 헤어를 분리하며, 만화 연출 포함 시 최상단 &quot;웹툰 만화 연출&quot; 그룹에 스크린톤 망점·효과선·말풍선 프레임·대사 식자·효과음 스탬프 5개 투명 레이어가 개별 저장됩니다.</p>
        <button type="button" onClick={onPsd} disabled={!engineReady || busy || (splitHairLayers && hairSplitReason !== null)}>
          레이어 PSD 저장
        </button>
      </fieldset>
    </>
  );
}
