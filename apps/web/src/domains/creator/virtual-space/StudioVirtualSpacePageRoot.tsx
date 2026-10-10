import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { StudioLiveCollaborationProvider } from "../live/StudioLiveCollaborationProvider";
import { useStudioLiveTransportAuth } from "../live/use-studio-live-transport-auth";
import { readStudioVirtualArtStyle, writeStudioVirtualArtStyle, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { resolveStudioVirtualBuiltinWorld } from "./studio-virtual-space-campus-world";
import { parseCodeInviteFragment } from "./studio-virtual-space-entry-code";
import {
  normalizeStudioVirtualSpaceNickname,
  readStudioVirtualSpaceEntryPreference,
  studioVirtualSpaceNicknameFromAccount,
  validStudioVirtualSpaceAvatarIndex,
  writeStudioVirtualSpaceEntryPreference,
} from "./studio-virtual-space-entry-preference";
import {
  clearStudioGuestSession,
  createStudioGuestSession,
  parseStudioGuestInviteFragment,
  readStudioGuestSession,
  writeStudioGuestSession,
  type StudioGuestSession,
} from "./studio-virtual-space-guest-session";
import {
  clearStudioVirtualSpaceLastPosition,
  readStudioVirtualSpaceLastPosition,
  studioVirtualSpaceResumeDecision,
} from "./studio-virtual-space-last-position";
import {
  readStudioVirtualPlaceId,
  studioVirtualPlaceById,
  studioVirtualPlaceSearch,
} from "./studio-virtual-space-place-world";
import {
  clearStudioVirtualSpaceSessionPoint,
  studioVirtualSpacePositionScope,
  writeStudioVirtualSpaceSessionPoint,
} from "./studio-virtual-space-session-position";
import { isStudioSpatialInviteToken } from "./studio-spatial-invite-context";
import { verifyStudioSpaceEntryCode, verifyStudioSpatialInvite } from "./studio-virtual-space-access-client";
import { StudioGodotSpaceEmbed } from "./StudioGodotSpaceEmbed";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import { STUDIO_SHARED_CURSOR_PALETTE } from "./studio-virtual-space-shared-cursors";
import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";
import type { StudioEntryCodeEntryResult } from "./StudioVirtualSpaceEntryCodePanel";
import { VirtualSpaceExperience } from "./StudioVirtualSpacePage";
import { useStudioWorldPublication } from "./world-publication/use-studio-world-publication";

function decodeProjectId(projectId: string): string {
  try {
    return decodeURIComponent(projectId);
  } catch {
    return projectId;
  }
}

function validProjectId(projectId: string): boolean {
  return Boolean(projectId && projectId !== "." && projectId !== ".." && projectId.length <= 160 && !projectId.includes("\\"));
}

/** 게스트가 제시한 자격. 링크로 막 도착한 자격(fragment)과 이전에 검증돼 저장된 자격(stored)을 구분한다. */
interface SpaceAccessCredential {
  readonly source: "fragment" | "stored";
  readonly kind: "invite" | "code";
  readonly value: string;
}

/** 서버가 거절한 자격의 사유별 로비 안내(F-B06-1: 조용한 로비 착지 금지). */
const ACCESS_DENIAL_COPY: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  "not-found": {
    ko: "확인할 수 없는 초대예요. 링크가 올바른지, 초대를 보낸 사람에게 다시 확인해 주세요.",
    en: "We couldn't find this invitation. Check the link, or ask the sender to confirm it.",
  },
  expired: {
    ko: "만료된 초대예요. 보낸 사람에게 새 초대를 요청해 주세요.",
    en: "This invitation has expired. Ask the sender for a new one.",
  },
  revoked: {
    ko: "취소된 초대예요. 보낸 사람에게 확인해 주세요.",
    en: "This invitation was revoked. Please check with the sender.",
  },
  consumed: {
    ko: "이미 사용된 초대예요. 이미 팀에 참여했다면 로그인하면 바로 입장할 수 있어요.",
    en: "This invitation was already used. If you already joined the team, sign in to enter.",
  },
  "space-mismatch": {
    ko: "이 공간에 대한 초대가 아니에요. 링크가 올바른지 확인해 주세요.",
    en: "This invitation is for a different space. Please check the link.",
  },
  locked: {
    ko: "시도가 너무 많아 이 공간이 잠시 잠겼어요. 잠시 후 다시 시도해 주세요.",
    en: "Too many attempts — this space is briefly locked. Please try again shortly.",
  },
};

