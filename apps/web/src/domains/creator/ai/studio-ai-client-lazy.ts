/**
 * Studio AI 비동기 생성 호출의 지연 경계.
 * 실제 생성·채색·번역·대사 추천을 요청하는 시점에만 REST/프롬프트 클라이언트를 로드한다.
 */
import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

export {
  DEFAULT_STUDIO_AI_IMAGE_SIZE,
  isStudioAiConfigured,
  isStudioTextAiConfigured,
  resolveActiveServerAiProviderLabel,
  saveStudioAiSettings,
  studioTextAiTransportForOperation,
  type StudioAiSettings,
} from "./studio-ai-client-config";

export type {
  StudioAiImageSize,
  StudioTextAiProvenance,
  StudioTextAiTransport,
} from "./studio-ai-response-parsing";

type StudioAiClientModule = typeof import("./studio-ai-client");
type StudioScenarioImageGenModule = typeof import("./studio-scenario-image-generation");
type StudioServerAiClientModule = typeof import("../studio-server-ai-client");

const aiClientLoader = createStudioIntentLazyLoader<StudioAiClientModule>(
  () => import("./studio-ai-client"),
);
const scenarioImageGenLoader = createStudioIntentLazyLoader<StudioScenarioImageGenModule>(
  () => import("./studio-scenario-image-generation"),
);
const serverAiClientLoader = createStudioIntentLazyLoader<StudioServerAiClientModule>(
  () => import("../studio-server-ai-client"),
);

export const getStudioServerAiStatus: StudioServerAiClientModule["getStudioServerAiStatus"] = async (...args) =>
  (await serverAiClientLoader.load()).getStudioServerAiStatus(...args);

export const colorizeLineArt: StudioAiClientModule["colorizeLineArt"] = async (...args) =>
  (await aiClientLoader.load()).colorizeLineArt(...args);

export const generateBackgroundImage: StudioAiClientModule["generateBackgroundImage"] = async (...args) =>
  (await aiClientLoader.load()).generateBackgroundImage(...args);

export const generateConsistentCharacterImage: StudioAiClientModule["generateConsistentCharacterImage"] = async (...args) =>
  (await aiClientLoader.load()).generateConsistentCharacterImage(...args);

export const generateScenarioScenes: StudioAiClientModule["generateScenarioScenes"] = async (...args) =>
  (await aiClientLoader.load()).generateScenarioScenes(...args);

export const generateStudioWriterRoomDraft: StudioAiClientModule["generateStudioWriterRoomDraft"] = async (...args) =>
  (await aiClientLoader.load()).generateStudioWriterRoomDraft(...args);

export const suggestColorPalette: StudioAiClientModule["suggestColorPalette"] = async (...args) =>
  (await aiClientLoader.load()).suggestColorPalette(...args);

export const suggestDialogueLines: StudioAiClientModule["suggestDialogueLines"] = async (...args) =>
  (await aiClientLoader.load()).suggestDialogueLines(...args);

export const translateDialogueBatch: StudioAiClientModule["translateDialogueBatch"] = async (...args) =>
  (await aiClientLoader.load()).translateDialogueBatch(...args);

export function createStudioScenarioImageGenerationExecutors(
  context: Parameters<StudioScenarioImageGenModule["createStudioScenarioImageGenerationExecutors"]>[0],
): ReturnType<StudioScenarioImageGenModule["createStudioScenarioImageGenerationExecutors"]> {
  return {
    executeGenerateScenarioImages: async (...args) =>
      (await scenarioImageGenLoader.load())
        .createStudioScenarioImageGenerationExecutors(context)
        .executeGenerateScenarioImages(...args),
    executeRegenerateScenarioImage: async (...args) =>
      (await scenarioImageGenLoader.load())
        .createStudioScenarioImageGenerationExecutors(context)
        .executeRegenerateScenarioImage(...args),
  };
}
