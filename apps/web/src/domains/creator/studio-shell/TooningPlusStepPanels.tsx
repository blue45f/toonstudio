import type { CSSProperties } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardCopy,
  FileJson,
  FileText,
  Layers,
  MessageSquareText,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

import {
  getTooningBackground,
  getTooningCamera,
  getTooningCharacter,
  getTooningPose,
  getTooningSfx,
  TOONING_BACKGROUNDS,
  TOONING_BUBBLE_STYLES,
  TOONING_CAMERAS,
  TOONING_CHARACTERS,
  TOONING_EXPRESSIONS,
  TOONING_GENRES,
  TOONING_POSES,
  TOONING_SFX_PRESETS,
  TOONING_TONES,
  type Tooning3dStageHandoff,
  type TooningBubbleStyleId,
  type TooningCharacterId,
  type TooningCutDirectionPatch,
  type TooningEpisodePlan,
  type TooningGenreId,
  type TooningLocale,
  type TooningProductionMode,
  type TooningSfxId,
  type TooningSpeakerPosition,
  type TooningTeamDivisionPacket,
  type TooningToneId,
} from "./tooning-plus-allinone-engine";
import { TooningPlusCutStagePreview } from "./TooningPlusCutStagePreview";

interface Step1StoryProps {
  readonly locale: TooningLocale;
  readonly plan: TooningEpisodePlan;
  readonly onChangeGenre: (genreId: TooningGenreId) => void;
  readonly onChangeTone: (toneId: TooningToneId) => void;
  readonly onChangeKeyword: (keyword: string) => void;
  readonly onChangeCutCount: (cutCount: 4 | 6 | 8) => void;
  readonly onChangeSpeaker: (slotIndex: number, characterId: TooningCharacterId) => void;
  readonly onToggleThirdSpeaker: () => void;
  readonly onEditCutDialogue: (cutNumber: number, value: string) => void;
}

