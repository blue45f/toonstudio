import type { BilingualText } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioAiAssistToolId } from "../../ai/studio-ai-assist-ux";
import type {
  StudioOpenAiAssistMode,
  StudioOpenAiAssistSuccess,
} from "../../ai/studio-openai-creative-assist-client";

export type StudioProjectAssistantSectionId =
  | "overview"
  | "story"
  | "production"
  | "assets"
  | "review"
  | "export"
  | "settings";

export type AssistantSuggestionSpec = Readonly<{
  tool: StudioAiAssistToolId;
  openAiMode: StudioOpenAiAssistMode;
  label: BilingualText;
  prompt: BilingualText;
}>;

export const STUDIO_ASSISTANT_SUGGESTIONS: Readonly<
  Record<StudioProjectAssistantSectionId, readonly AssistantSuggestionSpec[]>
> = Object.freeze({
  overview: [
    {
      tool: "composition",
      openAiMode: "idea-remix",
      label: { ko: "5가지 발상 넓히기", en: "5-angle idea remix" },
      prompt: {
        ko: "평범한 출퇴근길 지하철에서 우연히 시작되는 미스터리 웹툰 소재를 5가지 신선한 각도로 넓혀줘.",
        en: "Remix a subway commute mystery webtoon idea into 5 distinct angles.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "다음 장면 계획", en: "Plan next scene" },
      prompt: {
        ko: "주인공이 낯선 편지를 열어 보고 놀라 뒤돌아보는 오프닝 장면을 4컷 구성으로 나눠줘.",
        en: "Draft a 4-panel opening sequence where the lead opens a strange letter and turns around.",
      },
    },
    {
      tool: "palette",
      openAiMode: "idea-remix",
      label: { ko: "작품 색감 정리", en: "Refine project palette" },
      prompt: {
        ko: "현재 작품의 장르와 분위기에 맞는 일관된 색상과 연출 포인트를 제안해줘.",
        en: "Suggest consistent mood and direction cues for the project's genre.",
      },
    },
  ],
  story: [
    {
      tool: "dialogue",
      openAiMode: "dialogue-polish",
      label: { ko: "대사 다듬기", en: "Refine dialogue" },
      prompt: {
        ko: "“내가 어제 분명히 그 문서 절대 열어보지 말라고 말했잖아, 왜 내 말을 안 듣는 거야?”를 말풍선에 잘 읽히게 다듬어줘.",
        en: "Polish this long line so it reads naturally inside mobile speech balloons.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "대본을 컷으로", en: "Script to panels" },
      prompt: {
        ko: "현재 대본을 웹툰 컷 단위로 나누고 카메라 구도와 말풍선 여백을 제안해줘.",
        en: "Break the current script into webtoon panels with camera and balloon-space suggestions.",
      },
    },
    {
      tool: "character",
      openAiMode: "idea-remix",
      label: { ko: "소재 5각도 리믹스", en: "5-lens story remix" },
      prompt: {
        ko: "이번 회차 줄거리를 독자가 예측하기 어려운 반전·공감·디테일 5가지 시선으로 재해석해줘.",
        en: "Reinterpret this episode's premise from 5 fresh storytelling lenses.",
      },
    },
  ],
  production: [
    {
      tool: "background",
      openAiMode: "script-to-cuts",
      label: { ko: "배경 참고 만들기", en: "Create background reference" },
      prompt: {
        ko: "현재 컷의 카메라와 분위기에 맞는 배경·샷 구도 참고안을 만들어줘.",
        en: "Create background and shot framing references matching the current scene.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "컷 구성 개선", en: "Improve composition" },
      prompt: {
        ko: "현재 장면의 시선 흐름과 긴장감을 높이는 컷 분할 대안을 제안해줘.",
        en: "Suggest panel breakdowns that improve eye flow and dramatic tension.",
      },
    },
    {
      tool: "palette",
      openAiMode: "dialogue-polish",
      label: { ko: "말풍선 호흡 조절", en: "Adjust balloon pacing" },
      prompt: {
        ko: "액션 컷 사이에 들어갈 짧은 호흡의 대사 대안을 제안해줘.",
        en: "Suggest concise dialogue alternatives that fit fast action beats.",
      },
    },
  ],
  assets: [
    {
      tool: "character",
      openAiMode: "idea-remix",
      label: { ko: "캐릭터 연출 아이디어", en: "Character hook ideas" },
      prompt: {
        ko: "주인공의 성격을 소품과 행동 하나로 보여 줄 수 있는 첫 등장 컷 아이디어를 제안해줘.",
        en: "Suggest first-appearance panel hooks that show character personality through action.",
      },
    },
    {
      tool: "palette",
      openAiMode: "export-preflight-coach",
      label: { ko: "작품 소개글 다듬기", en: "Polish series blurb" },
      prompt: {
        ko: "작품 표지와 함께 걸어 둘 매력적인 한 줄 소개글과 주의할 표현을 점검해줘.",
        en: "Check and polish a one-line series blurb to pair with the cover.",
      },
    },
  ],
  review: [
    {
      tool: "dialogue",
      openAiMode: "dialogue-polish",
      label: { ko: "대사 검토", en: "Review dialogue" },
      prompt: {
        ko: "검토 중인 대사의 어색한 표현을 덜어내고 모바일에서 읽기 편한 길이로 다듬어줘.",
        en: "Trim awkward phrasing and fit review dialogue cleanly for mobile reading.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "연출 검토", en: "Review direction" },
      prompt: {
        ko: "검토 중인 장면의 시선 흐름과 스크롤 여백을 살리는 컷 구성을 제안해줘.",
        en: "Suggest panel pacing and scroll gaps for smoother transitions.",
      },
    },
  ],
  export: [
    {
      tool: "dialogue",
      openAiMode: "export-preflight-coach",
      label: { ko: "글자 가독성·소개글 점검", en: "Check readability & blurb" },
      prompt: {
        ko: "1화 공개 전 독자 눈길이 멈추는 회차 소개글과 말풍선 가독성 점검표를 만들어줘.",
        en: "Prepare an episode release blurb and pre-export readability checklist.",
      },
    },
    {
      tool: "palette",
      openAiMode: "dialogue-polish",
      label: { ko: "마지막 대사 다듬기", en: "Final line polish" },
      prompt: {
        ko: "회차 마지막 컷의 엔딩 대사를 다음 화가 궁금해지도록 자연스럽게 다듬어줘.",
        en: "Polish the cliffhanger line in the final panel so readers want the next episode.",
      },
    },
  ],
  settings: [
    {
      tool: "palette",
      openAiMode: "export-preflight-coach",
      label: { ko: "작품 기본 소개 정리", en: "Organize series summary" },
      prompt: {
        ko: "이 작품의 장르와 독자층에 어울리는 작품 소개 문구와 연재 전 확인 항목을 정리해줘.",
        en: "Summarize series blurb ideas and pre-serial checks for this genre.",
      },
    },
  ],
});

export function defaultOpenAiModeForSection(
  section: StudioProjectAssistantSectionId,
): StudioOpenAiAssistMode {
  if (section === "overview" || section === "assets") return "idea-remix";
  if (section === "story" || section === "production") return "script-to-cuts";
  if (section === "review") return "dialogue-polish";
  return "export-preflight-coach";
}

const SESSION_KEY_PREFIX = "toonstudio:assistant-draft:v1:";

export interface StudioAssistantSessionSnapshot {
  readonly prompt: string;
  readonly openAiMode: StudioOpenAiAssistMode;
  readonly lastResult: StudioOpenAiAssistSuccess | null;
}

export function readStudioAssistantSessionState(
  projectId: string,
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): StudioAssistantSessionSnapshot | null {
  if (!storage || !projectId) return null;
  try {
    const raw = storage.getItem(`${SESSION_KEY_PREFIX}${projectId}`);
    if (!raw || raw.length > 64_000) return null;
    const parsed = JSON.parse(raw) as Partial<StudioAssistantSessionSnapshot>;
    if (typeof parsed.prompt !== "string" || typeof parsed.openAiMode !== "string") {
      return null;
    }
    return {
      prompt: parsed.prompt.slice(0, 6_000),
      openAiMode: parsed.openAiMode as StudioOpenAiAssistMode,
      lastResult: parsed.lastResult ?? null,
    };
  } catch {
    return null;
  }
}

export function writeStudioAssistantSessionState(
  projectId: string,
  snapshot: StudioAssistantSessionSnapshot,
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): void {
  if (!storage || !projectId) return;
  try {
    storage.setItem(`${SESSION_KEY_PREFIX}${projectId}`, JSON.stringify(snapshot));
  } catch {
    // sessionStorage 할당량 초과나 사생활 보호 모드에서는 조용히 건너뛴다.
  }
}

export function clearStudioAssistantSessionState(
  projectId: string,
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): void {
  if (!storage || !projectId) return;
  try {
    storage.removeItem(`${SESSION_KEY_PREFIX}${projectId}`);
  } catch {
    // 무시
  }
}
