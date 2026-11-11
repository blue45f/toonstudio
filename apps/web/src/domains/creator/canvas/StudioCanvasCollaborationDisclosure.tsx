import { ChevronDown, UsersRound } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useIsMobile } from "@/shared/hooks/use-media-query";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./studio-canvas-collaboration-disclosure.css";

/** 접어도 자식의 참여자 구독·따라가기·단축키는 계속 유지한다. */
export function StudioCanvasCollaborationDisclosure({
  children,
  onOpenTeam,
  mobileImmersive,
  following = false,
}: {
  readonly children: ReactNode;
  readonly onOpenTeam: () => void;
  readonly mobileImmersive: boolean;
  readonly following?: boolean;
}) {
  const bt = useBilingual("StudioCanvasCollaborationDisclosure");
  const smallViewport = useIsMobile();
  const isMobile = smallViewport && mobileImmersive;
  const [expanded, setExpanded] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!isMobile || !expanded) return;
    const ownerDocument = detailsRef.current?.ownerDocument;
    if (!ownerDocument) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented
        || !(event.target instanceof Node) || !detailsRef.current?.contains(event.target)) return;
      event.preventDefault();
      setExpanded(false);
      summaryRef.current?.focus({ preventScroll: true });
    };
    // 자식 컨트롤이 Escape를 먼저 처리한 뒤 부모의 접힘을 판단한다.
    ownerDocument.addEventListener("keydown", closeWithEscape);
    return () => ownerDocument.removeEventListener("keydown", closeWithEscape);
  }, [isMobile, expanded]);

  return (
    <details
      ref={detailsRef}
      data-studio-shortcut-boundary="true"
      data-studio-collaboration-disclosure="true"
      data-studio-collaboration-mobile={isMobile ? "true" : undefined}
      open={!isMobile || expanded}
      onToggle={(event) => {
        if (isMobile) setExpanded(event.currentTarget.open);
      }}

    >
      <summary
        ref={summaryRef}
        hidden={!isMobile}
        aria-controls={panelId}
        aria-expanded={expanded}
        data-studio-collaboration-summary="true"
      >
        <UsersRound size={16} aria-hidden="true" />
        {bt("함께 작업", "Work together")}
        {following ? <span className="text-accent">{bt("따라가기 중", "Following")}</span> : null}
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div id={panelId} data-studio-collaboration-body="true" hidden={isMobile && !expanded}>
        <button
          type="button"
          hidden={!isMobile}
          data-studio-collaboration-team="true"
          onClick={onOpenTeam}
        >
          <UsersRound size={16} aria-hidden="true" />
          {bt("팀·채팅 열기", "Open team and chat")}
        </button>
        {children}
      </div>
    </details>
  );
}
