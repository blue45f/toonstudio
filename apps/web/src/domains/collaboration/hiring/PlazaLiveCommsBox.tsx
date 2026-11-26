import { ArrowUpRight, MessageSquare, Radio, Send } from "lucide-react";
import { useEffect, useState } from "react";

import {
  studioEcosystemClient,
  type PlazaAvailabilityMode,
  type PlazaLiveMessageItem,
} from "@/platform/studio-ecosystem-client";
import type { EcosystemStreamEvent } from "@/platform/use-studio-ecosystem-stream";

const SEED_MESSAGES: readonly PlazaLiveMessageItem[] = [
  {
    id: "seed-1",
    partyId: "party-gate-01",
    senderName: "스튜디오 크로니클 PD",
    roleLabel: "파티장",
    text: "오늘 밤 11시까지 48화 액션 12컷 선화 대타 가능한 분 계신가요? .clip 원본 그대로 넘겨드립니다.",
    createdAt: "2026-11-26T06:00:00.000Z",
  },
  {
    id: "seed-2",
    partyId: "party-gate-01",
    senderName: "펜선장인_루나",
    roleLabel: "선화·펜선",
    text: "클튜 EX 작업 중이라 바로 투입 가능합니다! 브러시 가이드만 공유 검수방에 올려주세요.",
    createdAt: "2026-11-26T06:02:00.000Z",
  },
];

const AVAILABILITY_OPTIONS: readonly {
  readonly id: PlazaAvailabilityMode;
  readonly label: string;
}[] = [
  { id: "urgent-sub-ready", label: "즉시 대타 가능" },
  { id: "online-ready", label: "일정 조율 가능" },
  { id: "busy", label: "마감 집중" },
];

export interface PlazaLiveCommsBoxProps {
  readonly activePartyId: string;
  readonly activePartyTitle: string;
  readonly activeRoleCode: string;
  readonly activeRoleLabel: string;
  readonly handoffReviewPath: string | null;
  readonly latestMessageEvent?: EcosystemStreamEvent;
}

