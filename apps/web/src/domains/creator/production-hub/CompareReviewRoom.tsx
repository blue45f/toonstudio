import { Camera, Columns2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { buttonClass } from "@/shared/components/ui/button-utils";

import type { StudioCommentActor, StudioCommentsDocument } from "../studio-comments";
import { CompareReviewViewer } from "./CompareReviewViewer";
import { CompareSourcePoolStrip, type ComparePoolStatus } from "./CompareSourcePoolStrip";
import {
  addComparePoolItem,
  addComparePoolItems,
  applyComparePreset,
  compareSourceKey,
  createEmptyCompareSession,
  defaultComparePanes,
  parseCompareSession,
  poolItemFromExternal,
  removeComparePoolItem,
  serializeCompareSession,
  summarizeComparePinGate,
  toggleComparePaneSource,
  type ComparePinGateSummary,
  type ComparePoolItem,
  type ComparePresetId,
  type CompareSession,
} from "./compare-review-model";
import {
  createCompareReviewSnapshot,
  type CompareReviewSnapshot,
} from "./compare-review-snapshot";
import type { ManuscriptPinAssigneeOption } from "./manuscript-pin-feedback-model";

function createAssetId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** URL 문자열의 안정 해시(같은 URL을 다시 넣어도 같은 소스가 되게). */
function hashCompareUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function urlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const file = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return file || parsed.hostname;
  } catch {
    return url;
  }
}

export interface CompareReviewRoomProps {
  readonly episodeId: string;
  /** 풀의 씨앗(버전 소스). 페이지 배선이 닿지 않은 경우 비워 두면 빈 풀로 시작한다. */
  readonly seedItems?: readonly ComparePoolItem[];
  /** 콘티 프리셋이 찾을 콘티 공정의 식별자(revision 소스의 processId). */
  readonly storyboardProcessId?: string | null;
  /** 전 회차 프리셋 후보 페이지들. 프리셋을 누를 때 풀에 합류한다. */
  readonly previousEpisodePages?: readonly ComparePoolItem[];
  readonly comments: StudioCommentsDocument;
  readonly onCommentsChange: (next: StudioCommentsDocument) => void;
  readonly currentActor: StudioCommentActor;
  readonly assigneeOptions?: readonly ManuscriptPinAssigneeOption[];
  readonly canEdit?: boolean;
  readonly onPickColor?: (hex: string) => void;
  /** 비교 핀 게이트 집계 변경 통지(회차 룸 승인 게이트 합산용). */
  readonly onPinGateSummaryChange?: (summary: ComparePinGateSummary) => void;
  /** 버전 소스가 없을 때 안내할 원고·버전 링크. */
  readonly manuscriptsHref?: string;
  /**
   * 외부 검수용 고정본 만들기(5단계). 지정하면 "고정본 만들기" 버튼이 생기고,
   * 누른 순간의 비교 구성+핀이 담긴 스냅샷이 콜백으로 나간다.
   * 호스트는 이를 serializeCompareReviewSnapshot으로 고정 검수본의
   * compareSnapshotJson에 넣거나 buildExternalCompareReviewUrl로 링크에 실는다.
   */
  readonly onCreateCompareSnapshot?: (snapshot: CompareReviewSnapshot) => void;
}

/**
 * 회차 룸의 "버전 비교" 탭 본체. 소스 풀 + 비교 뷰어 + 핀 게이트 집계를 한곳에서 소유한다.
 * 세션은 회차 단위로 이 기기에 저장된다(1단계 — 서버 계약이 생기면 같은 직렬화 포맷으로 이관).
 */