export function StudioVirtualSpacePage({ projectIdOverride, homeHeader, personal = false }: { readonly projectIdOverride?: string; readonly homeHeader?: ReactNode; readonly personal?: boolean } = {}) {
  const bt = useBilingual("StudioVirtualSpacePage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const decodedProjectId = projectIdOverride ?? decodeProjectId(projectId);
  const location = useLocation();
  const initialEntryPreference = useMemo(() => readStudioVirtualSpaceEntryPreference(), []);
  const [entryAvatarIndex, setEntryAvatarIndex] = useState(initialEntryPreference.avatarIndex);
  const [entryArtStyle, setEntryArtStyle] = useState<StudioVirtualArtStyleKey>(() => readStudioVirtualArtStyle());
  const [entryNickname, setEntryNickname] = useState(initialEntryPreference.nickname);
  const [entryOpen, setEntryOpen] = useState(() =>
    !initialEntryPreference.confirmed || new URLSearchParams(location.search).get("lobby") === "1",
  );
  const session = useSession();
  const guestInvite = useMemo(() => parseStudioGuestInviteFragment(location.hash), [location.hash]);
  // #code=XXXXXX 코드 초대도 같은 게스트 세션 흐름으로 태우되, 초대 토큰과
  // 마찬가지로 서버 검증(access 게이트)을 통과해야만 세션이 생긴다(F-B06-1).
  const codeInvite = useMemo(() => parseCodeInviteFragment(location.hash), [location.hash]);
  const [guestSession, setGuestSession] = useState<StudioGuestSession | null>(() => readStudioGuestSession());
  // 저장된 게스트 세션은 그 공간의 세션일 때만 이 페이지의 자격이 된다.
  const guestSessionForSpace = guestSession && guestSession.spaceId === decodedProjectId ? guestSession : null;
  const isGuest = !personal && session.ready && !session.data
    && (guestInvite.token !== null || codeInvite !== null || guestSessionForSpace !== null);
  // 자격 기반 입장 게이트(F-B06-1): 자격이 제시된 경우에만 서버로 검증한다.
  // 막 도착한 자격은 확인 불가(unavailable)여도 통과시키지 않고(fail-closed),
  // 저장된 자격은 발급 시점에 이미 검증됐으므로 확인 불가만으로 내쫓지 않는다.
  const accessCredential = useMemo<SpaceAccessCredential | null>(() => {
    if (guestInvite.token) return { source: "fragment", kind: "invite", value: guestInvite.token };
    if (codeInvite) return { source: "fragment", kind: "code", value: codeInvite };
    if (guestSessionForSpace) {
      return {
        source: "stored",
        kind: isStudioSpatialInviteToken(guestSessionForSpace.inviteToken) ? "invite" : "code",
        value: guestSessionForSpace.inviteToken,
      };
    }
    return null;
  }, [guestInvite.token, codeInvite, guestSessionForSpace]);
  const [accessGate, setAccessGate] = useState<"idle" | "checking" | "allowed" | "unavailable">("idle");
  const [accessDenial, setAccessDenial] = useState<string | null>(null);
  const [accessRetry, setAccessRetry] = useState(0);
  useEffect(() => {
    if (!entryOpen || personal || !session.ready || session.data || !accessCredential) {
      setAccessGate("idle");
      return;
    }
    let cancelled = false;
    setAccessGate("checking");
    setAccessDenial(null);
    const verification = accessCredential.kind === "invite"
      ? verifyStudioSpatialInvite(accessCredential.value, { kind: "project-space", projectId: decodedProjectId })
      : verifyStudioSpaceEntryCode(decodedProjectId, accessCredential.value);
    void verification.then((result) => {
      if (cancelled) return;
      if (result.status === "valid") {
        setAccessGate("allowed");
      } else if (result.status === "invalid") {
        setAccessGate("idle");
        setAccessDenial(result.reason);
        if (accessCredential.source === "stored") {
          // 서버가 거절한 저장 세션은 더 이상 자격이 아니다 — 지우되 사유는 로비에 남긴다.
          clearStudioGuestSession();
          setGuestSession(null);
        }
      } else {
        setAccessGate("unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessCredential, accessRetry, decodedProjectId, entryOpen, personal, session.data, session.ready]);
  const accessBlocked = Boolean(isGuest && accessCredential && (
    accessGate === "checking"
    || accessGate === "idle"
    || accessDenial !== null
    || (accessGate === "unavailable" && accessCredential.source === "fragment")
  ));
  const accessNotice = !isGuest || !accessCredential
    ? null
    : accessDenial !== null
      ? { tone: "error" as const, ...(ACCESS_DENIAL_COPY[accessDenial] ?? ACCESS_DENIAL_COPY["not-found"]) }
      : accessGate === "checking" || accessGate === "idle"
        ? { tone: "info" as const, ko: "초대 자격을 확인하고 있어요…", en: "Checking your invitation…" }
        : accessGate === "unavailable" && accessCredential.source === "fragment"
          ? {
              tone: "error" as const,
              ko: "초대 자격을 확인하지 못했어요. 연결 상태를 확인한 뒤 다시 확인해 주세요.",
              en: "We couldn't verify your invitation. Check your connection and try again.",
            }
          : null;
  const userId = session.data?.user.id ?? null;
  const accountNickname = studioVirtualSpaceNicknameFromAccount(session.data?.user.name);
  useEffect(() => {
    if (entryNickname.trim()) return;
    setEntryNickname(accountNickname ?? bt("크리에이터", "Creator"));
  }, [accountNickname, bt, entryNickname]);
  const publication = useStudioWorldPublication(decodedProjectId, userId, !entryOpen && !personal && session.ready && Boolean(userId)
    && validProjectId(decodedProjectId) && !/^(?:virtual-demo|draft|local)(?:$|[:_-])/u.test(decodedProjectId));
  const transportFactory = useStudioLiveTransportAuth({
    authReady: !entryOpen && session.ready && !personal,
    userId: personal ? null : userId,
  });
  const publicNickname = normalizeStudioVirtualSpaceNickname(entryNickname)
    ?? accountNickname
    ?? bt("게스트 크리에이터", "Guest creator");
  const participant = useMemo(() => {
    if (personal || !session.ready || !transportFactory) return null;
    return {
      displayName: publicNickname,
      role: session.data ? "editor" as const : "viewer" as const,
    };
  }, [personal, publicNickname, session.data, session.ready, transportFactory]);

  useDocumentTitle(`${personal ? bt("나의 스튜디오", "My studio") : bt("협업 스튜디오", "Collaboration Studio")} · ToonStudio`);

  // 위치 복원(W-2): 로그인 사용자의 마지막 위치 기록을 읽어 복원 방식을 정한다.
  const navigate = useNavigate();
  const [resumeChoiceMade, setResumeChoiceMade] = useState(false);
  const currentPlaceId = readStudioVirtualPlaceId(location.search, personal);
  const resumeRecord = !personal && session.ready && session.data
    ? readStudioVirtualSpaceLastPosition(decodedProjectId)
    : null;
  const resumeDecision = studioVirtualSpaceResumeDecision(resumeRecord, currentPlaceId);
  // 게이트는 입장 전에만 평가한다. 이미 들어간 뒤에는 장소가 바뀔 때마다
  // 직전 기록이 잠시 어긋나 보여도 로비로 되돌리지 않는다.
  const enteredRef = useRef(false);
  const resumeGate = resumeDecision === "ask" && !resumeChoiceMade && !enteredRef.current;
  if (!entryOpen && !resumeGate) enteredRef.current = true;
  // 같은 장소 복원은 묻지 않는다: Experience가 마운트되기 전, 렌더 단계에서 세션 위치로 심어 둔다.
  const seededResumeRef = useRef<string | null>(null);
  if (!personal && resumeRecord && resumeDecision === "silent") {
    const seedKey = `${resumeRecord.placeId}:${resumeRecord.point.x}:${resumeRecord.point.y}`;
    if (seededResumeRef.current !== seedKey) {
      seededResumeRef.current = seedKey;
      const targetWorld = resolveStudioVirtualBuiltinWorld(resumeRecord.placeId, personal);
      writeStudioVirtualSpaceSessionPoint(
        studioVirtualSpacePositionScope(decodedProjectId, false, targetWorld.positionPlaceId),
        resumeRecord.point,
      );
    }
  }
  const completeEntry = (resume: boolean) => {
    const resolvedNickname = normalizeStudioVirtualSpaceNickname(entryNickname);
    if (!resolvedNickname) return;
    // 자격이 제시된 게스트는 서버 검증을 통과하기 전에는 세션을 만들지 않는다(F-B06-1).
    if (accessBlocked) return;
    const inviteToken = guestInvite.token ?? codeInvite;
    if (isGuest && inviteToken) {
      const guest = createStudioGuestSession({
        token: inviteToken,
        spaceId: decodedProjectId,
        nickname: resolvedNickname,
        spawn: guestInvite.spawn,
      });
      writeStudioGuestSession(guest);
      setGuestSession(guest);
      setEntryNickname(resolvedNickname);
      setResumeChoiceMade(true);
      setEntryOpen(false);
      return;
    }
    if (!validStudioVirtualSpaceAvatarIndex(entryAvatarIndex)) return;
    if (resumeRecord && resume) {
      const targetWorld = resolveStudioVirtualBuiltinWorld(resumeRecord.placeId, personal);
      writeStudioVirtualSpaceSessionPoint(
        studioVirtualSpacePositionScope(decodedProjectId, false, targetWorld.positionPlaceId),
        resumeRecord.point,
      );
      if (resumeRecord.placeId !== currentPlaceId) {
        const nextSearch = new URLSearchParams(studioVirtualPlaceSearch(location.search, resumeRecord.placeId, personal));
        // 이어서 시작에서는 딥링크 입구보다 저장 좌표가 우선하도록 일회성 표시를 남긴다(Experience가 소비 후 제거).
        nextSearch.set("resume", "1");
        const value = nextSearch.toString();
        navigate({ pathname: location.pathname, search: value ? `?${value}` : "" });
      }
    } else if (resumeRecord && resumeDecision === "ask") {
      // 처음부터: 지난 기록과 그 장소·현재 장소의 세션 위치를 지워 스폰에서 시작한다.
      clearStudioVirtualSpaceLastPosition(decodedProjectId);
      const recordWorld = resolveStudioVirtualBuiltinWorld(resumeRecord.placeId, personal);
      clearStudioVirtualSpaceSessionPoint(studioVirtualSpacePositionScope(decodedProjectId, false, recordWorld.positionPlaceId));
      const currentWorld = resolveStudioVirtualBuiltinWorld(currentPlaceId, personal);
      if (currentWorld.positionPlaceId !== recordWorld.positionPlaceId) {
        clearStudioVirtualSpaceSessionPoint(studioVirtualSpacePositionScope(decodedProjectId, false, currentWorld.positionPlaceId));
      }
    }
    setEntryNickname(resolvedNickname);
    void writeStudioVirtualSpaceEntryPreference(entryAvatarIndex, resolvedNickname);
    void writeStudioVirtualArtStyle(entryArtStyle);
    setResumeChoiceMade(true);
    setEntryOpen(false);
  };

  if (!validProjectId(decodedProjectId)) {
    return (
      <Container size="wide" className="py-10">
        <section className="rounded-3xl border border-line bg-card p-6" role="alert">
          <h1 className="text-xl font-black">{bt("프로젝트를 찾을 수 없어요.", "Project not found.")}</h1>
          <Link href="/studio" className={buttonClass({ className: "mt-5" })}>
            {bt("내 작업으로", "Go to My work")}
          </Link>
        </section>
      </Container>
    );
  }

  if (entryOpen || resumeGate) {
    const guestMode = isGuest;
    return <StudioVirtualSpaceEntryLobby
      avatarIndex={guestMode ? 0 : entryAvatarIndex}
      artStyle={entryArtStyle}
      nickname={entryNickname}
      returning={initialEntryPreference.confirmed && !guestMode}
      personal={personal}
      guestMode={guestMode}
      projectName={personal ? bt("나의 스튜디오", "My studio") : decodedProjectId}
      onAvatarIndex={setEntryAvatarIndex}
      onArtStyle={setEntryArtStyle}
      onNickname={setEntryNickname}
      resumePlace={resumeGate && resumeRecord
        ? { labelKo: studioVirtualPlaceById(resumeRecord.placeId).labelKo, labelEn: studioVirtualPlaceById(resumeRecord.placeId).labelEn }
        : null}
      onResume={() => completeEntry(true)}
      accessNotice={accessNotice}
      accessBlocked={accessBlocked}
      onRetryAccess={accessGate === "unavailable" ? () => setAccessRetry((count) => count + 1) : undefined}
      initialEntryCode={codeInvite}
      onEnterWithCode={session.data ? undefined : async (code): Promise<StudioEntryCodeEntryResult> => {
        // 코드는 서버 발급 기록과 대조한 뒤에만 세션을 만든다(F-B06-1).
        const verification = await verifyStudioSpaceEntryCode(decodedProjectId, code);
        if (verification.status === "unavailable") return { ok: false, reason: "unavailable" };
        if (verification.status === "invalid") {
          return { ok: false, reason: verification.reason, retryAfterSeconds: verification.retryAfterSeconds };
        }
        const resolvedNickname = normalizeStudioVirtualSpaceNickname(entryNickname) ?? publicNickname;
        const guest = createStudioGuestSession({
          token: code,
          spaceId: decodedProjectId,
          nickname: resolvedNickname,
          spawn: guestInvite.spawn,
        });
        writeStudioGuestSession(guest);
        setGuestSession(guest);
        setEntryNickname(resolvedNickname);
        setAccessDenial(null);
        setAccessGate("allowed");
        setEntryOpen(false);
        return { ok: true };
      }}
      onEnter={() => completeEntry(false)}
    />;
  }

  // Godot 무대 (재개발 2단계): ?engine=godot 일 때만 기존 공간 대신 Godot 임베드를 띄운다.
  // 기본값은 기존 웹 공간이며, 임베드 안의 "기존 스페이스로 돌아가기"로 언제든 되돌릴 수 있다.
  if (new URLSearchParams(location.search).get("engine") === "godot") {
    const effectiveAvatarIndex = isGuest ? 0 : entryAvatarIndex;
    const skin =
      STUDIO_CHARACTER_SKINS[effectiveAvatarIndex] ?? STUDIO_CHARACTER_SKINS[0];
    const colorHex =
      STUDIO_SHARED_CURSOR_PALETTE[
        effectiveAvatarIndex % STUDIO_SHARED_CURSOR_PALETTE.length
      ] ?? "#3b82f6";
    const exitToClassic = () => {
      const params = new URLSearchParams(location.search);
      params.delete("engine");
      const value = params.toString();
      navigate({ pathname: location.pathname, search: value ? `?${value}` : "" });
    };
    return (
      <StudioGodotSpaceEmbed
        workId={decodedProjectId}
        displayName={publicNickname}
        colorHex={colorHex}
        skinKey={skin?.key}
        localOnly={personal || !session.data}
        onExitToClassic={exitToClassic}
      />
    );
  }

  return (
    <StudioLiveCollaborationProvider
      workId={decodedProjectId}
      participant={participant}
      currentPageId="virtual-space"
      currentTool="spatial-presence"
      outboxScope={null}
      transportFactory={transportFactory}
      serverRequired
      ephemeralOnly
      showHuddleLauncher={false}
    >
      <VirtualSpaceExperience
        key={JSON.stringify([decodedProjectId, userId, publication.snapshot.active?.scope ?? "bundled"])}
        publication={publication}
        projectId={decodedProjectId}
        initialAvatarIndexOverride={isGuest ? 0 : entryAvatarIndex}
        initialArtStyleOverride={entryArtStyle}
        nickname={publicNickname}
        onNicknameChange={(value) => {
          const resolvedNickname = normalizeStudioVirtualSpaceNickname(value);
          if (!resolvedNickname) return;
          setEntryNickname(resolvedNickname);
          if (validStudioVirtualSpaceAvatarIndex(entryAvatarIndex)) {
            void writeStudioVirtualSpaceEntryPreference(entryAvatarIndex, resolvedNickname);
          }
        }}
        homeHeader={homeHeader}
        personal={personal}
        preparing={!personal && (!session.ready || !transportFactory)}
        signedIn={!personal && Boolean(session.data)}
        isGuest={isGuest}
        guestSpawn={guestSessionForSpace?.spawn ?? guestInvite.spawn}
        entryJustConfirmed={!initialEntryPreference.confirmed}
      />
    </StudioLiveCollaborationProvider>
  );
}

export default StudioVirtualSpacePage;
