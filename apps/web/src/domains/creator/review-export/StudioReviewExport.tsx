import { useId, useLayoutEffect, useRef, useState } from "react";

import {
  getAuthSessionRevision,
  getAuthUserId,
  listeners as sessionListeners,
} from "@/domains/auth/public/session/auth-session-state";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";
import { StudioReviewDelivery } from "./StudioReviewDelivery";
import {
  prepareStudioReviewExport,
  StudioReviewExportError,
  type StudioReviewExportProgress,
} from "./studio-review-export";
import { StudioReviewExportPreflight } from "./StudioReviewExportPreflight";

interface ExportOutcome {
  readonly kind:
    | "completed"
    | "cancelled"
    | "offline"
    | "integrity-error"
    | "authority-error";
  readonly primary: string;
  readonly nextStep: string;
}

function browserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function StudioReviewExport({
  verified,
}: {
  readonly verified: StudioVirtualSpaceVerifiedReview;
}) {
  const actorId = useAuthActorId();
  return (
    <StudioReviewExportForActor
      key={JSON.stringify([actorId, verified.subject])}
      actorId={actorId}
      verified={verified}
    />
  );
}

function StudioReviewExportForActor({
  actorId,
  verified,
}: {
  readonly actorId: string | null;
  readonly verified: StudioVirtualSpaceVerifiedReview;
}) {
  const bt = useBilingual("StudioReviewExport");
  const blockReasonId = useId();
  const progressStatusId = useId();
  const [progress, setProgress] = useState<StudioReviewExportProgress | null>(
    null,
  );
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);
  const [online, setOnline] = useState(browserOnline);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusOnCancelRef = useRef(false);
  const key = JSON.stringify(verified.subject);

  useLayoutEffect(() => {
    if (!progress && restoreFocusOnCancelRef.current) {
      restoreFocusOnCancelRef.current = false;
      saveButtonRef.current?.focus();
    }
  }, [progress]);

  useLayoutEffect(() => {
    mounted.current = true;
    const cancel = () => {
      active.current?.abort();
      active.current = null;
      setProgress(null);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    const offline = () => {
      setOnline(false);
      cancel();
      setOutcome({
        kind: "offline",
        primary: bt(
          "연결이 복구된 뒤 승인과 접근 권한을 다시 확인해 주세요.",
          "Reconnect before verifying approval and access again.",
        ),
        nextStep: bt(
          "네트워크가 연결되면 저장 버튼이 다시 열립니다.",
          "The save button re-enables once your connection returns.",
        ),
      });
    };
    const backOnline = () => {
      setOnline(true);
      setOutcome(null);
    };
    sessionListeners.add(cancel);
    document.addEventListener("visibilitychange", hidden);
    globalThis.addEventListener("offline", offline);
    globalThis.addEventListener("online", backOnline);
    return () => {
      mounted.current = false;
      active.current?.abort();
      active.current = null;
      sessionListeners.delete(cancel);
      document.removeEventListener("visibilitychange", hidden);
      globalThis.removeEventListener("offline", offline);
      globalThis.removeEventListener("online", backOnline);
    };
  }, [bt, key]);

  if (verified.review.status !== "approved") return null;

  const previewCount = verified.revision.blobRefs
    ? verified.revision.blobRefs.filter((ref) => ref.role === "preview").length
    : null;

  const start = async () => {
    if (
      active.current ||
      !actorId ||
      !browserOnline() ||
      document.visibilityState === "hidden"
    ) {
      return;
    }
    const controller = new AbortController();
    const session = getAuthSessionRevision();
    const actor = actorId;
    active.current = controller;
    setOutcome(null);
    setProgress({ phase: "reading", completed: 0, total: 0 });
    const isCurrent = () =>
      mounted.current &&
      active.current === controller &&
      !controller.signal.aborted &&
      session === getAuthSessionRevision() &&
      actor === getAuthUserId() &&
      actor === actorId &&
      browserOnline() &&
      document.visibilityState !== "hidden";
    try {
      const { downloadBlob } = await import("../export/studio-export");
      if (!isCurrent()) return;
      const result = await prepareStudioReviewExport(verified.subject, {
        signal: controller.signal,
        isCurrent,
        onProgress: setProgress,
      });
      if (!isCurrent()) return;
      downloadBlob(result.blob, result.fileName);
      setOutcome({
        kind: "completed",
        primary: bt(
          "브라우저에 승인된 검수본의 ZIP 다운로드를 요청했어요.",
          "The approved review ZIP download was requested in your browser.",
        ),
        nextStep: bt(
          "브라우저 다운로드 목록에서 ZIP 파일을 열어 보세요. 팀원에게 공식 전달과 수신 기록을 남기려면 아래 ‘공식 전달’을 이용하세요.",
          "Check your browser downloads for the ZIP file, or use 'Official delivery' below to record team handoff and receipt.",
        ),
      });
    } catch (error) {
      if (isCurrent()) {
        const isIntegrity =
          error instanceof StudioReviewExportError &&
          error.reason === "integrity";
        setOutcome(
          isIntegrity
            ? {
                kind: "integrity-error",
                primary: bt(
                  "저장된 이미지의 내용이나 전체 목록을 확인하지 못했어요. 파일을 저장하지 않았습니다.",
                  "The stored images or complete page list could not be verified. No file was downloaded.",
                ),
                nextStep: bt(
                  "불완전한 파일은 내려받지 않도록 차단했습니다. 잠시 후 다시 시도하거나 원본 검수 스냅샷 상태를 점검해 주세요.",
                  "Incomplete archives are never downloaded. Try again shortly or inspect the pinned review snapshot.",
                ),
              }
            : {
                kind: "authority-error",
                primary: bt(
                  "현재 승인과 접근 권한을 확인하지 못했어요. 검토 기록을 새로 확인한 뒤 다시 시도해 주세요.",
                  "Current approval and access could not be verified. Refresh the review before trying again.",
                ),
                nextStep: bt(
                  "위쪽의 ‘검토 기록 새로 확인’ 버튼을 눌러 최신 승인·권한 상태를 불러온 뒤 다시 저장을 눌러 주세요.",
                  "Press 'Refresh review' above to reload current approval and access, then try saving again.",
                ),
              },
        );
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (mounted.current) setProgress(null);
      }
    }
  };

  const progressLabel = progress
    ? progress.phase === "images"
      ? bt(
          `2/4단계 · 이미지 확인 중 (${progress.completed}/${progress.total})`,
          `Step 2/4 · Checking images (${progress.completed}/${progress.total})`,
        )
      : progress.phase === "archive"
        ? bt(
            "3/4단계 · 원본 이미지 묶음을 준비 중…",
            "Step 3/4 · Preparing original image archive…",
          )
        : progress.phase === "checking"
          ? bt(
              "4/4단계 · 다운로드 직전 승인·파일 목록 최종 확인 중…",
              "Step 4/4 · Final approval and file list check before download…",
            )
          : bt(
              "1/4단계 · 승인과 접근 권한 확인 중…",
              "Step 1/4 · Checking approval and access…",
            )
    : "";

  const isBlocked = !actorId || !online;
  const describedBy = isBlocked
    ? blockReasonId
    : progress
      ? progressStatusId
      : undefined;

  return (
    <>
      <section
        className="mt-4 space-y-3 rounded-xl border border-line bg-card p-3.5"
        aria-label={bt("승인된 검수본 저장", "Save approved review images")}
      >
        <div>
          <h3 className="text-base font-semibold text-fg">
            {bt("승인 검수본 내 기기에 보관 (ZIP)", "Save approved review to device (ZIP)")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {bt(
              "이 검수본에 저장된 원본 이미지와 페이지별 확인 정보를 ZIP으로 저장합니다. 원고를 다시 렌더링하거나 게시하지 않아요.",
              "Save this review's original stored images and page checksums as a ZIP. This does not re-render or publish the document.",
            )}
          </p>
        </div>

        <ul
          data-review-export-quick-facts="true"
          className="grid gap-2 rounded-lg bg-panel p-2.5 text-xs text-fg-2 sm:grid-cols-2"
        >
          <li className="min-w-0 break-words">
            <strong className="font-semibold text-fg">
              {bt("저장되는 항목", "Saved in ZIP")}
            </strong>
            {" · "}
            {previewCount && previewCount > 0
              ? bt(
                  `승인 시점 원본 이미지 ${previewCount}장 + 확인 목록(manifest.json · README.txt)`,
                  `${previewCount} approved original image(s) + checksum manifest & README`,
                )
              : bt(
                  "승인 시점 원본 이미지 + 확인 목록(manifest.json · README.txt)",
                  "Approved original images + checksum manifest & README",
                )}
          </li>
          <li className="min-w-0 break-words">
            <strong className="font-semibold text-fg">
              {bt("제외·보존 원칙", "Excluded & untouched")}
            </strong>
            {" · "}
            {bt(
              "편집 작업본·검토 메모·팀 명단 제외, 해상도·색상 변환 없음",
              "No editable source, notes, or roster; zero resize or color conversion",
            )}
          </li>
        </ul>

        <StudioReviewExportPreflight verified={verified} />

        {isBlocked ? (
          <div
            id={blockReasonId}
            role="alert"
            className="rounded-lg border border-warn/35 bg-warn/10 p-3 text-sm"
          >
            <p className="font-medium text-fg">
              {!actorId
                ? bt(
                    "로그인한 계정으로 승인본 저장 권한을 다시 확인해 주세요.",
                    "Sign in and verify approved-export access again.",
                  )
                : bt(
                    "연결이 복구되기 전에는 승인본 파일 준비를 시작하지 않습니다.",
                    "Approved-export preparation is disabled until reconnection.",
                  )}
            </p>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {!actorId
                ? bt(
                    "로그인 상태를 복구한 뒤 위쪽 ‘검토 기록 새로 확인’을 누르면 저장 버튼이 열립니다.",
                    "Sign in again and press 'Refresh review' above to re-enable saving.",
                  )
                : bt(
                    "인터넷 연결이 복구되면 페이지를 새로고침하지 않아도 저장 버튼이 자동으로 활성화됩니다.",
                    "The save button re-enables automatically once your internet connection returns.",
                  )}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            ref={saveButtonRef}
            type="button"
            aria-describedby={describedBy}
            className="min-h-11 max-w-full rounded-lg border border-line bg-panel px-3.5 text-sm font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            disabled={Boolean(progress) || isBlocked}
            onClick={() => {
              void start();
            }}
          >
            {bt("승인 검수본 ZIP 저장", "Save approved review ZIP")}
          </button>
          {progress ? (
            <button
              type="button"
              className="min-h-11 rounded-lg border border-line bg-card px-3.5 text-sm font-medium text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              onClick={() => {
                restoreFocusOnCancelRef.current = true;
                active.current?.abort();
                active.current = null;
                setProgress(null);
                setOutcome({
                  kind: "cancelled",
                  primary: bt(
                    "파일 준비를 취소했어요.",
                    "File preparation cancelled.",
                  ),
                  nextStep: bt(
                    "승인 기록은 그대로 유지되며 내려받은 파일은 없습니다. 다시 받으려면 ‘승인 검수본 ZIP 저장’을 눌러 처음부터 시작하세요.",
                    "Approval remains intact and no file was downloaded. Press 'Save approved review ZIP' whenever you want to start again.",
                  ),
                });
              }}
            >
              {bt("취소", "Cancel")}
            </button>
          ) : null}
        </div>

        {progress ? (
          <div
            id={progressStatusId}
            role="status"
            className="rounded-lg border border-line bg-panel/60 p-3 text-sm"
          >
            <p className="font-medium text-fg">{progressLabel}</p>
            <p className="mt-1 text-xs text-fg-2">
              {bt(
                "취소해도 승인 상태는 바뀌지 않으며 준비 중이던 묶음은 즉시 폐기됩니다.",
                "Cancelling keeps the approval unchanged and discards any partial archive.",
              )}
            </p>
          </div>
        ) : null}

        {outcome ? (
          <div
            role="status"
            data-review-export-outcome={outcome.kind}
            className="rounded-lg border border-line bg-panel/50 p-3"
          >
            <p className="text-sm font-medium text-fg">{outcome.primary}</p>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {outcome.nextStep}
            </p>
          </div>
        ) : null}
      </section>
      <StudioReviewDelivery verified={verified} />
    </>
  );
}
