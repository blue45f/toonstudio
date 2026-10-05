/**
 * 웹툰 제작 공정별 외부 도구 정리 데이터.
 *
 * `/learn/process` 가이드의 "공정마다 쓰이는 도구들" 섹션 전용 데이터다.
 * 여기에 적는 도구는 업계에서 해당 공정에 널리 쓰이는 외부 도구이며,
 * 특정 제작사가 어떤 도구를 쓰는지는 작품마다 다르다 — 페이지 문구도
 * 그 전제를 독자에게 그대로 밝히는 가이드 서술로 유지한다.
 * 분석 근거: hidden_files/competitor-analysis-2026-10-06/ cat1~cat4.
 */

export interface ProcessToolchainToolCopy {
  readonly name: string;
  readonly role: string;
}

export interface ProcessToolchainStageCopy {
  readonly title: string;
  readonly summary: string;
  readonly tools: readonly ProcessToolchainToolCopy[];
}

export interface ProcessToolchainStage {
  readonly id: string;
  readonly copy: {
    readonly ko: ProcessToolchainStageCopy;
    readonly en: ProcessToolchainStageCopy;
  };
}

export const WEBTOON_PROCESS_TOOLCHAIN: readonly ProcessToolchainStage[] = [
  {
    id: "planning",
    copy: {
      ko: {
        title: "기획·세계관",
        summary: "콘셉트와 시리즈 바이블, 캐릭터·세계관 설정을 문서와 보드로 정리하는 단계입니다.",
        tools: [
          { name: "Notion", role: "기획 문서·시리즈 바이블·설정 자료를 한곳에 모으는 문서 도구" },
          { name: "Miro", role: "캐릭터 관계도와 스토리 구조를 무한 캔버스에 그리는 화이트보드" },
          { name: "Figma (FigJam)", role: "기획 보드를 팀과 공유하고 실시간으로 피드백을 주고받는 협업 보드" },
        ],
      },
      en: {
        title: "Planning & worldbuilding",
        summary: "The stage where the concept, series bible, and character/world settings are organized into documents and boards.",
        tools: [
          { name: "Notion", role: "Document workspace for planning docs, the series bible, and reference material" },
          { name: "Miro", role: "Infinite-canvas whiteboard for character relationship maps and story structure" },
          { name: "Figma (FigJam)", role: "Collaborative board for sharing planning boards and exchanging live feedback" },
        ],
      },
    },
  },
  {
    id: "script",
    copy: {
      ko: {
        title: "스토리·글콘티",
        summary: "장면·행동·대사를 작화 가능한 대본 문서로 만드는 단계입니다.",
        tools: [
          { name: "MangaPlay Studio", role: "대사와 지문을 텍스트로 쓰면 컷 분할 레이아웃이 자동으로 배치되는 글콘티 전용 도구" },
          { name: "Google Docs", role: "대본을 함께 쓰고 댓글로 피드백을 주고받는 문서 도구" },
        ],
      },
      en: {
        title: "Story & script",
        summary: "The stage where scenes, actions, and dialogue become a script document the art team can draw from.",
        tools: [
          { name: "MangaPlay Studio", role: "Script-first editor that auto-lays-out panel breakdowns from typed dialogue and directions" },
          { name: "Google Docs", role: "Shared document editing and comment feedback for scripts" },
        ],
      },
    },
  },
  {
    id: "storyboard",
    copy: {
      ko: {
        title: "콘티·스토리보드",
        summary: "대본을 컷·카메라·스크롤 리듬으로 바꾸는 그림콘티 단계입니다.",
        tools: [
          { name: "Clip Studio Paint", role: "컷 단위 스토리 편집으로 콘티를 그리고 검수하는 표준 작화 도구" },
          { name: "Figma", role: "스토리보드를 팀과 공유하고 실시간으로 피드백을 주고받는 협업 캔버스" },
        ],
      },
      en: {
        title: "Storyboard",
        summary: "The stage where the script turns into panels, camera work, and scroll rhythm.",
        tools: [
          { name: "Clip Studio Paint", role: "Industry-standard drawing app with panel-level story editing for boards" },
          { name: "Figma", role: "Shared canvas where teams review storyboards with live feedback" },
        ],
      },
    },
  },
  {
    id: "pipeline",
    copy: {
      ko: {
        title: "공정 관리·협업",
        summary: "콘티→선화→채색→식자로 이어지는 분업의 진척과 피드백을 관리하는 단계입니다.",
        tools: [
          { name: "CRECO", role: "웹툰 분업 공정을 한 워크스페이스에서 관리하는 웹툰 전용 협업 플랫폼" },
          { name: "KAISTORY", role: "콘티 저작부터 레이어·PSD 관리, 다국어 편집, 배포까지를 하나의 데이터로 잇는 통합 플랫폼" },
          { name: "메신저·엑셀·클라우드 드라이브", role: "전용 도구가 없을 때 일정·파일·피드백이 흩어지는 기존 방식" },
        ],
      },
      en: {
        title: "Pipeline management & collaboration",
        summary: "The stage that manages progress and feedback across the divided pipeline — boards, line art, coloring, lettering.",
        tools: [
          { name: "CRECO", role: "Webtoon-only collaboration platform that runs the divided pipeline in one workspace" },
          { name: "KAISTORY", role: "Integrated platform linking storyboard authoring, layer/PSD management, multilingual editing, and distribution in one dataset" },
          { name: "Messengers, spreadsheets & cloud drives", role: "The older way: schedules, files, and feedback scattered across separate apps" },
        ],
      },
    },
  },
  {
    id: "background",
    copy: {
      ko: {
        title: "배경·3D",
        summary: "공간의 투시와 카메라 기준을 잡아 배경 작화의 토대를 만드는 단계입니다.",
        tools: [
          { name: "SketchUp", role: "3D 공간 모델링으로 배경 구도를 잡고 카메라 앵글을 뽑는 도구" },
          { name: "Blender", role: "무료 3D 모델링·렌더링 도구로 배경 모델과 소품을 만드는 도구" },
          { name: "Clip Studio Paint", role: "3D 데생 인형과 배경 소재를 컷 안에 배치해 구도를 잡는 기능" },
        ],
      },
      en: {
        title: "Backgrounds & 3D",
        summary: "The stage that sets spatial perspective and camera references as the foundation for background art.",
        tools: [
          { name: "SketchUp", role: "3D spatial modeling for background layouts and camera angles" },
          { name: "Blender", role: "Free 3D modeling and rendering for background models and props" },
          { name: "Clip Studio Paint", role: "3D drawing figures and background assets placed directly inside panels" },
        ],
      },
    },
  },
  {
    id: "line",
    copy: {
      ko: {
        title: "선화·드로잉",
        summary: "스케치에서 검수한 포즈·표정을 최종 선으로 정리하는 단계입니다.",
        tools: [
          { name: "Clip Studio Paint", role: "펜·브러시와 컷선 도구로 선화를 완성하는 프로 표준 도구" },
          { name: "Adobe Photoshop", role: "브러시와 레이어 기반으로 작화와 편집을 함께 다루는 도구" },
        ],
      },
      en: {
        title: "Line art & drawing",
        summary: "The stage where reviewed poses and expressions from the sketch become final lines.",
        tools: [
          { name: "Clip Studio Paint", role: "The professional standard for inking with pens, brushes, and frame tools" },
          { name: "Adobe Photoshop", role: "Brush- and layer-based drawing and editing" },
        ],
      },
    },
  },
  {
    id: "color",
    copy: {
      ko: {
        title: "채색·밑색",
        summary: "캐릭터 팔레트와 장면 광원을 기준으로 밑색부터 최종 채색까지 채우는 단계입니다.",
        tools: [
          { name: "Clip Studio Paint", role: "밑색 채우기와 톤·그림자 보조 기능으로 채색을 진행하는 도구" },
          { name: "Adobe Photoshop", role: "색 조정과 그라데이션으로 장면 톤을 맞추는 후반 채색 도구" },
        ],
      },
      en: {
        title: "Coloring",
        summary: "The stage that fills flats through final color, guided by character palettes and scene lighting.",
        tools: [
          { name: "Clip Studio Paint", role: "Flat fills plus tone and shading assists for coloring" },
          { name: "Adobe Photoshop", role: "Color grading and gradients for unifying scene tone" },
        ],
      },
    },
  },
  {
    id: "post",
    copy: {
      ko: {
        title: "보정·후보정",
        summary: "조명·효과와 화면 완성도를 다듬는 단계입니다.",
        tools: [
          { name: "Adobe Photoshop", role: "색보정·합성·후보정의 대표 도구" },
          { name: "Clip Studio Paint", role: "집중선·효과선과 스크린톤으로 화면 효과를 더하는 도구" },
        ],
      },
      en: {
        title: "Finishing & post",
        summary: "The stage that polishes lighting, effects, and overall frame finish.",
        tools: [
          { name: "Adobe Photoshop", role: "The go-to tool for color correction, compositing, and finishing" },
          { name: "Clip Studio Paint", role: "Focus lines, effect lines, and screentones for impact" },
        ],
      },
    },
  },
  {
    id: "lettering",
    copy: {
      ko: {
        title: "식자·편집",
        summary: "대사와 효과음을 말풍선에 넣고 독서 흐름에 맞게 배치하는 단계입니다.",
        tools: [
          { name: "Clip Studio Paint", role: "말풍선과 대사 식자를 한 도구에서 처리하는 기능" },
          { name: "Adobe Photoshop", role: "전통적으로 대사 식자와 레터링에 쓰여 온 도구" },
        ],
      },
      en: {
        title: "Lettering",
        summary: "The stage that sets dialogue and sound effects into balloons along the reading flow.",
        tools: [
          { name: "Clip Studio Paint", role: "Balloons and dialogue lettering handled in one tool" },
          { name: "Adobe Photoshop", role: "Long used for dialogue lettering and typesetting" },
        ],
      },
    },
  },
  {
    id: "ai",
    copy: {
      ko: {
        title: "AI 제작 보조",
        summary: "반복 작업과 초안 생성을 보조하는 AI 도구들이 들어오는 단계입니다.",
        tools: [
          { name: "GenToon", role: "대본을 넣으면 캐릭터 일관성을 유지하며 컷을 구성하는 AI 제작 플랫폼" },
          { name: "투닝 (Tooning)", role: "문장을 입력하면 상황에 맞는 포즈·표정·컷을 추천하는 AI 보조 도구" },
          { name: "CREAM", role: "스튜디오 고유의 화풍과 캐릭터를 학습시킨 전용 AI 파트너를 구축하는 솔루션" },
        ],
      },
      en: {
        title: "AI assistance",
        summary: "The stage where AI tools assist with repetitive work and first drafts.",
        tools: [
          { name: "GenToon", role: "AI production platform that composes panels from a script while keeping characters consistent" },
          { name: "Tooning", role: "AI assistant that suggests poses, expressions, and panels from a sentence" },
          { name: "CREAM", role: "Solution that trains a studio-private AI partner on its own style and characters" },
        ],
      },
    },
  },
  {
    id: "localization",
    copy: {
      ko: {
        title: "번역·현지화",
        summary: "해외 연재를 위해 대사를 번역하고 언어별로 다시 식자하는 단계입니다.",
        tools: [
          { name: "레터웍스 (letr.ai)", role: "이미지 속 대사를 인식·추출하고 다국어 번역·식자를 자동화하는 현지화 도구" },
          { name: "KAISTORY", role: "같은 원고 데이터에서 언어별 판본을 편집하는 다국어 편집" },
        ],
      },
      en: {
        title: "Translation & localization",
        summary: "The stage that translates dialogue and re-letters each language edition for overseas serialization.",
        tools: [
          { name: "LETR WORKS (letr.ai)", role: "Localization tool that extracts dialogue from images and automates multilingual translation and lettering" },
          { name: "KAISTORY", role: "Multilingual editions edited from the same source data" },
        ],
      },
    },
  },
  {
    id: "distribution",
    copy: {
      ko: {
        title: "연재·배포",
        summary: "완성 회차를 플랫폼 규격에 맞춰 납품하고 공개를 관리하는 단계입니다.",
        tools: [
          { name: "KAISTORY", role: "제작 데이터에서 배포까지 이어지는 통합 플랫폼의 배포 흐름" },
          { name: "연재 플랫폼 업로드 시스템", role: "회차 업로드·예약 공개·연재 현황을 관리하는 플랫폼 제공 시스템" },
        ],
      },
      en: {
        title: "Serialization & distribution",
        summary: "The stage that packages finished episodes to platform specs and manages release.",
        tools: [
          { name: "KAISTORY", role: "Distribution flow of the integrated platform, from production data to release" },
          { name: "Platform upload systems", role: "Publisher-provided systems for episode upload, scheduled release, and serialization status" },
        ],
      },
    },
  },
  {
    id: "promotion",
    copy: {
      ko: {
        title: "홍보·마케팅",
        summary: "연재 소식을 알리고 독자 반응을 다음 회차에 잇는 단계입니다.",
        tools: [
          { name: "SNS·숏폼 채널", role: "인스타그램·유튜브 쇼츠 등으로 대표 컷과 연재 소식을 전하는 채널" },
        ],
      },
      en: {
        title: "Promotion & marketing",
        summary: "The stage that spreads release news and carries reader response into the next episode.",
        tools: [
          { name: "Social & short-form channels", role: "Instagram, YouTube Shorts, and similar channels for key panels and release news" },
        ],
      },
    },
  },
] as const;
