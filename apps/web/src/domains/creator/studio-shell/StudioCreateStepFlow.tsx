import type { ReactNode } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioCreateReturnContext, type StudioCreateStep } from "./useStudioCreateStepFlow";

export function StudioCreateStepScope({ onReturn, children }: { readonly onReturn: () => void; readonly children: ReactNode }) {
  return <StudioCreateReturnContext.Provider value={onReturn}>{children}</StudioCreateReturnContext.Provider>;
}

export function StudioCreateStepNavigation({ step, onStep }: {
  readonly step: StudioCreateStep; readonly onStep: (step: StudioCreateStep) => void;
}) {
  const bt = useBilingual("StudioCreateStepFlow");
  const labels = [bt("형식", "Format"), bt("이름·기본 크기", "Name & size"), bt("시작 확인", "Review & start")];
  return <nav className="studio-create-step-navigation" aria-label={bt("새 작품 만들기 단계", "New work steps")}>
    {([1, 2, 3] as const).map((index) => <button key={index} type="button"
      data-studio-create-step-link={index} aria-current={step === index ? "step" : undefined}
      onClick={() => onStep(index)}><span>{index}</span>{labels[index - 1]}</button>)}
  </nav>;
}

export function StudioCreateStepPanel({ step, current, children }: {
  readonly step: StudioCreateStep; readonly current: StudioCreateStep; readonly children: ReactNode;
}) {
  return <div data-studio-create-step-panel={step} hidden={step !== current}>{children}</div>;
}

export function StudioCreateStepActions({ step, onStep, ready = true }: {
  readonly step: StudioCreateStep; readonly onStep: (step: StudioCreateStep) => void; readonly ready?: boolean;
}) {
  const bt = useBilingual("StudioCreateStepFlow");
  return <div className="studio-create-step-actions">
    {step > 1 ? <button type="button" onClick={() => onStep(step === 3 ? 2 : 1)}>{bt("이전 단계", "Previous step")}</button> : null}
    {step < 3 ? <button type="button" data-studio-create-step-next={step} disabled={!ready}
      onClick={() => onStep(step === 1 ? 2 : 3)}>{step === 1 ? bt("다음: 작품 이름", "Next: work name") : bt("다음: 시작 확인", "Next: review & start")}</button> : null}
  </div>;
}
