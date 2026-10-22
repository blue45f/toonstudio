/**
 * STC 안내형 동선 패널 — 사진 → 특징 확인 → 셰이퍼 초안 전달 3단계 안내.
 *
 * 순수 모델(stc-guided-flow)이 단계 전이·검증·초안 생성을 맡고, 이 패널은
 * 표시와 입력만 담당한다. 사진은 파일 입력으로 받아 이 기기 안에서만
 * 미리보기로 쓰며(객체 URL), 어떤 서버로도 보내지 않는다. AI 분석
 * 제공자가 호스트에서 주입된 경우에만 2단계 진입 시 분석을 시도하고,
 * 실패·미연결이면 "자동 분석 없이 직접 확인" 상태로 정직하게 이어간다.
 *
 * 셰이퍼 전달은 onHandOff 콜백 한 번으로 끝난다 — 실제 적용(forge-face·
 * semantic-morph·forge-hair 병합과 되돌리기 1단계 기록)은 호스트의 기존
 * 셰이퍼 바인딩이 맡는다 (NOTES 배선 명세 참조).
 */

import { useEffect, useRef, useState } from "react";

import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import {
  buildStcShaperDraft,
  createManualStcProfile,
  createStcFlowState,
  resolveStcProfile,
  stcFeaturesNeedingReview,
  stcFlowAdvance,
  stcFlowBack,
  stcFlowBlockReason,
  stcFlowHandOff,
  stcFlowPatchProfile,
  stcFlowSetPhoto,
  stcFlowSetProfile,
  stcFlowSetRightsConfirmed,
  STC_FACE_SHAPE_LABELS,
  STC_FEATURE_LABELS,
  STC_FLOW_STEP_GUIDES,
  STC_FLOW_STEP_LABELS,
  STC_FLOW_STEPS,
  validateStcPhoto,
} from "./stc-guided-flow";

import type {
  StcFaceAnalysisProvider,
  StcFaceShapeKind,
  StcFlowState,
  StcPhotoMeta,
  StcShaperDraft,
  StcTriLevel,
} from "./stc-guided-flow";
import type { AvatarForgeBangStyle, AvatarForgeHairStyle } from "../vrm/studio-vrm-avatar-forge";

export interface StudioStcGuidedFlowPanelProps {
  /** AI 분석 제공자. 없으면 수동 확인 동선으로 동작한다(지어내지 않음). */
  readonly provider?: StcFaceAnalysisProvider | null;
  /** 셰이퍼로 초안 전달 — 호스트가 기존 셰이퍼 적용 경로에 연결한다. */
  readonly onHandOff: (draft: StcShaperDraft) => void;
  readonly onClose?: () => void;
}

const TRI_OPTIONS: readonly { readonly value: StcTriLevel; readonly label: string }[] = [
  { value: "low", label: "작게" },
  { value: "medium", label: "보통" },
  { value: "high", label: "크게" },
];

const TILT_OPTIONS: readonly { readonly value: "down" | "neutral" | "up"; readonly label: string }[] = [
  { value: "down", label: "처진" },
  { value: "neutral", label: "보통" },
  { value: "up", label: "올라간" },
];

const HAIR_STYLE_OPTIONS: readonly { readonly value: AvatarForgeHairStyle; readonly label: string }[] = [
  { value: "short", label: "숏" },
  { value: "bob", label: "보브" },
  { value: "long", label: "롱" },
  { value: "ponytail", label: "포니테일" },
  { value: "twintail", label: "트윈테일" },
  { value: "bun", label: "번" },
  { value: "wavy", label: "웨이브 롱" },
  { value: "braid", label: "땋은 머리" },
  { value: "twin-braid", label: "양갈래 땋기" },
  { value: "hime", label: "히메컷" },
  { value: "wolf", label: "울프컷" },
  { value: "half-up", label: "반묶음" },
  { value: "pixie", label: "픽시" },
  { value: "none", label: "헤어 없음" },
];

const BANG_OPTIONS: readonly { readonly value: AvatarForgeBangStyle; readonly label: string }[] = [
  { value: "full", label: "풀뱅" },
  { value: "split", label: "가르마" },
  { value: "side-swept", label: "사이드" },
  { value: "curtain", label: "커튼" },
  { value: "blunt", label: "일자" },
  { value: "none", label: "없음" },
];

