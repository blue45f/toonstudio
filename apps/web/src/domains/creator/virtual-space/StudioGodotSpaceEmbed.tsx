import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveStudioCloudflareRealtimeOrigin } from "../studio-realtime-provider-cloudflare-adapter";
import {
  StudioRealtimeTicketSchema,
  type StudioRealtimeTicketGuestAccess,
  type StudioRealtimeTicketRequest,
} from "../studio-realtime-provider-protocol";
import {
  StudioRealtimeTicketDeniedError,
  type StudioRealtimeTicketIssuer,
} from "../studio-realtime-provider-runtime";
import { createStudioRealtimeHttpTicketIssuer } from "../studio-realtime-ticket-client";
import {
  acquireStudioVoiceIcePolicyLease,
  type StudioVoiceIcePolicyLease,
} from "../studio-voice-ice-policy";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  StudioGodotMeetingSession,
  type GodotMeetingRoute,
} from "./studio-godot-meeting-session";
import { StudioGodotMeetingPanel } from "./StudioGodotMeetingPanel";
import {
  deleteGodotSpaceBackground,
  fetchGodotSpaceBackgrounds,
  fetchGodotSpaceCatalog,
  fetchGodotSpaceLayout,
  isGodotSpaceLayoutConflict,
  resolveGodotBackgroundForStage,
  restoreGodotBackgroundReference,
  saveGodotSpaceLayout,
  uploadGodotSpaceBackground,
  type GodotSpaceBackgroundAsset,
  type GodotSpaceDefinition,
} from "./studio-godot-space";
import {
  StudioGodotLayoutPanel,
  type GodotLayoutCommand,
  type GodotLayoutLoadState,
  type GodotLayoutSaveState,
  type GodotLayoutSelection,
} from "./StudioGodotLayoutPanel";
import {
  GODOT_EMOTE_BAR,
  GODOT_EMOTE_GLYPHS,
  GODOT_INTERACT_LABELS,
  loadGodotLastPosition,
  parseHostPayload,
  saveGodotLastPosition,
  type GodotChatEntry,
  type GodotZoneInfo,
  type TsvsGodotFrameWindow,
  type TsvsHostBridge,
} from "./studio-godot-space-embed-support";

/**
 * Godot 무대 임베드 셸 (가상스튜디오 재개발 2단계 — DESIGN §4 이층 구조).
 *
 * 셸이 소유하는 것: 계정 세션·티켓 발급/갱신·연결 생존성(visibility·워치독 ping)·
 * 로딩과 연결 상태 표기. Godot 무대는 공간 렌더와 이동만 소유하고, 경계는
 * `window.__tsvsHost`(Godot→셸)와 iframe 전역 콜백(셸→Godot)뿐이다.
 * 티켓은 메모리에만 두고 저장·URL·로그에 남기지 않는다.
 */

export const GODOT_SPACE_EMBED_PATH = "/godot-space/index.html";

const GODOT_PRESENCE_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
  // 3단계: 회의 구역 화상 브리지 — Godot 연결이 screen-signaling 채널을
  // 중계할 수 있어야 셸 소유 화상이 같은 룸에서 협상된다.
  "screen-signaling.session-v1",
  "screen-signaling.webrtc-v1",
  "screen-signaling.resume-v1",
] as const;

/** 게스트 티켓은 서버 계약상 presence 전용이다 (게스트 인가 분기가
 * 그 외 워크로드를 거부한다). 회의·댓글 채널은 게스트에게 열지 않는다. */
const GODOT_GUEST_PRESENCE_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
] as const;

const BRIDGE_PING_INTERVAL_MS = 20_000;
const TICKET_EXPIRY_MARGIN_MS = 10_000;

export type { GodotZoneInfo } from "./studio-godot-space-embed-support";

declare global {
  interface Window {
    __tsvsHost?: TsvsHostBridge;
  }
}

export type StudioGodotSpacePhase =
  | "booting"
  | "ticket"
  | "connecting"
  | "connected"
  | "disconnected"
  | "denied"
  | "unavailable"
  | "local";

export interface StudioGodotSpaceEmbedProps {
  readonly workId: string;
  readonly displayName: string;
  /** "#rrggbb" — 서버 계약 profile.avatar.color와 같은 형식. */
  readonly colorHex: string;
  readonly skinKey?: string;
  /** 개인 공간처럼 티켓을 발급할 수 없는 경우: 무대만 로컬로 띄운다. */
  readonly localOnly?: boolean;
  /**
   * 프로젝트 공간 게스트 자격. 서버 검증을 통과한 게스트 세션의 자격만
   * 전달된다 — 임베드는 이 자격으로 게스트 티켓(presence 전용)을 발급해
   * 접속한다. 자격이 없으면 게스트는 localOnly 로컬 무대에 머문다.
   */
  readonly guestAccess?: StudioRealtimeTicketGuestAccess;
  /** 테스트 주입용. 기본값은 운영 HTTP 발급기. */
  readonly ticketIssuer?: StudioRealtimeTicketIssuer;
}

