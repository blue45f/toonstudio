import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import {
  requestServiceCapabilityRefresh,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useServiceStatusSlot, type ServiceStatusSlot } from "@/shared/lib/modal-status-slot";
import { useOverlayClearance } from "@/shared/lib/overlay-clearance";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const COPY_SCOPE = "ServiceDegradedBanner";

/** 서버가 보고한 기능 키 → 사용자에게 보이는 이름(한국어·영어). */
const CAPABILITY_LABELS = {
  authSession: ["로그인·세션", "Sign-in & sessions"],
  communityRead: ["커뮤니티 조회", "Community browsing"],
  communityWrite: ["커뮤니티 작성", "Community posting"],
  marketplaceRead: ["마켓 리소스", "Market resources"],
  studioProjectRead: ["서버 프로젝트 불러오기", "Loading server projects"],
  studioCloudSave: ["클라우드 저장", "Cloud save"],
  realtimeCollaboration: ["실시간 협업", "Real-time collaboration"],
  publishing: ["게시", "Publishing"],
  serverAi: ["서버 AI", "Server AI"],
} as const satisfies Record<string, readonly [string, string]>;

const DETAIL_LIMIT = 4;

type CapabilityLabel = (typeof CAPABILITY_LABELS)[keyof typeof CAPABILITY_LABELS];

function unavailableLabels(
  capabilities: Record<string, string> | undefined,
): CapabilityLabel[] {
  if (!capabilities) return [];
  return Object.entries(CAPABILITY_LABELS)
    .filter(([key]) => capabilities[key] === "unavailable" || capabilities[key] === "degraded")
    .map(([, label]) => label);
}

