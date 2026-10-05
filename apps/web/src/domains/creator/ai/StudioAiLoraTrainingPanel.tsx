/**
 * 캐릭터·화풍 LoRA 학습 패널 — fal.ai BYOK.
 *
 * 이 패널이 하는 일:
 * 1. 사용자가 고른 참조 이미지 묶음(캔버스에서 선택한 이미지들)을 zip으로 묶어
 *    본인 fal 계정에 학습 잡을 제출한다. 제출이 성공하는 순간부터 과금은
 *    사용자 본인의 fal 계정에 발생하므로, 시작 버튼 위에 그 사실을 명시한다.
 * 2. 잡 상태는 fal 큐 API의 실제 응답으로만 갱신한다(자동 새로고침 15초 +
 *    수동 새로고침). 진행률 흉내·가짜 완료 표시는 없다.
 * 3. 학습이 끝나면 산출 LoRA 파일이 그 캐릭터에 연결된 것으로 기록되고,
 *    아래 생성 섹션에서 그 모델로 이미지를 만들어 캔버스에 넣을 수 있다.
 *
 * 키가 없으면 전체가 비활성으로 표시되고, 완료된 학습 모델이 없으면 위쪽의
 * 기존 참조 이미지 방식(캐릭터 일관성 패널)으로 안내한다 — 폴백은 기존 흐름이
 * 그대로 담당한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Layers, Loader2, Play, RefreshCw, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";

import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import {
  generateStudioLoraImage,
  isStudioFalConfigured,
  loadStudioFalApiKey,
  submitStudioLoraTraining,
  uploadStudioLoraFile,
  type StudioLoraClientDeps,
} from "./studio-lora-fal";
import {
  browserStudioLoraJobStorage,
  buildStudioLoraGenerationPrompt,
  createStudioLoraArchive,
  createStudioLoraJobRecord,
  loadStudioLoraJobs,
  refreshStudioLoraJob,
  removeStudioLoraJob,
  saveStudioLoraJobs,
  studioLoraArchiveEntryFromDataUrl,
  suggestStudioLoraTriggerWord,
  upsertStudioLoraJob,
  STUDIO_LORA_MAX_TRAINING_IMAGES,
  STUDIO_LORA_MIN_TRAINING_IMAGES,
  type StudioLoraJobKind,
  type StudioLoraTrainingJob,
} from "./studio-lora-training";

function text(source: string): string {
  return translateCurrentStaticSourceText("domains.creator.ai.StudioAiLoraTrainingPanel", "ko", source);
}

const JOB_STATUS_LABEL: Readonly<Record<StudioLoraTrainingJob["status"], string>> = {
  queued: "대기 중",
  training: "학습 중",
  completed: "완료",
  failed: "실패",
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

export interface StudioAiLoraTrainingPanelProps {
  /** 캔버스에서 현재 선택된 이미지의 data URL — 학습 세트에 담을 수 있다. */
  readonly selectedImageSrc: string | null;
  /** 생성 결과를 캔버스에 넣는다. */
  readonly onInsertImage: (dataUrl: string, width: number, height: number) => void;
  /** 테스트에서 목 fetch 등을 주입할 때만 쓴다. */
  readonly clientDeps?: StudioLoraClientDeps;
}