export function StudioGodotSpaceEmbed({
  workId,
  displayName,
  colorHex,
  skinKey,
  localOnly = false,
  guestAccess,
  ticketIssuer,
}: StudioGodotSpaceEmbedProps) {
  /** 게스트 접속은 presence 전용 — 회의 세션·ICE 리스·배치 저작을 켜지 않는다. */
  const presenceOnly = guestAccess !== undefined;
  const bt = useBilingual("StudioGodotSpaceEmbed");
  const [phase, setPhase] = useState<StudioGodotSpacePhase>(
    localOnly ? "local" : "booting",
  );
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const sessionIdRef = useRef<string | null>(null);
  const issuingRef = useRef(false);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 3단계: 구역·근접·화상·말풍선 상태. 구역 판정은 Godot가 소유하고 셸은 통지를 받는다.
  const [zoneInfo, setZoneInfo] = useState<GodotZoneInfo | null>(null);
  const zoneInfoRef = useRef<GodotZoneInfo | null>(null);
  zoneInfoRef.current = zoneInfo;
  const [proximitySize, setProximitySize] = useState(0);
  const [chatLog, setChatLog] = useState<readonly GodotChatEntry[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [interactNotice, setInteractNotice] = useState<string | null>(null);
  const chatSeqRef = useRef(0);
  const [meetingRoute, setMeetingRoute] = useState<GodotMeetingRoute>("idle");
  const [meetingLocalStream, setMeetingLocalStream] =
    useState<MediaStream | null>(null);
  const [meetingRemoteStream, setMeetingRemoteStream] =
    useState<MediaStream | null>(null);
  const meetingSessionRef = useRef<StudioGodotMeetingSession | null>(null);
  const iceLeaseRef = useRef<StudioVoiceIcePolicyLease | null>(null);
  const iceLeasePromiseRef = useRef<Promise<void> | null>(null);

  // 4단계: 공간 정의·배치 저작 상태. 정의 해석 순서: 작품별 저장본(API) →
  // 정적 기본값(spaces.json). 무대에는 세션 주입 또는 applyLayout으로 전달한다.
  const [catalog, setCatalog] = useState<readonly GodotSpaceDefinition[]>([]);
  const [spaceId, setSpaceId] = useState("studio-room");
  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;
  const [spaceDef, setSpaceDef] = useState<GodotSpaceDefinition | null>(null);
  const spaceDefRef = useRef<GodotSpaceDefinition | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const layoutRevisionRef = useRef(0);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const layoutDirtyRef = useRef(false);
  layoutDirtyRef.current = layoutDirty;
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [layoutSelection, setLayoutSelection] =
    useState<GodotLayoutSelection | null>(null);
  const [layoutLoadState, setLayoutLoadState] =
    useState<GodotLayoutLoadState>("loading");
  const [layoutSaveState, setLayoutSaveState] =
    useState<GodotLayoutSaveState>("idle");
  const [layoutFetchNonce, setLayoutFetchNonce] = useState(0);

  const frameWindow = useCallback((): TsvsGodotFrameWindow | null => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return null;
    return frame.contentWindow as unknown as TsvsGodotFrameWindow;
  }, []);

  // 무대 배경 로더(bg_stage.gd)는 HTTPRequest가 하나뿐이라, 부팅 배경을
  // 받는 중에 새 배경 적용이 닿으면 요청이 즉시 실패(err=44)하고 적용이
  // 유실된다 (2026-10-12 실측: 저장 배경 재접속 시 카탈로그로 남음).
  // 그래서 무대 적용은 배경 로드가 가라앉을 때까지 셸이 붙잡는다.
  const pendingStageLayoutRef = useRef<string | null>(null);
  const stageLayoutFlushingRef = useRef(false);

  // 배경 상태가 확정값(idle|ready|failed)이 될 때까지 기다린다. 상태
  // 문자열 자체가 끝내 없으면(보고 없는 무대·테스트 더블) 짧게만 기다리고
  // 기존 동작으로 진행한다. 한 번이라도 보이면 "loading" 해소까지 기다린다.
  const waitForStageBackgroundSettled = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const deadline = Date.now() + 65_000;
      const firstSeenDeadline = Date.now() + 300;
      while (!signal?.aborted && Date.now() < deadline) {
        const state = frameWindow()?.__godotBgState;
        if (typeof state === "string") {
          if (state !== "loading") return;
        } else if (Date.now() > firstSeenDeadline) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    [frameWindow],
  );

  // 대기 중인 무대 레이아웃을 배경 정착 후 흘려보낸다. 겹치면 최신만 남긴다.
  const flushPendingStageLayout = useCallback(async (): Promise<void> => {
    if (stageLayoutFlushingRef.current) return;
    stageLayoutFlushingRef.current = true;
    try {
      while (pendingStageLayoutRef.current) {
        if (frameWindow()?.__godotBgState === "loading") {
          await waitForStageBackgroundSettled();
        }
        const json = pendingStageLayoutRef.current;
        pendingStageLayoutRef.current = null;
        if (json) frameWindow()?.__tsvs_applyLayout?.(json);
      }
    } finally {
      stageLayoutFlushingRef.current = false;
    }
  }, [frameWindow, waitForStageBackgroundSettled]);

  const pushStageLayout = useCallback(
    (definition: GodotSpaceDefinition) => {
      pendingStageLayoutRef.current = JSON.stringify({
        spec: resolveGodotBackgroundForStage(definition, workId),
      });
      void flushPendingStageLayout();
    },
    [flushPendingStageLayout, workId],
  );

  // 해석된 정의를 상태·무대 양쪽에 반영한다. 세션 주입 전이면 무대 호출은
  // 무대가 버리고(주입 페이로드가 정의를 싣는다), 접속 중이면 즉시 적용된다.
  // 배경 로드 중이면 pushStageLayout이 정착까지 적용을 미룬다.
  const applyResolvedLayout = useCallback(
    (definition: GodotSpaceDefinition, revision: number) => {
      spaceDefRef.current = definition;
      setSpaceDef(definition);
      layoutRevisionRef.current = revision;
      setLayoutRevision(revision);
      setLayoutDirty(false);
      setLayoutLoadState("ready");
      pushStageLayout(definition);
    },
    [pushStageLayout],
  );

  // 정적 카탈로그는 빌드와 함께 배포되는 기본 정의 묶음이다.
  useEffect(() => {
    let cancelled = false;
    fetchGodotSpaceCatalog()
      .then((spaces) => {
        if (!cancelled) setCatalog(spaces);
      })
      .catch(() => {
        if (!cancelled) setLayoutLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [layoutFetchNonce]);

  // 공간이 바뀌거나 재조회가 요청되면 저장본을 다시 해석한다.
  useEffect(() => {
    const fallback = catalog.find((def) => def.id === spaceId) ?? null;
    if (!fallback) return;
    if (localOnly || presenceOnly) {
      // 게스트는 저장본 조회 권한이 없어 카탈로그 기본 정의를 쓴다.
      applyResolvedLayout(fallback, 0);
      return;
    }
    let cancelled = false;
    setLayoutLoadState("loading");
    fetchGodotSpaceLayout(workId, spaceId)
      .then((saved) => {
        if (cancelled) return;
        applyResolvedLayout(
          saved?.definition ?? fallback,
          saved?.revision ?? 0,
        );
      })
      .catch(() => {
        if (!cancelled) setLayoutLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyResolvedLayout, catalog, layoutFetchNonce, localOnly, presenceOnly, spaceId, workId]);

  const handleLayoutSave = useCallback(async () => {
    const definition = spaceDefRef.current;
    if (!definition) return;
    setLayoutSaveState("saving");
    try {
      const saved = await saveGodotSpaceLayout(
        workId,
        spaceIdRef.current,
        definition,
        layoutRevisionRef.current,
      );
      layoutRevisionRef.current = saved.revision;
      setLayoutRevision(saved.revision);
      setLayoutDirty(false);
      setLayoutSaveState("idle");
      // 저장 완료를 같은 방에 알린다 — 상대 셸이 재조회해 무대에 적용한다.
      frameWindow()?.__tsvs_notifyLayout?.(
        JSON.stringify({
          spaceId: spaceIdRef.current,
          revision: saved.revision,
        }),
      );
    } catch (error) {
      setLayoutSaveState(
        isGodotSpaceLayoutConflict(error) ? "conflict" : "error",
      );
    }
  }, [frameWindow, workId]);

  const handleLayoutCommand = useCallback(
    (command: GodotLayoutCommand) => {
      frameWindow()?.__tsvs_layoutCommand?.(JSON.stringify(command));
    },
    [frameWindow],
  );

  const handleToggleEditMode = useCallback(
    (enabled: boolean) => {
      setLayoutEditMode(enabled);
      frameWindow()?.__tsvs_setEditMode?.(enabled);
    },
    [frameWindow],
  );

  // 배경 GLB 교체 (§14): 업로드 자산 목록과 패널 동선의 상태.
  // 정의 변경은 기존 초안·dirty·저장 동선을 그대로 탄다.
  const [backgroundAssets, setBackgroundAssets] = useState<
    readonly GodotSpaceBackgroundAsset[]
  >([]);
  const [backgroundUploadState, setBackgroundUploadState] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  useEffect(() => {
    if (localOnly) return;
    let cancelled = false;
    fetchGodotSpaceBackgrounds(workId)
      .then((assets) => {
        if (!cancelled) setBackgroundAssets(assets);
      })
      .catch(() => {
        if (!cancelled) {
          setBackgroundError("업로드한 배경 목록을 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [localOnly, workId]);

  const applyDefinitionDraft = useCallback(
    (next: GodotSpaceDefinition) => {
      spaceDefRef.current = next;
      setSpaceDef(next);
      setLayoutDirty(true);
      pushStageLayout(next);
    },
    [pushStageLayout],
  );

  const handleBackgroundChange = useCallback(
    (background: GodotSpaceDefinition["background"]) => {
      const current = spaceDefRef.current;
      if (!current) return;
      applyDefinitionDraft({ ...current, background });
    },
    [applyDefinitionDraft],
  );

  const handleBackgroundUpload = useCallback(
    async (file: File) => {
      setBackgroundUploadState("uploading");
      setBackgroundError(null);
      try {
        const asset = await uploadGodotSpaceBackground(workId, file);
        setBackgroundAssets((previous) => [asset, ...previous]);
        setBackgroundUploadState("idle");
        // 업로드 즉시 지정한다. 카메라 값은 현재 배경(없으면 이 공간의
        // 기본 배경)의 것을 이어받는다.
        const current = spaceDefRef.current;
        if (current) {
          const base =
            current.background ??
            catalog.find((def) => def.id === current.id)?.background ??
            null;
          handleBackgroundChange({ ...(base ?? {}), glb: asset.glbRef });
        }
      } catch (error) {
        setBackgroundUploadState("error");
        setBackgroundError(
          error instanceof Error
            ? error.message
            : "배경을 올리지 못했습니다.",
        );
      }
    },
    [catalog, handleBackgroundChange, workId],
  );

  const handleBackgroundDelete = useCallback(
    async (assetId: string) => {
      setBackgroundError(null);
      try {
        await deleteGodotSpaceBackground(workId, assetId);
        setBackgroundAssets((previous) =>
          previous.filter((asset) => asset.assetId !== assetId),
        );
        const current = spaceDefRef.current;
        if (current?.background?.glb === `uploads/${assetId}.glb`) {
          // 사용 중이던 배경이 지워지면 기본 배경으로 되돌린다.
          const fallback =
            catalog.find((def) => def.id === current.id)?.background ?? null;
          handleBackgroundChange(fallback ? { ...fallback } : null);
        }
      } catch (error) {
        setBackgroundError(
          error instanceof Error
            ? error.message
            : "배경을 지우지 못했습니다.",
        );
      }
    },
    [catalog, handleBackgroundChange, workId],
  );

  // 공간 전환은 무대 리로드가 가장 안전하다 (연결·구역·배경을 통째로 재구성).
  // 새 무대의 세션 주입이 해석된 정의를 싣고, ?space=는 부팅 기본값을 맞춘다.
  const switchSpace = useCallback(
    (nextId: string) => {
      if (nextId === spaceIdRef.current) return;
      setSpaceId(nextId);
      setZoneInfo(null);
      setProximitySize(0);
      setLayoutSelection(null);
      setLayoutEditMode(false);
      setLayoutDirty(false);
      setLayoutSaveState("idle");
      setPhase(localOnly ? "local" : "booting");
      if (localOnly) {
        const lastPosition = loadGodotLastPosition(workId);
        const restoreQuery =
          lastPosition && lastPosition.spaceId === nextId
            ? `&px=${lastPosition.x}&py=${lastPosition.y}`
            : "";
        setFrameSrc(
          `${GODOT_SPACE_EMBED_PATH}?local=1&space=${nextId}${restoreQuery}`,
        );
      } else {
        setFrameSrc(`${GODOT_SPACE_EMBED_PATH}?space=${nextId}`);
      }
    },
    [localOnly, workId],
  );

  // 회의 맥락은 구역 통지에서 도출한다: 발표 구역은 회의 구역 안에 있으므로
  // 두 구역의 점유를 합쳐 판정한다. 4단계부터 공간마다 구역 id가 달라지므로
  // id가 아니라 kind로 판정한다 (거리의 광장·무대가 같은 역할).
  const meetingContext = useMemo(() => {
    if (!zoneInfo) return null;
    const isMeetingKind = (kind: string) =>
      kind === "meeting" || kind === "presentation";
    const selfZone = zoneInfo.zones.find(
      (zone) => zone.zoneId === zoneInfo.selfZoneId,
    );
    const selfInMeeting = selfZone ? isMeetingKind(selfZone.kind) : false;
    const occupantIds = new Set<string>();
    for (const zone of zoneInfo.zones) {
      if (isMeetingKind(zone.kind)) {
        for (const occupant of zone.occupants) occupantIds.add(occupant);
      }
    }
    const peerActorId =
      [...occupantIds].find((actor) => actor !== zoneInfo.selfActorId) ?? null;
    return {
      selfInMeeting,
      peerInMeeting: peerActorId !== null,
      peerActorId,
      peerClientId: peerActorId
        ? (zoneInfo.peerClientIds[peerActorId] ?? null)
        : null,
      selfClientId: zoneInfo.selfClientId || null,
      presenterName: zoneInfo.presenterActorId
        ? (zoneInfo.names[zoneInfo.presenterActorId] ?? null)
        : null,
      peerName: peerActorId
        ? (zoneInfo.names[peerActorId] ?? null)
        : null,
    };
  }, [zoneInfo]);

  // 화상 세션은 한 번만 만들고, ICE 리스는 연결 확정 뒤에 미리 받아 둔다.
  // 게스트(presence 전용)는 시그널링 채널이 없어 세션을 만들지 않는다.
  useEffect(() => {
    if (localOnly || presenceOnly) return;
    const session = new StudioGodotMeetingSession({
      sendSignal: (payload) => {
        frameWindow()?.__tsvs_sendSignal?.(JSON.stringify(payload));
      },
      createPeerConnection: () => {
        const lease = iceLeaseRef.current;
        if (!lease) {
          throw new Error("ICE 정책 리스가 아직 준비되지 않았습니다.");
        }
        return lease.createPeerConnection();
      },
      getLocalStream: () =>
        navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
      onRoute: (route) => setMeetingRoute(route),
      onRemoteStream: (stream) => setMeetingRemoteStream(stream),
      onLocalStream: (stream) => setMeetingLocalStream(stream),
    });
    meetingSessionRef.current = session;
    return () => {
      session.close();
      meetingSessionRef.current = null;
      iceLeaseRef.current?.close();
      iceLeaseRef.current = null;
      iceLeasePromiseRef.current = null;
    };
  }, [frameWindow, localOnly, presenceOnly]);

  const ensureIceLease = useCallback(() => {
    if (iceLeaseRef.current) return Promise.resolve();
    if (!iceLeasePromiseRef.current) {
      iceLeasePromiseRef.current = acquireStudioVoiceIcePolicyLease(workId)
        .then((lease) => {
          iceLeaseRef.current = lease;
        })
        .catch(() => {
          // 리스 실패는 화상 시작 시점에 "failed"로 정직하게 드러난다.
          iceLeasePromiseRef.current = null;
        });
    }
    return iceLeasePromiseRef.current;
  }, [workId]);

  useEffect(() => {
    if (localOnly || presenceOnly || phase !== "connected") {
      return;
    }
    void ensureIceLease();
  }, [ensureIceLease, localOnly, phase, presenceOnly]);

  useEffect(() => {
    const session = meetingSessionRef.current;
    if (!session || !meetingContext) return;
    session.setContext({
      selfInMeeting: meetingContext.selfInMeeting,
      peerInMeeting: meetingContext.peerInMeeting,
      peerClientId: meetingContext.peerClientId,
      selfClientId: meetingContext.selfClientId,
    });
  }, [meetingContext]);

  const injectSession = useCallback(
    (ticket: string) => {
      const origin = resolveStudioCloudflareRealtimeOrigin(
        import.meta.env.VITE_STUDIO_REALTIME_ORIGIN,
      );
      if (!origin) {
        setPhase("unavailable");
        return;
      }
      const payload: Record<string, unknown> = {
        v: 1,
        ticket,
        ws: origin.replace(/^https:/, "wss:"),
        workId,
        roomId: workId,
        name: displayName,
        color: colorHex,
      };
      if (skinKey) payload.skinKey = skinKey;
      // 위치 복원: 저장된 마지막 위치가 지금 공간의 것이면 함께 싣는다.
      const lastPosition = loadGodotLastPosition(workId);
      if (lastPosition && lastPosition.spaceId === spaceIdRef.current) {
        payload.restore = {
          spaceId: lastPosition.spaceId,
          x: lastPosition.x,
          y: lastPosition.y,
        };
      }
      // 4단계: 해석된 공간 정의(저장본 우선)를 세션에 싣는다. 없으면 무대가
      // ?space= 부팅 기본값·내장 정의를 쓴다. 업로드 배경 참조는 무대가
      // 읽을 수 있는 content 절대 URL로 바꾼 사본을 싣는다 (§14).
      if (spaceDefRef.current) {
        payload.space = resolveGodotBackgroundForStage(
          spaceDefRef.current,
          workId,
        );
      }
      frameWindow()?.__tsvs_setSession?.(JSON.stringify(payload));
      if (document.hidden) {
        frameWindow()?.__tsvs_setVisibility?.(true);
      }
      setPhase("connecting");
    },
    [colorHex, displayName, frameWindow, skinKey, workId],
  );

  const issueAndInject = useCallback(async () => {
    if (localOnly || issuingRef.current) return;
    const issuer =
      ticketIssuer ?? createStudioRealtimeHttpTicketIssuer({});
    issuingRef.current = true;
    setPhase((current) => (current === "connected" ? current : "ticket"));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // 세션 페이로드의 배경이 부팅 배경 다운로드와 겹치면 무대 로더가
      // 요청 중첩으로 실패한다. 티켓 발급 전에 배경 정착을 기다려
      // 티켓 수명(120초)은 대기 시간에 쓰지 않는다.
      await waitForStageBackgroundSettled(controller.signal);
      if (controller.signal.aborted) return;
      sessionIdRef.current ??=
        globalThis.crypto?.randomUUID?.() ??
        `godot-shell-${Date.now().toString(36)}`;
      const providerId =
        import.meta.env.VITE_STUDIO_REALTIME_PROVIDER_ID?.trim() ||
        "cloudflare-realtime-v1";
      const request: StudioRealtimeTicketRequest = guestAccess
        ? {
            // 게스트는 자격을 함께 제시하고 presence 전용으로만 발급받는다.
            version: 1,
            providerId,
            sessionId: sessionIdRef.current,
            scope: { workId, roomId: workId },
            workloads: ["presence"],
            capabilities: [...GODOT_GUEST_PRESENCE_CAPABILITIES],
            guestAccess,
          }
        : {
            version: 1,
            providerId,
            sessionId: sessionIdRef.current,
            scope: { workId, roomId: workId },
            workloads: ["presence", "screen-signaling"],
            capabilities: [...GODOT_PRESENCE_CAPABILITIES],
          };
      const raw = await issuer.issue(request, controller.signal);
      const parsed = StudioRealtimeTicketSchema.safeParse(raw);
      if (!parsed.success || parsed.data.providerId !== providerId) {
        setPhase("unavailable");
        return;
      }
      injectSession(parsed.data.ticket);
      // 접속이 끝나기 전에 티켓이 만료되면 새 티켓으로 다시 주입한다.
      // 이미 접속된 뒤에는 티켓 수명이 연결과 무관하므로 재발급하지 않는다.
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      const delay = Math.max(
        1_000,
        Date.parse(parsed.data.expiresAt) - Date.now() - TICKET_EXPIRY_MARGIN_MS,
      );
      expiryTimerRef.current = setTimeout(() => {
        if (phaseRef.current !== "connected") void issueAndInject();
      }, delay);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase(
        error instanceof StudioRealtimeTicketDeniedError
          ? "denied"
          : "unavailable",
      );
    } finally {
      issuingRef.current = false;
    }
  }, [guestAccess, injectSession, localOnly, ticketIssuer, waitForStageBackgroundSettled, workId]);

  const appendChat = useCallback(
    (fromSelf: boolean, name: string, text: string) => {
      chatSeqRef.current += 1;
      const entry: GodotChatEntry = {
        id: chatSeqRef.current,
        fromSelf,
        name,
        text,
      };
      setChatLog((current) => [...current.slice(-49), entry]);
    },
    [],
  );

  // 호스트 브리지 등록이 iframe 로드보다 먼저 끝나야 onGodotReady를 놓치지 않는다.
  useEffect(() => {
    const host: TsvsHostBridge = {
      onGodotReady: () => {
        void issueAndInject();
      },
      onConnectionState: (json) => {
        const payload = parseHostPayload(json);
        if (payload?.state === "connected") setPhase("connected");
        else if (payload?.state === "disconnected") setPhase("disconnected");
      },
      onTicketNeeded: () => {
        void issueAndInject();
      },
      onZoneChanged: (json) => {
        const payload = parseHostPayload(json);
        if (!payload) return;
        const zones = Array.isArray(payload.zones)
          ? payload.zones.flatMap((zone) => {
              if (typeof zone !== "object" || zone === null) return [];
              const record = zone as Record<string, unknown>;
              return [
                {
                  zoneId: String(record.zoneId ?? ""),
                  kind: String(record.kind ?? ""),
                  name: String(record.name ?? ""),
                  occupants: Array.isArray(record.occupants)
                    ? record.occupants.map((value) => String(value))
                    : [],
                },
              ];
            })
          : [];
        setZoneInfo({
          selfZoneId: String(payload.selfZoneId ?? ""),
          selfActorId: String(payload.selfActorId ?? ""),
          selfClientId: String(payload.selfClientId ?? ""),
          presenterActorId: String(payload.presenterActorId ?? ""),
          peerClientIds: (payload.peerClientIds ?? {}) as Record<
            string,
            string
          >,
          names: (payload.names ?? {}) as Record<string, string>,
          zones,
        });
      },
      onProximityChanged: (json) => {
        const payload = parseHostPayload(json);
        if (payload && typeof payload.size === "number") {
          setProximitySize(payload.size);
        }
      },
      onSignal: (json) => {
        const payload = parseHostPayload(json);
        const signal = payload?.payload;
        if (
          payload &&
          typeof signal === "object" &&
          signal !== null &&
          !Array.isArray(signal)
        ) {
          void meetingSessionRef.current?.handleSignal(
            String(payload.fromClientId ?? ""),
            signal as Record<string, unknown>,
          );
        }
      },
      onBubble: (json) => {
        const payload = parseHostPayload(json);
        if (!payload || typeof payload.text !== "string") return;
        const fromActorId = String(payload.fromActorId ?? "");
        const name =
          zoneInfoRef.current?.names[fromActorId] ??
          bt("상대", "Partner");
        appendChat(false, name, payload.text);
      },
      onEmote: (json) => {
        const payload = parseHostPayload(json);
        if (!payload || typeof payload.emote !== "string") return;
        const glyph = GODOT_EMOTE_GLYPHS[payload.emote];
        if (!glyph) return;
        const fromActorId = String(payload.fromActorId ?? "");
        const fromSelf =
          fromActorId !== "" &&
          fromActorId === zoneInfoRef.current?.selfActorId;
        const name =
          zoneInfoRef.current?.names[fromActorId] ??
          (fromSelf ? displayName : bt("상대", "Partner"));
        appendChat(fromSelf, name, glyph);
      },
      onInteract: (json) => {
        const payload = parseHostPayload(json);
        if (!payload || typeof payload.kind !== "string") return;
        const label = GODOT_INTERACT_LABELS[payload.kind];
        if (!label) return;
        setInteractNotice(label);
      },
      onPosition: (json) => {
        const payload = parseHostPayload(json);
        if (
          !payload ||
          typeof payload.spaceId !== "string" ||
          typeof payload.x !== "number" ||
          typeof payload.y !== "number"
        ) {
          return;
        }
        saveGodotLastPosition(workId, {
          spaceId: payload.spaceId,
          x: payload.x,
          y: payload.y,
          at: Date.now(),
        });
      },
      onLayoutChanged: (json) => {
        const payload = parseHostPayload(json);
        const spec = payload?.spec;
        if (
          typeof spec !== "object" ||
          spec === null ||
          Array.isArray(spec)
        ) {
          return;
        }
        // 무대 정규화를 통과한 정의를 셸 초안으로 삼는다 (저장은 별도 동선).
        // 무대는 업로드 배경을 절대 URL로 알고 있으므로, 저장 정본인
        // uploads/ 참조로 되돌려서 초안에 싣는다 (§14 역변환).
        const definition = restoreGodotBackgroundReference(
          spec as GodotSpaceDefinition,
          workId,
        );
        if (definition.id !== spaceIdRef.current) return;
        spaceDefRef.current = definition;
        setSpaceDef(definition);
        setLayoutDirty(true);
      },
      onLayoutSelection: (json) => {
        const payload = parseHostPayload(json);
        const raw = payload?.selection;
        if (
          typeof raw !== "object" ||
          raw === null ||
          Array.isArray(raw) ||
          Object.keys(raw).length === 0
        ) {
          setLayoutSelection(null);
          return;
        }
        const record = raw as Record<string, unknown>;
        const rect = Array.isArray(record.rect) ? record.rect : [];
        const rectTuple: [number, number, number, number] = [
          Number(rect[0] ?? 0),
          Number(rect[1] ?? 0),
          Number(rect[2] ?? 0),
          Number(rect[3] ?? 0),
        ];
        setLayoutSelection({
          // 무대 편집기는 구분을 "type" 키로 보낸다 (category는 예비 키).
          category:
            (record.category ?? record.type) === "zone" ? "zone" : "prop",
          index: Number(record.index ?? 0),
          kind: String(record.kind ?? ""),
          name: String(record.name ?? ""),
          rect: rectTuple,
        });
      },
      onLayoutRemote: (json) => {
        const payload = parseHostPayload(json);
        if (!payload || payload.spaceId !== spaceIdRef.current) return;
        if (layoutDirtyRef.current) {
          // 내 미저장 변경과 부딪히면 자동 적용하지 않고 충돌 동선을 띄운다.
          setLayoutSaveState("conflict");
          return;
        }
        setLayoutFetchNonce((nonce) => nonce + 1);
      },
    };
    window.__tsvsHost = host;
    if (localOnly) {
      // 개인 공간은 세션 주입이 없어 위치 복원을 부팅 파라미터로 전한다.
      const lastPosition = loadGodotLastPosition(workId);
      const restoreQuery =
        lastPosition && lastPosition.spaceId === spaceIdRef.current
          ? `&px=${lastPosition.x}&py=${lastPosition.y}`
          : "";
      setFrameSrc(`${GODOT_SPACE_EMBED_PATH}?local=1${restoreQuery}`);
    } else {
      setFrameSrc(GODOT_SPACE_EMBED_PATH);
    }
    return () => {
      if (window.__tsvsHost === host) delete window.__tsvsHost;
      abortRef.current?.abort();
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [appendChat, bt, displayName, issueAndInject, localOnly, workId]);

  // 상호작용 안내는 잠시만 보여준다.
  useEffect(() => {
    if (!interactNotice) return;
    const timer = setTimeout(() => setInteractNotice(null), 4_000);
    return () => clearTimeout(timer);
  }, [interactNotice]);

  // 생존성은 셸이 소유한다 (DESIGN §4.4): visibility를 무대에 전파하고,
  // 무대 루프가 얼어도 셸 타이머가 ping 발행을 대신 지시한다.
  useEffect(() => {
    if (localOnly) return;
    const forwardVisibility = () => {
      frameWindow()?.__tsvs_setVisibility?.(document.hidden);
    };
    document.addEventListener("visibilitychange", forwardVisibility);
    const pingTimer = setInterval(() => {
      if (phaseRef.current === "connected") {
        frameWindow()?.__tsvs_bridgePing?.();
      }
    }, BRIDGE_PING_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", forwardVisibility);
      clearInterval(pingTimer);
    };
  }, [frameWindow, localOnly]);

  const statusCopy: Record<StudioGodotSpacePhase, string> = {
    booting: bt("공간 엔진을 불러오는 중이에요…", "Loading the space engine…"),
    ticket: bt("입장권을 발급하는 중이에요…", "Issuing your entry ticket…"),
    connecting: bt("공간에 연결하는 중이에요…", "Connecting to the space…"),
    connected: bt("연결됨", "Connected"),
    disconnected: bt(
      "연결이 끊겨 다시 연결하는 중이에요…",
      "Connection lost — reconnecting…",
    ),
    denied: bt(
      "이 공간에 들어갈 권한이 없어요.",
      "You don't have access to this space.",
    ),
    unavailable: bt(
      "실시간 공간에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
      "Couldn't reach the live space. Please try again shortly.",
    ),
    local: bt(
      "로컬 모드 — 혼자 둘러보는 중이에요.",
      "Local mode — exploring on your own.",
    ),
  };
  const showOverlay =
    phase === "booting" || phase === "ticket" || phase === "connecting";
  const showRetry = phase === "denied" || phase === "unavailable";

  return (
    <section
      aria-label={bt("가상 스튜디오 공간", "Virtual studio space")}
      className="relative mx-auto w-full max-w-[1152px] px-4 py-4"
    >
      {catalog.length > 1 ? (
        <div
          className="mb-3 flex flex-wrap gap-2"
          role="group"
          aria-label={bt("공간 선택", "Choose a space")}
        >
          {catalog.map((def) => (
            <button
              key={def.id}
              type="button"
              aria-pressed={def.id === spaceId}
              data-testid={`godot-space-tab-${def.id}`}
              className="rounded-full border border-line px-3 py-1.5 text-sm font-bold"
              onClick={() => switchSpace(def.id)}
            >
              {def.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-card">
        {frameSrc ? (
          <iframe
            ref={iframeRef}
            src={frameSrc}
            title={bt("가상 스튜디오 공간 (Godot)", "Virtual studio space (Godot)")}
            className="block aspect-[3/2] w-full border-0"
            allow="autoplay; fullscreen"
          />
        ) : (
          <div className="aspect-[3/2] w-full" aria-hidden="true" />
        )}
        {showOverlay ? (
          <div
            className="absolute inset-0 grid place-items-center bg-card/80"
            role="status"
          >
            <p className="text-sm font-semibold text-fg-2">
              {statusCopy[phase]}
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm font-semibold">
          {statusCopy[phase]}
        </p>
        {zoneInfo?.selfZoneId ? (
          <p className="text-sm text-fg-2" data-testid="godot-current-zone">
            {bt(
              `현재 구역: ${zoneInfo.zones.find((zone) => zone.zoneId === zoneInfo.selfZoneId)?.name ?? zoneInfo.selfZoneId}`,
              `Current zone: ${zoneInfo.selfZoneId}`,
            )}
          </p>
        ) : null}
        {proximitySize >= 2 ? (
          <p className="text-sm text-fg-2" data-testid="godot-proximity">
            {bt(
              `근처 ${proximitySize}명과 말풍선 대화 중`,
              `Chatting with ${proximitySize} nearby`,
            )}
          </p>
        ) : null}
        {showRetry ? (
          <button
            type="button"
            className="text-sm font-bold underline underline-offset-4"
            onClick={() => void issueAndInject()}
          >
            {bt("다시 시도", "Retry")}
          </button>
        ) : null}
        {interactNotice ? (
          <p className="text-sm text-fg-2" data-testid="godot-interact-notice">
            {interactNotice}
          </p>
        ) : null}
      </div>
      <div
        className="mt-3 flex flex-wrap gap-1.5"
        role="group"
        aria-label={bt("이모트", "Emotes")}
      >
        {GODOT_EMOTE_BAR.map((emote) => (
          <button
            key={emote.id}
            type="button"
            data-testid={`godot-emote-${emote.id}`}
            className="rounded-full border border-line px-2.5 py-1 text-base leading-none"
            aria-label={bt(emote.ko, emote.en)}
            title={bt(emote.ko, emote.en)}
            onClick={() =>
              frameWindow()?.__tsvs_showEmote?.(
                JSON.stringify({
                  actorId: zoneInfoRef.current?.selfActorId ?? "",
                  emote: emote.id,
                }),
              )
            }
          >
            {emote.glyph}
          </button>
        ))}
      </div>
      {!localOnly && !presenceOnly ? (
        <StudioGodotLayoutPanel
          definition={spaceDef}
          revision={layoutRevision}
          dirty={layoutDirty}
          editMode={layoutEditMode}
          selection={layoutSelection}
          loadState={layoutLoadState}
          saveState={layoutSaveState}
          onRetryLoad={() => setLayoutFetchNonce((nonce) => nonce + 1)}
          onToggleEdit={handleToggleEditMode}
          onCommand={handleLayoutCommand}
          backgroundAssets={backgroundAssets}
          defaultBackground={
            catalog.find((def) => def.id === spaceId)?.background ?? null
          }
          backgroundUploadState={backgroundUploadState}
          backgroundError={backgroundError}
          onBackgroundChange={handleBackgroundChange}
          onBackgroundUpload={(file) => void handleBackgroundUpload(file)}
          onBackgroundDelete={(assetId) => void handleBackgroundDelete(assetId)}
          onSave={() => void handleLayoutSave()}
          onReload={() => {
            setLayoutSaveState("idle");
            setLayoutFetchNonce((nonce) => nonce + 1);
          }}
        />
      ) : null}
      {!localOnly && !presenceOnly && meetingContext?.selfInMeeting ? (
        <StudioGodotMeetingPanel
          route={meetingRoute}
          localStream={meetingLocalStream}
          remoteStream={meetingRemoteStream}
          selfName={displayName}
          peerName={meetingContext.peerName}
          presenterName={meetingContext.presenterName}
          onStart={() => {
            // 시작 클릭 시점까지 리스가 안 왔으면 먼저 기다린다 (느린 발급을
            // "준비 안 됨" 실패로 오인하지 않기 위해). 끝내 실패하면 세션이
            // failed 경로로 정직하게 표기한다.
            void ensureIceLease()
              .catch(() => undefined)
              .then(() => meetingSessionRef.current?.start());
          }}
          onStop={() => meetingSessionRef.current?.stop()}
          onToggleMic={(enabled) =>
            meetingSessionRef.current?.setMicEnabled(enabled)
          }
          onToggleCam={(enabled) =>
            meetingSessionRef.current?.setCamEnabled(enabled)
          }
        />
      ) : null}
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const text = chatDraft.trim();
          if (!text) return;
          setChatDraft("");
          appendChat(true, displayName, text);
          frameWindow()?.__tsvs_showBubble?.(
            JSON.stringify({
              actorId: zoneInfoRef.current?.selfActorId ?? "",
              text,
            }),
          );
        }}
      >
        <label className="grid gap-1 text-sm font-semibold">
          {bt("말풍선 채팅", "Bubble chat")}
          <input
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            maxLength={200}
            placeholder={bt(
              "가까운 상대에게 말풍선으로 보여요",
              "Shown as a bubble to nearby partners",
            )}
            className="w-72 rounded-xl border border-line bg-card px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="text-sm font-bold underline underline-offset-4"
        >
          {bt("보내기", "Send")}
        </button>
      </form>
      {chatLog.length > 0 ? (
        <ul
          aria-label={bt("말풍선 채팅 기록", "Bubble chat log")}
          className="mt-2 grid gap-1 text-sm"
        >
          {chatLog.map((entry) => (
            <li key={entry.id}>
              <b>{entry.fromSelf ? bt("나", "Me") : entry.name}</b>
              {": "}
              {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default StudioGodotSpaceEmbed;
