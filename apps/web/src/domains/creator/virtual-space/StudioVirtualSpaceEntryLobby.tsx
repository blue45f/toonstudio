import { CameraOff, Check, KeyRound, Lock, MicOff, Network, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";

import Link from "@/shared/navigation/router-link";
import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  STUDIO_VIRTUAL_ART_STYLES,
  studioVirtualArtTextureUrl,
  studioVirtualLobbyPreviewObjectPosition,
  type StudioVirtualArtStyleKey,
} from "./studio-virtual-space-art-style";
import { StudioVirtualCharacterPreview } from "./StudioVirtualCharacterPreview";
import { STUDIO_ENTRY_CODE_PANEL_ID } from "./studio-virtual-space-entry-code";
import { StudioVirtualSpaceEntryCodePanel, type StudioEntryCodeEntryResult } from "./StudioVirtualSpaceEntryCodePanel";
import { StudioVirtualThemeCharacterPicker } from "./StudioVirtualThemeCharacterPicker";
import { StudioVirtualExperienceArtPreview } from "./StudioVirtualExperienceArtPreview";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle } from "./studio-virtual-space-character-skins";
import {
  STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES,
  normalizeStudioVirtualSpaceNickname,
} from "./studio-virtual-space-entry-preference";
import "./studio-virtual-space.css";
import "./studio-workspace-live.css";
import "./hud/space-lobby.css";
import { createStudioVirtualSpacePanel } from "./StudioVirtualSpaceOnDemandPanel";

const StudioVirtualSpaceRtcPanel = createStudioVirtualSpacePanel(() => import("./StudioVirtualSpaceRtcPanel").then((module) => ({ default: module.StudioVirtualSpaceRtcPanel })));

export type StudioVirtualSpaceEntryVariant = "entry" | "character-onboarding";

function LobbyChip({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }) {
  // li 껍데기는 StaggerReveal(itemAs="li")이 입힌다 — 칩 내용만 반환한다.
  return <>{icon}<span>{children}</span></>;
}

/**
 * 입장 로비(게더형 2열).
 * 왼쪽 무대는 고른 캐릭터와 공개 이름표를 월드 아트 위에 크게 보여 주고,
 * 오른쪽 카드는 이름·캐릭터·아트 스타일을 고른 뒤 입장한다. 입장 전에는 위치·미디어·신호를 만들지 않는다.
 */
