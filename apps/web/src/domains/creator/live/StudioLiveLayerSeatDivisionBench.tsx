/**
 * Figma Dev Mode Ready-for-Dev Handoff & Miro Multi-Cursor Layer Collaboration 역공학 내재화:
 * V18 `studio-layer-seat-model.ts`의 순수 상태 머신(`claimStudioLayerSeat`, `leaveStudioLayerSeat`,
 * `requestStudioLayerSeat`, `handoffStudioLayerSeat`, `takeoverStudioLayerSeat`,
 * `studioLayerSeatModeAllowsIntent`)을 구동하는 실시간 레이어 좌석 분업·인계·강제인수 워크벤치.
 */

import type { HTMLAttributes } from "react";
import { useMemo, useState } from "react";
import { ArrowRightLeft, Lock, ShieldAlert, Sparkles, UserCheck, Users } from "lucide-react";

import {
  claimStudioLayerSeat,
  createStudioLayerSeatState,
  handoffStudioLayerSeat,
  leaveStudioLayerSeat,
  requestStudioLayerSeat,
  studioLayerSeatModeAllowsIntent,
  takeoverStudioLayerSeat,
  type StudioLayerAssignment,
  type StudioLayerAssignmentMode,
  type StudioLayerSeatIntent,
  type StudioLayerSeatState,
} from "./studio-layer-seat-model";

import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-2xl border ${className}`.trim()} {...props} />;
}

function Badge({
  className = "",
  variant: _variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { readonly variant?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[0.6875rem] font-semibold ${className}`.trim()}
      {...props}
    />
  );
}

interface LayerPresetMeta {
  readonly layerId: string;
  readonly resource: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly stageDescKo: string;
  readonly stageDescEn: string;
  readonly initialAssignment: StudioLayerAssignment;
}

interface ActorProfile {
  readonly userId: string;
  readonly sessionId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly moderate: boolean;
}

const ACTORS: readonly ActorProfile[] = Object.freeze([
  {
    userId: "user-story",
    sessionId: "sess-story-01",
    labelKo: "스토리·콘티 작가 (user-story)",
    labelEn: "Story & Continuity Artist (user-story)",
    moderate: false,
  },
  {
    userId: "user-ink",
    sessionId: "sess-ink-01",
    labelKo: "메인 선화 작가 (user-ink)",
    labelEn: "Lead Inking Artist (user-ink)",
    moderate: false,
  },
  {
    userId: "user-color",
    sessionId: "sess-color-01",
    labelKo: "채색·명암 어시 (user-color)",
    labelEn: "Color & Shading Assistant (user-color)",
    moderate: false,
  },
  {
    userId: "user-letter",
    sessionId: "sess-letter-01",
    labelKo: "식자·편집 담당 (user-letter)",
    labelEn: "Lettering Specialist (user-letter)",
    moderate: false,
  },
  {
    userId: "user-pd",
    sessionId: "sess-pd-mod",
    labelKo: "총괄 PD · 모더레이터 (user-pd)",
    labelEn: "Lead PD · Moderator (user-pd)",
    moderate: true,
  },
]);

const INTENTS: readonly {
  readonly id: StudioLayerSeatIntent;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  { id: "paint", labelKo: "브러시 작화 (paint)", labelEn: "Brush Paint (paint)" },
  { id: "erase", labelKo: "지우개 보정 (erase)", labelEn: "Erase Stroke (erase)" },
  { id: "transform", labelKo: "오브젝트 변형 (transform)", labelEn: "Transform Element (transform)" },
  { id: "text", labelKo: "대사·식자 편집 (text)", labelEn: "Edit Dialogue Text (text)" },
  { id: "filter", labelKo: "레이어 필터·보정 (filter)", labelEn: "Layer Filter FX (filter)" },
  { id: "merge", labelKo: "레이어 병합 (merge)", labelEn: "Merge Layer (merge)" },
]);

const MODES: readonly {
  readonly id: StudioLayerAssignmentMode;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  { id: "exclusive", labelKo: "단독 점유 (exclusive)", labelEn: "Exclusive Seat" },
  { id: "shared-strokes", labelKo: "공동 스트로크 (shared-strokes)", labelEn: "Shared Strokes" },
  { id: "shared-elements", labelKo: "공동 요소 편집 (shared-elements)", labelEn: "Shared Elements" },
  { id: "review-only", labelKo: "검수 전용 잠금 (review-only)", labelEn: "Review-Only Lock" },
]);