export function TooningStep1StoryPanel({
  locale,
  plan,
  onChangeGenre,
  onChangeTone,
  onChangeKeyword,
  onChangeCutCount,
  onChangeSpeaker,
  onToggleThirdSpeaker,
  onEditCutDialogue,
}: Step1StoryProps) {
  const ko = locale === "ko";
  const keywordValue = ko ? plan.keywordKo : plan.keywordEn;

  return (
    <div data-testid="tooning-step1-panel" className="tp-step-body">
      <div className="tp-card-grid-2">
        <div className="tp-surface-card">
          <h4 className="tp-card-title [word-break:keep-all]">
            {ko ? "장르와 핵심 키워드 정하기" : "Pick Genre & Core Keyword"}
          </h4>

          <div
            role="group"
            aria-label={ko ? "웹툰 장르 선택" : "Select webtoon genre"}
            className="tp-chip-wrap"
          >
            {TOONING_GENRES.map((genre) => {
              const active = plan.genreId === genre.id;
              return (
                <button
                  key={genre.id}
                  type="button"
                  data-testid={`tooning-genre-${genre.id}`}
                  aria-pressed={active}
                  onClick={() => onChangeGenre(genre.id)}
                  className={active ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
                  style={{ "--tp-chip-accent": genre.accentOklch } as CSSProperties}
                >
                  <span className="tp-dot" aria-hidden="true" />
                  <span>{ko ? genre.labelKo : genre.labelEn}</span>
                </button>
              );
            })}
          </div>

          <div className="tp-field-row">
            <label htmlFor="tooning-episode-keyword" className="tp-field-label">
              {ko ? "에피소드 키워드" : "Episode Keyword"}
            </label>
            <input
              id="tooning-episode-keyword"
              data-testid="tooning-keyword-input"
              type="text"
              value={keywordValue}
              onChange={(event) => onChangeKeyword(event.target.value)}
              placeholder={ko ? "예: 황실 비밀 계약서, 옥상 타임캡슐" : "e.g. Imperial Secret Pact, Rooftop Note"}
              className="tp-input min-h-11"
            />
          </div>

          <div className="tp-split-controls">
            <div>
              <span className="tp-field-label">{ko ? "컷 수 구성" : "Panel Count"}</span>
              <div role="group" aria-label={ko ? "컷 수 선택" : "Choose panel count"} className="tp-chip-wrap">
                {([4, 6, 8] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    data-testid={`tooning-cut-count-${count}`}
                    aria-pressed={plan.cutCount === count}
                    onClick={() => onChangeCutCount(count)}
                    className={
                      plan.cutCount === count
                        ? "tp-chip tp-chip--active tabular-nums min-h-11"
                        : "tp-chip tabular-nums min-h-11"
                    }
                  >
                    {ko ? `${count}컷` : `${count} Cuts`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="tp-field-label">{ko ? "1클릭 분위기 변주" : "1-Click Tone Shift"}</span>
              <div role="group" aria-label={ko ? "에피소드 톤 변주" : "Episode tone variation"} className="tp-chip-wrap">
                {TOONING_TONES.map((tone) => {
                  const active = plan.toneId === tone.id;
                  return (
                    <button
                      key={tone.id}
                      type="button"
                      data-testid={`tooning-tone-${tone.id}`}
                      aria-pressed={active}
                      onClick={() => onChangeTone(tone.id)}
                      className={active ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
                      style={{ "--tp-chip-accent": tone.accentOklch } as CSSProperties}
                    >
                      <span className="tp-dot" aria-hidden="true" />
                      <span>{ko ? tone.labelKo : tone.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="tp-surface-card">
          <div className="tp-card-head-row">
            <h4 className="tp-card-title [word-break:keep-all]">
              {ko ? `등장 화자 설정 (${plan.speakers.length}명)` : `Dialogue Speakers (${plan.speakers.length})`}
            </h4>
            <button
              type="button"
              data-testid="tooning-toggle-third-speaker"
              onClick={onToggleThirdSpeaker}
              className="tp-mini-action min-h-11"
            >
              {plan.speakers.length < 3 ? (
                <>
                  <Plus size={14} aria-hidden="true" />
                  <span>{ko ? "화자 3 추가" : "Add 3rd Speaker"}</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} aria-hidden="true" />
                  <span>{ko ? "2명으로 줄이기" : "Use 2 Speakers"}</span>
                </>
              )}
            </button>
          </div>

          <div className="tp-speaker-list">
            {plan.speakers.map((slot) => {
              const char = getTooningCharacter(slot.characterId);
              return (
                <label key={slot.slotIndex} className="tp-speaker-row">
                  <span className="tp-speaker-badge tabular-nums" style={{ "--tp-swatch": char.outfitOklch } as CSSProperties}>
                    {ko ? `화자 ${slot.slotIndex + 1}` : `Cast ${slot.slotIndex + 1}`}
                  </span>
                  <select
                    aria-label={ko ? `화자 ${slot.slotIndex + 1} 캐릭터` : `Speaker ${slot.slotIndex + 1} character`}
                    data-testid={`tooning-speaker-select-${slot.slotIndex}`}
                    value={slot.characterId}
                    onChange={(event) => onChangeSpeaker(slot.slotIndex, event.target.value as TooningCharacterId)}
                    className="tp-select min-h-11"
                  >
                    {TOONING_CHARACTERS.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {ko ? `${candidate.nameKo} (${candidate.roleKo})` : `${candidate.nameEn} (${candidate.roleEn})`}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="tp-surface-card">
        <div className="tp-card-head-row">
          <h4 className="tp-card-title [word-break:keep-all]">
            {ko ? "자동 조립된 기승전결 컷 대본" : "Auto-Assembled Episode Beat Script"}
          </h4>
          <span className="tp-pill tabular-nums">
            {ko ? `총 ${plan.cuts.length}컷 · 즉시 편집 가능` : `${plan.cuts.length} panels · Live editable`}
          </span>
        </div>

        <div className="tp-beat-grid">
          {plan.cuts.map((cut) => {
            const speaker = getTooningCharacter(cut.characterId);
            return (
              <div key={cut.cutNumber} data-testid={`tooning-story-cut-${cut.cutNumber}`} className="tp-beat-card">
                <div className="tp-beat-head">
                  <span className="tp-cut-num tabular-nums">{`CUT 0${cut.cutNumber}`}</span>
                  <span className="tp-beat-tag [word-break:keep-all]">
                    {ko ? cut.beatLabelKo : cut.beatLabelEn}
                  </span>
                </div>
                <div className="tp-beat-speaker">
                  <span className="tp-swatch-dot" style={{ background: speaker.outfitOklch }} aria-hidden="true" />
                  <span>{ko ? speaker.nameKo : speaker.nameEn}</span>
                </div>
                <textarea
                  aria-label={ko ? `컷 ${cut.cutNumber} 대사 편집` : `Edit cut ${cut.cutNumber} dialogue`}
                  data-testid={`tooning-dialogue-input-${cut.cutNumber}`}
                  rows={2}
                  value={ko ? cut.dialogueKo : cut.dialogueEn}
                  onChange={(event) => onEditCutDialogue(cut.cutNumber, event.target.value)}
                  className="tp-textarea"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Step2Studio3dProps {
  readonly locale: TooningLocale;
  readonly plan: TooningEpisodePlan;
  readonly selectedCutNumber: number;
  readonly stage3dHandoff: Tooning3dStageHandoff;
  readonly onSelectCut: (cutNumber: number) => void;
  readonly onPatchCut: (cutNumber: number, patch: TooningCutDirectionPatch) => void;
  readonly onOpen3dWorkspace?: () => void;
}

export function TooningStep2Studio3dPanel({
  locale,
  plan,
  selectedCutNumber,
  stage3dHandoff,
  onSelectCut,
  onPatchCut,
  onOpen3dWorkspace,
}: Step2Studio3dProps) {
  const ko = locale === "ko";
  const activeCut = plan.cuts.find((item) => item.cutNumber === selectedCutNumber) ?? plan.cuts[0];
  const active3d = stage3dHandoff.cuts.find((item) => item.cutNumber === activeCut.cutNumber) ?? stage3dHandoff.cuts[0];
  const activeCamera = getTooningCamera(activeCut.cameraId);
  const activeBg = getTooningBackground(activeCut.backgroundId);

  return (
    <div data-testid="tooning-step2-panel" className="tp-step-body">
      <div
        role="group"
        aria-label={ko ? "연출할 컷 선택" : "Select panel to direct"}
        className="tp-cut-strip-tabs"
      >
        {plan.cuts.map((cut) => {
          const active = cut.cutNumber === activeCut.cutNumber;
          const char = getTooningCharacter(cut.characterId);
          return (
            <button
              key={cut.cutNumber}
              type="button"
              data-testid={`tooning-select-cut-${cut.cutNumber}`}
              aria-pressed={active}
              onClick={() => onSelectCut(cut.cutNumber)}
              className={active ? "tp-cut-tab tp-cut-tab--active min-h-11" : "tp-cut-tab min-h-11"}
            >
              <span className="tabular-nums font-extrabold">{`0${cut.cutNumber}`}</span>
              <span>{ko ? char.nameKo : char.nameEn}</span>
            </button>
          );
        })}
      </div>

      <div className="tp-studio-grid">
        <div className="tp-preview-column">
          <div className="tp-surface-card">
            <div className="tp-card-head-row">
              <h4 className="tp-card-title [word-break:keep-all]">
                {ko ? `CUT 0${activeCut.cutNumber} 실시간 3D 연출 프리뷰` : `CUT 0${activeCut.cutNumber} Live Stage Preview`}
              </h4>
              <span className="tp-pill tabular-nums">
                {`${activeCamera.lensMm}mm · ${activeCamera.elevationDeg >= 0 ? "+" : ""}${activeCamera.elevationDeg}°`}
              </span>
            </div>

            <TooningPlusCutStagePreview cut={activeCut} locale={locale} previewScopeId="step2" />

            <div className="tp-position-bar">
              <span className="tp-field-label">{ko ? "화자 배치" : "Character Position"}</span>
              <div role="group" aria-label={ko ? "화자 위치 선택" : "Speaker stage position"} className="tp-chip-wrap">
                {(
                  [
                    { id: "left", ko: "왼쪽", en: "Left" },
                    { id: "center", ko: "중앙", en: "Center" },
                    { id: "right", ko: "오른쪽", en: "Right" },
                  ] as const
                ).map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    data-testid={`tooning-pos-${pos.id}`}
                    aria-pressed={activeCut.speakerPosition === pos.id}
                    onClick={() => onPatchCut(activeCut.cutNumber, { speakerPosition: pos.id as TooningSpeakerPosition })}
                    className={
                      activeCut.speakerPosition === pos.id
                        ? "tp-chip tp-chip--active min-h-11"
                        : "tp-chip min-h-11"
                    }
                  >
                    {ko ? pos.ko : pos.en}
                  </button>
                ))}
              </div>
            </div>

            <div data-testid="tooning-3d-handoff-bar" className="tp-handoff-strip">
              <div className="tp-handoff-meta [word-break:keep-all]">
                <Camera size={14} aria-hidden="true" />
                <span>
                  {ko
                    ? `3D 무대 연동 준비 완료 · 조명: ${activeBg.lightingMoodKo} · 컷 ${stage3dHandoff.totalCuts}개 좌표 패킷`
                    : `3D stage handoff ready · Lighting: ${activeBg.lightingMoodEn} · ${stage3dHandoff.totalCuts} cuts`}
                </span>
              </div>
              <span className="tp-mono-tag tabular-nums">{active3d.rigClipKey}</span>
              {onOpen3dWorkspace ? (
                <button
                  type="button"
                  data-testid="tooning-open-3d-workspace"
                  onClick={onOpen3dWorkspace}
                  className="tp-primary-btn min-h-11"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  <span>{ko ? "3D 포즈·배경 스테이지로 바로 열기" : "Open in 3D Pose & Stage"}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="tp-controls-column">
          <div className="tp-surface-card">
            <span className="tp-field-label">{ko ? "캐릭터 캐스트 (8종)" : "Character Cast (8)"}</span>
            <div className="tp-chip-wrap">
              {TOONING_CHARACTERS.map((char) => {
                const active = activeCut.characterId === char.id;
                return (
                  <button
                    key={char.id}
                    type="button"
                    data-testid={`tooning-char-${char.id}`}
                    aria-pressed={active}
                    onClick={() => onPatchCut(activeCut.cutNumber, { characterId: char.id })}
                    className={active ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
                    style={{ "--tp-chip-accent": char.outfitOklch } as CSSProperties}
                  >
                    <span className="tp-dot" aria-hidden="true" />
                    <span>{ko ? char.nameKo : char.nameEn}</span>
                  </button>
                );
              })}
            </div>

            <span className="tp-field-label tp-mt">{ko ? "동작 포즈 (12종)" : "Action Pose (12)"}</span>
            <div className="tp-chip-wrap">
              {TOONING_POSES.map((pose) => {
                const active = activeCut.poseId === pose.id;
                return (
                  <button
                    key={pose.id}
                    type="button"
                    data-testid={`tooning-pose-${pose.id}`}
                    aria-pressed={active}
                    onClick={() => onPatchCut(activeCut.cutNumber, { poseId: pose.id })}
                    className={active ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
                  >
                    {ko ? pose.labelKo : pose.labelEn}
                  </button>
                );
              })}
            </div>

            <span className="tp-field-label tp-mt">{ko ? "표정 연출 (10종)" : "Expression (10)"}</span>
            <div className="tp-chip-wrap">
              {TOONING_EXPRESSIONS.map((expr) => {
                const active = activeCut.expressionId === expr.id;
                return (
                  <button
                    key={expr.id}
                    type="button"
                    data-testid={`tooning-expr-${expr.id}`}
                    aria-pressed={active}
                    onClick={() => onPatchCut(activeCut.cutNumber, { expressionId: expr.id })}
                    className={active ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
                  >
                    {ko ? expr.labelKo : expr.labelEn}
                  </button>
                );
              })}
            </div>

            <span className="tp-field-label tp-mt">{ko ? "카메라 구도 (8종)" : "Camera Framing (8)"}</span>
            <div className="tp-chip-wrap">
              {TOONING_CAMERAS.map((cam) => {
                const active = activeCut.cameraId === cam.id;
                return (
                  <button
                    key={cam.id}
                    type="button"
                    data-testid={`tooning-cam-${cam.id}`}
                    aria-pressed={active}
                    onClick={() => onPatchCut(activeCut.cutNumber, { cameraId: cam.id })}
                    className={active ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
                  >
                    {ko ? cam.labelKo : cam.labelEn}
                  </button>
                );
              })}
            </div>

            <span className="tp-field-label tp-mt">{ko ? "장면 배경 (6종)" : "Scene Background (6)"}</span>
            <div className="tp-chip-wrap">
              {TOONING_BACKGROUNDS.map((bg) => {
                const active = activeCut.backgroundId === bg.id;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    data-testid={`tooning-bg-${bg.id}`}
                    aria-pressed={active}
                    onClick={() => onPatchCut(activeCut.cutNumber, { backgroundId: bg.id })}
                    className={active ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
                    style={{ "--tp-chip-accent": bg.accentOklch } as CSSProperties}
                  >
                    <span className="tp-dot" aria-hidden="true" />
                    <span>{ko ? bg.labelKo : bg.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Step3SmartEditorProps {
  readonly locale: TooningLocale;
  readonly plan: TooningEpisodePlan;
  readonly productionMode: TooningProductionMode;
  readonly divisionPacket: TooningTeamDivisionPacket;
  readonly exportFormat: "none" | "text" | "json";
  readonly exportedPayload: string;
  readonly onAutoArrangeAll: () => void;
  readonly onPatchCut: (cutNumber: number, patch: TooningCutDirectionPatch) => void;
  readonly onChangeProductionMode: (mode: TooningProductionMode) => void;
  readonly onToggleChecklistItem: (itemId: string) => void;
  readonly onDeliverTo2dStudio: () => void;
  readonly onOpenStageWorkspace?: (workspaceId: StudioDefaultWorkspaceId) => void;
  readonly onExportPacket: (format: "text" | "json") => void;
  readonly onCopyExport: () => void;
}

export function TooningStep3SmartEditorPanel({
  locale,
  plan,
  productionMode,
  divisionPacket,
  exportFormat,
  exportedPayload,
  onAutoArrangeAll,
  onPatchCut,
  onChangeProductionMode,
  onToggleChecklistItem,
  onDeliverTo2dStudio,
  onOpenStageWorkspace,
  onExportPacket,
  onCopyExport,
}: Step3SmartEditorProps) {
  const ko = locale === "ko";
  const overlapCount = plan.cuts.filter(
    (cut) => cut.smartLayout.hasBubbleCharacterOverlap || cut.smartLayout.hasBubbleSfxOverlap,
  ).length;

  return (
    <div data-testid="tooning-step3-panel" className="tp-step-body">
      <div className="tp-surface-card">
        <div className="tp-card-head-row">
          <div>
            <h4 className="tp-card-title [word-break:keep-all]">
              <MessageSquareText size={15} aria-hidden="true" />
              <span>{ko ? "스마트 말풍선·효과음 자동 배치 보드" : "Smart Bubble & SFX Auto-Layout Board"}</span>
            </h4>
            <p className="tp-subtle-copy [word-break:keep-all]">
              {ko
                ? "각 컷의 화자 얼굴 영역을 피해 말풍선과 효과음을 자동으로 배치했습니다."
                : "Speech bubbles and SFX stamps are automatically positioned clear of each speaker's face."}
            </p>
          </div>
          <div className="tp-inline-actions">
            <span data-testid="tooning-overlap-status" className="tp-pill tp-pill--good tabular-nums">
              {ko ? `겹침 ${overlapCount}건` : `${overlapCount} overlaps`}
            </span>
            <button
              type="button"
              data-testid="tooning-auto-arrange-all"
              onClick={onAutoArrangeAll}
              className="tp-mini-action min-h-11"
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>{ko ? "전체 자동 배치 다시 계산" : "Re-Arrange All Panels"}</span>
            </button>
          </div>
        </div>

        <div className="tp-final-cuts-grid">
          {plan.cuts.map((cut) => {
            const pose = getTooningPose(cut.poseId);
            const sfx = getTooningSfx(cut.sfxId);
            return (
              <div key={cut.cutNumber} data-testid={`tooning-smart-cut-${cut.cutNumber}`} className="tp-final-cut-card">
                <TooningPlusCutStagePreview cut={cut} locale={locale} previewScopeId="step3" compact />
                <div className="tp-final-cut-meta tabular-nums">
                  <span>{ko ? `말풍선 (${cut.smartLayout.bubbleBox.x}, ${cut.smartLayout.bubbleBox.y})` : `Bubble (${cut.smartLayout.bubbleBox.x}, ${cut.smartLayout.bubbleBox.y})`}</span>
                  <span>{ko ? `${pose.labelKo} · ${sfx.textKo}` : `${pose.labelEn} · ${sfx.textEn}`}</span>
                </div>
                <div className="tp-final-cut-controls">
                  <select
                    aria-label={ko ? `컷 ${cut.cutNumber} 말풍선 스타일` : `Cut ${cut.cutNumber} bubble style`}
                    data-testid={`tooning-bubble-select-${cut.cutNumber}`}
                    value={cut.bubbleStyle}
                    onChange={(event) =>
                      onPatchCut(cut.cutNumber, { bubbleStyle: event.target.value as TooningBubbleStyleId })
                    }
                    className="tp-select min-h-11"
                  >
                    {TOONING_BUBBLE_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {ko ? style.labelKo : style.labelEn}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label={ko ? `컷 ${cut.cutNumber} 효과음` : `Cut ${cut.cutNumber} SFX`}
                    data-testid={`tooning-sfx-select-${cut.cutNumber}`}
                    value={cut.sfxId}
                    onChange={(event) => onPatchCut(cut.cutNumber, { sfxId: event.target.value as TooningSfxId })}
                    className="tp-select min-h-11"
                  >
                    {TOONING_SFX_PRESETS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {ko ? `${item.textKo} (${item.moodKo})` : `${item.textEn} (${item.moodEn})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="tp-surface-card">
        <div className="tp-card-head-row">
          <div>
            <h4 className="tp-card-title [word-break:keep-all]">
              <Users size={15} aria-hidden="true" />
              <span>{ko ? "6단계 1인·팀 분업 공정 패킷" : "6-Stage Solo & Team Division Packet"}</span>
            </h4>
            <p className="tp-subtle-copy tabular-nums [word-break:keep-all]">
              {ko
                ? `체크리스트 완료 ${divisionPacket.completedChecklistCount}/${divisionPacket.totalChecklistCount} · 총 예상 작업 ${divisionPacket.totalEstimatedMinutes}분`
                : `Checklist ${divisionPacket.completedChecklistCount}/${divisionPacket.totalChecklistCount} · Est. ${divisionPacket.totalEstimatedMinutes} min`}
            </p>
          </div>
          <div role="group" aria-label={ko ? "제작 인원 방식" : "Production workflow mode"} className="tp-chip-wrap">
            <button
              type="button"
              data-testid="tooning-mode-solo"
              aria-pressed={productionMode === "solo"}
              onClick={() => onChangeProductionMode("solo")}
              className={productionMode === "solo" ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
            >
              {ko ? "1인 올인원 제작" : "Solo Creator"}
            </button>
            <button
              type="button"
              data-testid="tooning-mode-team"
              aria-pressed={productionMode === "team"}
              onClick={() => onChangeProductionMode("team")}
              className={productionMode === "team" ? "tp-chip tp-chip--active min-h-11" : "tp-chip min-h-11"}
            >
              {ko ? "6역할 팀 분업" : "6-Role Team Split"}
            </button>
          </div>
        </div>

        <div className="tp-division-grid">
          {divisionPacket.stages.map((stage) => (
            <div
              key={stage.stageId}
              data-testid={`tooning-stage-card-${stage.stageId}`}
              className="tp-stage-card"
              style={{ "--tp-stage-accent": stage.accentOklch } as CSSProperties}
            >
              <div className="tp-stage-card-head">
                <span className="tp-stage-order tabular-nums">{`${stage.order}. ${ko ? stage.labelKo : stage.labelEn}`}</span>
                <span className="tp-stage-cuts tabular-nums">{stage.assignedCutsLabel}</span>
              </div>
              <div className="tp-stage-owner tabular-nums">
                <span>{ko ? stage.ownerKo : stage.ownerEn}</span>
                <span>{ko ? `약 ${stage.estimatedMinutes}분` : `~${stage.estimatedMinutes}m`}</span>
              </div>

              <ul className="tp-checklist">
                {stage.checklist.map((item) => (
                  <li key={item.id}>
                    <label className="tp-check-label">
                      <input
                        type="checkbox"
                        data-testid={`tooning-check-${item.id}`}
                        checked={item.completed}
                        onChange={() => onToggleChecklistItem(item.id)}
                      />
                      <span className="[word-break:keep-all]">{ko ? item.labelKo : item.labelEn}</span>
                    </label>
                  </li>
                ))}
              </ul>

              {onOpenStageWorkspace ? (
                <button
                  type="button"
                  data-testid={`tooning-stage-open-${stage.stageId}`}
                  onClick={() => onOpenStageWorkspace(stage.workspacePreset)}
                  className="tp-stage-jump-btn min-h-11"
                >
                  <Layers size={13} aria-hidden="true" />
                  <span>{ko ? `${stage.labelKo} 작업공간 열기` : `Open ${stage.labelEn}`}</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="tp-export-bar">
          <button
            type="button"
            data-testid="tooning-deliver-2d-studio"
            onClick={onDeliverTo2dStudio}
            className="tp-primary-btn min-h-11"
          >
            <Send size={14} aria-hidden="true" />
            <span>{ko ? "원클릭 2D 스튜디오 컷으로 전달" : "Send Cuts to 2D Studio"}</span>
          </button>

          <button
            type="button"
            data-testid="tooning-export-text"
            onClick={() => onExportPacket("text")}
            className="tp-mini-action min-h-11"
          >
            <FileText size={14} aria-hidden="true" />
            <span>{ko ? "텍스트 대본·분업표 보기" : "Export Text Brief"}</span>
          </button>

          <button
            type="button"
            data-testid="tooning-export-json"
            onClick={() => onExportPacket("json")}
            className="tp-mini-action min-h-11"
          >
            <FileJson size={14} aria-hidden="true" />
            <span>{ko ? "JSON 작업 패킷 내보내기" : "Export JSON Packet"}</span>
          </button>
        </div>

        {exportFormat !== "none" ? (
          <div data-testid="tooning-export-preview" className="tp-export-box">
            <div className="tp-card-head-row">
              <span className="tp-field-label">
                <CheckCircle2 size={13} aria-hidden="true" />
                {exportFormat === "json"
                  ? ko
                    ? "JSON 분업·3D 연동 패킷"
                    : "JSON Division & 3D Handoff Packet"
                  : ko
                    ? "텍스트 대본·공정 배정표"
                    : "Plain Text Script & Assignment Sheet"}
              </span>
              <button
                type="button"
                data-testid="tooning-copy-export"
                onClick={onCopyExport}
                className="tp-mini-action min-h-11"
              >
                <ClipboardCopy size={13} aria-hidden="true" />
                <span>{ko ? "클립보드 복사" : "Copy Output"}</span>
              </button>
            </div>
            <pre className="tp-export-pre">{exportedPayload}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
