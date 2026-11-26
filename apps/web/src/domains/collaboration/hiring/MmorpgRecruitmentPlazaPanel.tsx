import { ShieldCheck, Swords, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";
import { useStudioEcosystemStream } from "@/platform/use-studio-ecosystem-stream";

import { PlazaLiveCommsBox } from "./PlazaLiveCommsBox";
import {
  DETAILED_WEBTOON_ROLES,
  assignAvatarToPartySlot,
  getDetailedWebtoonRole,
  matchPlazaAvatarsForSlot,
  type PlazaAssistantAvatar,
  type PlazaRecruitmentParty,
  type RoleGuildCategory,
} from "./mmorpg-plaza-matching";

export interface MmorpgRecruitmentPlazaPanelProps {
  readonly initialParties?: readonly PlazaRecruitmentParty[];
  readonly initialAvatars?: readonly PlazaAssistantAvatar[];
  readonly onInviteMatchedAvatar?: (partyId: string, slotId: string, avatarId: string) => void;
}

const DEFAULT_PARTIES: readonly PlazaRecruitmentParty[] = [
  {
    partyId: "party-gate-01",
    title: "[긴급] 헌터 액션 주간연재 3인 파티 모집",
    studioName: "스튜디오 크로니클",
    genre: "modern-fantasy",
    zone: "urgent-sub-gate",
    createdAt: "2026-11-19T04:30:00.000Z",
    slots: [
      { slotId: "s-line", roleCode: "001.003", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 18000, urgent: true },
      { slotId: "s-vfx", roleCode: "001.011", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 15000, urgent: false },
      { slotId: "s-bg3d", roleCode: "001.021", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 22000, urgent: false },
    ],
  },
];

const DEFAULT_AVATARS: readonly PlazaAssistantAvatar[] = [
  {
    id: "av-1",
    nickname: "펜선장인_루나",
    roleCode: "001.003",
    secondaryRoleCodes: ["001.027"],
    tier: "veteran",
    status: "urgent-sub-ready",
    preferredGenres: ["modern-fantasy", "action-shonen"],
    tools: ["clip-studio-ex"],
    cutRateKrw: 17000,
    weeklyCapacityCuts: 65,
    responseMinutes: 6,
    completedEpisodes: 112,
    urgentSubAvailable: true,
  },
  {
    id: "av-2",
    nickname: "아케인VFX_카이",
    roleCode: "001.011",
    secondaryRoleCodes: ["001.017", "001.019"],
    tier: "pro",
    status: "online-ready",
    preferredGenres: ["modern-fantasy", "romance-fantasy"],
    tools: ["clip-studio-ex", "photoshop"],
    cutRateKrw: 14500,
    weeklyCapacityCuts: 70,
    responseMinutes: 10,
    completedEpisodes: 54,
    urgentSubAvailable: true,
  },
  {
    id: "av-3",
    nickname: "블렌더건축_하율",
    roleCode: "001.021",
    secondaryRoleCodes: ["001.008", "001.022"],
    tier: "master",
    status: "online-ready",
    preferredGenres: ["modern-fantasy", "romance-fantasy"],
    tools: ["blender", "sketchup", "snaptoon"],
    cutRateKrw: 21000,
    weeklyCapacityCuts: 50,
    responseMinutes: 12,
    completedEpisodes: 140,
    urgentSubAvailable: false,
  },
];

const GUILD_LABELS: Readonly<Record<RoleGuildCategory | "all", string>> = {
  all: "전체 직군 (28)",
  "story-directing": "글·콘티·연출",
  "character-art": "선화·캐릭터·크리처",
  "coloring-vfx": "채색·원꾸·이펙트",
  "bg3d-rigging": "3D배경·VRM·리깅",
  "lettering-global": "식자·현지화·QC",
  "production-ip": "PD·IP확장·영상",
};

export function MmorpgRecruitmentPlazaPanel({
  initialParties = DEFAULT_PARTIES,
  initialAvatars = DEFAULT_AVATARS,
  onInviteMatchedAvatar,
}: MmorpgRecruitmentPlazaPanelProps) {
  const [parties, setParties] = useState<readonly PlazaRecruitmentParty[]>(initialParties);
  const [activePartyId, setActivePartyId] = useState<string>(initialParties[0].partyId);
  const party = parties.find((p) => p.partyId === activePartyId) ?? parties[0];
  const [activeSlotId, setActiveSlotId] = useState<string>(initialParties[0].slots[0].slotId);
  const [guildFilter, setGuildFilter] = useState<RoleGuildCategory | "all">("all");
  const [newPartyTitle, setNewPartyTitle] = useState("");
  const [newPartyRole, setNewPartyRole] = useState(DETAILED_WEBTOON_ROLES[2].code);
  const [notice, setNotice] = useState<string | null>(null);
  const [handoffReviewPath, setHandoffReviewPath] = useState<string | null>(null);
  const stream = useStudioEcosystemStream(true);
  const latestPlazaEventId = useMemo(
    () => stream.events.find((e) => e.type === "plaza.party_created" || e.type === "plaza.slot_assigned")?.id ?? null,
    [stream.events],
  );
  const latestMessageEvent = useMemo(
    () => stream.events.find((e) => e.type === "plaza.message_posted"),
    [stream.events],
  );

  useEffect(() => {
    let active = true;
    void studioEcosystemClient
      .listPlazaParties()
      .then((res) => {
        if (!active || !Array.isArray(res?.parties) || res.parties.length === 0) return;
        const remoteParties = (res.parties as Partial<PlazaRecruitmentParty>[])
          .filter((item): item is PlazaRecruitmentParty => Boolean(item?.partyId && item?.title && Array.isArray(item.slots)))
          .map((item) => ({
            ...item,
            zone: item.zone ?? "main-square",
            createdAt: item.createdAt ?? new Date().toISOString(),
          }));
        if (remoteParties.length === 0) return;
        setParties((prev) => {
          const existingIds = new Set(remoteParties.map((p) => p.partyId));
          return [...remoteParties, ...prev.filter((p) => !existingIds.has(p.partyId))];
        });
      })
      .catch(() => {
        // 오프라인/로컬 미리보기 환경에서는 기본 파티 목록을 유지한다.
      });
    return () => {
      active = false;
    };
  }, [latestPlazaEventId]);

  const activeSlot = party.slots.find((s) => s.slotId === activeSlotId) ?? party.slots[0];
  const matches = useMemo(
    () => matchPlazaAvatarsForSlot(party, activeSlot, initialAvatars),
    [party, activeSlot, initialAvatars],
  );
  const filteredRoles = useMemo(
    () =>
      guildFilter === "all"
        ? DETAILED_WEBTOON_ROLES
        : DETAILED_WEBTOON_ROLES.filter((r) => r.guild === guildFilter),
    [guildFilter],
  );

  const handleCreateParty = () => {
    const clean = newPartyTitle.trim();
    if (clean.length < 2) return;
    const slotId = `slot-${Date.now().toString(36)}`;
    const created: PlazaRecruitmentParty = {
      partyId: `party-${parties.length + 1}-${Date.now().toString(36)}`,
      title: clean,
      studioName: "내 스튜디오",
      genre: "modern-fantasy",
      zone: "main-square",
      createdAt: new Date().toISOString(),
      slots: [
        {
          slotId,
          roleCode: newPartyRole,
          requiredCount: 1,
          filledAvatarIds: [],
          budgetPerCutKrw: 18000,
          urgent: false,
        },
      ],
    };
    setParties((prev) => [created, ...prev]);
    setActivePartyId(created.partyId);
    setActiveSlotId(slotId);
    setNewPartyTitle("");
    setNotice(`새 파티 [${clean}]를 광장에 등록했습니다.`);
    void studioEcosystemClient
      .createPlazaParty({
        title: clean,
        studioName: "내 스튜디오",
        genre: "modern-fantasy",
        roleCode: newPartyRole,
        budgetPerCutKrw: 18000,
      })
      .catch(() => {
        // 오프라인/로컬 환경에서는 낙관적 파티 상태를 유지한다.
      });
  };

  const handleInvite = (avatarId: string, nickname: string) => {
    const defaultHandoffPath = `/collaborate/workspace?party=${encodeURIComponent(party.partyId)}&slot=${encodeURIComponent(activeSlot.slotId)}`;
    setParties((prev) =>
      prev.map((item) =>
        item.partyId === party.partyId
          ? assignAvatarToPartySlot(item, activeSlot.slotId, avatarId)
          : item,
      ),
    );
    setHandoffReviewPath(defaultHandoffPath);
    onInviteMatchedAvatar?.(party.partyId, activeSlot.slotId, avatarId);
    setNotice(`${nickname} 님을 [${getDetailedWebtoonRole(activeSlot.roleCode).labelKo}] 슬롯에 실시간 매칭했습니다.`);
    void studioEcosystemClient
      .assignPlazaSlot(party.partyId, activeSlot.slotId, avatarId)
      .then((res) => {
        if (res?.handoffReviewPath) {
          setHandoffReviewPath(res.handoffReviewPath);
        }
      })
      .catch(() => {
        // 오프라인/로컬 미리보기 환경에서는 낙관적 매칭 상태를 유지한다.
      });
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [overflow-wrap:break-word] [word-break:keep-all] sm:p-5"
      aria-label="MMORPG 구인 광장 실시간 매칭"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Swords className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg">
            MMORPG 구인 광장 · 실시간 어시 매칭
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 text-xs tabular-nums text-fg-2">
          <Users className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
          광장 대기 {initialAvatars.length}명 · {DETAILED_WEBTOON_ROLES.length}개 직군 ·{" "}
          {stream.status === "connected" ? "실시간" : "로컬"}
        </span>
      </header>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={newPartyTitle}
          onChange={(e) => setNewPartyTitle(e.target.value)}
          placeholder="새 구인 파티 제목 (예: 로판 원꾸 긴급 모집)"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9"
        />
        <select
          aria-label="모집 직군 선택"
          value={newPartyRole}
          onChange={(e) => setNewPartyRole(e.target.value as typeof newPartyRole)}
          className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9"
        >
          {DETAILED_WEBTOON_ROLES.map((role) => (
            <option key={role.code} value={role.code}>
              {role.labelKo}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCreateParty}
          className="min-h-11 w-full rounded-lg bg-accent px-4 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-9 sm:w-auto"
        >
          파티 개설
        </button>
      </div>

      {parties.length > 1 && (
        <div
          className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0"
          role="tablist"
          aria-label="모집 중인 파티 선택"
        >
          {parties.map((item) => (
            <button
              key={item.partyId}
              type="button"
              role="tab"
              aria-selected={item.partyId === party.partyId}
              onClick={() => {
                setActivePartyId(item.partyId);
                setActiveSlotId(item.slots[0]?.slotId ?? "");
              }}
              className={`min-h-11 max-w-60 shrink-0 snap-start truncate rounded-lg border px-3 text-xs transition-colors duration-150 sm:min-h-8 ${
                item.partyId === party.partyId
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-card p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-fg-3">{party.studioName}</p>
            <h4 className="text-sm font-medium leading-[1.45] text-fg">{party.title}</h4>
          </div>
          <span className="rounded-md border border-accent/35 bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            실시간 파티 모집 중
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {party.slots.map((slot) => {
            const meta = getDetailedWebtoonRole(slot.roleCode);
            const selected = slot.slotId === activeSlot.slotId;
            return (
              <button
                key={slot.slotId}
                type="button"
                onClick={() => setActiveSlotId(slot.slotId)}
                className={`min-h-14 rounded-lg border p-3 text-left text-xs transition-colors duration-150 ${
                  selected ? "border-accent bg-accent-soft/60" : "border-line bg-panel hover:border-accent/45"
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-medium text-fg">
                  <span className="truncate">{meta.labelKo}</span>
                  <span className="shrink-0 tabular-nums">
                    {slot.filledAvatarIds.length}/{slot.requiredCount}
                  </span>
                </div>
                <p className="mt-1 text-xs tabular-nums text-fg-3">
                  컷당 {slot.budgetPerCutKrw.toLocaleString("ko-KR")}원{slot.urgent ? " · 긴급 대타" : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-fg-2">
          <Users className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
          선택 슬롯 실시간 추천 매칭 ({getDetailedWebtoonRole(activeSlot.roleCode).labelKo})
        </h4>
        <ul className="space-y-2">
          {matches.map((match) => {
            const alreadyAssigned = activeSlot.filledAvatarIds.includes(match.avatarId);
            return (
              <li
                key={match.avatarId}
                className="flex flex-col gap-2.5 rounded-lg border border-line bg-card px-3.5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{match.nickname}</span>
                    <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium tabular-nums text-accent">
                      적합도 {match.score}점
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-[1.5] text-fg-3">
                    {match.compatible ? match.highlightsKo.join(" · ") : match.blockersKo.join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!match.compatible || alreadyAssigned}
                  onClick={() => handleInvite(match.avatarId, match.nickname)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:opacity-45 sm:min-h-9 sm:w-auto"
                >
                  <UserPlus className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  {alreadyAssigned ? "파티 합류됨" : "즉시 파티 초대"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <PlazaLiveCommsBox
        activePartyId={party.partyId}
        activePartyTitle={party.title}
        activeRoleCode={activeSlot.roleCode}
        activeRoleLabel={getDetailedWebtoonRole(activeSlot.roleCode).labelKo}
        handoffReviewPath={handoffReviewPath}
        latestMessageEvent={latestMessageEvent}
      />

      <div className="flex flex-col gap-2.5 border-t border-line pt-3">
        <div className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
          {(Object.keys(GUILD_LABELS) as (RoleGuildCategory | "all")[]).map((guild) => (
            <button
              key={guild}
              type="button"
              onClick={() => setGuildFilter(guild)}
              className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 text-xs transition-colors duration-150 sm:min-h-8 ${
                guildFilter === guild
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {GUILD_LABELS[guild]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRoles.slice(0, 9).map((role) => (
            <div key={role.code} className="rounded-lg border border-line bg-card px-3 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-fg">
                <ShieldCheck className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                <span className="truncate">{role.labelKo}</span>
              </div>
              <p className="mt-1 leading-[1.45] text-fg-3">{role.summaryKo}</p>
            </div>
          ))}
        </div>
      </div>

      {notice && (
        <p className="text-xs leading-[1.45] text-good" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