export function StudioAiLoraTrainingPanel({
  selectedImageSrc,
  onInsertImage,
  clientDeps,
}: StudioAiLoraTrainingPanelProps) {
  const deps = useMemo<StudioLoraClientDeps>(() => clientDeps ?? {}, [clientDeps]);
  const [apiKey, setApiKey] = useState<string>(() => loadStudioFalApiKey());
  const [jobs, setJobs] = useState<readonly StudioLoraTrainingJob[]>(() =>
    loadStudioLoraJobs(browserStudioLoraJobStorage()),
  );
  const [characterLabel, setCharacterLabel] = useState("");
  const [triggerWord, setTriggerWord] = useState("");
  const [triggerEdited, setTriggerEdited] = useState(false);
  const [kind, setKind] = useState<StudioLoraJobKind>("character");
  const [trainingImages, setTrainingImages] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generationJobId, setGenerationJobId] = useState<string>("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generated, setGenerated] = useState<{ url: string; width: number; height: number } | null>(null);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  // 마운트 때 키를 다시 읽는다(키 허브에서 막 등록하고 돌아온 경우 반영).
  useEffect(() => {
    setApiKey(loadStudioFalApiKey());
  }, []);

  const persistJobs = useCallback((next: readonly StudioLoraTrainingJob[]) => {
    jobsRef.current = next;
    setJobs(next);
    saveStudioLoraJobs(browserStudioLoraJobStorage(), next);
  }, []);

  const refreshOne = useCallback(
    async (job: StudioLoraTrainingJob) => {
      const key = apiKeyRef.current;
      if (!isStudioFalConfigured(key)) return;
      const outcome = await refreshStudioLoraJob(deps, key, job);
      if (outcome.ok) {
        persistJobs(upsertStudioLoraJob(jobsRef.current, outcome.data.job));
      }
    },
    [deps, persistJobs],
  );

  // 진행 중 잡은 15초 간격으로 실제 상태를 다시 묻는다. 흉내 진행률은 없다.
  useEffect(() => {
    const timer = setInterval(() => {
      const active = jobsRef.current.filter(
        (job) => job.status === "queued" || job.status === "training",
      );
      for (const job of active) void refreshOne(job);
    }, 15_000);
    return () => clearInterval(timer);
  }, [refreshOne]);

  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === "completed" && job.loraFileUrl),
    [jobs],
  );
  const generationJob = useMemo(
    () => completedJobs.find((job) => job.id === generationJobId) ?? completedJobs[0] ?? null,
    [completedJobs, generationJobId],
  );

  const configured = isStudioFalConfigured(apiKey);

  const handleLabelChange = (value: string) => {
    setCharacterLabel(value);
    if (!triggerEdited) setTriggerWord(suggestStudioLoraTriggerWord(value));
  };

  const addSelectedImage = () => {
    setError(null);
    if (!selectedImageSrc) {
      setError(text("먼저 캔버스에서 학습에 쓸 이미지를 선택해 주세요."));
      return;
    }
    if (!studioLoraArchiveEntryFromDataUrl(selectedImageSrc, 0)) {
      setError(text("선택한 이미지는 학습에 쓸 수 없는 형식입니다(PNG·JPEG·WebP만 가능)."));
      return;
    }
    if (trainingImages.includes(selectedImageSrc)) {
      setError(text("이미 학습 세트에 담긴 이미지입니다."));
      return;
    }
    if (trainingImages.length >= STUDIO_LORA_MAX_TRAINING_IMAGES) {
      setError(text(`학습 이미지는 최대 ${STUDIO_LORA_MAX_TRAINING_IMAGES}장까지 담을 수 있습니다.`));
      return;
    }
    setTrainingImages((prev) => [...prev, selectedImageSrc]);
  };

  const startTraining = async () => {
    setError(null);
    setNotice(null);
    const label = characterLabel.trim();
    const trigger = triggerWord.trim();
    if (!label) {
      setError(text("캐릭터(또는 화풍) 이름을 입력해 주세요."));
      return;
    }
    if (!trigger) {
      setError(text("트리거 워드를 입력해 주세요. 학습된 모습을 부를 때 쓰는 고유 단어입니다."));
      return;
    }
    if (trainingImages.length < STUDIO_LORA_MIN_TRAINING_IMAGES) {
      setError(
        text(
          `학습 이미지가 ${trainingImages.length}장입니다. fal 학습은 최소 ${STUDIO_LORA_MIN_TRAINING_IMAGES}장을 권합니다.`,
        ),
      );
      return;
    }
    const entries = trainingImages.map((src, index) => studioLoraArchiveEntryFromDataUrl(src, index));
    if (entries.some((entry) => entry === null)) {
      setError(text("학습 세트에 지원하지 않는 형식의 이미지가 섞여 있습니다."));
      return;
    }
    const validEntries = entries.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
    setBusy("training");
    try {
      const archive = createStudioLoraArchive(validEntries);
      const blob = new Blob([archive], { type: "application/zip" });
      const upload = await uploadStudioLoraFile(deps, apiKey, {
        name: `${label}-lora-training.zip`,
        contentType: "application/zip",
        body: blob,
      });
      if (!upload.ok) {
        setError(upload.error);
        return;
      }
      // ⚠️ 과금 경계: 아래 제출이 성공하는 순간부터 사용자 본인 fal 계정에
      // 학습 요금이 청구된다. 업로드까지는 학습 과금이 발생하지 않는다.
      const submission = await submitStudioLoraTraining(deps, apiKey, {
        imagesDataUrl: upload.data.fileUrl,
        triggerWord: trigger,
        isStyle: kind === "style",
      });
      if (!submission.ok) {
        setError(submission.error);
        return;
      }
      const nowIso = new Date().toISOString();
      const job = createStudioLoraJobRecord({
        id: `lora-${submission.data.requestId}`,
        characterLabel: label,
        triggerWord: trigger,
        kind,
        providerRequestId: submission.data.requestId,
        statusUrl: submission.data.statusUrl,
        responseUrl: submission.data.responseUrl,
        trainingImageCount: validEntries.length,
        nowIso,
      });
      persistJobs(upsertStudioLoraJob(jobsRef.current, job));
      setTrainingImages([]);
      setNotice(
        text("학습을 접수했습니다. 상태는 fal의 실제 응답으로만 갱신되며, 끝나면 아래 생성에서 쓸 수 있습니다."),
      );
    } finally {
      setBusy(null);
    }
  };

  const runGeneration = async () => {
    setError(null);
    setNotice(null);
    if (!generationJob?.loraFileUrl) {
      setError(text("먼저 학습이 완료된 모델을 골라 주세요."));
      return;
    }
    const prompt = buildStudioLoraGenerationPrompt(generationJob, generationPrompt);
    if (!prompt) {
      setError(text("만들 장면을 프롬프트로 입력해 주세요."));
      return;
    }
    setBusy("generation");
    try {
      // ⚠️ 과금 경계: 생성 제출이 성공하면 사용자 본인 fal 계정에 생성 요금이 청구된다.
      const result = await generateStudioLoraImage(deps, apiKey, {
        prompt,
        loraFileUrl: generationJob.loraFileUrl,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGenerated({
        url: result.data.imageUrl,
        width: result.data.width ?? 1024,
        height: result.data.height ?? 1024,
      });
    } finally {
      setBusy(null);
    }
  };

  const insertGenerated = async () => {
    if (!generated) return;
    setError(null);
    try {
      const response = await (deps.fetchImpl ?? fetch)(generated.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      if (!dataUrl) throw new Error("empty");
      onInsertImage(dataUrl, generated.width, generated.height);
      setNotice(text("생성 이미지를 캔버스에 추가했습니다."));
    } catch {
      // 변환이 막히면 원본 주소를 새 탭으로 여는 것으로 폴백한다.
      window.open(generated.url, "_blank", "noopener,noreferrer");
      setNotice(text("캔버스 변환이 막혀 생성 이미지의 원본 주소를 새 탭으로 열었습니다."));
    }
  };

  return (
    <section
      aria-label={text("캐릭터·화풍 학습 (LoRA)")}
      className="mt-3 rounded-2xl border border-line bg-panel/50 p-3"
      data-testid="studio-lora-training-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-[12px] font-bold text-fg">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden />
            {text("캐릭터·화풍 학습 (LoRA)")}
          </h4>
          <p className="mt-1 text-[11px] leading-5 text-fg-3">
            {text(
              "참조 이미지를 몇 장 모아 학습시키면, 그 캐릭터·화풍을 부를 수 있는 나만의 모델이 됩니다. 학습과 생성은 본인의 fal.ai 키로 실행됩니다.",
            )}
          </p>
        </div>
      </div>

      {!configured ? (
        <div className="mt-3 rounded-xl border border-dashed border-line bg-panel px-3 py-3">
          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-fg-2" role="status">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
            {text(
              "fal.ai 키가 없어 학습 기능이 꺼져 있습니다. 키가 없을 때는 위쪽 참조 이미지 방식(캐릭터 일관성)이 그대로 동작합니다.",
            )}
          </p>
          <Link
            to="/settings/api-keys"
            className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-[12px] font-bold text-white transition hover:bg-accent-strong"
          >
            {text("통합 API 키 설정에서 fal.ai 키 등록하기")}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-2">
            <label className="grid gap-1 text-[11px] font-semibold text-fg-2">
              {text("캐릭터(또는 화풍) 이름")}
              <input
                value={characterLabel}
                onChange={(event) => handleLabelChange(event.target.value)}
                placeholder={text("예: 주인공 하루")}
                className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-[12px] text-fg outline-none focus:border-accent"
              />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-fg-2">
              {text("트리거 워드 (생성할 때 이 단어로 부릅니다)")}
              <input
                value={triggerWord}
                onChange={(event) => {
                  setTriggerEdited(true);
                  setTriggerWord(event.target.value);
                }}
                className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-[12px] text-fg outline-none focus:border-accent"
              />
            </label>
            <div className="flex gap-1.5" role="group" aria-label={text("학습 종류")}>
              {(
                [
                  { value: "character", label: "캐릭터 학습" },
                  { value: "style", label: "화풍 학습" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  aria-pressed={kind === option.value}
                  className={`min-h-11 flex-1 rounded-lg border px-2 text-[12px] font-bold transition ${
                    kind === option.value
                      ? "border-accent bg-accent-soft text-accent-strong"
                      : "border-line bg-panel text-fg-2 hover:border-accent"
                  }`}
                >
                  {text(option.label)}
                </button>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-fg-2">
                  {text(`학습 이미지 ${trainingImages.length}장 (최소 ${STUDIO_LORA_MIN_TRAINING_IMAGES}장)`)}
                </span>
                <button
                  type="button"
                  onClick={addSelectedImage}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-[11px] font-bold text-fg transition hover:border-accent"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                  {text("선택한 이미지 담기")}
                </button>
              </div>
              {trainingImages.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {trainingImages.map((src, index) => (
                    <li key={`${index}-${src.slice(0, 32)}`} className="relative">
                      <img
                        src={src}
                        alt={text(`학습 이미지 ${index + 1}`)}
                        className="h-12 w-12 rounded-lg border border-line object-cover"
                      />
                      <button
                        type="button"
                        aria-label={text(`학습 이미지 ${index + 1} 빼기`)}
                        onClick={() =>
                          setTrainingImages((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2 text-[11px] leading-5 text-fg-2">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              {text(
                "학습을 시작하면 본인의 fal 계정에 학습 요금이 청구됩니다. 요금은 fal 모델 페이지에서 확인해 주세요.",
              )}
            </p>
            <button
              type="button"
              onClick={() => void startTraining()}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-bold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "training" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              {text("학습 시작 (fal에 접수)")}
            </button>
          </div>

          {jobs.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-xl border border-line bg-panel px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-bold text-fg">{job.characterLabel}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        job.status === "completed"
                          ? "bg-success-soft text-success"
                          : job.status === "failed"
                            ? "bg-danger-soft text-danger"
                            : "bg-accent-soft text-accent-strong"
                      }`}
                      role="status"
                    >
                      {text(JOB_STATUS_LABEL[job.status])}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-fg-3">
                    {job.kind === "style" ? text("화풍 학습") : text("캐릭터 학습")}
                    {" · "}
                    {text(`트리거 워드 ${job.triggerWord}`)}
                    {" · "}
                    {text(`학습 이미지 ${job.trainingImageCount}장`)}
                  </p>
                  {job.lastError ? (
                    <p className="mt-1 text-[11px] leading-5 text-danger">{job.lastError}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {job.status === "queued" || job.status === "training" ? (
                      <button
                        type="button"
                        onClick={() => void refreshOne(job)}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] font-bold text-fg transition hover:border-accent"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        {text("상태 새로고침")}
                      </button>
                    ) : null}
                    {job.status === "completed" && job.loraFileUrl ? (
                      <>
                        <a
                          href={job.loraFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center rounded-lg border border-line px-2.5 text-[11px] font-bold text-fg transition hover:border-accent"
                        >
                          {text("LoRA 파일 열기")}
                        </a>
                        <button
                          type="button"
                          onClick={() => setGenerationJobId(job.id)}
                          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-2.5 text-[11px] font-bold text-white transition hover:bg-accent-strong"
                        >
                          {text("이 모델로 생성")}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => persistJobs(removeStudioLoraJob(jobsRef.current, job.id))}
                      aria-label={text(`${job.characterLabel} 학습 기록 지우기`)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-fg-3 transition hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {text("기록 지우기")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 border-t border-line pt-3">
            <h5 className="flex items-center gap-1.5 text-[12px] font-bold text-fg">
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
              {text("학습 모델로 생성")}
            </h5>
            {completedJobs.length === 0 ? (
              <p className="mt-1 text-[11px] leading-5 text-fg-3" role="status">
                {text(
                  "아직 학습이 완료된 모델이 없습니다. 그전까지는 위쪽 캐릭터 일관성(참조 이미지 방식)으로 생성할 수 있습니다.",
                )}
              </p>
            ) : (
              <div className="mt-2 grid gap-2">
                <label className="grid gap-1 text-[11px] font-semibold text-fg-2">
                  {text("사용할 학습 모델")}
                  <select
                    value={generationJob?.id ?? ""}
                    onChange={(event) => setGenerationJobId(event.target.value)}
                    className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-[12px] text-fg outline-none focus:border-accent"
                  >
                    {completedJobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.characterLabel} ({job.triggerWord})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] font-semibold text-fg-2">
                  {text("만들 장면")}
                  <input
                    value={generationPrompt}
                    onChange={(event) => setGenerationPrompt(event.target.value)}
                    placeholder={text("예: 비 오는 골목에서 우산을 쓰고 서 있는 모습")}
                    className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-[12px] text-fg outline-none focus:border-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void runGeneration()}
                  disabled={busy !== null}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-bold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "generation" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  {text("학습 모델로 생성 (fal 과금)")}
                </button>
                {generated ? (
                  <div className="grid gap-2">
                    <img
                      src={generated.url}
                      alt={text("학습 모델 생성 결과")}
                      className="w-full rounded-xl border border-line object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void insertGenerated()}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-accent px-3 text-[12px] font-bold text-accent-strong transition hover:bg-accent-soft"
                    >
                      {text("캔버스에 추가")}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}

      {error ? (
        <p className="mt-2 text-[11px] font-semibold leading-5 text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-2 text-[11px] leading-5 text-fg-2" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
