import { Check, UserRoundPen } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  readSpaceActiveDccId,
  readSpaceCompanionId,
  readSpaceProximityPreferences,
  readSpaceStatusHatId,
  readSpaceStatusUrgency,
  SPACE_ACTIVE_DCC_OPTIONS,
  SPACE_BUBBLE_SOUND_OPTIONS,
  SPACE_COMPANION_OPTIONS,
  SPACE_PROXIMITY_RANGE_OPTIONS,
  SPACE_STATUS_EXPIRY_OPTIONS,
  SPACE_STATUS_HAT_OPTIONS,
  SPACE_STATUS_OPTIONS,
  SPACE_STATUS_URGENCY_OPTIONS,
  writeSpaceActiveDccId,
  writeSpaceCompanionId,
  writeSpaceProximityPreferences,
  writeSpaceStatusHatId,
  writeSpaceStatusUrgency,
  type SpaceActiveDccId,
  type SpaceBubbleSoundMode,
  type SpaceCompanionId,
  type SpaceProximityPreferences,
  type SpaceProximityRangeOption,
  type SpaceStatusExpiryMinutes,
  type SpaceStatusHatId,
  type SpaceStatusId,
  type SpaceStatusOption,
  type SpaceStatusUrgency,
} from "./space-dock-model";
import type { SpaceProximityRangeMode } from "./space-proximity-media";

/**
 * 내 상태 6종(대화 가능·집중·검토·회의·휴식·자리 비움)과 캐릭터·이름 바꾸기.
 * 상태는 색 점과 글자로 함께 보여 주고, 고른 값은 이름표와 팀원 목록에 그대로 보인다.
 * 근접 음성 범위(기본·좁게·끄기)를 함께 두면 좁게·끄기일 때 내 상태 점이 빨간색으로 바뀐다(Gather Quiet 대응).
 * oVice 긴급도 배지(일반·주의·긴급), WorkAdventure 동행 펫(companion)·따라가기 거절·버블 효과음,
 * Teemyco 상태 모자(statusHat), Tandem 실행 중인 창작 툴(activeDcc), Krisp AI 소음 제거·Whereby 플로팅 PiP도 함께 설정한다.
 */
