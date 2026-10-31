import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { CREATE_DISABLED_REASON_ID, CREATE_SIZE_REASON_ID } from "./studio-mode-project-create-helpers";
import { DisabledReason } from "./StudioTaskFlow";

const SUMMARY_ID = "studio-create-launch-summary";
const BUTTON_ID = "studio-create-primary-action";
const ERROR_ID = "studio-create-failure";

interface StudioCreateLaunchSummaryProps {
  readonly targetTitle: string;
  readonly width: number;
  readonly height: number;
  readonly titleReady: boolean;
  readonly sizeReady: boolean;
  readonly structuredWebtoon: boolean;
  readonly creating: boolean;
  readonly startLabel: string;
  readonly nextStepLabel: string;
  readonly error: string | null;
  readonly onFixName: () => void;
  readonly onFixSize: () => void;
}

/** 상세 설정 끝에서도 같은 시작 버튼으로 돌아간다. 생성 행동은 복제하지 않는다. */
export function StudioCreateReturnToStart() {
  const bt = useBilingual("StudioCreateLaunchSummary");
  return (
    <button type="button" data-studio-create-return="true"
      className="mt-4 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-accent underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onClick={() => {
        const start = document.getElementById(BUTTON_ID);
        // 비활성 버튼은 초점을 받지 못하므로 오류 복구가 있는 요약 구역으로 이동한다.
        if (start instanceof HTMLButtonElement && !start.disabled) start.focus();
        else document.getElementById(SUMMARY_ID)?.focus();
      }}
    >{bt("시작 설정으로 돌아가기", "Back to start settings")}</button>
  );
}

/** 주 행동·다음 화면·기기 저장 범위와 오류 복구를 한 구역에 모은다. */
export function StudioCreateLaunchSummary({
  targetTitle, width, height, titleReady, sizeReady, structuredWebtoon,
  creating, startLabel, nextStepLabel, error, onFixName, onFixSize,
}: StudioCreateLaunchSummaryProps) {
  const bt = useBilingual("StudioCreateLaunchSummary");
  const failureRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) failureRef.current?.focus(); }, [error]);
  const reasons = [!titleReady ? CREATE_DISABLED_REASON_ID : null, !sizeReady ? CREATE_SIZE_REASON_ID : null, error ? ERROR_ID : null].filter(Boolean).join(" ") || undefined;
  return (
    <section id={SUMMARY_ID} tabIndex={-1} data-studio-create-submit="true"
      aria-labelledby="studio-create-summary-title"
      className="mt-4 rounded-3xl border border-accent/35 bg-accent-soft/20 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-5">
      <h2 id="studio-create-summary-title" className="text-base font-bold text-fg">{bt("이 설정으로 시작해요", "Start with these settings")}</h2>
      <p className="mb-3 mt-1 break-words text-sm text-fg-2">
        {targetTitle} · {sizeReady ? `${width} × ${height} px` : bt("크기 확인 필요", "Check the size")}
        {structuredWebtoon ? bt(" · 제작 계획 포함", " · Production plan included") : null}
      </p>
      <p data-studio-create-next-step="true" role="status" aria-atomic="true" className="mb-3 text-sm font-semibold text-fg">{creating ? bt("프로젝트 만드는 중…", "Creating project…") : nextStepLabel}</p>
      <p className="rounded-xl bg-panel/60 px-3 py-2.5 text-xs leading-5 text-fg-2">
        {bt("작업은 이 기기에 자동 저장됩니다. 팀 공유와 클라우드 백업은 작업 중 언제든 연결할 수 있어요.", "Your work is autosaved on this device. Team sharing and cloud backup can be connected later.")}
      </p>
      <DisabledReason id={CREATE_DISABLED_REASON_ID} visible={!titleReady} className="mt-3">
        {bt("프로젝트 이름을 입력해 주세요.", "Enter a project name.")}
        <button type="button" onClick={onFixName} className="ml-2 min-h-11 rounded-lg px-2 font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{bt("이름 입력하기", "Enter a name")}</button>
      </DisabledReason>
      <DisabledReason id={CREATE_SIZE_REASON_ID} visible={!sizeReady} className="mt-3">
        {bt("캔버스 너비와 높이는 1부터 1,000,000 사이의 정수로 입력해 주세요.", "Enter canvas width and height as whole numbers between 1 and 1,000,000.")}
        <button type="button" onClick={onFixSize} className="ml-2 min-h-11 rounded-lg px-2 font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{bt("크기 수정하기", "Fix the size")}</button>
      </DisabledReason>
      <button id={BUTTON_ID} type="submit" disabled={creating || !titleReady || !sizeReady}
        aria-describedby={reasons} aria-busy={creating || undefined}
        className={buttonClass({ variant: "solid", size: "lg", className: "mt-4 min-h-12 w-full gap-2" })}>
        {creating ? bt("프로젝트 만드는 중…", "Creating project…") : startLabel}
        {!creating ? <ArrowRight size={16} aria-hidden="true" /> : null}
      </button>
      {error ? <p id={ERROR_ID} ref={failureRef} tabIndex={-1} role="alert" data-studio-create-error="true" className="mt-3 rounded-lg text-sm text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">{error}</p> : null}
    </section>
  );
}
