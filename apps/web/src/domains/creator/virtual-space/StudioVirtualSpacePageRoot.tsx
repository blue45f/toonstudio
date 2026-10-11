import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import type { StudioRealtimeTicketGuestAccess } from "../studio-realtime-provider-protocol";
import { readStudioVirtualArtStyle, writeStudioVirtualArtStyle, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
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
import { isStudioSpatialInviteToken } from "./studio-spatial-invite-context";
import { verifyStudioSpaceEntryCode, verifyStudioSpatialInvite } from "./studio-virtual-space-access-client";
import { StudioGodotSpaceEmbed } from "./StudioGodotSpaceEmbed";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import { STUDIO_SHARED_CURSOR_PALETTE } from "./studio-virtual-space-shared-cursors";
import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";
import type { StudioEntryCodeEntryResult } from "./StudioVirtualSpaceEntryCodePanel";

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

export function StudioVirtualSpacePage({ projectIdOverride, personal = false }: { readonly projectIdOverride?: string; readonly homeHeader?: ReactNode; readonly personal?: boolean } = {}) {
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
  const accountNickname = studioVirtualSpaceNicknameFromAccount(session.data?.user.name);
  useEffect(() => {
    if (entryNickname.trim()) return;
    setEntryNickname(accountNickname ?? bt("크리에이터", "Creator"));
  }, [accountNickname, bt, entryNickname]);
  const publicNickname = normalizeStudioVirtualSpaceNickname(entryNickname)
    ?? accountNickname
    ?? bt("게스트 크리에이터", "Guest creator");

  useDocumentTitle(`${personal ? bt("나의 스튜디오", "My studio") : bt("협업 스튜디오", "Collaboration Studio")} · ToonStudio`);

  const navigate = useNavigate();
  // 클래식 제거 마이그레이션 (DESIGN.md §15): `?engine=classic`으로 저장된
  // 링크·즐겨찾기는 파라미터를 지워 Godot 기본 동선으로 수렴시킨다.
  // 무대는 어느 경우든 Godot라 화면은 그대로고 URL만 정규화된다.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("engine") !== "classic") return;
    params.delete("engine");
    const value = params.toString();
    navigate(
      { pathname: location.pathname, search: value ? `?${value}` : "" },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  const completeEntry = () => {
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
      setEntryOpen(false);
      return;
    }
    if (!validStudioVirtualSpaceAvatarIndex(entryAvatarIndex)) return;
    setEntryNickname(resolvedNickname);
    void writeStudioVirtualSpaceEntryPreference(entryAvatarIndex, resolvedNickname);
    void writeStudioVirtualArtStyle(entryArtStyle);
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

  if (entryOpen) {
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
      onEnter={() => completeEntry()}
    />;
  }

  // 무대는 Godot 하나다 (클래식 제거 — DESIGN.md §15 최종 판단).
  // 게스트 티켓 배선: 서버 검증을 통과해 저장된 게스트 세션이 있을 때만
  // 그 자격을 임베드에 넘겨 게스트 티켓으로 접속하게 한다. 세션은 검증
  // 성공 뒤에만 만들어지고, 서버가 저장된 자격을 거절하면 위 게이트가
  // 세션을 지우므로, 여기 닿은 자격은 살아 있는 자격이다. 자격이 없는
  // 방문자는 기존처럼 로컬 무대(localOnly)에 머문다.
  const effectiveAvatarIndex = isGuest ? 0 : entryAvatarIndex;
  const skin =
    STUDIO_CHARACTER_SKINS[effectiveAvatarIndex] ?? STUDIO_CHARACTER_SKINS[0];
  const colorHex =
    STUDIO_SHARED_CURSOR_PALETTE[
      effectiveAvatarIndex % STUDIO_SHARED_CURSOR_PALETTE.length
    ] ?? "#3b82f6";
  const godotGuestAccess: StudioRealtimeTicketGuestAccess | undefined =
    isGuest && guestSessionForSpace
      ? isStudioSpatialInviteToken(guestSessionForSpace.inviteToken)
        ? {
            kind: "invite",
            token:
              guestSessionForSpace.inviteToken,
            guestSessionId: guestSessionForSpace.sessionId,
          }
        : {
            kind: "entry-code",
            code: guestSessionForSpace.inviteToken,
            guestSessionId: guestSessionForSpace.sessionId,
          }
      : undefined;
  return (
    <StudioGodotSpaceEmbed
      workId={decodedProjectId}
      displayName={publicNickname}
      colorHex={colorHex}
      skinKey={skin?.key}
      localOnly={personal || (!session.data && !godotGuestAccess)}
      guestAccess={godotGuestAccess}
    />
  );
}


export default StudioVirtualSpacePage;