const INITIAL_LAYER_PRESETS: readonly LayerPresetMeta[] = Object.freeze([
  {
    layerId: "storyboard",
    resource: "layer:p1:storyboard",
    labelKo: "콘티·컷 분할 레이어",
    labelEn: "Storyboard & Cut Layout Layer",
    stageDescKo: "연출 동선 및 말풍선 앵커 기준선 (단독 점유)",
    stageDescEn: "Camera pacing & speech balloon anchor baseline (Exclusive)",
    initialAssignment: {
      layerId: "storyboard",
      assignedUserIds: ["user-story"],
      reviewerUserIds: ["user-pd"],
      status: "in-progress",
      mode: "exclusive",
    },
  },
  {
    layerId: "lineart",
    resource: "layer:p1:lineart",
    labelKo: "펜선·주인공 선화 레이어",
    labelEn: "Main Character Inking Layer",
    stageDescKo: "선화 메인 작가 + 선화 어시 공동 스트로크 허용",
    stageDescEn: "Lead inker + assistant concurrent brush/erase strokes",
    initialAssignment: {
      layerId: "lineart",
      assignedUserIds: ["user-ink", "user-story"],
      reviewerUserIds: ["user-pd"],
      status: "assigned",
      mode: "shared-strokes",
    },
  },
  {
    layerId: "flats",
    resource: "layer:p1:flats",
    labelKo: "밑색·배경 톤 분리 레이어",
    labelEn: "Flats & Base Tone Separation Layer",
    stageDescKo: "펜선 폐합 영역 기준 파트별 밑색 채우기",
    stageDescEn: "Closed-line region flat fill by part",
    initialAssignment: {
      layerId: "flats",
      assignedUserIds: ["user-color"],
      reviewerUserIds: ["user-ink"],
      status: "assigned",
      mode: "shared-strokes",
    },
  },
  {
    layerId: "shading",
    resource: "layer:p1:shading",
    labelKo: "명암·조명 이펙트 레이어",
    labelEn: "Shading & Lighting FX Layer",
    stageDescKo: "역광·블러·색수차 후보정 (검수 단계 리뷰어 전용)",
    stageDescEn: "Rim light, blur & chromatic FX (Reviewers only in review status)",
    initialAssignment: {
      layerId: "shading",
      assignedUserIds: ["user-color"],
      reviewerUserIds: ["user-pd"],
      status: "review",
      mode: "exclusive",
    },
  },
  {
    layerId: "lettering",
    resource: "layer:p1:lettering",
    labelKo: "식자·말풍선 타이포 레이어",
    labelEn: "Lettering & Balloon Typography Layer",
    stageDescKo: "대사 텍스트 및 말풍선 변형 공동 작업 허용",
    stageDescEn: "Shared dialogue text & balloon transform editing",
    initialAssignment: {
      layerId: "lettering",
      assignedUserIds: ["user-letter"],
      reviewerUserIds: ["user-story"],
      status: "assigned",
      mode: "shared-elements",
    },
  },
]);

function createInitialSeatMap(): Record<string, StudioLayerSeatState> {
  const out: Record<string, StudioLayerSeatState> = {};
  for (const preset of INITIAL_LAYER_PRESETS) {
    const state = createStudioLayerSeatState(preset.initialAssignment);
    if (state) {
      out[preset.layerId] = state;
    }
  }
  return out;
}