export function StudioVirtualSpaceEntryLobby({
  avatarIndex,
  artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  nickname,
  returning,
  projectName,
  personal = false,
  variant = "entry",
  backHref = "/studio",
  backLabel,
  onAvatarIndex,
  onArtStyle,
  onNickname,
  onEnter,
  guestMode = false,
  resumePlace = null,
  onResume,
  onEnterWithCode,
  initialEntryCode = null,
  accessNotice = null,
  accessBlocked = false,
  onRetryAccess,
}: {
  readonly avatarIndex: number;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly nickname: string;
  readonly returning: boolean;
  readonly projectName: string;
  readonly personal?: boolean;
  /** Invite-link guest entry: nickname only, no character/art/RTC setup. */
  readonly guestMode?: boolean;
  /** 입장코드 패널 콜백. 없으면 패널 자체를 렌더하지 않는다(로그인 사용자 등). 서버 검증 결과를 돌려준다. */
  readonly onEnterWithCode?: (code: string) => Promise<StudioEntryCodeEntryResult | void> | StudioEntryCodeEntryResult | void;
  /** `#code=` 프래그먼트로 도착한 코드의 초기값. 코드 패널에 미리 채운다. */
  readonly initialEntryCode?: string | null;
  /** 초대 자격 검증 상태 안내(F-B06-1). 무효·확인 불가인 자격을 조용히 넘기지 않고 로비에 명시한다. */
  readonly accessNotice?: { readonly tone: "info" | "error"; readonly ko: string; readonly en: string } | null;
  /** 자격 검증이 끝나지 않았거나 거절돼 기본 입장을 막아야 할 때 true. */
  readonly accessBlocked?: boolean;
  /** 확인 불가 상태에서 검증을 다시 시도하는 콜백. 있으면 안내 옆에 재시도 버튼을 단다. */
  readonly onRetryAccess?: () => void;
  readonly variant?: StudioVirtualSpaceEntryVariant;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly onAvatarIndex: (avatarIndex: number) => void;
  readonly onArtStyle?: (artStyle: StudioVirtualArtStyleKey) => void;
  readonly onNickname: (nickname: string) => void;
  readonly onEnter: () => void;
  /** 지난 방문에 머물던 다른 장소. 있으면 "이어서 시작 / 처음부터" 선택을 보여 준다(W-2). */
  readonly resumePlace?: { readonly labelKo: string; readonly labelEn: string } | null;
  readonly onResume?: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceEntryLobby");
  const onboarding = variant === "character-onboarding";
  const resumeAvailable = Boolean(resumePlace && onResume) && !onboarding && !guestMode;
  const sourceCharacter = guestMode ? STUDIO_CHARACTER_SKINS[0] : STUDIO_CHARACTER_SKINS[avatarIndex];
  const characterSelected = guestMode || (Number.isInteger(avatarIndex) && Boolean(sourceCharacter));
  const normalizedNickname = normalizeStudioVirtualSpaceNickname(nickname);
  const selectedCharacter = characterSelected && sourceCharacter ? studioCharacterSkinForArtStyle(sourceCharacter, artStyle) : null;
  const nicknameInvalid = nickname.length > 0 && !normalizedNickname;
  const canEnter = characterSelected && Boolean(normalizedNickname) && !accessBlocked;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // 월드 미리보기 텍스처의 도착 상태. 스타일별로 마지막 결과만 들고 있어,
  // 스타일을 바꾸면 새 텍스처가 도착할 때까지 다시 로딩으로 판정한다.
  const [previewResult, setPreviewResult] = useState<{ readonly style: StudioVirtualArtStyleKey; readonly status: "ready" | "error" } | null>(null);
  const previewStatus: "loading" | "ready" | "error" = onboarding
    ? "ready"
    : previewResult && previewResult.style === artStyle ? previewResult.status : "loading";
  const resolvedBackLabel = backLabel ?? (onboarding
    ? bt("홈으로 돌아가기", "Back to home")
    : bt("작업 목록으로", "Back to work list"));
  const title = onboarding
    ? returning
      ? bt("내 캐릭터를 확인하세요", "Confirm your character")
      : bt("함께할 캐릭터를 선택하세요", "Choose the character who will join you")
    : guestMode
      ? bt("초대받은 공간에 입장하세요", "Enter the space you were invited to")
      : returning
        ? bt("다시 스튜디오로", "Return to the studio")
        : personal ? bt("내 원고 작업실에 입장하세요", "Enter your manuscript office")
          : bt("함께 작업할 스튜디오에 입장하세요", "Enter your shared work studio");
  const description = onboarding
    ? bt(
      "직접 고른 캐릭터는 홈, 프로필, 방문자 목록과 가상스튜디오에서 나를 이어 주는 모습이 돼요. 나중에도 언제든 변경할 수 있어요.",
      "The character you choose connects your identity across home, profile, visitor lists and the virtual studio. You can change it later.",
    )
    : guestMode ? bt(
      "초대 링크로 입장하는 게스트예요. 닉네임만 정하면 바로 들어갈 수 있어요. 공간 편집은 할 수 없고, 이동과 음성 대화만 가능해요.",
      "You're entering as an invited guest. Just pick a nickname to join. You can't edit the space — only move around and voice chat.",
    )
      : personal ? bt(
        "내 캐릭터로 작업실에 입장해 원고 작업을 시작하세요. 내 작품을 열거나 새 작품을 만들고, 작업할 위치와 분위기를 고를 수 있어요.",
        "Enter your office with your character to work on a manuscript. Open a work or create one, then choose your workspace and atmosphere.",
      ) : bt(
        `${projectName}에서 오늘 할 원고 작업을 고르고, 동료에게 다가가 대화하거나 검수를 요청하세요. 작업 자리로 돌아와 제작을 이어갈 수 있어요.`,
        `Choose today's manuscript work in ${projectName}, walk to a teammate to talk or request a review, and return to your desk to continue creating.`,
      );
  const enterLabel = onboarding
    ? returning ? bt("이 캐릭터로 계속", "Continue with this character") : bt("이 캐릭터로 시작", "Start with this character")
    : guestMode ? bt("게스트로 입장", "Enter as guest")
      : returning ? bt("이 캐릭터로 바로 입장", "Enter with this character") : bt("선택하고 입장", "Choose and enter");
  const note = !normalizedNickname
    ? bt("공개 닉네임을 확인하면 입장할 수 있어요.", "Confirm a public nickname to enter.")
    : characterSelected
      ? onboarding
        ? bt("닉네임과 캐릭터는 이 브라우저에 저장되며 홈에서 다시 바꿀 수 있어요.", "Your nickname and character are saved in this browser and can be changed from home.")
        : guestMode
          ? bt("게스트 세션은 24시간 동안 유효해요.", "Your guest session is valid for 24 hours.")
          : bt("닉네임·캐릭터·아트 스타일 선택은 이 브라우저에 저장돼요.", "Nickname, character and art-style choices are saved in this browser.")
      : bt("캐릭터를 직접 선택하면 다음 단계로 이동할 수 있어요.", "Choose a character to continue.");
  // 코드로 들어오는 방문자는 캐릭터 설정을 건너뛰는 경로가 있다는 것부터 알아야 한다.
  // 첫 화면 안내에서 카드 아래쪽 코드 패널로 바로 이동시켜 동선을 눈으로 잇는다.
  const scrollToEntryCode = () => {
    const panel = document.getElementById(STUDIO_ENTRY_CODE_PANEL_ID);
    if (!panel) return;
    if (typeof panel.scrollIntoView === "function") panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    panel.focus({ preventScroll: true });
  };

  return <div className="studio-vspace-entry space-lobby" data-own-control-size="true" data-route-ready={onboarding ? "studio-character-onboarding" : "studio-virtual-entry"}
    data-art-style={artStyle} data-entry-variant={variant}>
    <div className="space-lobby__backdrop" aria-hidden>
      {onboarding
        ? <img className="space-lobby__backdrop-art" src="/images/onboarding-character-stage.webp" alt="" draggable={false} />
        : <StudioVirtualExperienceArtPreview className="space-lobby__backdrop-art" kind="landmarks" artStyle={artStyle} frame={0} preserveAspectRatio="xMidYMid slice" />}
    </div>
    <div className="space-lobby__layout">
      <RevealOnScroll as="section" variant="fade" className="space-lobby__stage" aria-label={bt("입장 미리보기", "Entry preview")}>
        {/* 들어갈 월드의 실제 베이스 아트를 무대 배경으로 깐다. 입장 전 프리뷰라 위치·신호는 만들지 않고,
            부트 로더가 받는 것과 같은 스타일별 world-base 텍스처만 정적으로 보여 준다. */}
        <div className="space-lobby__scene" aria-hidden>
          {onboarding
            ? <img className="space-lobby__scene-art space-lobby__scene-art--onboarding" src="/images/onboarding-character-stage.webp" alt="" draggable={false} data-onboarding-stage-art />
            : <img className="space-lobby__scene-art" src={studioVirtualArtTextureUrl(artStyle, "world-base")} alt="" draggable={false} data-world-preview={artStyle}
              data-preview-state={previewStatus}
              style={{ objectPosition: studioVirtualLobbyPreviewObjectPosition(artStyle) }}
              ref={(img) => { if (img && img.naturalWidth > 0) setPreviewResult({ style: artStyle, status: "ready" }); }}
              onLoad={() => setPreviewResult({ style: artStyle, status: "ready" })}
              onError={() => setPreviewResult({ style: artStyle, status: "error" })} />}
        </div>
        <header className="space-lobby__stage-head">
          <p className="space-lobby__kicker"><Sparkles size={15} aria-hidden />{onboarding ? "ToonStudio Character" : "ToonStudio Spatial Campus"}</p>
          <p className="space-lobby__place">{projectName}</p>
          {previewStatus === "error" ? <p className="space-lobby__scene-status" role="status">{bt(
            "월드 미리보기를 불러오지 못했어요. 입장에는 영향이 없어요.",
            "The world preview couldn't be loaded. You can still enter.",
          )}</p> : null}
        </header>
        <div className="space-lobby__avatar" data-empty={!selectedCharacter || undefined}>
          <p className="space-lobby__nameplate" aria-live="polite">
            <small>{bt("공개 이름표", "Public nameplate")}</small>
            <strong>{normalizedNickname ?? bt("닉네임을 입력하세요", "Enter a nickname")}</strong>
          </p>
          {selectedCharacter
            ? <StudioVirtualCharacterPreview key={selectedCharacter.key} skin={selectedCharacter} className="space-lobby__character" />
            : <span className="space-lobby__placeholder"><UserRound size={44} aria-hidden /><small>{bt("캐릭터를 골라 주세요", "Choose a character")}</small></span>}
          <span className="space-lobby__floor" aria-hidden />
        </div>
        {!onboarding && !personal && !guestMode ? <StaggerReveal as="ul" itemAs="li" className="space-lobby__chips" aria-label={bt("입장 시 기본 상태", "Default state on entry")}>
          <LobbyChip icon={<MicOff size={15} aria-hidden />}>{bt("마이크 꺼짐", "Microphone off")}</LobbyChip>
          <LobbyChip icon={<CameraOff size={15} aria-hidden />}>{bt("카메라 꺼짐", "Camera off")}</LobbyChip>
          <LobbyChip icon={<Network size={15} aria-hidden />}>{bt("동료가 수락하면 함께 작업", "Work together after an invitation is accepted")}</LobbyChip>
          <LobbyChip icon={<ShieldCheck size={15} aria-hidden />}>{bt("미디어는 별도 동의 후 시작", "Media starts only after consent")}</LobbyChip>
        </StaggerReveal> : null}
        {onboarding ? <StaggerReveal as="ul" itemAs="li" className="space-lobby__chips" aria-label={bt("캐릭터 안내", "About your character")}>
          <LobbyChip icon={<UserRound size={15} aria-hidden />}>{bt("홈·프로필·방문 목록에 같은 모습", "The same look on home, profile and visitor lists")}</LobbyChip>
          <LobbyChip icon={<ShieldCheck size={15} aria-hidden />}>{bt("공개되는 건 닉네임과 캐릭터뿐", "Only your nickname and character are public")}</LobbyChip>
          <LobbyChip icon={<Sparkles size={15} aria-hidden />}>{bt("나중에도 언제든 변경 가능", "Change it anytime later")}</LobbyChip>
        </StaggerReveal> : null}
        {personal && !onboarding ? <StaggerReveal as="ul" itemAs="li" className="space-lobby__chips" aria-label={bt("개인 작업실 안내", "About your personal office")}>
          <LobbyChip icon={<Lock size={15} aria-hidden />}>{bt("나만 입장하는 개인 작업실", "A personal office only you enter")}</LobbyChip>
          <LobbyChip icon={<MicOff size={15} aria-hidden />}>{bt("마이크·카메라를 쓰지 않아요", "No microphone or camera")}</LobbyChip>
        </StaggerReveal> : null}
      </RevealOnScroll>

      <RevealOnScroll as="section" variant="up" delayMs={120} className="studio-vspace-entry-card space-lobby__form" aria-labelledby="studio-vspace-entry-title">
        <header className="space-lobby__heading">
          <h1 id="studio-vspace-entry-title">{title}</h1>
          <p>{description}</p>
          {onEnterWithCode && !guestMode && !onboarding ? <button type="button" className="space-lobby__code-hint" onClick={scrollToEntryCode}>
            <KeyRound size={14} aria-hidden />
            {bt(
              "초대 코드가 있으면 캐릭터를 고르지 않아도 아래 입장코드 칸에서 바로 들어갈 수 있어요.",
              "Have an invite code? You can skip the character setup and enter from the entry-code section below.",
            )}
          </button> : null}
        </header>

        {accessNotice ? <div className="space-lobby__access-notice" role={accessNotice.tone === "error" ? "alert" : "status"}
          data-tone={accessNotice.tone}>
          <p>{bt(accessNotice.ko, accessNotice.en)}</p>
          {onRetryAccess ? <button type="button" className={buttonClass({ variant: "outline" })} onClick={onRetryAccess}>
            {bt("다시 확인", "Check again")}
          </button> : null}
        </div> : null}

        {onboarding ? <ol className="space-lobby__onboarding-steps" aria-label={bt("시작 준비 상태", "Getting-ready status")}>
          {[
            { done: Boolean(normalizedNickname), label: bt("공개 닉네임", "Public nickname"), detail: normalizedNickname ?? bt("아직 입력 전", "Not entered yet") },
            { done: characterSelected, label: bt("캐릭터 선택", "Character choice"), detail: selectedCharacter ? bt(selectedCharacter.labelKo, selectedCharacter.labelEn) : bt("아직 선택 전", "Not chosen yet") },
            { done: canEnter, label: bt("시작 준비", "Ready to start"), detail: canEnter ? bt("바로 시작할 수 있어요", "You can start now") : bt("두 가지를 마치면 시작", "Finish both to start") },
          ].map((step, index) => <li key={step.label} data-done={step.done || undefined}>
            <span className="space-lobby__onboarding-step-icon" aria-hidden>{step.done ? <Check size={13} /> : index + 1}</span>
            <span className="space-lobby__onboarding-step-text"><strong>{step.label}</strong><small>{step.detail}</small></span>
          </li>)}
        </ol> : null}

        <label className="space-lobby__field" htmlFor="studio-virtual-nickname">
          <span className="space-lobby__field-label"><UserRound size={16} aria-hidden />{bt("공개 닉네임", "Public nickname")}
            <small>{Array.from(nickname).length}/{STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES}</small></span>
          <input
            id="studio-virtual-nickname"
            value={nickname}
            maxLength={STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES}
            autoComplete="nickname"
            inputMode="text"
            aria-invalid={nicknameInvalid}
            aria-describedby="studio-virtual-nickname-help"
            placeholder={bt("예: 희준 작가", "For example, Creator Kim")}
            onChange={(event) => onNickname(event.target.value)}
          />
          <small id="studio-virtual-nickname-help" data-invalid={nicknameInvalid || undefined}>
            {normalizedNickname
              ? bt("이 이름이 캐릭터 이름표와 팀원 목록에 표시돼요.", "This name appears on your character and in teammate lists.")
              : bt("2~16자의 한글·영문·숫자·공백을 사용할 수 있어요. 이메일은 공개되지 않아요.", "Use 2–16 letters, numbers or spaces. Email addresses are never shown publicly.")}
          </small>
        </label>

        {!guestMode ? <div className="space-lobby__picker">
          <StudioVirtualThemeCharacterPicker mode="all" artStyle={artStyle} avatarIndex={avatarIndex} onSelect={onAvatarIndex} />
        </div> : null}

        {!onboarding && !guestMode ? <details className="space-lobby__advanced" open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary>{personal ? bt("아트 스타일 설정", "Art style settings") : bt("아트 스타일·연결 고급 설정", "Advanced art and connection settings")}</summary>
          {advancedOpen ? <div className="space-lobby__advanced-body">
            <fieldset className="studio-vspace-art-style-picker space-lobby__art-styles">
              <legend>{bt("아트 스타일", "Art direction")}</legend>
              <p>{bt(
                "건물·가구·바닥의 작화를 선택해요. 내 캐릭터는 직접 고른 모습을 유지해요.",
                "Choose the art for buildings, furniture and floors. Your character keeps the look you chose.",
              )}</p>
              <div className="studio-vspace-art-style-grid">
                {STUDIO_VIRTUAL_ART_STYLES.map((style) => <button key={style.key} type="button" className="fx-press" data-art-style={style.key}
                  aria-pressed={artStyle === style.key} title={bt(style.descriptionKo, style.descriptionEn)}
                  onClick={() => onArtStyle?.(style.key)}>
                  <StudioVirtualExperienceArtPreview kind="landmarks" artStyle={style.key} frame={0} preserveAspectRatio="xMidYMid slice" />
                  <small>{bt(style.labelKo, style.labelEn)}</small>
                </button>)}
              </div>
            </fieldset>
            {!personal ? <Suspense fallback={<p role="status">{bt("연결 설정 불러오는 중…", "Loading connection settings…")}</p>}><StudioVirtualSpaceRtcPanel entryOnly /></Suspense> : null}
          </div> : null}
        </details> : null}

        <details className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-black text-fg [&::-webkit-details-marker]:hidden">
            {bt("입장 전 조작법 미리보기", "Preview controls before entering")}
            <span aria-hidden className="text-base leading-none text-fg-3">＋</span>
          </summary>
          <div className="border-t border-white/10 px-4 py-3">
            <ul className="flex flex-col gap-2 text-xs leading-5 text-fg-2">
              <li className="flex items-center gap-2"><strong className="w-14 shrink-0 text-fg">{bt("이동", "Move")}</strong><span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">WASD</kbd> · {bt("방향키 · 빈 공간 클릭 · 모바일 조이스틱", "arrow keys · click empty space · mobile joystick")}</span></li>
              <li className="flex items-center gap-2"><strong className="w-14 shrink-0 text-fg">{bt("상호작용", "Interact")}</strong><span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">X</kbd> · {bt("가까이 다가가 상호작용 · 모바일은 화면의 상호작용 버튼", "walk up close and interact · on-screen interact button on mobile")}</span></li>
              <li className="flex items-center gap-2"><strong className="w-14 shrink-0 text-fg">{bt("리액션", "Reactions")}</strong><span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">1</kbd>–<kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">9</kbd> · {bt("바로 리액션 보내기(Z는 춤) · 모바일은 도크의 리액션 버튼", "send a reaction instantly (Z to dance) · reaction button in the mobile dock")}</span></li>
            </ul>
            <p className="mt-2 text-[0.7rem] leading-5 text-fg-3">{bt("입장하면 3단계 미니 투어가 나타나요. 화면을 막지 않고, 직접 걷고·상호작용하고·리액션하면 다음 단계로 넘어가요. 언제든 건너뛸 수 있고, 다시 보지 않기로 저장하거나 ? 도움말에서 다시 볼 수 있어요.", "A 3-step mini tour appears after you enter. It never blocks the screen and advances as you walk, interact and react. Skip it anytime, choose not to see it again, or replay it from the ? help.")}</p>
          </div>
        </details>

        {resumeAvailable && resumePlace ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3" role="group"
          aria-label={bt("지난 위치에서 이어서 시작", "Resume where you left off")}>
          <p className="text-sm font-black text-fg">{bt("지난 위치에서 이어서 시작", "Resume where you left off")}</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">{bt(
            `지난번에는 ${resumePlace.labelKo}에 있었어요. 이어서 시작하면 그 자리에서, 처음부터 시작하면 이 공간의 시작 위치에서 출발해요.`,
            `Last time you were in ${resumePlace.labelEn}. Resume picks up in that spot; starting fresh begins at this space's start position.`,
          )}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass()} disabled={!canEnter} onClick={onResume}>{bt("이어서 시작", "Resume")}</button>
            <button type="button" className={buttonClass({ variant: "outline" })} disabled={!canEnter} onClick={onEnter}>{bt("처음부터 시작", "Start fresh")}</button>
          </div>
        </div> : null}

        <div className="space-lobby__actions">
          <Link href={backHref} className={buttonClass({ variant: "outline" })}>{resolvedBackLabel}</Link>
          {resumeAvailable ? null : <button type="button" className={buttonClass()} disabled={!canEnter} onClick={onEnter}>{enterLabel}</button>}
        </div>
        <p className="space-lobby__note" role={!canEnter ? "status" : undefined}>{note}</p>

        {/* 입장코드는 닉네임 입장의 대체 경로라 기본 행동 아래에 둔다. 첫 화면의 주인공은 닉네임+입장 버튼이다. */}
        {onEnterWithCode ? <div className="space-lobby__entry-code">
          <StudioVirtualSpaceEntryCodePanel onEnterWithCode={onEnterWithCode} initialCode={initialEntryCode} />
        </div> : null}
      </RevealOnScroll>
    </div>
  </div>;
}
