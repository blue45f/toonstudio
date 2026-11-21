import {
  Hand,
  Languages,
  Mic,
  MicOff,
  MonitorUp,
  SendHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  PLAZA_LANGUAGE_CODES,
  PLAZA_LANGUAGE_METADATA,
  QUICK_STUDIO_PHRASE_KEYS,
  type PlazaChatMessage,
  type PlazaLanguageCode,
  type VoiceSessionState,
} from "./realtime-meeting-voice-chat-engine";

export interface StudioGlobalPlazaVoiceChatDockProps {
  readonly voice: VoiceSessionState;
  readonly messages: readonly PlazaChatMessage[];
  readonly viewerLang: PlazaLanguageCode;
  readonly composerLang: PlazaLanguageCode;
  readonly onChangeViewerLang: (lang: PlazaLanguageCode) => void;
  readonly onChangeComposerLang: (lang: PlazaLanguageCode) => void;
  readonly onToggleMute: () => void;
  readonly onToggleHandRaise: () => void;
  readonly onToggleScreenShare: () => void;
  readonly onTypingChange: (isTyping: boolean) => void;
  readonly onSendMessage: (text: string) => void;
}

export function StudioGlobalPlazaVoiceChatDock({
  voice,
  messages,
  viewerLang,
  composerLang,
  onChangeViewerLang,
  onChangeComposerLang,
  onToggleMute,
  onToggleHandRaise,
  onToggleScreenShare,
  onTypingChange,
  onSendMessage,
}: StudioGlobalPlazaVoiceChatDockProps) {
  const [draft, setDraft] = useState("");
  const isFocusDnd = voice.presenceMode === "focus-dnd";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = draft.trim();
    if (!cleaned) return;
    onSendMessage(cleaned);
    setDraft("");
    onTypingChange(false);
  };

  return (
    <aside className="gpp-card space-y-3" aria-label="회의실 음성 및 6개국어 실시간 번역 채팅" data-testid="gpp-voice-chat-dock">
      {/* 회의실 / 근접 음성 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-fg">실시간 회의실 음성 · 6개국어 자동 번역</h3>
          <p className="text-xs text-fg-2" data-testid="gpp-voice-channel-label">
            채널: {voice.activeRoomNameKo} ({voice.activeChannelId}) ·{" "}
            {voice.transportMode === "webrtc-live" ? "WebRTC 실시간" : "무과금 오프라인 폴백 (₩0)"}
          </p>
        </div>
        <span
          className="gpp-pill"
          data-tone={isFocusDnd ? "warn" : "good"}
          data-testid="gpp-voice-connection-badge"
        >
          <span className="gpp-pill-dot" />
          {isFocusDnd ? "방해 금지 (음성 차단)" : "음성 연결됨"}
        </span>
      </div>

      {/* 포커스 타임 격리 안내 */}
      {isFocusDnd ? (
        <div className="gpp-focus-banner text-xs" role="status" data-testid="gpp-voice-dnd-notice">
          <p className="font-bold text-fg">집중 작업 모드 활성화 — 광장 알림·군중 소음 차단 중</p>
          <p className="mt-0.5 text-fg-2">
            캔버스 작화 중 외부 음성과 알림이 침투하지 않습니다. 상단에서 광장 오픈 모드로 전환하면 회의실 음성에 즉시 재합류합니다.
          </p>
        </div>
      ) : null}

      {/* 음성 제어 바 */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="음성 회의 제어">
        <button
          type="button"
          className="gpp-btn"
          data-variant={voice.muted ? "danger" : "good"}
          aria-pressed={voice.muted}
          data-testid="gpp-voice-mute-btn"
          onClick={onToggleMute}
        >
          {voice.muted ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
          <span>{voice.muted ? "음소거 중" : "마이크 켜짐"}</span>
        </button>

        <button
          type="button"
          className="gpp-btn"
          data-variant={voice.handRaised ? "warn" : undefined}
          aria-pressed={voice.handRaised}
          data-testid="gpp-voice-hand-btn"
          onClick={onToggleHandRaise}
        >
          <Hand className="size-4" aria-hidden="true" />
          <span>{voice.handRaised ? "손들기 활성" : "손들기"}</span>
        </button>

        <button
          type="button"
          className="gpp-btn"
          data-variant={voice.screenSharing ? "primary" : undefined}
          aria-pressed={voice.screenSharing}
          data-testid="gpp-voice-share-btn"
          onClick={onToggleScreenShare}
        >
          <MonitorUp className="size-4" aria-hidden="true" />
          <span>{voice.screenSharing ? "화면 공유 중" : "캔버스 화면 공유"}</span>
        </button>
      </div>

      {/* 참여자별 방음 격리 / 근접 감쇠 미터 */}
      <div className="space-y-1.5 rounded-xl border border-line bg-canvas p-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-fg-2">
          <span>회의실 · 근접 오디오 감쇠 상태</span>
          <span className="gpp-num">참여자 {voice.participants.length}명</span>
        </div>
        <ul className="space-y-1.5">
          {voice.participants.map((peer) => {
            const gainPct = Math.round(peer.effectiveGain * 100);
            return (
              <li
                key={peer.id}
                className="flex items-center justify-between gap-2 text-xs"
                data-testid={`gpp-voice-peer-${peer.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {gainPct > 0 ? (
                      <Volume2 className="size-3.5 shrink-0 text-good" aria-hidden="true" />
                    ) : (
                      <VolumeX className="size-3.5 shrink-0 text-fg-3" aria-hidden="true" />
                    )}
                    <span className="truncate font-semibold text-fg">{peer.name}</span>
                    <span className="text-fg-3">[{PLAZA_LANGUAGE_METADATA[peer.lang].badge}]</span>
                    {peer.handRaised ? <span className="text-warn">✋</span> : null}
                  </div>
                  <p className="truncate text-fg-2">{peer.acousticReasonKo}</p>
                </div>
                <div className="w-20 shrink-0 text-right">
                  <span className="gpp-num font-bold text-fg">{gainPct}%</span>
                  <div className="gpp-gain-track mt-0.5">
                    <div className="gpp-gain-fill" style={{ width: `${gainPct}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 6개국어 번역 표시/작성 언어 선택 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
          <span className="inline-flex items-center gap-1 text-fg-2">
            <Languages className="size-3.5 text-accent" aria-hidden="true" />
            자동 번역 표시 언어
          </span>
          <select
            aria-label="자동 번역 표시 언어"
            data-testid="gpp-viewer-lang-select"
            value={viewerLang}
            onChange={(event) => onChangeViewerLang(event.target.value as PlazaLanguageCode)}
            className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg"
          >
            {PLAZA_LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {PLAZA_LANGUAGE_METADATA[code].labelKo} ({PLAZA_LANGUAGE_METADATA[code].nativeLabel})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
          <span className="text-fg-2">내 입력 언어</span>
          <select
            aria-label="내 입력 언어"
            data-testid="gpp-composer-lang-select"
            value={composerLang}
            onChange={(event) => onChangeComposerLang(event.target.value as PlazaLanguageCode)}
            className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg"
          >
            {PLAZA_LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {PLAZA_LANGUAGE_METADATA[code].labelKo} ({PLAZA_LANGUAGE_METADATA[code].badge})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 실무 핵심 표현 원클릭 입력 칩 */}
      <div className="flex flex-wrap gap-1.5" aria-label="웹툰 실무 자주 쓰는 표현">
        {QUICK_STUDIO_PHRASE_KEYS.map((phrase) => (
          <button
            key={phrase}
            type="button"
            className="gpp-chip-btn text-xs"
            onClick={() => onSendMessage(phrase)}
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* 실시간 번역 채팅 피드 (원문 + 번역문 동시 표시) */}
      <div
        className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-line bg-canvas p-2.5"
        role="log"
        aria-live="polite"
        data-testid="gpp-chat-feed"
      >
        {messages.map((msg) => {
          const translated = msg.translations[viewerLang] ?? msg.originalText;
          const isSameLang = msg.senderLang === viewerLang;
          return (
            <article key={msg.id} className="rounded-lg border border-line bg-card p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-bold text-fg">
                  {msg.senderName}{" "}
                  <span className="font-normal text-fg-3">
                    [{PLAZA_LANGUAGE_METADATA[msg.senderLang].badge}]
                  </span>
                </span>
                {msg.matchedGlossaryIds.length > 0 ? (
                  <span className="gpp-pill" data-tone="accent">
                    웹툰 용어집 {msg.matchedGlossaryIds.length}건 정확 매칭
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-medium text-fg">{translated}</p>
              {!isSameLang ? (
                <p className="mt-1 border-t border-line pt-1 text-fg-2">
                  원문 ({PLAZA_LANGUAGE_METADATA[msg.senderLang].badge}): {msg.originalText}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {voice.typingUserIds.length > 0 ? (
        <p className="text-xs text-fg-2" data-testid="gpp-typing-indicator">
          입력 중: {voice.typingUserIds.join(", ")}
        </p>
      ) : null}

      {/* 메시지 입력 폼 */}
      <form className="flex items-center gap-2" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            const nextVal = event.target.value;
            setDraft(nextVal);
            onTypingChange(nextVal.trim().length > 0);
          }}
          placeholder="선화 20컷 마감, 채색 톤 통일, 단가 협의 등을 입력하세요..."
          aria-label="실시간 다국어 채팅 입력"
          data-testid="gpp-chat-input"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-xs text-fg"
        />
        <button
          type="submit"
          className="gpp-btn"
          data-variant="primary"
          data-testid="gpp-chat-send-btn"
        >
          <SendHorizontal className="size-4" aria-hidden="true" />
          <span>전송</span>
        </button>
      </form>
    </aside>
  );
}
