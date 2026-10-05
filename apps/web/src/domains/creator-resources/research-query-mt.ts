import type { ResearchQueryTranslator } from "./research-query-translation";

/**
 * 2차 층 — 클라이언트 ONNX 한→영 번역 모델 로더.
 *
 * 모델: Xenova/opus-mt-ko-en — Helsinki-NLP/opus-mt-ko-en의 ONNX 양자화 포팅.
 * 원본 모델 라이선스는 Apache-2.0(Hugging Face 모델 카드 cardData 기준)으로
 * 상업 사용이 가능하다. transformers.js 라이브러리도 Apache-2.0이다.
 *
 * 활성화 경계 (2026-10-06 실측):
 * - `@huggingface/transformers`는 아직 이 저장소의 의존성에 없다. 그래서 이 로더는
 *   동적 import로만 접근하고, 패키지가 없으면 null을 돌려준다(폴백 사다리 동작).
 * - 운영 CSP가 외부 origin 스크립트·WASM 실행을 금지하므로, 실제로 켜려면
 *   ① 패키지 추가 ② 모델 파일 자체 호스팅(스튜디오 ONNX 자산과 같은 방식)
 *   ③ `configureResearchMtLocalModelPath`로 자체 호스팅 경로 지정이 선행돼야 한다.
 * - 위 경계 전까지 검색은 1차 사전 + 원문 폴백으로 완결되며, 이 로더의 실패가
 *   검색을 막는 일은 없다.
 */
export const RESEARCH_MT_MODEL_ID = "Xenova/opus-mt-ko-en";

interface TransformersEnv {
  localModelPath?: string;
  allowLocalModels?: boolean;
}

interface TransformersModuleShape {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<unknown>;
  env?: TransformersEnv;
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
    // 변수 지정자 + @vite-ignore: 패키지가 설치되기 전까지 번들러가 해석하지 않고
    // 브라우저 네이티브 import로 남긴다. 실패는 아래 폴백이 흡수한다.
    const specifier: string = "@huggingface/transformers";
    const mod: unknown = await import(/* @vite-ignore */ specifier);
    if (typeof mod !== "object" || mod === null) return null;
    const candidate = mod as { pipeline?: unknown; env?: unknown };
    if (typeof candidate.pipeline !== "function") return null;
    return {
      pipeline: candidate.pipeline as TransformersModuleShape["pipeline"],
      env: typeof candidate.env === "object" && candidate.env !== null ? candidate.env as TransformersEnv : undefined,
    };
  } catch {
    return null;
  }
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
 */
export function loadOpusMtTranslator(): Promise<ResearchQueryTranslator | null> {
  translatorPromise ??= (async () => {
    const mod = await importTransformers();
    if (!mod) return null;
    try {
      if (localModelPath && mod.env) {
        mod.env.localModelPath = localModelPath;
        mod.env.allowLocalModels = true;
      }
      const loaded: unknown = await mod.pipeline("translation", RESEARCH_MT_MODEL_ID, { dtype: "q8" });
      if (typeof loaded !== "function") return null;
      const run = loaded as (text: string) => Promise<unknown>;
      return async (text: string) => readTranslationText(await run(text));
    } catch {
      return null;
    }
  })();
  return translatorPromise;
}
