/**
 * 주간 연재 에피소드 다중 4컷 콘티 큐시트(`.cutsheet.json`) 매니저 · 12대 장르 샘플 템플릿 로더 · 일괄 배치 내보내기 서브컴포넌트.
 *
 * Unslop · Editor Chrome · Korean Typography(IME 가드) · 5-State UI 규약 준수:
 * - 중첩 카드 테두리 대신 1px 헤어라인 구분선과 고정폭 숫자(`tabular-nums`)를 사용한다.
 * - 한국어 한글 조합 중 엔터(`event.nativeEvent.isComposing`) 중복 등록을 원천 차단한다.
 * - 내장 샘플 템플릿(12대 장르 옴니버스 48컷 · 3막 12컷 · 일본어 세로쓰기 8컷) 원클릭 적재 및 활성 비트 제자리 덮어쓰기(`updateBeat`)를 지원한다.
 */
import { useState, useSyncExternalStore } from "react";

import { CUTSHEET_FILE_SUFFIX, MAX_CUTSHEET_BEATS } from "../../../../export/webtoon-episode-cutsheet";
import {
  EPISODE_CUTSHEET_TEMPLATES,
  buildEpisodeCutsheetDocumentFromTemplate,
} from "../../../../export/webtoon-episode-templates";
import { findWebtoonSceneDirectorPreset } from "../viewport-scene-director";

import type {
  EpisodeCutsheetBeat,
  EpisodeCutsheetDirectorSnapshot,
  EpisodeCutsheetStore,
} from "../../../../export/webtoon-episode-cutsheet";
import type { EpisodeCutsheetTemplateId } from "../../../../export/webtoon-episode-templates";
import type { StripDirectorSession, WebtoonSceneDirectorPresetId } from "../viewport-scene-director";

export interface ExportEpisodeCutsheetSectionProps {
  readonly idsPrefix: string;
  readonly engineReady: boolean;
  readonly busy: boolean;
  readonly directorSession: StripDirectorSession;
  readonly cutsheetStore: EpisodeCutsheetStore;
  readonly onSaveCutsheetJson: () => void;
  readonly onLoadCutsheetFile: (file: File | undefined) => void;
  readonly onExportBatchLongStripPng?: () => void;
  readonly onExportBatchMotionWebm?: () => void;
  readonly onExportBatchAudioWav?: () => void;
  readonly onExportBatchWebVtt?: () => void;
  readonly onExportStoryboardMd?: () => void;
  readonly onBeatAppliedNotice?: (messageKo: string) => void;
}

function captureSnapshotFromSession(session: StripDirectorSession): EpisodeCutsheetDirectorSnapshot {
  const s = session.getState();
  return {
    activeDirectorId: s.activeDirectorId,
    locale: s.locale,
    jaWritingMode: s.jaWritingMode,
    tankobonOrder: s.tankobonOrder,
    manuscriptMood: s.manuscriptMood,
    gutterPaces: [s.gutterPaces[0], s.gutterPaces[1], s.gutterPaces[2]],
    screentones: [s.screentones[0], s.screentones[1], s.screentones[2], s.screentones[3]],
    actingArc: s.actingArc,
    bakeStripFx: s.bakeStripFx,
    stripFxLines: s.stripFxLines,
    dialogueLines: [s.dialogueLines[0], s.dialogueLines[1], s.dialogueLines[2], s.dialogueLines[3]],
    bubbleShapes: [s.bubbleShapes[0], s.bubbleShapes[1], s.bubbleShapes[2], s.bubbleShapes[3]],
    bubbleFontScales: [s.bubbleFontScales[0], s.bubbleFontScales[1], s.bubbleFontScales[2], s.bubbleFontScales[3]],
    sfxStamps: [s.sfxStamps[0], s.sfxStamps[1], s.sfxStamps[2], s.sfxStamps[3]],
    speakerTargets: [s.speakerTargets[0], s.speakerTargets[1], s.speakerTargets[2], s.speakerTargets[3]],
    cutCameraPresets: [s.cutCameraPresets[0], s.cutCameraPresets[1], s.cutCameraPresets[2], s.cutCameraPresets[3]],
    partnerSide: s.partnerSide,
    includePsdMangaFx: s.includePsdMangaFx,
  };
}

