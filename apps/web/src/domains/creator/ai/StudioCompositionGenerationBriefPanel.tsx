import { useMemo, useState } from "react";

import { StudioAiConnectionBadge, StudioAiConnectionNotice } from "./StudioAiConnectionBadge";
import {
  buildCompositionGenerationBrief,
  type CompositionGenerationSnapshot,
} from "./studio-composition-generation-brief";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { copyStudioText } from "@/shared/lib/copy-text";

/**
 * 3D 구도 → AI 이미지 생성 브리프 패널 (투닝 플러스 3D Studio 간판 동선 흡수).
 *
 * 포저/bg3d에서 잡은 구도를 생성 요청 패킷으로 보여준다. 제공자 실연결 전에는
 * 정직하게 그 사실을 표시하고, 프롬프트 복사(외부 도구·협업 전달)와
 * "캡처 그대로 삽입" 폴백만으로 동작한다 — 없는 생성을 있는 척하지 않는다.
 *
 * 표시 규칙: 사람이 읽는 브리프는 한국어 줄 목록으로 본문 글꼴에 맞춰 줄바꿈한다(고정폭
 * 글꼴·잘림 없음). 내부 작업 코드(E3 등)는 화면에 내지 않는다. 영문은 이미지 생성 도구에
 * 붙여 넣는 프롬프트 복사본에만 쓴다.
 */
export interface StudioCompositionGenerationBriefPanelProps {
  readonly snapshot: CompositionGenerationSnapshot | null;
  /** AI 제공자가 연결돼 있으면 주입. 없으면 브리프/폴백 모드. */
  readonly onRequestGeneration?: () => void;
  /** 폴백: 현재 구도 캡처를 컷에 그대로 삽입. */
  readonly onInsertCaptureFallback: () => void;
  readonly locale?: "ko" | "en";
}

const COPY = Object.freeze({
  ko: Object.freeze({
    title: "이 구도로 AI 이미지 만들기",
    empty: "먼저 포저나 3D 배경에서 캐릭터와 카메라를 잡아 주세요.",
    providerPending:
      "AI 생성 연결은 준비 중이에요. 지금은 아래 브리프를 보고 프롬프트를 복사해 쓰거나, 캡처를 그대로 넣을 수 있어요.",
    providerNotice: "외부 AI 이미지 제공자는 아직 연결되지 않았어요. 연결되면 생성 버튼이 나타납니다.",
    localFallback: "브리프는 이 기기에서 바로 만들어져요. 프롬프트 복사와 캡처 그대로 넣기는 지금 쓸 수 있어요.",
    copyBrief: "AI용 프롬프트 복사",
    copyBriefTitle: "이미지 생성 도구에 붙여 넣을 영문 프롬프트를 복사합니다.",
    copied: "복사했어요",
    insertCapture: "캡처 그대로 넣기",
    requestGeneration: "이 구도로 생성하기",
    consistency: "일관성 키",
    errorCharacter: "캐릭터가 정해지지 않았어요.",
    errorCamera: "카메라 구도가 없어요.",
    errorFov: "화각 값이 올바르지 않아요.",
  }),
  en: Object.freeze({
    title: "Generate an AI image from this composition",
    empty: "Set a character and camera in the poser or 3D background first.",
    providerPending:
      "AI generation is not connected yet. Copy the prompt from the brief below, or insert the capture as-is.",
    providerNotice: "No external AI image provider is connected yet. The generate button appears once one is.",
    localFallback: "The brief is assembled on this device. Copying the prompt and inserting the capture work now.",
    copyBrief: "Copy AI prompt",
    copyBriefTitle: "Copies the English prompt to paste into an image generation tool.",
    copied: "Copied",
    insertCapture: "Insert capture as-is",
    requestGeneration: "Generate from this composition",
    consistency: "Consistency keys",
    errorCharacter: "No character is set.",
    errorCamera: "No camera composition.",
    errorFov: "Invalid field of view.",
  }),
});

