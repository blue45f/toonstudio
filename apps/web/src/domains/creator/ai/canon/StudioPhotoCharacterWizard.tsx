/**
 * 사진→캐릭터 생성 위저드 — 지니캔버스 캐릭터의 "업로드 → 스타일 → 생성 → 보관함"
 * 원스톱 동선을 캐릭터 캐논 관리자 안에 연다.
 *
 * 재료는 전부 기존재를 쓴다: 스타일은 사진→웹툰 프리셋 3종, 생성은 BYOK 이미지 편집
 * (generateConsistentCharacterImage), 저장은 캐논 라이브러리(canon.saveSheet)라 저장 즉시
 * 디렉터의 캐논 선택지·컷 프롬프트 주입 동선을 그대로 탄다. 이 컴포넌트가 새로 만드는
 * 것은 단계형 동선뿐이다.
 *
 * BYOK 경계: 통합 AI 설정에 키가 없으면 생성 단계는 비활성으로 표시하고 키 등록
 * 동선(/settings/api-keys)으로 안내한다. 업로드·스타일 선택·이름 입력과 "원본 사진을
 * 레퍼런스로 그대로 저장"은 키 없이 동작한다. 클라이언트 필터 프리셋의 실시간
 * 미리보기는 Konva 파이프라인이 편집기 노드에 묶여 있어 이 표면에서는 제공하지
 * 않는다 — 스타일 카드의 설명이 그 자리를 대신한다.
 */
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  KeyRound,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

import { useUserAi, userAiLegacySettings } from "@/shared/ai/user-ai-store";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { downscaleDataUrl, downscaleImageFile } from "../../canvas/studio-canvas-image-io";
import {
  generateConsistentCharacterImage,
  isStudioAiConfigured,
  type StudioAiSettings,
} from "../studio-ai-client";
import {
  CANON_APPEARANCE_MAX,
  CANON_NAME_MAX,
  type CharacterCanonSheet,
} from "./studio-character-canon";
import {
  buildPhotoCharacterCanonDraft,
  canLeavePhotoStep,
  canLeaveStyleStep,
  resolvePhotoCharacterResultImage,
  runPhotoCharacterGeneration,
  PHOTO_CHARACTER_STYLE_OPTIONS,
  PHOTO_CHARACTER_WIZARD_STEPS,
  type PhotoCharacterGenerateFn,
} from "./studio-photo-character-wizard";
import type { useStudioCharacterCanon } from "./useStudioCharacterCanon";

type CanonSaveApi = Pick<ReturnType<typeof useStudioCharacterCanon>, "saveSheet">;