export function ServiceDegradedBanner({ immersive = false }: { immersive?: boolean }) {
  const state = useServiceCapabilityState();
  const bt = useBilingual(COPY_SCOPE);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  // 몰입형은 모든 폭에서 한 줄로 접고, 일반 화면은 휴대폰 폭(<640px)에서만 설명을 접는다.
  const collapsed = !detailsExpanded;
  const compact = immersive && collapsed;
  const bannerRef = useRef<HTMLDivElement>(null);
  const visible = state.status === "degraded" || recoveryVisible;
  // 거의 전체 화면을 쓰는 모달이 상태 자리를 내주면 떠 있는 배너 대신 그 자리에 한 줄 칩으로 들어간다.
  // 떠 있는 배너(z-90)가 모달의 뷰포트 아래쪽·검색창을 가리던 문제를 막는다(알림은 숨기지 않는다).
  const statusSlot = useServiceStatusSlot();

  // 실제 알림 높이를 공유해 OST·베타 안내가 경고·재시도 버튼을 가리거나 그 아래 숨지 않게 한다.
  // 웜업 동안에는 이 컴포넌트가 연결 칩을 따로 렌더링해 bannerRef가 비어 있으므로,
  // 렌더링 형태가 바뀌는 전이(웜업→저하·복구)에서도 다시 재도록 상태 조합을 다시 잼 키에 넣는다.
  useOverlayClearance(
    bannerRef,
    visible && immersive && statusSlot === null,
    `${state.status}:${state.warmingUp === true}:${compact}`,
  );

  useEffect(() => {
    if (!state.recoveredAt) return;
    setRecoveryVisible(true);
    const remaining = Math.max(0, 8_000 - (Date.now() - state.recoveredAt));
    const timer = globalThis.setTimeout(() => setRecoveryVisible(false), remaining);
    return () => globalThis.clearTimeout(timer);
  }, [state.recoveredAt]);

  const unavailable = useMemo(
    () => unavailableLabels(state.report?.capabilities),
    [state.report?.capabilities],
  );
  if (!visible) return null;
  if (state.warmingUp === true && state.status === "degraded") {
    return statusSlot
      ? <ServiceStatusSlotNotice
          slot={statusSlot}
          tone="warming"
          title={bt("온라인 기능을 연결하는 중이에요.", "Connecting online features.")}
          description={bt("탐색과 로컬 작업은 지금 바로 할 수 있어요.", "You can browse and work locally right now.")}
        />
      : <ServiceWarmupNotice immersive={immersive} />;
  }

  const recovered = state.status === "available" && recoveryVisible;
  const hiddenCount = Math.max(0, unavailable.length - DETAIL_LIMIT);
  const detail = unavailable.length > 0
    ? bt(
      `${unavailable.slice(0, DETAIL_LIMIT).map(([ko]) => ko).join(" · ")}${hiddenCount ? ` 외 ${hiddenCount}개` : ""}`,
      `${unavailable.slice(0, DETAIL_LIMIT).map(([, en]) => en).join(" · ")}${hiddenCount ? ` and ${hiddenCount} more` : ""}`,
    )
    : null;
  const title = recovered
    ? bt("온라인 기능이 복구되었습니다.", "Online features are back.")
    : detail
      ? bt("일부 온라인 기능을 잠시 사용할 수 없습니다.", "Some online features are temporarily unavailable.")
      : bt("온라인 연결 상태를 다시 확인하고 있습니다.", "Rechecking the online connection.");
  const description = recovered
    ? bt("대기 중인 저장과 동기화를 순서대로 다시 확인합니다.", "Pending saves and sync are being rechecked in order.")
    : detail
      ? bt(
        `${detail}이 제한됩니다. 탐색과 로컬 편집은 계속 사용할 수 있습니다.`,
        `${detail} are limited. Browsing and local editing keep working.`,
      )
      : bt(
        "일부 온라인 요청의 응답을 확인하지 못했습니다. 서비스 전체 장애로 확인된 것은 아니며, 탐색과 로컬 편집은 계속 사용할 수 있습니다.",
        "Some online requests did not respond. This is not a confirmed full outage, and browsing and local editing keep working.",
      );

  if (statusSlot) {
    return (
      <ServiceStatusSlotNotice
        slot={statusSlot}
        tone={recovered ? "recovered" : "degraded"}
        title={title}
        description={description}
        checking={state.checking}
        onRefresh={recovered ? undefined : requestServiceCapabilityRefresh}
      />
    );
  }

  return (
    <div
      ref={bannerRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-service-degraded-banner={recovered ? "recovered" : "degraded"}
      className={cn(
        "border-y px-3 py-2.5 text-sm shadow-sm",
        recovered
          ? "border-good/35 bg-good/10 text-good"
          : "border-warn/40 bg-warn/10 text-fg",
        immersive
          && "pointer-events-none fixed left-1/2 bottom-[calc(max(5.5rem,var(--immersive-dock-clearance,0px),calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem))+env(safe-area-inset-bottom))] z-[90] w-[min(46rem,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl border bg-panel",
      )}
    >
      <div className={cn("mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-2",
        immersive && "max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:items-start") }>
        {recovered
          ? <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          : <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden="true" />}
        <div className="min-w-0 flex-1 break-keep">
          <p className="font-bold">{title}</p>
          <p hidden={compact} className={cn("mt-0.5 text-xs leading-relaxed text-fg-2", !immersive && collapsed && "max-sm:hidden")}>{description}</p>
        </div>
        <button
          type="button"
          aria-label={collapsed
            ? bt("서비스 상태 알림 펼치기", "Expand the service status notice")
            : bt("서비스 상태 알림 접기", "Collapse the service status notice")}
          aria-expanded={!collapsed}
          onClick={() => setDetailsExpanded((expanded) => !expanded)}
          className={cn("grid size-11 shrink-0 place-items-center rounded-xl border border-current/20", !immersive && "sm:hidden", immersive && "pointer-events-auto")}
        >
          {collapsed ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {!recovered ? (
          <div className={cn("ml-auto flex shrink-0 items-center gap-2 max-sm:ml-0 max-sm:grid max-sm:w-full max-sm:grid-cols-2",
            immersive && "pointer-events-auto max-sm:col-span-2") }>
            <button
              type="button"
              onClick={requestServiceCapabilityRefresh}
              disabled={state.checking}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-warn/40 px-3 text-xs font-bold disabled:opacity-50 max-sm:justify-center"
            >
              <RefreshCw
                className={cn("size-3.5", state.checking && "animate-spin motion-reduce:animate-none")}
                aria-hidden="true"
              />
              {state.checking ? bt("확인 중", "Checking") : bt("다시 확인", "Check again")}
            </button>
            <Link
              href="/status"
              className="inline-flex min-h-11 items-center rounded-xl bg-fg px-3 text-xs font-bold text-canvas max-sm:justify-center"
            >
              {bt("상태 자세히", "Status details")}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 알림 열(왼쪽 아래)의 맨 아래 칸. 넓은 화면은 왼쪽 아래 모서리에, 휴대폰은 하단 탭 위 기준선에 놓고
 * 오른쪽 조작 열(⚙·음성 안내·맨 위로)을 비켜 폭을 줄인다.
 * 위에 쌓이는 OST·베타 안내는 이 칩이 게시한 높이(useOverlayClearance)만큼 올라가 서로 가리지 않는다.
 * 칩은 모든 폭에서 한 줄로 유지한다 — 두 번째 문장까지 보이면 칩이 두 줄·넓어져
 * 첫 화면 본문 카드를 덮는 면적이 커지기 때문이다(보조 설명은 화면 읽기 전용으로 남긴다).
 */
const WARMUP_CHIP_CLASS = cn(
  "pointer-events-none fixed left-4 z-[90] flex w-max items-center gap-2.5 border border-line bg-panel/95 text-sm text-fg-2 shadow-lg backdrop-blur-md",
  "bottom-[calc(max(1rem,var(--immersive-dock-clearance,0px),calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem))+env(safe-area-inset-bottom))] max-w-[min(24rem,calc(100vw-2rem))] rounded-2xl px-4 py-2",
  "max-md:bottom-[max(var(--site-float-base),calc(var(--immersive-dock-clearance,0px)+env(safe-area-inset-bottom)),calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem+env(safe-area-inset-bottom)))] max-md:left-3 max-md:max-w-[calc(100vw-0.75rem-max(0.75rem,var(--site-float-column)))] max-md:rounded-[1.25rem] max-md:px-3",
);

/**
 * 연결 준비 중임을 알리는 안내. 일반 페이지는 머리글 아래 본문 흐름에 놓아 행동을 덮지 않는다.
 * 몰입 화면에서는 기존 한 줄 칩과 모달 상태 자리를 유지한다.
 */
function ServiceWarmupNotice({ immersive }: { readonly immersive: boolean }) {
  const bt = useBilingual(COPY_SCOPE);
  const chipRef = useRef<HTMLDivElement>(null);
  useOverlayClearance(chipRef, immersive);
  return (
    <div
      ref={chipRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-service-degraded-banner="warming"
      data-service-status-placement={immersive ? "floating" : "page-inline"}
      className={immersive ? WARMUP_CHIP_CLASS : "flex min-w-0 items-center justify-center gap-2 border-b border-line bg-panel px-3 py-1 text-xs text-fg-2"}
    >
      <LoaderCircle className="size-4 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
      <span className="min-w-0 break-keep">
        <strong className="font-bold text-fg">{bt("온라인 기능을 연결하는 중이에요.", "Connecting online features.")}</strong>{" "}
        <span className="sr-only">{bt("탐색과 로컬 작업은 지금 바로 할 수 있어요.", "You can browse and work locally right now.")}</span>
      </span>
    </div>
  );
}

/**
 * 모달이 내준 상태 자리에 들어가는 한 줄 칩. 떠 있는 배너와 같은 상태·문구를 쓰되
 * 설명은 화면 읽기용(sr-only)과 툴팁으로만 두고, 다시 확인 버튼 하나만 남긴다.
 */
interface ServiceStatusNoticeProps {
  readonly tone: "degraded" | "recovered" | "warming";
  readonly title: string;
  readonly description: string;
  readonly checking?: boolean;
  readonly onRefresh?: () => void;
}

/** 모달에는 한 줄 칩, 편집기에는 같은 상태 버튼의 요약과 펼쳐 보는 상세를 제공한다. */
function ServiceStatusSlotNotice({ slot, ...notice }: ServiceStatusNoticeProps & { readonly slot: ServiceStatusSlot }) {
  const bt = useBilingual(COPY_SCOPE);
  if (slot.kind === "modal") return createPortal(<ServiceStatusSlotChip {...notice} />, slot.element);
  const Icon = notice.tone === "warming" ? LoaderCircle : notice.tone === "recovered" ? CheckCircle2 : AlertTriangle;
  const label = notice.tone === "warming"
    ? bt("온라인 연결 확인 중", "Checking online connection")
    : notice.tone === "recovered"
      ? bt("온라인 기능 복구", "Online features restored")
      : bt("온라인 기능 확인 필요", "Check online features");
  const compactWarmup = notice.tone === "warming" && slot.summary.dataset.studioDrawingSaveSummary === "true";
  return <>
    {!compactWarmup && createPortal(
      <span role="status" aria-live="polite" aria-atomic="true" title={notice.title}
        data-service-status-placement="editor-summary" data-service-degraded-banner={notice.tone}
        className="inline-flex min-w-0 items-center gap-1 text-xs text-fg-2">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
        <span className="sr-only">{notice.title}</span>
      </span>, slot.summary,
    )}
    {createPortal(
      <section aria-label={bt("온라인 연결 상태", "Online connection status")}
        data-service-status-placement="editor-details" className="mt-3 rounded-lg border border-line bg-panel/60 p-2.5 text-xs">
        <p className="font-semibold text-fg">{notice.title}</p>
        <p className="mt-1 leading-relaxed text-fg-2">{notice.description}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {notice.onRefresh ? <button type="button" onClick={notice.onRefresh} disabled={notice.checking}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-lg border border-line px-3 font-semibold disabled:opacity-50">
            <RefreshCw className={cn("size-3.5", notice.checking && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
            {notice.checking ? bt("확인 중", "Checking") : bt("다시 확인", "Check again")}
          </button> : null}
          <Link href="/status" className="inline-flex min-h-12 items-center rounded-lg border border-line px-3 font-semibold">
            {bt("상태 자세히", "Status details")}
          </Link>
        </div>
      </section>, slot.element,
    )}
  </>;
}

function ServiceStatusSlotChip({
  tone,
  title,
  description,
  checking = false,
  onRefresh,
}: ServiceStatusNoticeProps): ReactElement {
  const bt = useBilingual(COPY_SCOPE);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-service-degraded-banner={tone}
      data-service-status-placement="modal-slot"
      title={description}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-0.5 text-[0.68rem] font-semibold",
        tone === "recovered" && "border-good/35 bg-good/10 text-good",
        tone === "degraded" && "border-warn/40 bg-warn/10 text-fg",
        tone === "warming" && "border-line bg-panel/90 text-fg-2",
        !onRefresh && "pr-2",
      )}
    >
      {tone === "recovered" ? (
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
      ) : tone === "warming" ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <AlertTriangle className="size-3.5 shrink-0 text-warn" aria-hidden="true" />
      )}
      <span className="min-w-0 truncate">{title}</span>
      <span className="sr-only">{description}</span>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={checking}
          aria-label={checking ? bt("확인 중", "Checking") : bt("다시 확인", "Check again")}
          title={checking ? bt("확인 중", "Checking") : bt("다시 확인", "Check again")}
          className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-warn/15 disabled:opacity-50 pointer-coarse:size-11"
        >
          <RefreshCw
            className={cn("size-3.5", checking && "animate-spin motion-reduce:animate-none")}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}

export default ServiceDegradedBanner;