const SECTION_CLASS = "space-y-2 text-xs text-fg-2";
const TITLE_CLASS = "flex flex-wrap items-center gap-1.5 text-sm font-bold text-fg";
const ACTION_CLASS = buttonClass({ size: "sm", variant: "outline", className: "text-[0.72rem]" });

export function StudioCompositionGenerationBriefPanel(
  props: StudioCompositionGenerationBriefPanelProps,
) {
  const copy = COPY[props.locale ?? "ko"];
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => (props.snapshot ? buildCompositionGenerationBrief(props.snapshot) : null),
    [props.snapshot],
  );

  if (!props.snapshot || result === null) {
    return (
      <section aria-label={copy.title} data-testid="composition-brief-panel" className={SECTION_CLASS}>
        <h3 className={TITLE_CLASS}>
          {copy.title}
          <StudioAiConnectionBadge kind="not-connected" />
        </h3>
        <p data-testid="composition-brief-empty" className="leading-relaxed text-fg-3">{copy.empty}</p>
      </section>
    );
  }

  if (!result.ok) {
    const errorCopy = {
      "missing-character": copy.errorCharacter,
      "missing-camera": copy.errorCamera,
      "invalid-fov": copy.errorFov,
    } as const;
    return (
      <section aria-label={copy.title} data-testid="composition-brief-panel" className={SECTION_CLASS}>
        <h3 className={TITLE_CLASS}>
          {copy.title}
          <StudioAiConnectionBadge kind="not-connected" />
        </h3>
        <ul data-testid="composition-brief-errors" className="list-disc space-y-0.5 pl-4 text-fg-3">
          {result.errors.map((error) => (
            <li key={error}>{errorCopy[error]}</li>
          ))}
        </ul>
        <button type="button" onClick={props.onInsertCaptureFallback} className={ACTION_CLASS}>
          {copy.insertCapture}
        </button>
      </section>
    );
  }

  const { request } = result;
  const providerConnected = props.onRequestGeneration !== undefined;

  return (
    <section aria-label={copy.title} data-testid="composition-brief-panel" className={SECTION_CLASS}>
      <h3 className={TITLE_CLASS}>
        {copy.title}
        {providerConnected ? <StudioAiConnectionBadge kind="provider-ready" /> : null}
      </h3>
      {!providerConnected ? (
        <>
          <StudioAiConnectionNotice kind="not-connected" detail={copy.providerNotice} />
          <p data-testid="composition-brief-local-fallback" className="leading-relaxed text-fg-3">
            {copy.localFallback}
          </p>
          <p data-testid="composition-brief-provider-pending" className="leading-relaxed text-fg-3">
            {copy.providerPending}
          </p>
        </>
      ) : null}
      {/* 본문 글꼴·줄바꿈 — 고정폭 <pre>는 글자가 커지고 패널 폭을 넘어 잘렸다. */}
      <p
        data-testid="composition-brief-text"
        className="whitespace-pre-line break-words rounded-lg border border-line bg-card/60 px-2.5 py-2 leading-relaxed text-fg"
      >
        {request.briefKo}
      </p>
      <p className="break-all text-[0.66rem] leading-relaxed text-fg-3">
        <span className="font-semibold">{copy.consistency}: </span>
        <span>{request.consistencyKeys.join(" · ")}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            void copyStudioText(request.prompt).then((ok) => setCopied(ok));
          }}
          title={copy.copyBriefTitle}
          data-testid="composition-brief-copy"
          className={ACTION_CLASS}
        >
          {copied ? copy.copied : copy.copyBrief}
        </button>
        {providerConnected ? (
          <button type="button" onClick={props.onRequestGeneration} className={ACTION_CLASS}>
            {copy.requestGeneration}
          </button>
        ) : null}
        <button type="button" onClick={props.onInsertCaptureFallback} className={ACTION_CLASS}>
          {copy.insertCapture}
        </button>
      </div>
    </section>
  );
}
