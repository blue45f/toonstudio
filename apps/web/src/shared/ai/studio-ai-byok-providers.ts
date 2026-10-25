/**
 * studio-ai-byok-providers.ts — BYOK 제공자 프리셋·기능 지원 표 (순수 모듈, fetch 없음).
 *
 * 배경: 채색 설정 모델(StudioAiSettings)은 baseUrl + apiKey + imageModel
 * 단일 쌍이라 제공자 전환 UI가 없다. 이 모듈은 그 빈틈을 메우는
 * 프리셋·지원 표 데이터만 제공한다. 키 입력·저장 경로는 기존 설정 배선을
 * 그대로 쓰며, 이 모듈이 키를 만지거나 저장하지 않는다.
 *
 * 지원 표 근거(코드 실측):
 * - byok-images-edits: colorizeLineArt가 마스크 없이 이미지 전체 +
 *   텍스트 프롬프트만 보내는 단순화 버전이라 인페인팅·레이어 분리는 없다.
 *   색 힌트는 프롬프트 문장 컴파일로만 전달할 수 있다.
 * - local-onnx: Tag2Pix 기기 채색은 태그 힌트와 레이어 분리 PSD
 *   내보내기를 갖추고, 인페인팅은 없다.
 * - server-chat: 서버 AI는 텍스트 작업(chat) 경로이며 이미지 채색이 아니다.
 */

export interface StudioAiByokProviderPreset {
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly note: string;
}

export const STUDIO_AI_BYOK_PROVIDER_PRESETS: readonly StudioAiByokProviderPreset[] =
  Object.freeze([
    Object.freeze({
      id: "openai",
      label: "OpenAI 호환",
      baseUrl: "https://api.openai.com/v1",
      note: "기본값과 같다. 이미지 모델명은 직접 입력한다.",
    }),
    Object.freeze({
      id: "custom",
      label: "직접 입력",
      baseUrl: "",
      note: "OpenAI 호환 엔드포인트 주소를 직접 입력한다.",
    }),
  ]);

export type StudioAiProviderTransport = "byok-images-edits" | "local-onnx" | "server-chat";

export interface StudioAiProviderCapability {
  readonly transport: StudioAiProviderTransport;
  readonly label: string;
  readonly supportsHintViaPrompt: boolean;
  readonly supportsHintViaTags: boolean;
  readonly supportsLayeredOutput: boolean;
  readonly supportsInpainting: boolean;
  readonly note: string;
}

export const STUDIO_AI_PROVIDER_CAPABILITIES: readonly StudioAiProviderCapability[] =
  Object.freeze([
    Object.freeze({
      transport: "byok-images-edits",
      label: "클라우드 채색(BYOK)",
      supportsHintViaPrompt: true,
      supportsHintViaTags: false,
      supportsLayeredOutput: false,
      supportsInpainting: false,
      note: "마스크를 보내지 않아 영역 지정 수정은 할 수 없다. 결과는 래스터 1장이다.",
    }),
    Object.freeze({
      transport: "local-onnx",
      label: "기기 채색(ONNX)",
      supportsHintViaPrompt: false,
      supportsHintViaTags: true,
      supportsLayeredOutput: true,
      supportsInpainting: false,
      note: "태그 힌트와 레이어 분리 PSD 내보내기를 지원한다. 오프라인에서 동작한다.",
    }),
    Object.freeze({
      transport: "server-chat",
      label: "서버 AI(텍스트)",
      supportsHintViaPrompt: false,
      supportsHintViaTags: false,
      supportsLayeredOutput: false,
      supportsInpainting: false,
      note: "텍스트 작업 전용 경로이며 이미지 채색은 다루지 않는다.",
    }),
  ]);

export function findByokProviderPreset(
  presetId: string,
): StudioAiByokProviderPreset | null {
  return (
    STUDIO_AI_BYOK_PROVIDER_PRESETS.find((preset) => preset.id === presetId) ??
    null
  );
}

export function findProviderCapability(
  transport: StudioAiProviderTransport,
): StudioAiProviderCapability | null {
  return (
    STUDIO_AI_PROVIDER_CAPABILITIES.find((entry) => entry.transport === transport) ??
    null
  );
}