export function CompareReviewRoom({
  episodeId,
  seedItems = [],
  storyboardProcessId = null,
  previousEpisodePages = [],
  comments,
  onCommentsChange,
  currentActor,
  assigneeOptions = [],
  canEdit = true,
  onPickColor,
  onPinGateSummaryChange,
  manuscriptsHref,
  onCreateCompareSnapshot,
}: CompareReviewRoomProps) {
  const bt = useBilingual("CompareReview");
  const storageKey = `toonstudio.compare-review.${episodeId}`;
  const actorId = currentActor.id ?? "me";

  const [session, setSession] = useState<CompareSession>(() => {
    let restored = createEmptyCompareSession(episodeId);
    try {
      if (typeof window !== "undefined") {
        restored = parseCompareSession(window.localStorage.getItem(storageKey), episodeId);
      }
    } catch {
      /* 저장소 접근 실패 시 빈 세션으로 시작 */
    }
    const withSeeds = addComparePoolItems(restored, seedItems);
    return withSeeds.panes.length >= 2
      ? withSeeds
      : { ...withSeeds, panes: defaultComparePanes(withSeeds.pool) };
  });
  const [pinMode, setPinMode] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [poolStatus, setPoolStatus] = useState<ComparePoolStatus>({ state: "idle" });
  const [presetStatus, setPresetStatus] = useState<string | null>(null);
  const presetTimer = useRef<number | null>(null);

  // 씨앗(버전 소스)이 늦게 도착하면 풀에 합류시킨다. 이미 있는 소스는 모델이 중복을 막는다.
  useEffect(() => {
    if (seedItems.length === 0) return;
    setSession((current) => {
      const next = addComparePoolItems(current, seedItems);
      return next.panes.length >= 2 ? next : { ...next, panes: defaultComparePanes(next.pool) };
    });
  }, [seedItems]);

  // 세션 영속화. 저장 실패(용량 초과 등)는 조용히 넘긴다 — 비교가 멈추는 것보다 낫다.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, serializeCompareSession(session));
    } catch {
      /* noop */
    }
  }, [session, storageKey]);

  // 비교 핀 게이트 집계를 회차 룸에 통지(내용이 바뀔 때만).
  const lastSummaryJson = useRef("");
  useEffect(() => {
    if (!onPinGateSummaryChange) return;
    const summary = summarizeComparePinGate(comments, session.pool);
    const json = JSON.stringify(summary);
    if (json === lastSummaryJson.current) return;
    lastSummaryJson.current = json;
    onPinGateSummaryChange(summary);
  }, [comments, session.pool, onPinGateSummaryChange]);

  const announcePreset = useCallback((message: string) => {
    setPresetStatus(message);
    if (presetTimer.current) window.clearTimeout(presetTimer.current);
    presetTimer.current = window.setTimeout(() => setPresetStatus(null), 6000);
  }, []);

  const handleAddFiles = useCallback(
    (files: readonly File[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) {
        setPoolStatus({ state: "error", message: bt("이미지 파일만 비교 소스로 넣을 수 있습니다.", "Only image files can be added as compare sources.") });
        return;
      }
      setPoolStatus({ state: "adding", message: bt("이미지를 읽는 중…", "Reading images…") });
      const failures: string[] = [];
      let pending = images.length;
      const finish = () => {
        pending -= 1;
        if (pending > 0) return;
        setPoolStatus(failures.length
          ? { state: "error", message: bt(`일부 파일을 읽지 못했습니다: ${failures.join(", ")}`, `Some files could not be read: ${failures.join(", ")}`) }
          : { state: "idle" });
      };
      for (const file of images) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = typeof reader.result === "string" ? reader.result : null;
          if (dataUrl) {
            setSession((current) => addComparePoolItem(current, poolItemFromExternal({
              assetId: createAssetId("ext"),
              label: file.name,
              imageUrl: dataUrl,
              addedBy: actorId,
              addedAt: new Date().toISOString(),
            })));
          } else {
            failures.push(file.name);
          }
          finish();
        };
        reader.onerror = () => { failures.push(file.name); finish(); };
        reader.readAsDataURL(file);
      }
    },
    [actorId, bt],
  );

  const handleAddUrl = useCallback(
    (url: string, rightsNote: string) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        setPoolStatus({ state: "error", message: bt("URL 형식이 올바르지 않습니다.", "That URL doesn't look valid.") });
        return;
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        setPoolStatus({ state: "error", message: bt("http 또는 https URL만 넣을 수 있습니다.", "Only http or https URLs can be added.") });
        return;
      }
      setPoolStatus({ state: "adding", message: bt("이미지를 확인하는 중…", "Checking the image…") });
      const probe = new Image();
      const timer = window.setTimeout(() => {
        probe.src = "";
        setPoolStatus({ state: "error", message: bt("이미지를 불러오지 못했습니다. 공개 URL인지 확인해 주세요.", "Couldn't load that image. Check that the URL is public.") });
      }, 10_000);
      probe.onload = () => {
        window.clearTimeout(timer);
        setSession((current) => addComparePoolItem(current, poolItemFromExternal({
          assetId: `url-${hashCompareUrl(url)}`,
          label: urlLabel(url),
          imageUrl: url,
          addedBy: actorId,
          addedAt: new Date().toISOString(),
          ...(rightsNote ? { rightsNote } : {}),
        })));
        setPoolStatus({ state: "idle" });
      };
      probe.onerror = () => {
        window.clearTimeout(timer);
        setPoolStatus({ state: "error", message: bt("이미지를 불러오지 못했습니다. 공개 URL인지 확인해 주세요.", "Couldn't load that image. Check that the URL is public.") });
      };
      probe.src = url;
    },
    [actorId, bt],
  );

  const handleApplyPreset = useCallback(
    (preset: ComparePresetId) => {
      let base = session;
      if (preset === "previous-episode" && previousEpisodePages.length) {
        base = addComparePoolItems(base, previousEpisodePages);
      }
      const storyboardItem = storyboardProcessId
        ? [...base.pool].reverse().find((item) => item.source.kind === "revision" && item.source.processId === storyboardProcessId)
        : null;
      const result = applyComparePreset(base, preset, { storyboardSource: storyboardItem?.source ?? null });
      if (result.ok) {
        setSession(result.session);
        announcePreset(bt("프리셋을 적용했습니다. 이후 배치는 자유롭게 바꾸세요.", "Preset applied. Rearrange freely from here."));
        return;
      }
      if (base !== session) setSession(base);
      announcePreset(result.reason === "no-current"
        ? bt("먼저 현재 원고를 풀에 넣어 주세요.", "Add the current manuscript to the pool first.")
        : preset === "external-brief"
          ? bt("비교할 시안이 풀에 없습니다. 시안 이미지를 먼저 추가해 주세요.", "No client brief in the pool yet. Add the brief image first.")
          : bt("상대 소스가 풀에 없습니다. 소스를 먼저 모아 주세요.", "The counterpart source isn't in the pool yet. Collect sources first."));
    },
    [session, previousEpisodePages, storyboardProcessId, announcePreset, bt],
  );

  const handleCreateSnapshot = useCallback(() => {
    if (!onCreateCompareSnapshot) return;
    onCreateCompareSnapshot(createCompareReviewSnapshot({
      reviewId: "",
      session,
      comments,
      capturedAt: new Date().toISOString(),
      capturedBy: actorId,
    }));
    setSnapshotStatus(bt(
      "지금 비교 화면을 고정본으로 만들었습니다. 외부 검수 링크에서 이 구성과 핀이 그대로 열립니다.",
      "Pinned this comparison. The external review link will open this exact setup and its pins.",
    ));
  }, [onCreateCompareSnapshot, session, comments, actorId, bt]);

  const paneSourceKeys = useMemo(
    () => session.panes.map((source) => compareSourceKey(source)),
    [session.panes],
  );
  const hasRevisionSource = session.pool.some((item) => item.source.kind === "revision");

  return (
    <div className="space-y-3" data-testid="crv-room">
      {!hasRevisionSource && manuscriptsHref ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg-2">
          <Columns2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {bt(
              "아직 연결된 원고 버전이 없습니다. 외부 이미지만으로도 비교를 시작할 수 있고, 버전은 원고·버전에서 이어집니다.",
              "No manuscript versions connected yet. You can start with external images; versions connect from Manuscripts.",
            )}
          </span>
          <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })} to={manuscriptsHref}>
            {bt("원고·버전 열기", "Open Manuscripts")}
          </Link>
        </div>
      ) : null}

      {onCreateCompareSnapshot ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg-2">
          <Camera className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {snapshotStatus ?? bt(
              "외부 검수자에게는 지금 이 비교 구성(소스·모드·핀)을 고정한 링크를 보낼 수 있습니다.",
              "You can send external reviewers a link pinned to this exact comparison (sources, mode, pins).",
            )}
          </span>
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
            onClick={handleCreateSnapshot}
            disabled={!canEdit || session.pool.length === 0}
          >
            {bt("외부 검수용 고정본 만들기", "Pin for external review")}
          </button>
        </div>
      ) : null}

      <CompareSourcePoolStrip
        items={session.pool}
        paneSourceKeys={paneSourceKeys}
        onTogglePane={(item) => setSession((current) => toggleComparePaneSource(current, item.source))}
        onAddFiles={handleAddFiles}
        onAddUrl={handleAddUrl}
        onRemove={(item) => setSession((current) => removeComparePoolItem(current, item.id))}
        pinMode={pinMode}
        onTogglePinMode={() => setPinMode((value) => !value)}
        status={poolStatus}
        readOnly={!canEdit}
      />

      <CompareReviewViewer
        session={session}
        onSessionChange={setSession}
        comments={comments}
        onCommentsChange={onCommentsChange}
        currentActor={currentActor}
        assigneeOptions={assigneeOptions}
        canEdit={canEdit}
        pinMode={pinMode}
        onPinModeChange={setPinMode}
        onPickColor={onPickColor}
        onApplyPreset={handleApplyPreset}
        presetStatus={presetStatus}
      />
    </div>
  );
}