export function SpaceStatusMenu({
  status, onStatus, onEditCharacter, proximityRange, onProximityRange, statusExpiryMinutes = null, onStatusExpiry,
  statusUrgency, onStatusUrgency, companionId, onCompanionChange, proximityPreferences, onProximityPreferences,
  statusHatId, onStatusHatChange, activeDccId, onActiveDccChange,
}: {
  readonly status: SpaceStatusId;
  /** close가 true면 고른 뒤 메뉴를 닫는다(클릭). 화살표 이동은 메뉴를 유지한다. */
  readonly onStatus: (option: SpaceStatusOption, close: boolean) => void;
  readonly onEditCharacter: () => void;
  /** 근접 음성 범위. onProximityRange와 함께 주어질 때만 범위 그룹을 그린다. */
  readonly proximityRange?: SpaceProximityRangeMode;
  readonly onProximityRange?: (option: SpaceProximityRangeOption, close: boolean) => void;
  /** 상태 자동 해제 시간(Gather SetStatusV2.statusExpiresAt 대응). */
  readonly statusExpiryMinutes?: SpaceStatusExpiryMinutes;
  readonly onStatusExpiry?: (minutes: SpaceStatusExpiryMinutes) => void;
  /** 상태 긴급도 배지(oVice Set Customize Status · speechBubble.options 대응). */
  readonly statusUrgency?: SpaceStatusUrgency;
  readonly onStatusUrgency?: (urgency: SpaceStatusUrgency) => void;
  /** 동행 펫(WorkAdventure LocalUserStore.companion 대응). */
  readonly companionId?: SpaceCompanionId;
  readonly onCompanionChange?: (companionId: SpaceCompanionId) => void;
  /** 근접 버블 효과음·따라가기 거절(WorkAdventure LocalUserStore 대응). */
  readonly proximityPreferences?: SpaceProximityPreferences;
  readonly onProximityPreferences?: (next: SpaceProximityPreferences) => void;
  /** 아바타 상태 모자(Teemyco Status Hat 대응). */
  readonly statusHatId?: SpaceStatusHatId;
  readonly onStatusHatChange?: (hatId: SpaceStatusHatId) => void;
  /** 실행 중인 창작 툴 표시(Tandem / Cosmos True Status 대응). */
  readonly activeDccId?: SpaceActiveDccId;
  readonly onActiveDccChange?: (dccId: SpaceActiveDccId) => void;
}) {
  const bt = useBilingual("SpaceStatusMenu");
  const group = useRef<HTMLDivElement>(null);
  const rangeGroup = useRef<HTMLDivElement>(null);
  const [localUrgency, setLocalUrgency] = useState<SpaceStatusUrgency>(() => readSpaceStatusUrgency());
  const [localCompanion, setLocalCompanion] = useState<SpaceCompanionId>(() => readSpaceCompanionId());
  const [localPrefs, setLocalPrefs] = useState<SpaceProximityPreferences>(() => readSpaceProximityPreferences());
  const [localHat, setLocalHat] = useState<SpaceStatusHatId>(() => readSpaceStatusHatId());
  const [localDcc, setLocalDcc] = useState<SpaceActiveDccId>(() => readSpaceActiveDccId());
  const activeUrgency = statusUrgency ?? localUrgency;
  const activeCompanion = companionId ?? localCompanion;
  const activePrefs = proximityPreferences ?? localPrefs;
  const activeHat = statusHatId ?? localHat;
  const activeDcc = activeDccId ?? localDcc;

  const selectUrgency = (next: SpaceStatusUrgency) => {
    setLocalUrgency(next);
    writeSpaceStatusUrgency(next);
    onStatusUrgency?.(next);
  };
  const selectCompanion = (next: SpaceCompanionId) => {
    setLocalCompanion(next);
    writeSpaceCompanionId(next);
    onCompanionChange?.(next);
  };
  const selectHat = (next: SpaceStatusHatId) => {
    setLocalHat(next);
    writeSpaceStatusHatId(next);
    onStatusHatChange?.(next);
  };
  const selectDcc = (next: SpaceActiveDccId) => {
    setLocalDcc(next);
    writeSpaceActiveDccId(next);
    onActiveDccChange?.(next);
  };
  const updatePrefs = (patch: Partial<SpaceProximityPreferences>) => {
    const next: SpaceProximityPreferences = { ...activePrefs, ...patch };
    setLocalPrefs(next);
    writeSpaceProximityPreferences(next);
    onProximityPreferences?.(next);
  };
  // 라디오 그룹 관례: 화살표로 선택을 옮기고 초점도 따라간다.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = SPACE_STATUS_OPTIONS[(index + step + SPACE_STATUS_OPTIONS.length) % SPACE_STATUS_OPTIONS.length];
    if (!next) return;
    onStatus(next, false);
    group.current?.querySelector<HTMLButtonElement>(`[data-status-option="${next.id}"]`)?.focus();
  };
  const onRangeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!onProximityRange) return;
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = SPACE_PROXIMITY_RANGE_OPTIONS[(index + step + SPACE_PROXIMITY_RANGE_OPTIONS.length) % SPACE_PROXIMITY_RANGE_OPTIONS.length];
    if (!next) return;
    onProximityRange(next, false);
    rangeGroup.current?.querySelector<HTMLButtonElement>(`[data-range-option="${next.id}"]`)?.focus();
  };
  return <div className="space-status-menu">
    <div ref={group} role="radiogroup" aria-label={bt("내 상태", "My status")} className="space-status-menu__options">
      {SPACE_STATUS_OPTIONS.map((option, index) => <button key={option.id} type="button" role="radio" aria-checked={status === option.id}
        tabIndex={status === option.id ? 0 : -1} data-status-option={option.id} data-activity-option={option.activity}
        className="space-menu-row" onClick={() => onStatus(option, true)} onKeyDown={(event) => onKeyDown(event, index)}>
        <span className="space-status-dot" data-activity={option.activity} data-status={option.id} aria-hidden />
        <span className="space-menu-row__label">{bt(option.labelKo, option.labelEn)}</span>
        {status === option.id ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div>
    <p className="space-status-menu__note">{bt(
      "집중·자리 비움 중에는 새 대화 요청을 받지 않아요. 회의·휴식 중은 이름표에만 표시돼요.",
      "Focusing or away pauses new conversation requests. Meeting and break only change your name tag.",
    )}</p>
    {status !== "available" && onStatusExpiry ? <div role="radiogroup" aria-label={bt("상태 자동 해제", "Auto-clear status")} className="space-status-menu__options">
      {SPACE_STATUS_EXPIRY_OPTIONS.map((item) => <button key={String(item.minutes)} type="button" role="radio"
        aria-checked={statusExpiryMinutes === item.minutes} className="space-menu-row"
        onClick={() => onStatusExpiry(item.minutes)}>
        <span className="space-menu-row__label">{bt(item.labelKo, item.labelEn)}</span>
        {statusExpiryMinutes === item.minutes ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div> : null}
    <div role="radiogroup" aria-label={bt("상태 긴급도", "Status urgency")} className="space-status-menu__options">
      {SPACE_STATUS_URGENCY_OPTIONS.map((item) => <button key={item.id} type="button" role="radio"
        aria-checked={activeUrgency === item.id} data-urgency-option={item.id} className="space-menu-row"
        onClick={() => selectUrgency(item.id)}>
        <span className="space-menu-row__label">{item.badge ? `${item.badge} ` : ""}{bt(item.labelKo, item.labelEn)}</span>
        {activeUrgency === item.id ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div>
    <div role="radiogroup" aria-label={bt("동행 펫", "Companion pet")} className="space-status-menu__options">
      {SPACE_COMPANION_OPTIONS.map((item) => <button key={item.id} type="button" role="radio"
        aria-checked={activeCompanion === item.id} data-companion-option={item.id} className="space-menu-row"
        onClick={() => selectCompanion(item.id)}>
        <span className="space-menu-row__label">{item.emoji ? `${item.emoji} ` : ""}{bt(item.labelKo, item.labelEn)}</span>
        {activeCompanion === item.id ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div>
    <div role="radiogroup" aria-label={bt("근접 버블 효과음", "Proximity bubble sound")} className="space-status-menu__options">
      {SPACE_BUBBLE_SOUND_OPTIONS.map((item) => <button key={item.id} type="button" role="radio"
        aria-checked={activePrefs.bubbleSound === item.id} data-bubble-sound-option={item.id} className="space-menu-row"
        onClick={() => updatePrefs({ bubbleSound: item.id as SpaceBubbleSoundMode })}>
        <span className="space-menu-row__label">{bt(item.labelKo, item.labelEn)}</span>
        {activePrefs.bubbleSound === item.id ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div>
    <button type="button" className="space-menu-row" aria-pressed={activePrefs.ignoreFollowRequests}
      onClick={() => updatePrefs({ ignoreFollowRequests: !activePrefs.ignoreFollowRequests })}>
      <span className="space-menu-row__label">{bt("따라가기 요청 자동 거절", "Ignore follow requests")}</span>
      {activePrefs.ignoreFollowRequests ? <Check size={16} aria-hidden /> : null}
    </button>
    <div role="radiogroup" aria-label={bt("상태 모자", "Status hat")} className="space-status-menu__options">
      {SPACE_STATUS_HAT_OPTIONS.map((item) => <button key={item.id} type="button" role="radio"
        aria-checked={activeHat === item.id} data-status-hat-option={item.id} className="space-menu-row"
        onClick={() => selectHat(item.id)}>
        <span className="space-menu-row__label">{item.emoji ? `${item.emoji} ` : ""}{bt(item.labelKo, item.labelEn)}</span>
        {activeHat === item.id ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div>
    <div role="radiogroup" aria-label={bt("실행 중인 창작 툴", "Active creative app")} className="space-status-menu__options">
      {SPACE_ACTIVE_DCC_OPTIONS.map((item) => <button key={item.id} type="button" role="radio"
        aria-checked={activeDcc === item.id} data-active-dcc-option={item.id} className="space-menu-row"
        onClick={() => selectDcc(item.id)}>
        <span className="space-menu-row__label">{item.badge ? `${item.badge} ` : ""}{bt(item.labelKo, item.labelEn)}</span>
        {activeDcc === item.id ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div>
    <button type="button" className="space-menu-row" aria-pressed={activePrefs.krispNoiseSuppression ?? true}
      onClick={() => updatePrefs({ krispNoiseSuppression: !(activePrefs.krispNoiseSuppression ?? true) })}>
      <span className="space-menu-row__label">{bt("AI 펜·키보드 소음 제거 (Krisp BVC)", "AI stylus & keyboard noise filter (Krisp BVC)")}</span>
      {(activePrefs.krispNoiseSuppression ?? true) ? <Check size={16} aria-hidden /> : null}
    </button>
    <button type="button" className="space-menu-row" aria-pressed={Boolean(activePrefs.wherebyFloatingPip)}
      onClick={() => updatePrefs({ wherebyFloatingPip: !activePrefs.wherebyFloatingPip })}>
      <span className="space-menu-row__label">{bt("창작 툴 위 플로팅 PiP 버블 (Whereby)", "Floating PiP camera bubble (Whereby)")}</span>
      {activePrefs.wherebyFloatingPip ? <Check size={16} aria-hidden /> : null}
    </button>
    {proximityRange && onProximityRange ? <>
      <div ref={rangeGroup} role="radiogroup" aria-label={bt("근접 음성 범위", "Proximity voice range")} className="space-status-menu__options">
        {SPACE_PROXIMITY_RANGE_OPTIONS.map((option, index) => <button key={option.id} type="button" role="radio" aria-checked={proximityRange === option.id}
          tabIndex={proximityRange === option.id ? 0 : -1} data-range-option={option.id}
          className="space-menu-row" onClick={() => onProximityRange(option, true)} onKeyDown={(event) => onRangeKeyDown(event, index)}>
          <span className="space-status-dot" data-range={option.id === "standard" ? undefined : option.id} aria-hidden />
          <span className="space-menu-row__label">{bt(option.labelKo, option.labelEn)}
            <small>{bt(option.hintKo, option.hintEn)}</small>
          </span>
          {proximityRange === option.id ? <Check size={16} aria-hidden /> : null}
        </button>)}
      </div>
      <p className="space-status-menu__note">{bt(
        "좁게·끄기를 고르면 도크의 내 상태 점이 빨간색으로 바뀌어요.",
        "Choosing Quiet or Off turns your status dot in the dock red.",
      )}</p>
    </> : null}
    <button type="button" className="space-menu-row" onClick={onEditCharacter}>
      <UserRoundPen size={16} aria-hidden />
      <span className="space-menu-row__label">{bt("캐릭터·이름 바꾸기", "Change character & name")}</span>
    </button>
  </div>;
}
