import type { ResearchQueryTranslator } from "./research-query-translation";

/**
 * 2차 층 — 클라이언트 ONNX 한→영 번역 모델 로더 (Transformers.js).
 *
 * 모델: Xenova/opus-mt-ko-en — Helsinki-NLP/opus-mt-ko-en의 ONNX 양자화 포팅.
 * 원본 모델 라이선스는 Apache-2.0(Hugging Face 모델 카드 기준)으로 상업 사용이
 * 가능하다. @huggingface/transformers 라이브러리도 Apache-2.0이다.
 *
 * 활성화 상태 (2026-10-06):
 * - `@huggingface/transformers`가 정식 의존성으로 들어왔고, 이 로더는 실제
 *   동적 import로 번들에 포함된다(lazy chunk). 패키지가 없으면 null 폴백하던
 *   과거의 @vite-ignore 우회는 제거됐다.
 * - 운영 CSP가 외부 origin 스크립트·WASM 실행을 금지하므로 원격 모델
 *   다운로드(allowRemoteModels)는 끄고, 모델 파일은 자체 호스팅 경로에서만
 *   읽는다. 기본 경로는 `/models/` — 배포 시 `dist/models/Xenova/opus-mt-ko-en/`
 *   아래에 아래 파일들을 배치하면 그대로 켜진다.
 *   필수 파일 (q8 기준, Hugging Face API 실측 합계 약 123MB):
 *   config.json, generation_config.json, tokenizer.json, tokenizer_config.json,
 *   vocab.json, source.spm, target.spm, special_tokens_map.json,
 *   onnx/encoder_model_quantized.onnx(약 52.9MB),
 *   onnx/decoder_model_merged_quantized.onnx(약 60.2MB)
 * - 모델 파일이 배치되지 않은 환경에서는 pipeline 생성이 실패해 null로
 *   귀결되고, 검색은 1차 사전 + 원문 폴백으로 종전과 동일하게 완결된다.
 *   이 로더의 실패가 검색을 막는 일은 없다.
 */
export const RESEARCH_MT_MODEL_ID = "Xenova/opus-mt-ko-en";

/** 자체 호스팅 모델 파일의 기본 베이스 경로. 배포 구조가 다르면 configure로 바꾼다. */
export const RESEARCH_MT_DEFAULT_LOCAL_MODEL_PATH = "/models/";

/** q8 모델 파일 전체 용량 (자체 호스팅 필수 파일 합계, 2026-10-06 HF API 실측). */
export const RESEARCH_MT_MODEL_TOTAL_BYTES = 123_110_000;

export interface ResearchMtProgress {
  /** 지금 받는 파일명 (예: onnx/decoder_model_merged_quantized.onnx) */
  file: string;
  loadedBytes: number;
  /** 파일 총량을 모르면 null */
  totalBytes: number | null;
  /** 0..1 진행률. 총량을 모르면 null */
  ratio: number | null;
}

type ResearchMtProgressListener = (progress: ResearchMtProgress) => void;

const progressListeners = new Set<ResearchMtProgressListener>();

/** 모델 다운로드 진행률을 구독한다. 모델이 이미 준비됐거나 실패하면 이벤트는 오지 않는다. */
export function subscribeResearchMtProgress(listener: ResearchMtProgressListener): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitProgress(progress: ResearchMtProgress): void {
  for (const listener of progressListeners) {
    try {
      listener(progress);
    } catch {
      // 구독자 오류가 로더를 막지 않는다.
    }
  }
}

interface TransformersEnvShape {
  localModelPath?: string;
  allowLocalModels?: boolean;
  allowRemoteModels?: boolean;
}

interface TransformersProgressEvent {
  status?: unknown;
  file?: unknown;
  loaded?: unknown;
  total?: unknown;
  progress?: unknown;
}

interface TransformersModuleShape {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  env?: TransformersEnvShape;
}

let translatorPromise: Promise<ResearchQueryTranslator | null> | null = null;
let localModelPath: string | null = null;

/** 모델 파일을 자체 호스팅할 때 그 베이스 경로를 지정한다. 변경하면 캐시를 비운다. */
export function configureResearchMtLocalModelPath(path: string | null): void {
  localModelPath = path;
  translatorPromise = null;
}

async function importTransformers(): Promise<TransformersModuleShape | null> {
  try {
    const mod: unknown = await import("@huggingface/transformers");
    if (typeof mod !== "object" || mod === null) return null;
    const candidate = mod as { pipeline?: unknown; env?: unknown };
    if (typeof candidate.pipeline !== "function") return null;
    return {
      pipeline: candidate.pipeline as TransformersModuleShape["pipeline"],
      env: typeof candidate.env === "object" && candidate.env !== null
        ? candidate.env as TransformersEnvShape
        : undefined,
    };
  } catch {
    return null;
  }
}

function toProgress(event: TransformersProgressEvent): ResearchMtProgress | null {
  if (event.status !== "progress") return null;
  if (typeof event.file !== "string" || !event.file) return null;
  const loaded = typeof event.loaded === "number" ? event.loaded : 0;
  const total = typeof event.total === "number" && event.total > 0 ? event.total : null;
  const ratio = typeof event.progress === "number"
    ? Math.min(1, Math.max(0, event.progress / 100))
    : total !== null
      ? loaded / total
      : null;
  return { file: event.file, loadedBytes: loaded, totalBytes: total, ratio };
}

function readTranslationText(output: unknown): string | null {
  const first: unknown = Array.isArray(output) ? output[0] : output;
  if (typeof first !== "object" || first === null) return null;
  const text = (first as { translation_text?: unknown }).translation_text;
  return typeof text === "string" ? text : null;
}

/**
 * opus-mt-ko-en 번역기를 lazy load 한다. 세션 내 1회만 시도하고 결과를 캐시한다.
 * 어떤 실패도 null로 귀결된다 — 호출자는 사전/원문 폴백으로 진행하면 된다.
 * `importModule`은 테스트 주입용이며, 실사용에서는 기본 동적 import를 쓴다.
 */
export function loadOpusMtTranslator(
  importModule: () => Promise<TransformersModuleShape | null> = importTransformers,
): Promise<ResearchQueryTranslator | null> {
  translatorPromise ??= (async () => {
    const mod = await importModule();
    if (!mod) return null;
    try {
      if (mod.env) {
        // CSP 경계: 외부 origin에서 모델·스크립트를 받지 않는다. 자체 호스팅만 허용.
        mod.env.localModelPath = localModelPath ?? RESEARCH_MT_DEFAULT_LOCAL_MODEL_PATH;
        mod.env.allowLocalModels = true;
        mod.env.allowRemoteModels = false;
      }
      const loaded: unknown = await mod.pipeline("translation", RESEARCH_MT_MODEL_ID, {
        dtype: "q8",
        progress_callback: (event: TransformersProgressEvent) => {
          const progress = toProgress(event ?? {});
          if (progress) emitProgress(progress);
        },
      });
      if (typeof loaded !== "function") return null;
      const run = loaded as (text: string) => Promise<unknown>;
      return async (text: string) => readTranslationText(await run(text));
    } catch {
      return null;
    }
  })();
  return translatorPromise;
}

/** 테스트 전용: 캐시된 번역기와 자체 호스팅 경로를 초기 상태로 되돌린다. */
export function resetResearchMtForTests(): void {
  translatorPromise = null;
  localModelPath = null;
  progressListeners.clear();
}