function TriSelect(props: {
  readonly id: string;
  readonly label: string;
  readonly value: StcTriLevel;
  readonly onChange: (value: StcTriLevel) => void;
}) {
  return (
    <label htmlFor={props.id} className="flex flex-col gap-1 text-sm text-fg-2">
      {props.label}
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as StcTriLevel)}
        className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
      >
        {TRI_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StudioStcGuidedFlowPanel(props: StudioStcGuidedFlowPanelProps) {
  const [flow, setFlow] = useState<StcFlowState>(() => createStcFlowState());
  const [notice, setNotice] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const analyzedPhotoRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const stepIndex = STC_FLOW_STEPS.indexOf(flow.step);
  const blockReason = stcFlowBlockReason(flow);
  const photoIssues = flow.photo ? validateStcPhoto(flow.photo.meta) : [];
  const reviewLabels = stcFeaturesNeedingReview(flow.profile);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const previewRef = URL.createObjectURL(file);
    previewUrlRef.current = previewRef;
    analyzedPhotoRef.current = null;
    const meta: StcPhotoMeta = {
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      // 실제 픽셀 크기는 이미지 로드 후 알 수 있어, 로드 전에는 0으로 두고
      // 미리보기 onLoad에서 갱신한다. 그 전에는 크기 검증이 막는 쪽으로 동작.
      width: 0,
      height: 0,
    };
    setNotice(null);
    setFlow((current) => stcFlowSetPhoto(current, { meta, previewRef }));
  };

  const handlePreviewLoad = (width: number, height: number) => {
    setFlow((current) =>
      current.photo
        ? { ...current, photo: { ...current.photo, meta: { ...current.photo.meta, width, height } } }
        : current,
    );
  };

  const goNext = async () => {
    // 분석 결과를 먼저 지역 상태에 반영한 뒤 그 상태로 전이한다(스테일 상태로
    // 전이하면 분석 프로필이 아닌 기본값으로 초안이 만들어지기 때문).
    let working = flow;
    if (flow.step === "photo" && flow.photo && props.provider && analyzedPhotoRef.current !== flow.photo.previewRef) {
      setAnalyzing(true);
      const outcome = await resolveStcProfile(props.provider, flow.photo.previewRef);
      analyzedPhotoRef.current = flow.photo.previewRef;
      setAnalyzing(false);
      if (outcome.kind === "provider") {
        working = stcFlowSetProfile(working, outcome.profile);
        setNotice("자동으로 읽은 특징이에요. 실제와 다르면 직접 바꿔 주세요.");
      } else {
        working = stcFlowSetProfile(working, createManualStcProfile());
        setNotice("자동 분석을 마치지 못해 기본값에서 시작해요. 특징을 직접 확인해 주세요.");
      }
    }
    const result = stcFlowAdvance(working);
    if (!result.ok) {
      setFlow(working);
      setNotice(result.reason);
      return;
    }
    if (working === flow) setNotice(null);
    setFlow(result.state);
  };

  const handleHandOff = () => {
    const result = stcFlowHandOff(flow);
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setFlow(result.state);
    props.onHandOff(result.draft);
  };

  const draft = flow.step === "draft" ? (flow.draft ?? buildStcShaperDraft(flow.profile)) : null;

  return (
    <section aria-label="사진으로 닮은꼴 캐릭터 만들기" className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2" aria-label="진행 단계">
        {STC_FLOW_STEPS.map((step, index) => (
          <li
            key={step}
            aria-current={step === flow.step ? "step" : undefined}
            className={
              step === flow.step
                ? "rounded-full bg-accent px-3 py-1 text-xs font-bold text-white"
                : "rounded-full border border-line px-3 py-1 text-xs text-fg-3"
            }
          >
            {index + 1}. {STC_FLOW_STEP_LABELS[step]}
          </li>
        ))}
      </ol>
      <p className="text-sm text-fg-2">{STC_FLOW_STEP_GUIDES[flow.step]}</p>
      {notice ? (
        <p role="status" className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg-2">
          {notice}
        </p>
      ) : null}

      {flow.step === "photo" ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="stc-photo-input" className="text-sm font-bold text-fg">
            얼굴 사진 한 장을 골라 주세요
          </label>
          <input
            id="stc-photo-input"
            type="file"
            accept="image/*"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            className="text-sm text-fg-2"
          />
          {flow.photo ? (
            <div className="flex flex-col gap-2">
              {/* 미리보기는 이 기기 안에서만 쓰이며 서버로 전송되지 않는다. */}
              <img
                src={flow.photo.previewRef}
                alt="고른 얼굴 사진 미리보기"
                onLoad={(event) =>
                  handlePreviewLoad(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                }
                className="max-h-56 w-auto rounded-2xl border border-line object-contain"
              />
              <p className="text-xs text-fg-3">{flow.photo.meta.fileName}</p>
              {photoIssues.map((issue) => (
                <p key={issue.code + issue.message} className={issue.blocking ? "text-sm text-red-500" : "text-sm text-fg-3"}>
                  {issue.message}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg-3">사진을 고르면 여기서 미리 볼 수 있어요.</p>
          )}
          <label className="flex items-start gap-2 text-sm text-fg-2">
            <input
              type="checkbox"
              checked={flow.rightsConfirmed}
              onChange={(event) => setFlow((current) => stcFlowSetRightsConfirmed(current, event.target.checked))}
              className="mt-1"
            />
            본인 사진이거나, 사용해도 된다는 동의를 받은 사진이에요.
          </label>
        </div>
      ) : null}

      {flow.step === "features" ? (
        <div className="flex flex-col gap-3">
          {flow.profile.source === "provider" ? (
            <p className="text-sm text-fg-3">특징 출처: 자동 분석 — 값을 직접 확인해 주세요.</p>
          ) : (
            <p className="text-sm text-fg-3">
              자동 분석이 연결되지 않아 기본값에서 시작해요. 사진을 보면서 특징을 직접 맞춰 주세요.
            </p>
          )}
          {reviewLabels.length > 0 ? (
            <p className="text-sm text-fg-2">
              자동으로 읽기 어려웠던 항목: {reviewLabels.join(", ")} — 이 항목은 꼭 확인해 주세요.
            </p>
          ) : null}
          <label htmlFor="stc-face-shape" className="flex flex-col gap-1 text-sm text-fg-2">
            {STC_FEATURE_LABELS.faceShape}
            <select
              id="stc-face-shape"
              value={flow.profile.faceShape}
              onChange={(event) =>
                setFlow((current) => stcFlowPatchProfile(current, { faceShape: event.target.value as StcFaceShapeKind }))
              }
              className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            >
              {(Object.keys(STC_FACE_SHAPE_LABELS) as StcFaceShapeKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {STC_FACE_SHAPE_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <TriSelect id="stc-eye-size" label={STC_FEATURE_LABELS.eyeSize} value={flow.profile.eyeSize} onChange={(value) => setFlow((c) => stcFlowPatchProfile(c, { eyeSize: value }))} />
            <TriSelect id="stc-eye-spacing" label={STC_FEATURE_LABELS.eyeSpacing} value={flow.profile.eyeSpacing} onChange={(value) => setFlow((c) => stcFlowPatchProfile(c, { eyeSpacing: value }))} />
            <label htmlFor="stc-eye-tilt" className="flex flex-col gap-1 text-sm text-fg-2">
              {STC_FEATURE_LABELS.eyeTilt}
              <select
                id="stc-eye-tilt"
                value={flow.profile.eyeTilt}
                onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { eyeTilt: event.target.value as "down" | "neutral" | "up" }))}
                className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                {TILT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <TriSelect id="stc-nose-height" label={STC_FEATURE_LABELS.noseHeight} value={flow.profile.noseHeight} onChange={(value) => setFlow((c) => stcFlowPatchProfile(c, { noseHeight: value }))} />
            <TriSelect id="stc-nose-width" label={STC_FEATURE_LABELS.noseWidth} value={flow.profile.noseWidth} onChange={(value) => setFlow((c) => stcFlowPatchProfile(c, { noseWidth: value }))} />
            <TriSelect id="stc-mouth-width" label={STC_FEATURE_LABELS.mouthWidth} value={flow.profile.mouthWidth} onChange={(value) => setFlow((c) => stcFlowPatchProfile(c, { mouthWidth: value }))} />
            <TriSelect id="stc-lip-fullness" label={STC_FEATURE_LABELS.lipFullness} value={flow.profile.lipFullness} onChange={(value) => setFlow((c) => stcFlowPatchProfile(c, { lipFullness: value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="stc-cheek" className="flex flex-col gap-1 text-sm text-fg-2">
              볼 볼륨 {Math.round(flow.profile.cheekFullness * 100)}%
              <input
                id="stc-cheek"
                type="range"
                min={0}
                max={100}
                value={Math.round(flow.profile.cheekFullness * 100)}
                onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { cheekFullness: Number(event.target.value) / 100 }))}
              />
            </label>
            <label htmlFor="stc-chin" className="flex flex-col gap-1 text-sm text-fg-2">
              턱 뾰족함 {Math.round(flow.profile.chinPointedness * 100)}%
              <input
                id="stc-chin"
                type="range"
                min={0}
                max={100}
                value={Math.round(flow.profile.chinPointedness * 100)}
                onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { chinPointedness: Number(event.target.value) / 100 }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="stc-hair-style" className="flex flex-col gap-1 text-sm text-fg-2">
              {STC_FEATURE_LABELS.hairStyle}
              <select
                id="stc-hair-style"
                value={flow.profile.hairStyle}
                onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { hairStyle: event.target.value as AvatarForgeHairStyle }))}
                className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                {HAIR_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="stc-bang-style" className="flex flex-col gap-1 text-sm text-fg-2">
              앞머리
              <select
                id="stc-bang-style"
                value={flow.profile.bangStyle}
                onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { bangStyle: event.target.value as AvatarForgeBangStyle }))}
                className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                {BANG_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="stc-hair-color" className="flex flex-col gap-1 text-sm text-fg-2">
              {STC_FEATURE_LABELS.hairColor}
              <input id="stc-hair-color" type="color" value={flow.profile.hairColor} onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { hairColor: event.target.value }))} />
            </label>
            <label htmlFor="stc-iris-color" className="flex flex-col gap-1 text-sm text-fg-2">
              {STC_FEATURE_LABELS.irisColor}
              <input id="stc-iris-color" type="color" value={flow.profile.irisColor} onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { irisColor: event.target.value }))} />
            </label>
            <label htmlFor="stc-skin-tone" className="flex flex-col gap-1 text-sm text-fg-2">
              {STC_FEATURE_LABELS.skinTone}
              <input id="stc-skin-tone" type="color" value={flow.profile.skinTone} onChange={(event) => setFlow((c) => stcFlowPatchProfile(c, { skinTone: event.target.value }))} />
            </label>
          </div>
        </div>
      ) : null}

      {flow.step === "draft" && draft ? (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm text-fg-2">
            {draft.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-xs text-fg-3">얼굴형 항목: {draft.faceShapeEntryId}</p>
          {draft.needsReview.length > 0 ? (
            <p className="text-sm text-fg-2">
              셰이퍼에서 다시 확인하면 좋은 항목: {draft.needsReview.join(", ")}
            </p>
          ) : null}
          {flow.handedOff ? (
            <p role="status" className="text-sm font-bold text-fg">
              셰이퍼로 초안을 보냈어요. 셰이퍼에서 다듬어 주세요.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={() => setFlow((current) => stcFlowBack(current))}
            className="rounded-full border border-line px-4 py-2 text-sm text-fg-2"
          >
            이전
          </button>
        ) : null}
        {flow.step !== "draft" ? (
          <button
            type="button"
            disabled={analyzing}
            onClick={() => void goNext()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {analyzing ? r3c04StatusText("studio.r3c04Status.shaper.stcFlow.analyzing", "특징을 읽는 중…") : flow.step === "photo" ? "특징 확인으로" : "초안 만들기"}
          </button>
        ) : (
          <button
            type="button"
            disabled={flow.handedOff}
            onClick={handleHandOff}
            className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            셰이퍼로 보내기
          </button>
        )}
        {blockReason && flow.step !== "draft" ? <span className="text-xs text-fg-3">{blockReason}</span> : null}
        {props.onClose ? (
          <button type="button" onClick={props.onClose} className="ml-auto text-sm text-fg-3">
            닫기
          </button>
        ) : null}
      </div>
    </section>
  );
}