function applySnapshotToSession(session: StripDirectorSession, snap: EpisodeCutsheetDirectorSnapshot): void {
  const validPreset = snap.activeDirectorId ? findWebtoonSceneDirectorPreset(snap.activeDirectorId) : null;
  session.update({
    activeDirectorId: (validPreset ? validPreset.id : "") as WebtoonSceneDirectorPresetId | "",
    locale: snap.locale,
    jaWritingMode: snap.jaWritingMode,
    tankobonOrder: snap.tankobonOrder,
    manuscriptMood: snap.manuscriptMood,
    gutterPaces: snap.gutterPaces,
    screentones: snap.screentones,
    actingArc: snap.actingArc,
    bakeStripFx: snap.bakeStripFx,
    stripFxLines: snap.stripFxLines,
    dialogueLines: snap.dialogueLines,
    bubbleShapes: snap.bubbleShapes,
    bubbleFontScales: snap.bubbleFontScales,
    sfxStamps: snap.sfxStamps,
    speakerTargets: snap.speakerTargets,
    cutCameraPresets: snap.cutCameraPresets,
    partnerSide: snap.partnerSide,
    includePsdMangaFx: snap.includePsdMangaFx,
  });
}

export function ExportEpisodeCutsheetSection({
  idsPrefix,
  engineReady,
  busy,
  directorSession,
  cutsheetStore,
  onSaveCutsheetJson,
  onLoadCutsheetFile,
  onExportBatchLongStripPng,
  onExportBatchMotionWebm,
  onExportBatchAudioWav,
  onExportBatchWebVtt,
  onExportStoryboardMd,
  onBeatAppliedNotice,
}: ExportEpisodeCutsheetSectionProps) {
  const cutsheetState = useSyncExternalStore(
    cutsheetStore.subscribe,
    cutsheetStore.getState,
    cutsheetStore.getState,
  );
  const [draftBeatTitle, setDraftBeatTitle] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<EpisodeCutsheetTemplateId>(
    "template-12genre-omnibus-48cuts",
  );

  const beatCount = cutsheetState.beats.length;
  const totalCuts = beatCount * 4;
  const isAtCapacity = beatCount >= MAX_CUTSHEET_BEATS;

  const onAddCurrentBeat = (): void => {
    if (busy || isAtCapacity) return;
    const current = directorSession.getState();
    const presetLabel = current.activeDirectorId
      ? (findWebtoonSceneDirectorPreset(current.activeDirectorId)?.labelKo.split("(")[0]?.trim() ?? "")
      : "";
    const autoTitle = draftBeatTitle.trim() || presetLabel || `씬 비트 ${beatCount + 1}`;
    const added = cutsheetStore.addBeat(autoTitle, captureSnapshotFromSession(directorSession));
    if (added) {
      setDraftBeatTitle("");
      onBeatAppliedNotice?.(`에피소드 큐시트에 '${added.titleKo}' (${added.cutRangeLabel}) 스냅샷을 추가했습니다.`);
    }
  };

  const onSelectBeat = (beat: EpisodeCutsheetBeat): void => {
    applySnapshotToSession(directorSession, beat.snapshot);
    cutsheetStore.markActiveBeat(beat.beatId);
    onBeatAppliedNotice?.(`큐시트 '${beat.titleKo}' (${beat.cutRangeLabel}) 설정을 4컷 디렉터에 복원했습니다.`);
  };

  const onOverwriteBeat = (beat: EpisodeCutsheetBeat): void => {
    const nextTitle = draftBeatTitle.trim() || undefined;
    const ok = cutsheetStore.updateBeat(beat.beatId, captureSnapshotFromSession(directorSession), nextTitle);
    if (ok) {
      if (nextTitle) setDraftBeatTitle("");
      onBeatAppliedNotice?.(`큐시트 '${nextTitle ?? beat.titleKo}' (${beat.cutRangeLabel}) 설정을 현재 연출로 덮어썼습니다.`);
    }
  };

  const onLoadBuiltinTemplate = (): void => {
    if (busy) return;
    const doc = buildEpisodeCutsheetDocumentFromTemplate(selectedTemplateId);
    cutsheetStore.replaceDocument(doc);
    const first = doc.beats[0];
    if (first) {
      applySnapshotToSession(directorSession, first.snapshot);
    }
    onBeatAppliedNotice?.(
      `'${doc.episodeTitleKo}' 내장 샘플 템플릿(${doc.beats.length}비트 · ${doc.beats.length * 4}컷)을 적재했습니다.`,
    );
  };

  const emptyReason = "먼저 '현재 4컷 씬 추가' 또는 '샘플 템플릿 적재'로 최소 1개 이상의 씬 비트를 등록하세요";
  const engineReason = !engineReady
    ? "렌더 엔진이 준비된 뒤 일괄 원고·비디오 렌더링을 사용할 수 있습니다"
    : beatCount === 0
      ? emptyReason
      : undefined;

  return (
    <section
      className="cl-export-cutsheet"
      aria-label="에피소드 다중 4컷 씬 큐시트 매니저"
      data-testid="export-episode-cutsheet"
    >
      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-cutsheet-ep-title`}>에피소드 큐시트</label>
        <input
          id={`${idsPrefix}-cutsheet-ep-title`}
          data-testid="cutsheet-episode-title"
          type="text"
          maxLength={48}
          value={cutsheetState.episodeTitleKo}
          onChange={(event) => cutsheetStore.setEpisodeTitle(event.target.value)}
        />
        <span className="cl-cutsheet-summary" data-testid="cutsheet-summary-count">
          {`총 ${beatCount}비트 · ${totalCuts}컷`}
        </span>
      </div>

      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-cutsheet-template`}>내장 샘플 콘티</label>
        <select
          id={`${idsPrefix}-cutsheet-template`}
          data-testid="cutsheet-template-select"
          value={selectedTemplateId}
          disabled={busy}
          onChange={(event) => setSelectedTemplateId(event.target.value as EpisodeCutsheetTemplateId)}
        >
          {EPISODE_CUTSHEET_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.labelKo}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="cl-button cl-export-nav-btn"
          data-testid="cutsheet-load-template-btn"
          disabled={busy}
          title="외부 파일 업로드 없이 선택된 대표 장르 큐시트 템플릿을 즉시 불러와 첫 번째 비트를 적용합니다"
          onClick={onLoadBuiltinTemplate}
        >
          샘플 템플릿 적재
        </button>
      </div>

      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-cutsheet-beat-title`}>씬 비트 제목</label>
        <input
          id={`${idsPrefix}-cutsheet-beat-title`}
          data-testid="cutsheet-beat-title"
          type="text"
          maxLength={36}
          placeholder="예: 법정 반대신문 클라이맥스"
          value={draftBeatTitle}
          onChange={(event) => setDraftBeatTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onAddCurrentBeat();
            }
          }}
        />
        <button
          type="button"
          className="cl-button cl-export-nav-btn"
          data-testid="cutsheet-add-beat"
          disabled={busy || isAtCapacity}
          title={
            isAtCapacity
              ? `큐시트 최대 비트 수(${MAX_CUTSHEET_BEATS}개)에 도달했습니다`
              : "현재 4컷 디렉터(구도·호흡·스크린톤·다국어 대사) 상태를 에피소드 큐시트에 추가합니다"
          }
          onClick={onAddCurrentBeat}
        >
          현재 4컷 씬 추가
        </button>
        <button
          type="button"
          className="cl-button cl-export-nav-btn"
          data-testid="cutsheet-save-json"
          disabled={busy || beatCount === 0}
          title={beatCount === 0 ? emptyReason : "등록된 다중 4컷 에피소드 콘티 큐시트를 .cutsheet.json 파일로 저장합니다"}
          onClick={onSaveCutsheetJson}
        >
          큐시트 JSON 저장
        </button>
        <label className="cl-export-file" htmlFor={`${idsPrefix}-cutsheet-file`}>
          큐시트 불러오기
          <input
            id={`${idsPrefix}-cutsheet-file`}
            data-testid="cutsheet-load-input"
            type="file"
            accept={`${CUTSHEET_FILE_SUFFIX},.json,application/json`}
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              onLoadCutsheetFile(file);
            }}
          />
        </label>
      </div>

      <div className="cl-export-row" role="group" aria-label="에피소드 큐시트 일괄 출고 도구">
        {onExportBatchLongStripPng ? (
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="cutsheet-export-batch-strip"
            disabled={!engineReady || busy || beatCount === 0}
            title={engineReason ?? `등록된 ${beatCount}비트(${totalCuts}컷)를 장편 세로 스크롤 웹툰 원고 PNG 한 장으로 이어 붙여 저장합니다`}
            onClick={onExportBatchLongStripPng}
          >
            장편 스트립 PNG 일괄 저장
          </button>
        ) : null}
        {onExportBatchMotionWebm ? (
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="cutsheet-export-batch-webm"
            disabled={!engineReady || busy || beatCount === 0}
            title={engineReason ?? `등록된 ${beatCount}비트(${totalCuts}컷)를 연속 9:16 숏폼 WebM 비디오 하나로 일괄 인코딩합니다`}
            onClick={onExportBatchMotionWebm}
          >
            연속 9:16 WebM 일괄 저장
          </button>
        ) : null}
        {onExportBatchAudioWav ? (
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="cutsheet-export-wav"
            disabled={busy || beatCount === 0}
            title={beatCount === 0 ? emptyReason : `등록된 ${beatCount}비트(${totalCuts}컷)의 효과음과 무드 BGM을 무손실 16-bit WAV 마스터 트랙으로 저장합니다`}
            onClick={onExportBatchAudioWav}
          >
            통합 음원(.wav) 저장
          </button>
        ) : null}
        {onExportBatchWebVtt ? (
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="cutsheet-export-vtt"
            disabled={busy || beatCount === 0}
            title={beatCount === 0 ? emptyReason : `등록된 ${beatCount}비트(${totalCuts}컷)의 누적 타임코드가 동기화된 다국어 WebVTT(.vtt) 자막을 저장합니다`}
            onClick={onExportBatchWebVtt}
          >
            통합 WebVTT 자막 저장
          </button>
        ) : null}
        {onExportStoryboardMd ? (
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="cutsheet-export-storyboard-md"
            disabled={busy || beatCount === 0}
            title={beatCount === 0 ? emptyReason : "PD·배경·식자 파트 공유용 한국어 스토리보드 연출 큐시트(.storyboard.md)를 저장합니다"}
            onClick={onExportStoryboardMd}
          >
            스토리보드 .md 저장
          </button>
        ) : null}
      </div>

      {beatCount > 0 ? (
        <ul className="cl-cutsheet-beat-list" aria-label="등록된 4컷 씬 비트 목록" data-testid="cutsheet-beat-list">
          {cutsheetState.beats.map((beat, idx) => {
            const isActive = cutsheetState.activeBeatId === beat.beatId;
            return (
              <li
                key={beat.beatId}
                className="cl-cutsheet-beat-item"
                data-active={isActive ? "true" : undefined}
                data-testid={`cutsheet-beat-item-${idx}`}
              >
                <span className="cl-cutsheet-beat-range">{beat.cutRangeLabel}</span>
                <strong className="cl-cutsheet-beat-name">{beat.titleKo}</strong>
                <span className="cl-cutsheet-beat-meta">
                  {`${beat.snapshot.locale.toUpperCase()} · ${beat.snapshot.dialogueLines[0].slice(0, 18)}`}
                </span>
                <div className="cl-cutsheet-beat-actions" role="group" aria-label={`${beat.titleKo} 조작`}>
                  <button
                    type="button"
                    className="cl-preset-chip"
                    data-testid={`cutsheet-beat-apply-${idx}`}
                    aria-pressed={isActive}
                    disabled={busy}
                    onClick={() => onSelectBeat(beat)}
                  >
                    적용
                  </button>
                  <button
                    type="button"
                    className="cl-preset-chip"
                    data-testid={`cutsheet-beat-update-${idx}`}
                    disabled={busy}
                    title="현재 4컷 디렉터 설정으로 이 비트를 순서를 유지한 채 덮어씁니다"
                    onClick={() => onOverwriteBeat(beat)}
                  >
                    덮어쓰기
                  </button>
                  <button
                    type="button"
                    className="cl-preset-chip"
                    data-testid={`cutsheet-beat-up-${idx}`}
                    disabled={busy || idx === 0}
                    title={idx === 0 ? "첫 번째 씬 비트입니다" : "순서를 위로 올립니다"}
                    onClick={() => cutsheetStore.moveBeat(beat.beatId, "up")}
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    className="cl-preset-chip"
                    data-testid={`cutsheet-beat-down-${idx}`}
                    disabled={busy || idx === beatCount - 1}
                    title={idx === beatCount - 1 ? "마지막 씬 비트입니다" : "순서를 아래로 내립니다"}
                    onClick={() => cutsheetStore.moveBeat(beat.beatId, "down")}
                  >
                    아래로
                  </button>
                  <button
                    type="button"
                    className="cl-preset-chip"
                    data-testid={`cutsheet-beat-remove-${idx}`}
                    disabled={busy}
                    onClick={() => cutsheetStore.removeBeat(beat.beatId)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="cl-export-row" data-testid="cutsheet-empty-state">
          <span>등록된 4컷 비트가 없습니다. 현재 연출 세션을 첫 비트로 담거나 내장 12대 장르 샘플을 적재해 보세요.</span>
          <button
            type="button"
            className="cl-preset-chip"
            data-testid="cutsheet-empty-starter-cta"
            disabled={busy}
            onClick={onAddCurrentBeat}
          >
            현재 4컷 첫 비트로 바로 시작
          </button>
        </div>
      )}
    </section>
  );
}