export function PlazaLiveCommsBox({
  activePartyId,
  activePartyTitle,
  activeRoleCode,
  activeRoleLabel,
  handoffReviewPath,
  latestMessageEvent,
}: PlazaLiveCommsBoxProps) {
  const [channelScope, setChannelScope] = useState<"party" | "global">("party");
  const [availability, setAvailability] =
    useState<PlazaAvailabilityMode>("urgent-sub-ready");
  const [messages, setMessages] =
    useState<readonly PlazaLiveMessageItem[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");
  const [senderName, setSenderName] = useState("내 스튜디오·어시");
  const [presenceNotice, setPresenceNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const targetParty = channelScope === "party" ? activePartyId : undefined;
    void studioEcosystemClient
      .listPlazaMessages(targetParty)
      .then((res) => {
        if (!active || !Array.isArray(res?.items) || res.items.length === 0) {
          return;
        }
        setMessages(res.items);
      })
      .catch(() => {
        // 오프라인/로컬 미리보기에서는 기본 광장 대화 시드를 유지한다.
      });
    return () => {
      active = false;
    };
  }, [activePartyId, channelScope, latestMessageEvent?.id]);

  const handleToggleAvailability = (next: PlazaAvailabilityMode) => {
    setAvailability(next);
    const label =
      AVAILABILITY_OPTIONS.find((item) => item.id === next)?.label ?? next;
    setPresenceNotice(`광장 대기 상태를 [${label}]으로 전환했습니다.`);
    void studioEcosystemClient
      .upsertPlazaPresence({
        userId: "local-plaza-creator",
        nickname: senderName.trim() || "광장 어시스턴트",
        roleCode: activeRoleCode,
        availability: next,
      })
      .catch(() => {
        // 오프라인 환경에서는 로컬 상태 전환만 유지한다.
      });
  };

  const handleSendMessage = () => {
    const text = draft.trim();
    if (text.length < 2) return;
    const targetPartyId = channelScope === "party" ? activePartyId : null;
    const optimistic: PlazaLiveMessageItem = {
      id: `local-msg-${Date.now().toString(36)}`,
      partyId: targetPartyId,
      senderName: senderName.trim() || "광장 창작자",
      roleLabel: activeRoleLabel,
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [optimistic, ...prev].slice(0, 30));
    setDraft("");
    void studioEcosystemClient
      .postPlazaMessage({
        partyId: targetPartyId,
        senderName: optimistic.senderName,
        roleLabel: activeRoleLabel,
        text,
      })
      .catch(() => {
        // 오프라인 환경에서는 낙관적 메시지를 유지한다.
      });
  };

  const visibleMessages =
    channelScope === "party"
      ? messages.filter((m) => m.partyId === activePartyId || m.partyId === null)
      : messages;

  return (
    <div
      data-testid="plaza-live-comms-box"
      className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare
            className="size-4 shrink-0 text-accent"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h4 className="text-xs font-semibold text-fg">
            실시간 구인 광장 라운지 · 작업 조건 조율 (중개 수수료 0%)
          </h4>
        </div>
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label="내 광장 가용 상태"
        >
          <Radio
            className="mr-1 size-3.5 shrink-0 text-good"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {AVAILABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleToggleAvailability(opt.id)}
              aria-pressed={availability === opt.id}
              className={`min-h-11 rounded-md border px-2.5 text-[11px] transition-colors duration-150 sm:min-h-8 ${
                availability === opt.id
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-panel text-fg-2 hover:text-fg"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-[1.5] text-fg-3 [word-break:keep-all]">
        광장 구인·실시간 조율·포트폴리오 매칭은 중개 수수료 없이 무료로 제공되며 외주 계약은 당사자 간 직접 체결합니다. 파티 합류 후 공유 검수·원본 인계 방 개설 시 보너스 크레딧(+20C)이 적립됩니다.
      </p>

      {handoffReviewPath ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/35 bg-accent-soft/50 px-3 py-2.5 text-xs">
          <span className="font-medium text-fg">
            파티 슬롯 매칭 완료 · `.clip/.psd` 공유 검수·인계 방이 준비되었습니다.
          </span>
          <a
            href={handoffReviewPath}
            data-testid="plaza-handoff-room-link"
            className="inline-flex min-h-11 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-8"
          >
            공유 검수방 열기
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setChannelScope("party")}
          aria-pressed={channelScope === "party"}
          className={`min-h-11 rounded-md border px-2.5 text-xs sm:min-h-8 ${
            channelScope === "party"
              ? "border-accent bg-accent-soft font-medium text-accent"
              : "border-line bg-panel text-fg-2"
          }`}
        >
          현재 파티 조율 ({activePartyTitle.slice(0, 16)})
        </button>
        <button
          type="button"
          onClick={() => setChannelScope("global")}
          aria-pressed={channelScope === "global"}
          className={`min-h-11 rounded-md border px-2.5 text-xs sm:min-h-8 ${
            channelScope === "global"
              ? "border-accent bg-accent-soft font-medium text-accent"
              : "border-line bg-panel text-fg-2"
          }`}
        >
          전체 광장 채널
        </button>
      </div>

      <ul
        aria-label="광장 실시간 대화 목록"
        className="max-h-44 space-y-1.5 overflow-y-auto overscroll-contain rounded-lg border border-line bg-panel p-2.5 text-xs"
      >
        {visibleMessages.slice(0, 8).map((msg) => (
          <li
            key={msg.id}
            className="rounded-md bg-card px-2.5 py-2 leading-[1.45]"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-fg">{msg.senderName}</span>
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {msg.roleLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
              {msg.text}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          aria-label="광장 대화 활동명"
          placeholder="활동명"
          className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg sm:min-h-9 sm:w-32"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          aria-label="광장 실시간 메시지 입력"
          placeholder="마감 시각, 작업 툴(.clip/.psd), 컷당 단가 조건을 바로 물어보세요"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9"
        />
        <button
          type="button"
          disabled={draft.trim().length < 2}
          data-testid="plaza-send-message-btn"
          onClick={handleSendMessage}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:opacity-45 sm:min-h-9"
        >
          <Send className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          전송
        </button>
      </div>

      {presenceNotice ? (
        <p className="text-[11px] text-good" role="status">
          {presenceNotice}
        </p>
      ) : null}
    </div>
  );
}