export function StudioLiveLayerSeatDivisionBench() {
  const bt = useBilingual("StudioLiveLayerSeatDivisionBench");
  const [seatStates, setSeatStates] = useState<Record<string, StudioLayerSeatState>>(createInitialSeatMap);
  const [selectedLayerId, setSelectedLayerId] = useState<string>("lineart");
  const [selectedActorId, setSelectedActorId] = useState<string>("user-ink");
  const [selectedIntent, setSelectedIntent] = useState<StudioLayerSeatIntent>("paint");
  const [handoffTargetUserId, setHandoffTargetUserId] = useState<string>("user-color");
  const [leaseCounter, setLeaseCounter] = useState<number>(1);
  const [banner, setBanner] = useState<{
    readonly tone: "good" | "bad" | "warn";
    readonly code: string;
    readonly message: string;
  } | null>(null);

  const activePreset =
    INITIAL_LAYER_PRESETS.find((item) => item.layerId === selectedLayerId) ?? INITIAL_LAYER_PRESETS[0];
  const activeSeatState = seatStates[activePreset.layerId];
  const activeActor = ACTORS.find((actor) => actor.userId === selectedActorId) ?? ACTORS[0];

  const summaryCounts = useMemo(() => {
    const states = Object.values(seatStates);
    const activeLeases = states.reduce((acc, s) => acc + s.leases.length, 0);
    const pendingRequests = states.reduce((acc, s) => acc + s.pendingRequests.length, 0);
    const inProgressCount = states.filter((s) => s.assignment.status === "in-progress").length;
    return { activeLeases, pendingRequests, inProgressCount };
  }, [seatStates]);

  function handleClaimSeat() {
    const now = 1_760_000_000_000 + leaseCounter * 1000;
    const leaseId = `lease-${activePreset.layerId}-${activeActor.userId}-${leaseCounter}`;
    const result = claimStudioLayerSeat({
      state: activeSeatState,
      resource: activePreset.resource,
      userId: activeActor.userId,
      sessionId: activeActor.sessionId,
      leaseId,
      intent: selectedIntent,
      now,
      leaseDurationMs: 300_000,
    });
    setLeaseCounter((prev) => prev + 1);
    if (!result.ok) {
      setBanner({
        tone: "bad",
        code: result.code,
        message: `${bt("좌석 점유 거부", "Seat claim denied")} [${result.code}]: ${result.reason}`,
      });
      return;
    }
    setSeatStates((prev) => ({
      ...prev,
      [activePreset.layerId]: result.state,
    }));
    setBanner({
      tone: "good",
      code: "claim-ok",
      message: bt(
        `${activeActor.labelKo}님이 '${activePreset.labelKo}' 좌석을 '${selectedIntent}' 의도로 점유했습니다.`,
        `${activeActor.labelEn} claimed '${activePreset.labelEn}' seat with '${selectedIntent}' intent.`
      ),
    });
  }

  function handleLeaveSeat(leaseId: string, sessionId: string) {
    const now = 1_760_000_000_000 + leaseCounter * 1000;
    const result = leaveStudioLayerSeat({
      state: activeSeatState,
      leaseId,
      sessionId,
      now,
    });
    setLeaseCounter((prev) => prev + 1);
    if (!result.ok) {
      setBanner({
        tone: "bad",
        code: result.code,
        message: `${bt("좌석 반납 거부", "Seat release denied")} [${result.code}]: ${result.reason}`,
      });
      return;
    }
    setSeatStates((prev) => ({
      ...prev,
      [activePreset.layerId]: result.state,
    }));
    setBanner({
      tone: "good",
      code: "leave-ok",
      message: bt(
        `임대(${leaseId}) 좌석을 정상 반납했습니다.`,
        `Released seat lease (${leaseId}).`
      ),
    });
  }

  function handleRequestSeat() {
    const now = 1_760_000_000_000 + leaseCounter * 1000;
    const result = requestStudioLayerSeat({
      state: activeSeatState,
      userId: activeActor.userId,
      intent: selectedIntent,
      now,
    });
    setLeaseCounter((prev) => prev + 1);
    if (!result.ok) {
      setBanner({
        tone: "warn",
        code: result.code,
        message: `${bt("좌석 대기 요청 거부", "Seat petition denied")} [${result.code}]: ${result.reason}`,
      });
      return;
    }
    setSeatStates((prev) => ({
      ...prev,
      [activePreset.layerId]: result.state,
    }));
    setBanner({
      tone: "good",
      code: "request-ok",
      message: bt(
        `${activeActor.labelKo}님이 '${activePreset.labelKo}' 좌석 대기열에 등록되었습니다.`,
        `${activeActor.labelEn} queued a seat request on '${activePreset.labelEn}'.`
      ),
    });
  }

  function handleHandoffSeat() {
    const now = 1_760_000_000_000 + leaseCounter * 1000;
    const result = handoffStudioLayerSeat({
      state: activeSeatState,
      fromUserId: activeActor.userId,
      toUserId: handoffTargetUserId,
      now,
    });
    setLeaseCounter((prev) => prev + 1);
    if (!result.ok) {
      setBanner({
        tone: "bad",
        code: result.code,
        message: `${bt("좌석 인계 거부", "Seat handoff denied")} [${result.code}]: ${result.reason}`,
      });
      return;
    }
    setSeatStates((prev) => ({
      ...prev,
      [activePreset.layerId]: result.state,
    }));
    setBanner({
      tone: "good",
      code: "handoff-ok",
      message: bt(
        `${activeActor.userId} → ${handoffTargetUserId}로 '${activePreset.labelKo}' 담당 좌석을 인계했습니다.`,
        `Handed off '${activePreset.labelEn}' seat from ${activeActor.userId} to ${handoffTargetUserId}.`
      ),
    });
  }

  function handleTakeoverSeat() {
    const now = 1_760_000_000_000 + leaseCounter * 1000;
    const result = takeoverStudioLayerSeat({
      state: activeSeatState,
      byUserId: activeActor.userId,
      capabilities: { moderate: activeActor.moderate },
      now,
    });
    setLeaseCounter((prev) => prev + 1);
    if (!result.ok) {
      setBanner({
        tone: "bad",
        code: result.code,
        message: `${bt("강제 인수 거부", "Forced takeover denied")} [${result.code}]: ${result.reason}`,
      });
      return;
    }
    setSeatStates((prev) => ({
      ...prev,
      [activePreset.layerId]: result.state,
    }));
    setBanner({
      tone: "good",
      code: "takeover-ok",
      message: bt(
        `모더레이터(${activeActor.userId})가 '${activePreset.labelKo}' 좌석을 강제 인수하고 상태를 진행 중으로 전환했습니다.`,
        `Moderator (${activeActor.userId}) forcibly took over '${activePreset.labelEn}' and reopened as in-progress.`
      ),
    });
  }

  function handleModeChange(mode: StudioLayerAssignmentMode) {
    setSeatStates((prev) => {
      const current = prev[activePreset.layerId];
      return {
        ...prev,
        [activePreset.layerId]: {
          ...current,
          assignment: {
            ...current.assignment,
            mode,
          },
        },
      };
    });
    setBanner({
      tone: "good",
      code: "mode-updated",
      message: bt(
        `'${activePreset.labelKo}' 공유 모드를 '${mode}'로 전환했습니다.`,
        `Switched '${activePreset.labelEn}' sharing mode to '${mode}'.`
      ),
    });
  }

  return (
    <Card
      className="border-line bg-panel p-4 sm:p-5"
      data-testid="studio-live-layer-seat-division-bench"
      role="region"
      aria-label={bt(
        "실시간 레이어 좌석 분업·인계·강제인수 워크벤치",
        "Live Layer Seat Division, Handoff & Takeover Workbench"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-accent/40 bg-accent/10 text-accent">
              <Sparkles className="mr-1 size-3" aria-hidden="true" />
              {bt("Figma Dev Mode · Miro Layer Lock 내재화", "Figma Dev Mode · Miro Layer Lock Internalized")}
            </Badge>
            <Badge variant="outline">
              {bt(
                `활성 임대 ${summaryCounts.activeLeases}건 · 대기 요청 ${summaryCounts.pendingRequests}건`,
                `${summaryCounts.activeLeases} Active Leases · ${summaryCounts.pendingRequests} Pending Petitions`
              )}
            </Badge>
          </div>
          <h3 className="mt-2 text-base font-bold text-fg">
            {bt(
              "웹툰 5공정 레이어 좌석(Layer Seat) 분업·인계·충돌 방지 워크벤치",
              "Webtoon 5-Stage Layer Seat Division, Handoff & Conflict Guard Workbench"
            )}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "콘티·선화·밑색·명암·식자 레이어별로 단독 점유(exclusive), 공동 스트로크(shared-strokes), 공동 요소(shared-elements), 검수 잠금(review-only)을 제어하여 동시 작업 중 브러시·필터 충돌을 원천 차단합니다.",
              "Prevents simultaneous brush/filter collisions across Storyboard, Inking, Flats, Shading, and Lettering layers via fail-closed seat leases and handoffs."
            )}
          </p>
        </div>
      </div>

      {/* 레이어 탭 선택 */}
      <div
        className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        role="group"
        aria-label={bt("분업 레이어 좌석 선택", "Select division layer seat")}
      >
        {INITIAL_LAYER_PRESETS.map((preset) => {
          const state = seatStates[preset.layerId];
          const selected = preset.layerId === activePreset.layerId;
          return (
            <button
              key={preset.layerId}
              type="button"
              aria-pressed={selected}
              data-testid={`layer-seat-tab-${preset.layerId}`}
              onClick={() => setSelectedLayerId(preset.layerId)}
              className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-colors ${
                selected
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-line bg-raised/60 text-fg-2 hover:border-accent/40 hover:text-fg"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[0.6875rem] text-fg-3">{preset.resource}</span>
                  <span className="rounded bg-panel px-1.5 py-0.5 text-[0.6875rem] font-semibold text-accent">
                    {state.assignment.mode}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-bold text-fg">
                  {bt(preset.labelKo, preset.labelEn)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[0.6875rem] text-fg-3">
                <span>
                  {bt("상태", "Status")}: <strong className="text-fg-2">{state.assignment.status}</strong>
                </span>
                <span>
                  {bt("점유", "Leases")} {state.leases.length} · {bt("대기", "Queue")} {state.pendingRequests.length}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 실시간 피드백 배너 (Accessible Error & State Announcement) */}
      <div aria-live="polite" className="mt-3">
        {banner ? (
          <div
            data-testid="layer-seat-transition-banner"
            data-banner-code={banner.code}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
              banner.tone === "good"
                ? "border-good/40 bg-good/10 text-fg"
                : banner.tone === "warn"
                  ? "border-warn/40 bg-warn/10 text-fg"
                  : "border-bad/40 bg-bad/10 text-fg"
            }`}
          >
            <span>{banner.message}</span>
            <span className="font-mono text-[0.6875rem] text-fg-3">{banner.code}</span>
          </div>
        ) : null}
      </div>

      {/* 좌석 조작 컨트롤 + 현재 레이어 상세 */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3 rounded-xl border border-line bg-raised/40 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-fg">
                {bt(activePreset.labelKo, activePreset.labelEn)} ({activePreset.resource})
              </p>
              <p className="text-[0.6875rem] text-fg-3">
                {bt(activePreset.stageDescKo, activePreset.stageDescEn)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[0.6875rem]">
              <span className="rounded-lg border border-line bg-panel px-2 py-1 text-fg-2">
                {bt("담당자", "Assignees")}:{" "}
                <strong className="text-fg">{activeSeatState.assignment.assignedUserIds.join(", ")}</strong>
              </span>
              <span className="rounded-lg border border-line bg-panel px-2 py-1 text-fg-2">
                {bt("리뷰어", "Reviewers")}:{" "}
                <strong className="text-fg">{activeSeatState.assignment.reviewerUserIds.join(", ")}</strong>
              </span>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block text-xs font-semibold text-fg-2">
              {bt("실행 작업자 (세션)", "Active Actor (Session)")}
              <select
                data-testid="layer-seat-actor-select"
                value={selectedActorId}
                onChange={(event) => setSelectedActorId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg"
              >
                {ACTORS.map((actor) => (
                  <option key={actor.userId} value={actor.userId}>
                    {bt(actor.labelKo, actor.labelEn)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-fg-2">
              {bt("작업 의도 (Intent)", "Seat Intent")}
              <select
                data-testid="layer-seat-intent-select"
                value={selectedIntent}
                onChange={(event) => setSelectedIntent(event.target.value as StudioLayerSeatIntent)}
                className="mt-1 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg"
              >
                {INTENTS.map((intent) => (
                  <option key={intent.id} value={intent.id}>
                    {bt(intent.labelKo, intent.labelEn)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-fg-2">
              {bt("공유 모드 (Mode)", "Sharing Mode")}
              <select
                data-testid="layer-seat-mode-select"
                value={activeSeatState.assignment.mode}
                onChange={(event) =>
                  handleModeChange(event.target.value as StudioLayerAssignmentMode)
                }
                className="mt-1 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg"
              >
                {MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {bt(mode.labelKo, mode.labelEn)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 액션 버튼 */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              data-testid="layer-seat-claim-btn"
              onClick={handleClaimSeat}
            >
              <UserCheck className="mr-1.5 size-3.5" aria-hidden="true" />
              {bt("좌석 점유 (Claim)", "Claim Seat")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="layer-seat-request-btn"
              onClick={handleRequestSeat}
            >
              <Users className="mr-1.5 size-3.5" aria-hidden="true" />
              {bt("좌석 대기 요청 (Petition)", "Request Seat")}
            </Button>
            <div className="flex items-center gap-1.5">
              <select
                aria-label={bt("인계 받을 작업자", "Handoff recipient")}
                data-testid="layer-seat-handoff-target-select"
                value={handoffTargetUserId}
                onChange={(event) => setHandoffTargetUserId(event.target.value)}
                className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-fg"
              >
                {ACTORS.map((actor) => (
                  <option key={actor.userId} value={actor.userId}>
                    → {actor.userId}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="layer-seat-handoff-btn"
                onClick={handleHandoffSeat}
              >
                <ArrowRightLeft className="mr-1.5 size-3.5" aria-hidden="true" />
                {bt("담당 인계 (Handoff)", "Handoff Seat")}
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="layer-seat-takeover-btn"
              onClick={handleTakeoverSeat}
            >
              <ShieldAlert className="mr-1.5 size-3.5 text-warn" aria-hidden="true" />
              {bt("총괄 강제 인수 (Takeover)", "Moderator Takeover")}
            </Button>
          </div>

          {/* 활성 임대 및 대기열 목록 */}
          <div className="grid gap-2.5 pt-2 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel p-2.5">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3">
                {bt("현재 활성 좌석 임대", "Active Seat Leases")} ({activeSeatState.leases.length})
              </p>
              {activeSeatState.leases.length === 0 ? (
                <p className="mt-1.5 text-xs text-fg-3">
                  {bt("점유 중인 세션이 없습니다.", "No active seat leases.")}
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {activeSeatState.leases.map((lease) => (
                    <li
                      key={lease.leaseId}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-raised px-2 py-1.5 text-xs"
                    >
                      <span className="truncate text-fg">
                        <strong>{lease.userId}</strong> · {lease.intent}
                      </span>
                      <button
                        type="button"
                        data-testid={`layer-seat-leave-${lease.leaseId}`}
                        onClick={() => handleLeaveSeat(lease.leaseId, lease.sessionId)}
                        className="rounded border border-line bg-panel px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:text-fg"
                      >
                        {bt("반납", "Leave")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-line bg-panel p-2.5">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3">
                {bt("좌석 대기 요청 큐", "Pending Seat Petitions")} ({activeSeatState.pendingRequests.length})
              </p>
              {activeSeatState.pendingRequests.length === 0 ? (
                <p className="mt-1.5 text-xs text-fg-3">
                  {bt("대기 중인 좌석 요청이 없습니다.", "No pending petitions.")}
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {activeSeatState.pendingRequests.map((req) => (
                    <li
                      key={req.userId}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-raised px-2 py-1.5 text-xs text-fg"
                    >
                      <span>
                        <strong>{req.userId}</strong> ({req.intent})
                      </span>
                      <span className="text-[0.6875rem] text-accent">
                        {bt("인계 대기", "Awaiting handoff")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* 공유 모드 × 작업 의도 허용 매트릭스 */}
        <div className="rounded-xl border border-line bg-raised/40 p-3.5">
          <div className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-accent" aria-hidden="true" />
            <h4 className="text-xs font-bold text-fg">
              {bt(
                "공유 모드 × 작업 의도 Fail-Closed 허용 매트릭스",
                "Sharing Mode × Seat Intent Fail-Closed Permission Matrix"
              )}
            </h4>
          </div>
          <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
            {bt(
              "레이어 전체에 영향을 주는 필터(filter)·병합(merge)은 단독 점유(exclusive)에서만 허용됩니다.",
              "Layer-wide structural intents (filter, merge) are strictly limited to exclusive mode."
            )}
          </p>
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[0.6875rem]">
              <thead>
                <tr className="border-b border-line text-fg-3">
                  <th className="py-1.5 pr-2 font-semibold">{bt("의도", "Intent")}</th>
                  {MODES.map((m) => (
                    <th key={m.id} className="px-1.5 py-1.5 text-center font-semibold">
                      {m.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INTENTS.map((intent) => (
                  <tr key={intent.id} className="border-b border-line/60">
                    <td className="py-1.5 pr-2 font-semibold text-fg">{intent.id}</td>
                    {MODES.map((mode) => {
                      const allowed = studioLayerSeatModeAllowsIntent(mode.id, intent.id);
                      const isCurrentCell =
                        mode.id === activeSeatState.assignment.mode && intent.id === selectedIntent;
                      return (
                        <td
                          key={mode.id}
                          className={`px-1.5 py-1.5 text-center font-mono ${
                            isCurrentCell ? "bg-accent/15 font-bold" : ""
                          }`}
                        >
                          <span className={allowed ? "text-good" : "text-bad"}>
                            {allowed ? "ALLOW" : "DENY"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}
