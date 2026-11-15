import { Check, Copy, Download, ExternalLink, Link2, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

type InviteRoleId = "lead-author" | "line-color-assist" | "editor-pd" | "external-viewer";

interface InviteRoleOption {
  readonly id: InviteRoleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly scopeKo: string;
  readonly scopeEn: string;
}

const INVITE_ROLE_OPTIONS: readonly InviteRoleOption[] = [
  {
    id: "line-color-assist",
    labelKo: "선화·채색 어시",
    labelEn: "Line & Color Assist",
    scopeKo: "담당 레이어 편집 · 말풍선/식자 잠금 보호",
    scopeEn: "Edit assigned layers · speech/lettering locked",
  },
  {
    id: "editor-pd",
    labelKo: "편집자 · 담당 PD",
    labelEn: "Editor / PD Reviewer",
    scopeKo: "컷 좌표 핀 댓글 · 전후 비교 · 승인 결정",
    scopeEn: "Coordinate pin comments · diff · review approval",
  },
  {
    id: "lead-author",
    labelKo: "공동 총괄 작가",
    labelEn: "Co-Lead Creator",
    scopeKo: "전체 레이어 편집 · 이력 복원 · 출고 권한",
    scopeEn: "Full layer edit · history restore · export",
  },
  {
    id: "external-viewer",
    labelKo: "외부 열람자",
    labelEn: "External Viewer",
    scopeKo: "워터마크 열람 전용 · 원본 다운로드 제한",
    scopeEn: "Watermarked read-only · download restricted",
  },
];

export interface StudioShareAndInviteDialogProps {
  readonly documentTitle: string;
  readonly openCommentCount: number;
  readonly returnFocus?: () => HTMLElement | null;
  readonly onClose: () => void;
  readonly onOpenTeamPanel: () => void;
  readonly onOpenComments: () => void;
  readonly onOpenExport: () => void;
}

export default function StudioShareAndInviteDialog({
  documentTitle,
  openCommentCount,
  returnFocus,
  onClose,
  onOpenTeamPanel,
  onOpenComments,
  onOpenExport,
}: StudioShareAndInviteDialogProps) {
  const bt = useBilingual("studio.shareAndInvite");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedRole, setSelectedRole] = useState<InviteRoleId>("line-color-assist");
  const [inviteTarget, setInviteTarget] = useState("");
  const [copiedKind, setCopiedKind] = useState<"team" | "review" | null>(null);
  const [sentInvites, setSentInvites] = useState<
    readonly { readonly id: string; readonly handle: string; readonly roleLabel: string }[]
  >([
    { id: "seed-1", handle: "@minseo.color (데모 어시)", roleLabel: "선화·채색 어시" },
    { id: "seed-2", handle: "@hyunwoo.pd (데모 PD)", roleLabel: "편집자 · 담당 PD" },
  ]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://toonstudio.local";
  const teamShareUrl = `${origin}/team/people/join?source=studio-editor&mode=demo`;
  const externalReviewUrl = `${origin}/production/pinned-review#demo=ep-cut-review`;

  const finishClose = () => {
    onClose();
    queueMicrotask(() => {
      returnFocus?.()?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        queueMicrotask(() => {
          returnFocus?.()?.focus({ preventScroll: true });
        });
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, returnFocus]);

  const copyLink = async (url: string, kind: "team" | "review") => {
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      // 클립보드 권한이 없는 환경에서도 링크 문자열은 입력란에서 바로 선택·복사할 수 있다.
    }
    setCopiedKind(kind);
  };

  const submitQuickInvite = () => {
    const trimmed = inviteTarget.trim();
    if (!trimmed) return;
    const roleMeta =
      INVITE_ROLE_OPTIONS.find((item) => item.id === selectedRole) ?? INVITE_ROLE_OPTIONS[0]!;
    setSentInvites((prev) => [
      {
        id: `inv-${Date.now()}`,
        handle: trimmed,
        roleLabel: bt(roleMeta.labelKo, roleMeta.labelEn),
      },
      ...prev,
    ]);
    setInviteTarget("");
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-canvas/75 p-3 backdrop-blur-sm sm:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          finishClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-studio-shortcut-boundary="true"
        data-testid="studio-share-invite-dialog"
        className="flex max-h-[calc(100dvh-24px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-accent/35 bg-panel text-fg shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line bg-card/80 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/brand/toonstudio-premium-icons/team.webp"
              alt=""
              width={36}
              height={36}
              aria-hidden="true"
              className="size-9 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-black text-fg sm:text-lg">
                {bt("원고 공유 · 팀원 초대 · 검수 출고", "Share Draft · Invite Team · Review & Export")}
              </h2>
              <p className="truncate text-xs text-fg-2">
                {documentTitle.trim() || bt("제목 없는 원고", "Untitled draft")} ·{" "}
                {bt("팀 연결과 직무 권한을 한 창에서 설정합니다", "Configure team link, role access, and export in one place")}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={finishClose}
            aria-label={bt("공유·초대 창 닫기", "Close share and invite dialog")}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          <section className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-black text-fg">
                <Link2 size={16} className="text-accent" aria-hidden="true" />
                {bt("① 1클릭 통합 초대 링크 (팀 + 현재 원고 동시 연결)", "1. One-click unified invite link (Team + Draft)")}
              </h3>
              <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[0.68rem] font-bold text-accent">
                {bt("실시간 공동 편집 지원", "Live collaboration ready")}
              </span>
            </div>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                readOnly
                aria-label={bt("통합 초대 링크 주소", "Unified invite link URL")}
                value={teamShareUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-11 flex-1 rounded-xl border border-line bg-panel px-3 text-xs font-medium text-fg-2"
              />
              <button
                type="button"
                data-testid="studio-share-copy-team-link"
                onClick={() => void copyLink(teamShareUrl, "team")}
                className={buttonClass({ size: "sm", className: "min-h-11 shrink-0 gap-1.5" })}
              >
                {copiedKind === "team" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copiedKind === "team"
                  ? bt("초대 링크 복사됨", "Invite link copied")
                  : bt("초대 링크 복사", "Copy invite link")}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-card p-4">
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
              {bt("② 웹툰 4대 직무 권한 선택 & 초대 발송", "2. Webtoon 4-role RBAC & direct invite")}
            </h3>
            <div
              className="mt-2.5 grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label={bt("초대할 직무 권한 선택", "Select collaborator role")}
            >
              {INVITE_ROLE_OPTIONS.map((role) => {
                const active = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedRole(role.id)}
                    className={cn(
                      "flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      active
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    <strong className="text-xs font-black text-fg">{bt(role.labelKo, role.labelEn)}</strong>
                    <span className="mt-0.5 text-[0.68rem] text-fg-2">{bt(role.scopeKo, role.scopeEn)}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={inviteTarget}
                onChange={(event) => setInviteTarget(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitQuickInvite();
                  }
                }}
                aria-label={bt("초대할 이메일 또는 @아이디", "Collaborator email or @handle")}
                placeholder={bt("이메일 또는 @아이디 입력 (예: @jinho.line)", "Enter email or @handle")}
                className="min-h-11 flex-1 rounded-xl border border-line bg-panel px-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
              <button
                type="button"
                data-testid="studio-share-send-invite"
                onClick={submitQuickInvite}
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 shrink-0 gap-1.5" })}
              >
                <UserPlus size={15} aria-hidden="true" />
                {bt("역할 지정 초대", "Send role invite")}
              </button>
            </div>

            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={bt("연결된 협업 참여자", "Connected collaborators")}>
              {sentInvites.map((entry) => (
                <li
                  key={entry.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[0.7rem] text-fg-2"
                >
                  <strong className="font-bold text-fg">{entry.handle}</strong>
                  <span>· {entry.roleLabel}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-3.5">
              <strong className="block text-xs font-black text-fg">
                {bt("③ 외부 PD · 편집부 무로그인 핀 검수", "3. External PD pin-comment review")}
              </strong>
              <p className="mt-1 text-[0.72rem] leading-5 text-fg-2">
                {bt(
                  `현재 열린 댓글 ${openCommentCount}건 · 워터마크 보호 검수 링크를 복사합니다.`,
                  `${openCommentCount} open comments · copy watermarked review link.`,
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyLink(externalReviewUrl, "review")}
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10 gap-1.5 text-xs" })}
                >
                  {copiedKind === "review" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copiedKind === "review" ? bt("검수 링크 복사됨", "Copied") : bt("PD 검수 링크 복사", "Copy PD review link")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenComments();
                  }}
                  className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-10 text-xs" })}
                >
                  {bt("핀 댓글 열기", "Open pin comments")}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-card p-3.5">
              <strong className="block text-xs font-black text-fg">
                {bt("④ 플랫폼 규격 원고 출고 & 협업 관제실", "4. Platform export & production hub")}
              </strong>
              <p className="mt-1 text-[0.72rem] leading-5 text-fg-2">
                {bt(
                  "세로 스크롤 자동 분할 PNG, 레이어 보존 PSD 출고 또는 통합 협업 허브로 이동합니다.",
                  "Export sliced PNG / layered PSD or open the 5-pillar collaboration hub.",
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenExport();
                  }}
                  className={buttonClass({ size: "sm", className: "min-h-10 gap-1.5 text-xs" })}
                >
                  <Download size={14} aria-hidden="true" />
                  {bt("출고 규격 열기", "Open export")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTeamPanel();
                  }}
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10 gap-1.5 text-xs" })}
                >
                  <Users size={14} aria-hidden="true" />
                  {bt("공동 작업 패널", "Team panel")}
                </button>
                <Link
                  href="/production"
                  className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-10 gap-1 text-xs" })}
                >
                  {bt("협업 관제실", "Collab hub")}
                  <ExternalLink size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          {copiedKind ? (
            <p role="status" className="rounded-xl border border-success/35 bg-success-soft/20 px-3 py-2 text-xs font-bold text-success">
              {copiedKind === "team"
                ? bt("팀 + 원고 통합 초대 링크가 준비되었습니다.", "Unified team + draft invite link is ready.")
                : bt("외부 PD 전용 워터마크 검수 링크가 준비되었습니다.", "Watermarked external PD review link is ready.")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