interface LoadedPhoto {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface StudioPhotoCharacterWizardProps {
  readonly canon: CanonSaveApi;
  readonly onClose: () => void;
  /** 테스트 주입용 — 없으면 통합 AI 스토어 설정을 쓴다. */
  readonly aiSettings?: StudioAiSettings;
  /** 테스트 주입용 — 없으면 generateConsistentCharacterImage를 쓴다. */
  readonly generateImage?: PhotoCharacterGenerateFn;
  /** 테스트 주입용 — 없으면 downscaleImageFile(1280px)을 쓴다. */
  readonly loadPhotoFile?: (file: File) => Promise<LoadedPhoto>;
  /** 테스트 주입용 — 캐논 레퍼런스 규격(긴 변 512px)으로 줄이는 저장 전처리. */
  readonly prepareReferenceImage?: (dataUrl: string) => Promise<string>;
}

const STEP_IDS = PHOTO_CHARACTER_WIZARD_STEPS.map((step) => step.id);

export function StudioPhotoCharacterWizard({
  canon,
  onClose,
  aiSettings,
  generateImage,
  loadPhotoFile,
  prepareReferenceImage,
}: StudioPhotoCharacterWizardProps) {
  const bt = useBilingual("canon.photoCharacter");
  const unifiedAi = useUserAi();
  const settings = aiSettings ?? userAiLegacySettings(unifiedAi.configuration);
  const configured = isStudioAiConfigured(settings);
  const generate = generateImage ?? generateConsistentCharacterImage;
  const loadPhoto = loadPhotoFile ?? ((file: File) => downscaleImageFile(file, 1280));
  const prepareReference =
    prepareReferenceImage ?? ((dataUrl: string) => downscaleDataUrl(dataUrl, 512, 0.82));

  const [stepIndex, setStepIndex] = useState(0);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedDataUrl, setGeneratedDataUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [useOriginal, setUseOriginal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<readonly string[]>([]);
  const [savedSheet, setSavedSheet] = useState<CharacterCanonSheet | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generationRunRef = useRef(0);

  const stepId = STEP_IDS[stepIndex] ?? "photo";
  const resultImage = resolvePhotoCharacterResultImage({
    generatedDataUrl,
    photoDataUrl: photo?.src ?? null,
    useOriginalPhoto: useOriginal,
  });
  const selectedStyle = PHOTO_CHARACTER_STYLE_OPTIONS.find((option) => option.id === styleId);

  const onPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const loaded = await loadPhoto(file);
      setPhoto(loaded);
      // 새 사진을 올리면 이전 생성 결과는 그 사진 기준이 아니므로 버린다.
      setGeneratedDataUrl(null);
      setGenError(null);
      setUseOriginal(false);
    } catch (error) {
      setPhotoError(
        error instanceof Error
          ? error.message
          : bt("사진을 읽지 못했어요. 다른 파일로 올려 주세요.", "Could not read that photo. Try another file."),
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const runGeneration = async () => {
    const runId = ++generationRunRef.current;
    setGenerating(true);
    setGenError(null);
    const result = await runPhotoCharacterGeneration(
      { settings, photoDataUrl: photo?.src ?? null, styleId, note },
      generate,
    );
    if (generationRunRef.current !== runId) return;
    setGenerating(false);
    if (result.ok) {
      setGeneratedDataUrl(result.data.dataUrl);
      setUseOriginal(false);
    } else {
      setGenError(result.error);
    }
  };

  const continueWithOriginal = () => {
    setUseOriginal(true);
    setStepIndex(3);
  };

  const save = async () => {
    if (!resultImage || saving) return;
    setSaving(true);
    setSaveErrors([]);
    try {
      const referenceImage = await prepareReference(resultImage);
      const draft = buildPhotoCharacterCanonDraft({
        name,
        description,
        imageDataUrl: referenceImage,
        styleId,
        usedOriginalPhoto: generatedDataUrl === null,
      });
      const result = canon.saveSheet(draft);
      if (result.ok) {
        setSavedSheet(result.sheet);
      } else {
        setSaveErrors(result.errors);
      }
    } finally {
      setSaving(false);
    }
  };

  if (savedSheet) {
    return (
      <div className="space-y-4">
        <div className="grid place-items-center gap-2 py-6 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-good/15 text-good">
            <Check size={22} aria-hidden />
          </span>
          <p className="text-sm font-black">
            {bt("캐릭터를 캐논에 저장했어요.", "Saved to your character canon.")}
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-fg-3">
            {bt(
              `"${savedSheet.name}"이(가) 캐릭터 목록에 들어갔어요. AI 코믹 디렉터에서 이 캐릭터를 골라 컷 프롬프트에 반영하면, 매 컷 같은 얼굴로 그려집니다.`,
              `"${savedSheet.name}" is now in your character list. Pick it in the AI comic director to inject it into panel prompts so every panel draws the same face.`,
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 w-full rounded-lg bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent/90"
        >
          {bt("캐논 목록으로 돌아가기", "Back to the canon list")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
          <ImagePlus size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black">{bt("사진으로 캐릭터 만들기", "Make a character from a photo")}</h3>
          <p className="text-[0.65rem] leading-relaxed text-fg-3">
            {bt(
              "사진 한 장을 골라 스타일을 정하면 AI가 웹툰 캐릭터로 바꿔 캐릭터 캐논에 보관해요.",
              "Pick one photo and a style — the AI turns it into a webtoon character and keeps it in your canon.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={bt("닫기", "Close")}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-fg"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <ol className="grid grid-cols-4 gap-1" aria-label={bt("진행 단계", "Progress")}>
        {PHOTO_CHARACTER_WIZARD_STEPS.map((step, index) => (
          <li
            key={step.id}
            aria-current={index === stepIndex ? "step" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-[0.65rem] font-semibold",
              index === stepIndex
                ? "border-accent/50 bg-accent-soft text-fg"
                : index < stepIndex
                  ? "border-line bg-panel text-fg-2"
                  : "border-line bg-card text-fg-3",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[0.6rem] font-black",
                index === stepIndex ? "bg-accent text-on-accent" : "bg-raised text-fg-3",
              )}
            >
              {index < stepIndex ? <Check size={11} aria-hidden /> : index + 1}
            </span>
            <span className="truncate">{bt(step.ko, step.en)}</span>
          </li>
        ))}
      </ol>

      {stepId === "photo" ? (
        <section aria-label={bt("사진 올리기", "Add a photo")} className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label={bt("사진 파일 선택", "Choose a photo file")}
            className="sr-only"
            onChange={(event) => {
              void onPhotoFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {photo ? (
            <div className="flex items-start gap-3">
              <img
                src={photo.src}
                alt={bt("올린 사진", "Uploaded photo")}
                className="size-28 shrink-0 rounded-xl border border-line object-cover"
              />
              <div className="space-y-2">
                <p role="status" className="text-xs text-fg-2">
                  {bt("사진이 준비됐어요.", "Your photo is ready.")}
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoBusy}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised disabled:opacity-60"
                >
                  <RotateCcw size={13} aria-hidden />
                  {bt("다른 사진으로 바꾸기", "Use a different photo")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoBusy}
              className="grid w-full place-items-center gap-1 rounded-xl border border-dashed border-line p-8 text-center hover:bg-raised disabled:opacity-60"
            >
              <ImagePlus size={20} className="text-fg-3" aria-hidden />
              <span className="text-sm font-semibold">
                {photoBusy ? bt("사진을 읽는 중…", "Reading photo…") : bt("사진 올리기", "Upload a photo")}
              </span>
              <span className="text-[0.65rem] text-fg-3">
                {bt("정면 사진일수록 캐릭터가 닮게 나와요. JPG·PNG 파일을 올려 주세요.", "Front-facing photos work best. JPG or PNG.")}
              </span>
            </button>
          )}
          {photoError ? (
            <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-2 text-xs text-bad">
              {photoError}
            </p>
          ) : null}
        </section>
      ) : null}

      {stepId === "style" ? (
        <section aria-label={bt("스타일 고르기", "Pick a style")} className="space-y-3">
          <div className="grid gap-2" role="radiogroup" aria-label={bt("스타일", "Style")}>
            {PHOTO_CHARACTER_STYLE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={styleId === option.id}
                onClick={() => setStyleId(option.id)}
                className={cn(
                  "flex min-h-11 items-start gap-3 rounded-xl border p-3 text-left",
                  styleId === option.id
                    ? "border-accent/60 bg-accent-soft"
                    : "border-line bg-card hover:bg-raised",
                )}
              >
                <span
                  className="mt-0.5 size-6 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: option.swatch }}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">{option.label}</span>
                  <span className="mt-0.5 block text-[0.68rem] leading-relaxed text-fg-3">{option.tip}</span>
                </span>
                {styleId === option.id ? <Check size={14} className="ml-auto shrink-0 text-accent" aria-hidden /> : null}
              </button>
            ))}
          </div>
          <p className="text-[0.65rem] leading-relaxed text-fg-3">
            {bt(
              "편집기에서 사진에 거는 필터 프리셋과 같은 스타일들이에요. 다음 단계에서 AI 생성이 이 스타일로 캐릭터를 새로 그립니다.",
              "These are the same styles as the photo filter presets in the editor. In the next step, AI generation redraws your character in this style.",
            )}
          </p>
        </section>
      ) : null}

      {stepId === "generate" ? (
        <section aria-label={bt("캐릭터 생성", "Generate")} className="space-y-3">
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={photo.src} alt={bt("올린 사진", "Uploaded photo")} className="size-16 shrink-0 rounded-lg border border-line object-cover" />
            ) : null}
            <p className="text-xs leading-relaxed text-fg-2">
              {selectedStyle
                ? bt(`"${selectedStyle.label}" 스타일로 캐릭터를 만듭니다.`, `Creating your character in the "${selectedStyle.label}" style.`)
                : null}
            </p>
          </div>

          {configured ? (
            <>
              <label className="block space-y-1">
                <span className="text-[0.68rem] font-semibold text-fg-2">{bt("추가 요청 (선택)", "Extra request (optional)")}</span>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={bt("예: 안경을 쓴 모습으로", "e.g. wearing glasses")}
                  className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <button
                type="button"
                onClick={() => void runGeneration()}
                disabled={generating || !photo}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:opacity-45"
              >
                {generatedDataUrl || genError ? <RotateCcw size={14} aria-hidden /> : <Sparkles size={14} aria-hidden />}
                {generating
                  ? bt("생성 중…", "Generating…")
                  : generatedDataUrl || genError
                    ? bt("다시 생성", "Regenerate")
                    : bt("캐릭터 생성", "Generate character")}
              </button>
              {generating ? (
                <p role="status" className="text-xs text-fg-3">
                  {bt("AI가 사진을 캐릭터로 바꾸고 있어요.", "The AI is turning your photo into a character.")}
                </p>
              ) : null}
              {genError ? (
                <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-2 text-xs text-bad">
                  {genError}
                </p>
              ) : null}
              {generatedDataUrl ? (
                <div className="space-y-2">
                  <img
                    src={generatedDataUrl}
                    alt={bt("생성된 캐릭터", "Generated character")}
                    className="max-h-64 w-full rounded-xl border border-line object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setStepIndex(3)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90"
                  >
                    {bt("이 결과로 계속", "Continue with this result")}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={continueWithOriginal}
                className="block text-xs font-semibold text-fg-3 underline-offset-2 hover:text-fg hover:underline"
              >
                {bt("생성 없이 원본 사진으로 저장하기", "Save the original photo without generating")}
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2 rounded-xl border border-line bg-panel p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold">
                  <KeyRound size={14} className="text-accent" aria-hidden />
                  {bt("AI 생성을 쓰려면 API 키가 필요해요.", "AI generation needs an API key.")}
                </p>
                <p className="text-[0.68rem] leading-relaxed text-fg-3">
                  {bt(
                    "이미지 생성은 본인 키(BYOK)로 동작해요. 통합 API 키 설정에서 이미지 제공자 키를 등록하면 이 단계에서 바로 캐릭터를 생성할 수 있어요.",
                    "Image generation runs on your own key (BYOK). Register an image provider key in the API key hub and this step can generate right away.",
                  )}
                </p>
                <Link
                  href="/settings/api-keys"
                  className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
                >
                  {bt("통합 API 키 설정 열기", "Open API key settings")}
                </Link>
              </div>
              <button
                type="button"
                onClick={continueWithOriginal}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-4 text-xs font-semibold hover:bg-raised"
              >
                {bt("원본 사진으로 계속", "Continue with the original photo")}
                <ArrowRight size={14} aria-hidden />
              </button>
              <p className="text-[0.65rem] leading-relaxed text-fg-3">
                {bt(
                  "키가 없어도 사진 자체를 캐릭터 레퍼런스로 캐논에 저장할 수 있어요. 나중에 키를 등록하면 같은 사진으로 다시 생성할 수 있습니다.",
                  "Without a key you can still keep the photo itself as the character reference. Register a key later to regenerate from the same photo.",
                )}
              </p>
            </>
          )}
        </section>
      ) : null}

      {stepId === "details" ? (
        <section aria-label={bt("이름·설명", "Name & describe")} className="space-y-3">
          <div className="flex items-start gap-3">
            {resultImage ? (
              <img
                src={resultImage}
                alt={bt("저장될 캐릭터 이미지", "Character image to save")}
                className="size-20 shrink-0 rounded-xl border border-line object-cover"
              />
            ) : null}
            <p className="text-[0.68rem] leading-relaxed text-fg-3">
              {generatedDataUrl
                ? bt("생성된 캐릭터를 캐논에 보관합니다.", "The generated character will be kept in your canon.")
                : bt("원본 사진을 캐릭터 레퍼런스로 캐논에 보관합니다.", "The original photo will be kept as the character reference.")}
              {selectedStyle ? ` ${bt("스타일", "Style")}: ${selectedStyle.label}` : null}
            </p>
          </div>
          <label className="block space-y-1">
            <span className="text-[0.68rem] font-semibold text-fg-2">{bt("캐릭터 이름", "Character name")}</span>
            <input
              type="text"
              value={name}
              maxLength={CANON_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder={bt("예: 하린", "e.g. Harin")}
              className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[0.68rem] font-semibold text-fg-2">{bt("캐릭터 설명 (외모)", "Description (appearance)")}</span>
            <textarea
              value={description}
              maxLength={CANON_APPEARANCE_MAX}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={bt("얼굴·머리·체형이 드러나게 써 주세요. 컷을 그릴 때 이 설명이 함께 쓰여요.", "Describe the face, hair, and build — this text is used when panels are drawn.")}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          {saveErrors.length > 0 ? (
            <ul role="alert" className="space-y-1 rounded-lg border border-bad/40 bg-bad/10 p-2 text-xs text-bad">
              {saveErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center gap-2 border-t border-line pt-3">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised"
          >
            <ArrowLeft size={14} aria-hidden />
            {bt("이전", "Back")}
          </button>
        ) : null}
        <span className="flex-1" />
        {stepId === "photo" ? (
          <button
            type="button"
            onClick={() => setStepIndex(1)}
            disabled={!canLeavePhotoStep(photo?.src ?? null)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:opacity-45"
          >
            {bt("다음", "Next")}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : null}
        {stepId === "style" ? (
          <button
            type="button"
            onClick={() => setStepIndex(2)}
            disabled={!canLeaveStyleStep(styleId)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:opacity-45"
          >
            {bt("다음", "Next")}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : null}
        {stepId === "details" ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !resultImage}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:opacity-45"
          >
            <Check size={14} aria-hidden />
            {saving ? bt("저장 중…", "Saving…") : bt("캐논에 저장", "Save to canon")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
