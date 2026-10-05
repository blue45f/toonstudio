/**
 * 웹툰 제작 공정별 도구 정리 데이터 — 외부 도구 + 툰스튜디오 내장 기능 전수 카탈로그.
 *
 * `/learn/process` 가이드의 "공정별로 쓰이는 도구들" 섹션 전용 데이터다.
 * 수록 원칙:
 * - 외부 도구는 업계에서 해당 공정에 쓰이는 도구이며, 특정 제작사가 어떤 도구를
 *   쓰는지는 작품마다 다르다 — 페이지 문구도 그 전제를 밝히는 가이드 서술로 유지한다.
 * - 과금 형태(pricing)는 공식 출처로 확인된 경우에만 적는다. 확인이 안 되면 비운다.
 * - 내장 기능(kind: "builtin")은 코드 실측으로 존재가 확인된 것만 적고, 독립
 *   화면이 있는 기능만 href를 단다. 에디터 안 패널 기능은 역할에 그 사실을 밝힌다.
 * 근거: hidden_files/competitor-analysis-2026-10-06/ cat1~cat6·synthesis,
 * ai-assist-benchmark-2026-09-30, 벤치마크 문서군, 2026-10-06 웹 확인, 2026-10-06 코드 실측.
 */

export type ProcessToolKind = "external" | "builtin";

/** 무료 / 부분 무료(프리미엄) / 유료 / 구독 — 확인된 경우에만 표기한다. */
export type ProcessToolPricing = "free" | "freemium" | "paid" | "subscription";

export interface ProcessToolchainTool {
  /** 도구 고유명은 번역하지 않지만, 내장 기능은 UI 표시명이라 한/영이 다를 수 있다. */
  readonly name: { readonly ko: string; readonly en: string };
  readonly role: { readonly ko: string; readonly en: string };
  readonly kind: ProcessToolKind;
  readonly pricing?: ProcessToolPricing;
  /** 내장 기능 전용. 실재가 확인된 내부 라우트만 적는다. */
  readonly href?: string;
}

export interface ProcessToolchainStage {
  readonly id: string;
  readonly title: { readonly ko: string; readonly en: string };
  readonly summary: { readonly ko: string; readonly en: string };
  readonly tools: readonly ProcessToolchainTool[];
}

export const WEBTOON_PROCESS_TOOLCHAIN: readonly ProcessToolchainStage[] = [
  {
    id: "planning",
    title: { ko: "기획·세계관", en: "Planning & worldbuilding" },
    summary: {
      ko: "콘셉트와 시리즈 바이블, 캐릭터·세계관 설정을 문서와 보드로 정리하는 단계입니다.",
      en: "The stage where the concept, series bible, and character/world settings are organized into documents and boards.",
    },
    tools: [
      {
        name: { ko: "Notion", en: "Notion" },
        role: {
          ko: "기획 문서·시리즈 바이블·설정 자료를 한곳에 모으는 문서 도구",
          en: "Document workspace for planning docs, the series bible, and reference material",
        },
        kind: "external",
      },
      {
        name: { ko: "Miro", en: "Miro" },
        role: {
          ko: "캐릭터 관계도와 스토리 구조를 무한 캔버스에 그리는 화이트보드",
          en: "Infinite-canvas whiteboard for character relationship maps and story structure",
        },
        kind: "external",
      },
      {
        name: { ko: "FigJam", en: "FigJam" },
        role: {
          ko: "스티키·도형·투표로 아이디어를 모으는 Figma의 협업 화이트보드",
          en: "Figma's collaborative whiteboard with stickies, shapes, and voting sessions",
        },
        kind: "external",
      },
      {
        name: { ko: "투툰-패불레이터", en: "TooToon Fabulator" },
        role: {
          ko: "세계관·시나리오·캐릭터를 완결형 기획서로 뽑는 투툰의 스토리 기획 도구",
          en: "TooToon's story planning tool that drafts world, scenario, and characters into a complete planning document",
        },
        kind: "external",
      },
      {
        name: { ko: "World Maker (슈에이샤)", en: "World Maker (Shueisha)" },
        role: {
          ko: "기획 단계에서 콘티(썸네일 레이아웃)를 시각화하는 슈에이샤의 제작 앱",
          en: "Shueisha's app for visualizing thumbnail layouts at the planning stage",
        },
        kind: "external",
      },
      {
        name: { ko: "세계관 랩", en: "Storyworld Lab" },
        role: {
          ko: "세계관의 인과를 분석하고 설정 이슈를 찾아내는 전용 랩",
          en: "Dedicated lab that analyzes world causality and flags setting issues",
        },
        kind: "builtin",
        href: "/studio/storyworld",
      },
      {
        name: { ko: "스토리 랩", en: "StoryLab" },
        role: {
          ko: "작품 기획서를 작성하고 내보내는 기획 도구",
          en: "Planning tool for writing and exporting the title's story planning document",
        },
        kind: "builtin",
        href: "/story-lab",
      },
      {
        name: { ko: "캐릭터 캐논", en: "Character Canon" },
        role: {
          ko: "캐릭터 설정 시트를 프롬프트 블록으로 재사용해 일관성을 지키는 관리 (에디터 안)",
          en: "Character canon sheets reused as prompt blocks to keep consistency (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "캐릭터 바이블", en: "Character Bible" },
        role: {
          ko: "캐릭터 설정을 모아 두는 설정집 패널 (에디터 안)",
          en: "Character bible panel collecting character settings (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "제작 바이블", en: "Production Bible" },
        role: {
          ko: "작품의 제작 기준과 약속-회수 관계를 관리하는 워크스페이스 (에디터 안)",
          en: "Workspace for production standards and promise-payoff tracking (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "소재 탐색 허브", en: "Material Research Hub" },
        role: {
          ko: "오픈 API 소재를 작품 참고자료로 탐색하는 허브",
          en: "Hub for browsing open API materials as production references",
        },
        kind: "builtin",
        href: "/research",
      },
      {
        name: { ko: "템플릿", en: "Templates" },
        role: {
          ko: "작품 템플릿을 골라 새 프로젝트를 시작하는 자리",
          en: "Pick a title template to start a new project",
        },
        kind: "builtin",
        href: "/studio/templates",
      },
    ],
  },
  {
    id: "script",
    title: { ko: "스토리·글콘티", en: "Story & script" },
    summary: {
      ko: "장면·행동·대사를 작화 가능한 대본 문서로 만드는 단계입니다.",
      en: "The stage where scenes, actions, and dialogue become a script document the art team can draw from.",
    },
    tools: [
      {
        name: { ko: "MangaPlay Studio", en: "MangaPlay Studio" },
        role: {
          ko: "대사와 지문을 텍스트로 쓰면 컷 분할 레이아웃이 자동으로 배치되는 글콘티 전용 도구",
          en: "Script-first editor that auto-lays-out panel breakdowns from typed dialogue and directions",
        },
        kind: "external",
      },
      {
        name: { ko: "Google Docs", en: "Google Docs" },
        role: {
          ko: "대본을 함께 쓰고 댓글로 피드백을 주고받는 문서 도구",
          en: "Shared document editing and comment feedback for scripts",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 플러스 스토리즈", en: "Tooning Plus Stories" },
        role: {
          ko: "장르·키워드를 넣으면 줄거리와 시나리오를 자동으로 만드는 투닝 플러스의 AI 스토리 도구",
          en: "Tooning Plus's AI story tool that generates plots and scenarios from a genre and keywords",
        },
        kind: "external",
      },
      {
        name: { ko: "작가의 방", en: "Writer Room" },
        role: {
          ko: "전제·시놉시스·비트·장면·컷·대사를 단계별 문서로 쓰는 공간 (에디터 안)",
          en: "Step-by-step writing space for premise, synopsis, beats, scenes, panels, and dialogue (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "소설→웹툰 변환", en: "Novel-to-Webtoon Adaptation" },
        role: {
          ko: "웹소설 원고를 장면·비트·예상 컷수로 바꿔 작가룸으로 넘기는 각색 패널 (에디터 안)",
          en: "Adaptation panel that turns a web-novel manuscript into scenes, beats, and panel estimates (inside the editor)",
        },
        kind: "builtin",
      },
    ],
  },
  {
    id: "storyboard",
    title: { ko: "콘티·스토리보드", en: "Storyboard" },
    summary: {
      ko: "대본을 컷·카메라·스크롤 리듬으로 바꾸는 그림콘티 단계입니다.",
      en: "The stage where the script turns into panels, camera work, and scroll rhythm.",
    },
    tools: [
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "컷 단위 스토리 편집으로 콘티를 그리고 검수하는 표준 작화 도구",
          en: "Industry-standard drawing app with panel-level story editing for boards",
        },
        kind: "external",
      },
      {
        name: { ko: "Figma", en: "Figma" },
        role: {
          ko: "스토리보드를 팀과 공유하고 실시간으로 피드백을 주고받는 협업 캔버스",
          en: "Shared canvas where teams review storyboards with live feedback",
        },
        kind: "external",
      },
      {
        name: { ko: "Storyboarder", en: "Storyboarder" },
        role: {
          ko: "샷 단위로 빠르게 콘티를 그리는 무료 오픈소스 스토리보드 도구",
          en: "Free open-source storyboarding tool for drawing boards shot by shot",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Toon Boom Storyboard Pro", en: "Toon Boom Storyboard Pro" },
        role: {
          ko: "스케치·카메라·애니매틱을 잇는 전문 스토리보드 제작 도구",
          en: "Professional storyboard tool linking drawing, camera moves, and animatics",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "World Maker (슈에이샤)", en: "World Maker (Shueisha)" },
        role: {
          ko: "스토리보드 레이아웃을 만드는 슈에이샤의 콘티 제작 앱",
          en: "Shueisha's storyboard layout app",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 플러스 3D 스튜디오", en: "Tooning Plus 3D Studio" },
        role: {
          ko: "3D 모델로 포즈·카메라 구도를 잡아 콘티의 기준으로 삼는 투닝 플러스의 3D 연출 도구",
          en: "Tooning Plus's 3D staging tool that sets poses and camera angles with 3D models as a board reference",
        },
        kind: "external",
      },
      {
        name: { ko: "ComicAI", en: "ComicAI" },
        role: {
          ko: "스토리를 넣으면 패널을 자동으로 구성하는 Story Mode",
          en: "Story Mode that composes panels automatically from a story",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "스토리보드 그리드", en: "Storyboard Grid" },
        role: {
          ko: "전 페이지를 시퀀스로 펼쳐 검토 상태와 제작 준비도를 보는 보드 (에디터 안)",
          en: "Board viewing all pages as a sequence with review status and readiness (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "AI 코믹 디렉터", en: "AI Comic Director" },
        role: {
          ko: "시나리오 비트를 장면 후보 이미지로 만들어 검토·적용하는 AI 연출",
          en: "AI directing that turns scenario beats into scene candidates to review and apply",
        },
        kind: "builtin",
      },
    ],
  },
  {
    id: "pipeline",
    title: { ko: "공정 관리·협업", en: "Pipeline management & collaboration" },
    summary: {
      ko: "콘티→선화→채색→식자로 이어지는 분업의 진척과 피드백을 관리하는 단계입니다.",
      en: "The stage that manages progress and feedback across the divided pipeline — boards, line art, coloring, lettering.",
    },
    tools: [
      {
        name: { ko: "CRECO", en: "CRECO" },
        role: {
          ko: "웹툰 분업 공정을 한 워크스페이스에서 관리하는 웹툰 전용 협업 플랫폼",
          en: "Webtoon-only collaboration platform that runs the divided pipeline in one workspace",
        },
        kind: "external",
      },
      {
        name: { ko: "KAISTORY", en: "KAISTORY" },
        role: {
          ko: "콘티 저작부터 레이어·PSD 관리, 다국어 편집, 배포까지를 하나의 데이터로 잇는 통합 플랫폼",
          en: "Integrated platform linking storyboard authoring, layer/PSD management, multilingual editing, and distribution in one dataset",
        },
        kind: "external",
      },
      {
        name: { ko: "Jira", en: "Jira" },
        role: {
          ko: "이슈 트래킹과 칸반·스프린트 보드로 제작 일정을 관리하는 협업 도구",
          en: "Issue tracking with kanban and sprint boards for production schedules",
        },
        kind: "external",
      },
      {
        name: { ko: "Asana", en: "Asana" },
        role: {
          ko: "보드·타임라인·캘린더 뷰로 팀 작업을 관리하는 프로젝트 도구",
          en: "Project management with board, timeline, and calendar views",
        },
        kind: "external",
      },
      {
        name: { ko: "Linear", en: "Linear" },
        role: {
          ko: "키보드 중심의 빠른 이슈 관리로 제작 파이프라인을 운영하는 도구",
          en: "Keyboard-first issue tracking for fast-moving teams",
        },
        kind: "external",
      },
      {
        name: { ko: "monday.com", en: "monday.com" },
        role: {
          ko: "칸반·간트 등 다양한 뷰로 업무 현황을 보는 워크 플랫폼",
          en: "Work platform with kanban, Gantt, and workload views",
        },
        kind: "external",
      },
      {
        name: { ko: "ClickUp", en: "ClickUp" },
        role: {
          ko: "보드·테이블·간트를 한곳에 모은 올인원 작업 관리 도구",
          en: "All-in-one work management with boards, tables, and Gantt charts",
        },
        kind: "external",
      },
      {
        name: { ko: "Trello", en: "Trello" },
        role: {
          ko: "카드와 리스트 드래그로 진행 상황을 옮기는 간편한 칸반 보드",
          en: "Simple kanban boards of draggable cards and lists",
        },
        kind: "external",
      },
      {
        name: { ko: "Slack", en: "Slack" },
        role: {
          ko: "팀 대화와 제작 알림 연동을 맡는 업무 메신저",
          en: "Team messaging with alert integrations for production updates",
        },
        kind: "external",
      },
      {
        name: { ko: "Gather Town", en: "Gather Town" },
        role: {
          ko: "아바타로 모여 대화하는 2D 가상 사무실형 협업 공간",
          en: "2D virtual office where avatars gather and talk by proximity",
        },
        kind: "external",
      },
      {
        name: { ko: "oVice", en: "oVice" },
        role: {
          ko: "가상 오피스에서 회의와 상주 협업을 하는 공간형 플랫폼",
          en: "Virtual office platform for meetings and always-on collaboration",
        },
        kind: "external",
      },
      {
        name: { ko: "ZEP", en: "ZEP" },
        role: {
          ko: "맵을 꾸며 팀이 모이는 한국형 메타버스 협업 공간",
          en: "Korean metaverse workspace with customizable maps for teams",
        },
        kind: "external",
      },
      {
        name: { ko: "메신저·엑셀·클라우드 드라이브", en: "Messengers, spreadsheets & cloud drives" },
        role: {
          ko: "전용 도구가 없을 때 일정·파일·피드백이 흩어지는 기존 방식",
          en: "The older way: schedules, files, and feedback scattered across separate apps",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 플러스 에디터", en: "Tooning Plus Editor" },
        role: {
          ko: "PD와 작가가 실시간으로 함께 편집하는 투닝 플러스의 협업 에디터 (말풍선·효과 배치 포함)",
          en: "Tooning Plus's collaborative editor where PDs and artists edit together in real time, including balloons and effects",
        },
        kind: "external",
      },
      {
        name: { ko: "제작 허브", en: "Production Hub" },
        role: {
          ko: "프로젝트·회차·공정·검수·일정을 한곳에서 관리하는 제작 본진",
          en: "Production headquarters managing projects, episodes, processes, reviews, and schedules",
        },
        kind: "builtin",
        href: "/production",
      },
      {
        name: { ko: "공정별 칸반", en: "Process Kanban Board" },
        role: {
          ko: "콘티·선화·배경·채색·식자·검수 공정을 열로 둔 작업 카드 보드 (제작 허브 안)",
          en: "Work card board with boards, line art, backgrounds, coloring, lettering, and review columns (inside the Production Hub)",
        },
        kind: "builtin",
        href: "/production",
      },
      {
        name: { ko: "원클릭 버전 스냅샷", en: "One-Click Version Snapshot" },
        role: {
          ko: "현재 작업본을 스냅샷으로 저장하고 공유 링크를 발급하는 기능 (제작 허브 안)",
          en: "Saves the current draft as a version snapshot with a share link (inside the Production Hub)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "활동 로그", en: "Activity Log" },
        role: {
          ko: "프로젝트의 제작 활동 기록을 모아 보는 워크스페이스 (제작 허브 안)",
          en: "Workspace collecting the project's production activity records (inside the Production Hub)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "팀 워크스페이스", en: "Team Workspaces" },
        role: {
          ko: "팀 공간과 멤버·권한을 관리하는 자리",
          en: "Manages team spaces, members, and permissions",
        },
        kind: "builtin",
        href: "/production/workspaces",
      },
      {
        name: { ko: "가상 스튜디오", en: "Virtual Studio" },
        role: {
          ko: "아바타로 모여 함께 작업하는 프로젝트 가상 공간",
          en: "Virtual project space where avatars gather and work together",
        },
        kind: "builtin",
        href: "/studio/space",
      },
      {
        name: { ko: "협업 보드", en: "Collaboration Board" },
        role: {
          ko: "협업자를 구하고 의뢰를 올리는 구인 게시판",
          en: "Recruiting board for finding collaborators and posting commissions",
        },
        kind: "builtin",
        href: "/collaborate",
      },
      {
        name: { ko: "에셋 허브", en: "Asset Hub" },
        role: {
          ko: "작품의 브러시·캐릭터·3D 에셋을 모아 둔 라이브러리",
          en: "Library hub for the title's brushes, characters, and 3D assets",
        },
        kind: "builtin",
        href: "/studio/assets",
      },
    ],
  },
  {
    id: "background",
    title: { ko: "배경·3D", en: "Backgrounds & 3D" },
    summary: {
      ko: "공간의 투시와 카메라 기준을 잡아 배경 작화의 토대를 만드는 단계입니다.",
      en: "The stage that sets spatial perspective and camera references as the foundation for background art.",
    },
    tools: [
      {
        name: { ko: "SketchUp", en: "SketchUp" },
        role: {
          ko: "3D 공간 모델링으로 배경 구도를 잡고 카메라 앵글을 뽑는 도구",
          en: "3D spatial modeling for background layouts and camera angles",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Blender", en: "Blender" },
        role: {
          ko: "무료 3D 모델링·렌더링 도구로 배경 모델과 소품을 만드는 도구",
          en: "Free 3D modeling and rendering for background models and props",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "3D 데생 인형과 배경 소재를 컷 안에 배치해 구도를 잡는 기능",
          en: "3D drawing figures and background assets placed directly inside panels",
        },
        kind: "external",
      },
      {
        name: { ko: "CLIP STUDIO ASSETS", en: "CLIP STUDIO ASSETS" },
        role: {
          ko: "브러시·3D·배경 소재를 사고파는 Clip Studio 공식 소재 스토어",
          en: "Official Clip Studio marketplace for brushes, 3D, and background assets",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "3D Warehouse", en: "3D Warehouse" },
        role: {
          ko: "사용자들이 올린 3D 모델을 SketchUp 안에서 바로 불러오는 라이브러리",
          en: "Library of user-shared 3D models loaded directly inside SketchUp",
        },
        kind: "external",
      },
      {
        name: { ko: "에이콘3D (ACON3D)", en: "ACON3D" },
        role: {
          ko: "웹툰 배경용 3D 모델을 사고파는 국내 소재 마켓플레이스",
          en: "Korean marketplace for 3D background models used in webtoons",
        },
        kind: "external",
      },
      {
        name: { ko: "APOC 에셋", en: "APOC Asset" },
        role: {
          ko: "각도를 바꿔 쓸 수 있는 3D와 바로 쓰는 2D 소재를 사고파는 에셋 스토어",
          en: "Asset store for ready-to-use 2D assets and angle-adjustable 3D assets",
        },
        kind: "external",
      },
      {
        name: { ko: "에이블러 (ABLUR)", en: "ABLUR (Abler)" },
        role: {
          ko: "3D 장면을 배치·조명하고 선을 추출해 웹툰 배경으로 뽑는 배경 전용 스튜디오",
          en: "Background-only studio that stages, lights, and extracts lines from 3D scenes",
        },
        kind: "external",
      },
      {
        name: { ko: "DesignDoll", en: "DesignDoll" },
        role: {
          ko: "체형과 포즈를 자유롭게 바꾸는 3D 데생 인형",
          en: "3D drawing figure with freely adjustable body types and poses",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "JustSketchMe", en: "JustSketchMe" },
        role: {
          ko: "웹에서 바로 포즈를 잡는 3D 캐릭터 포징·레퍼런스 도구",
          en: "Web-based 3D character posing and drawing reference tool",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Magic Poser", en: "Magic Poser" },
        role: {
          ko: "포즈 프리셋과 스튜디오 조명을 갖춘 3D 인체 포징 앱",
          en: "3D figure posing app with pose presets and studio lighting",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Easy Pose", en: "Easy Pose" },
        role: {
          ko: "만화풍 체형을 포함한 3D 포즈 제작 앱",
          en: "3D pose-making app including comic-style body types",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "POSEMANIACS", en: "POSEMANIACS" },
        role: {
          ko: "360도로 돌려 보는 무료 3D 포즈 레퍼런스 사이트",
          en: "Free 3D pose reference site with 360-degree rotation",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Shaper (네이버웹툰)", en: "Shaper (WEBTOON)" },
        role: {
          ko: "스케치를 3D 캐릭터 모델로 바꿔 포즈를 자유롭게 잡는 네이버웹툰의 AI 도구",
          en: "WEBTOON's AI tool that turns sketches into posable 3D character models",
        },
        kind: "external",
      },
      {
        name: { ko: "Constella (네이버웹툰)", en: "Constella (WEBTOON)" },
        role: {
          ko: "3D 모델의 포즈를 작가 그림체의 2D로 바꿔 주는 네이버웹툰의 AI 도구",
          en: "WEBTOON's AI tool that converts 3D model poses into the artist's 2D style",
        },
        kind: "external",
      },
      {
        name: { ko: "PIXEL (픽셀)", en: "PIXEL" },
        role: {
          ko: "웹툰 소재를 사고파는 마켓으로 공동구매 할인도 여는 국내 소재 스토어",
          en: "Korean material store for buying and selling webtoon assets, with group-buy discounts",
        },
        kind: "external",
      },
      {
        name: { ko: "크티 (CTEE)", en: "CTEE" },
        role: {
          ko: "공동구매(크라우드펀딩) 방식을 내세운 웹툰 소재 마켓",
          en: "Webtoon material market built around group buying (crowdfunding)",
        },
        kind: "external",
      },
      {
        name: { ko: "캐릭터 셰이퍼", en: "Character Shaper" },
        role: {
          ko: "3D 캐릭터의 체형과 포즈를 빚는 셰이퍼",
          en: "Shaper for sculpting 3D character bodies and poses",
        },
        kind: "builtin",
        href: "/studio/assets/characters/new",
      },
      {
        name: { ko: "배경 3D 스튜디오", en: "Background 3D Studio" },
        role: {
          ko: "3D 배경 씬을 편집하고 조명·분위기를 잡는 워크스페이스",
          en: "Workspace for editing 3D background scenes, lighting, and mood",
        },
        kind: "builtin",
        href: "/studio/bg3d",
      },
      {
        name: { ko: "포즈 스튜디오", en: "Pose Studio" },
        role: {
          ko: "데생 인형으로 포즈를 잡고 프리셋을 쓰는 포저",
          en: "Poser for setting poses on a drawing figure with presets",
        },
        kind: "builtin",
        href: "/studio/poser",
      },
      {
        name: { ko: "2D→3D 리프트", en: "Lift3D" },
        role: {
          ko: "2D 이미지를 깊이와 메시로 들어올려 3D로 바꾸는 작업대",
          en: "Turns 2D images into 3D meshes with depth",
        },
        kind: "builtin",
        href: "/studio/lift3d",
      },
      {
        name: { ko: "캐릭터 변환", en: "Character Conversion" },
        role: {
          ko: "캐릭터를 다른 형태로 바꾸는 변환 전용 화면",
          en: "Dedicated screen for converting characters",
        },
        kind: "builtin",
        href: "/studio/character-convert",
      },
      {
        name: { ko: "공간 제작", en: "Immersive Creation" },
        role: {
          ko: "몰입형 3D 공간을 만드는 제작 허브",
          en: "Creation hub for immersive 3D spaces",
        },
        kind: "builtin",
        href: "/studio/immersive",
      },
      {
        name: { ko: "3D·질감 소재 탐색", en: "3D & Texture Materials" },
        role: {
          ko: "Poly Haven·AmbientCG 같은 3D 에셋과 질감 소재 탐색",
          en: "Browse 3D assets and texture materials from sources like Poly Haven and AmbientCG",
        },
        kind: "builtin",
        href: "/research/3d-assets",
      },
      {
        name: { ko: "마켓", en: "Market" },
        role: {
          ko: "제작 소재와 에셋을 탐색·거래하는 마켓",
          en: "Marketplace for browsing and trading production assets",
        },
        kind: "builtin",
        href: "/market",
      },
    ],
  },
  {
    id: "line",
    title: { ko: "선화·드로잉", en: "Line art & drawing" },
    summary: {
      ko: "스케치에서 검수한 포즈·표정을 최종 선으로 정리하는 단계입니다.",
      en: "The stage where reviewed poses and expressions from the sketch become final lines.",
    },
    tools: [
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "펜·브러시와 컷선 도구로 선화를 완성하는 프로 표준 도구",
          en: "The professional standard for inking with pens, brushes, and frame tools",
        },
        kind: "external",
      },
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "브러시와 레이어 기반으로 작화와 편집을 함께 다루는 도구",
          en: "Brush- and layer-based drawing and editing",
        },
        kind: "external",
      },
      {
        name: { ko: "Procreate", en: "Procreate" },
        role: {
          ko: "iPad 전용으로 빠른 브러시 반응과 직관적인 제스처가 강점인 드로잉 앱",
          en: "iPad-only drawing app known for responsive brushes and gestures",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "ibis Paint", en: "ibis Paint" },
        role: {
          ko: "모바일 중심의 만화·일러스트 드로잉 앱으로 소재와 스크린톤을 제공",
          en: "Mobile-first manga and illustration app with materials and screentones",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "MediBang Paint", en: "MediBang Paint" },
        role: {
          ko: "만화 원고 프리셋과 클라우드 동기화를 갖춘 무료로 시작하는 페인팅 앱",
          en: "Painting app with manga presets and cloud sync, free to start",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Krita", en: "Krita" },
        role: {
          ko: "무료 오픈소스 디지털 페인팅 프로그램",
          en: "Free and open-source digital painting program",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "PaintTool SAI", en: "PaintTool SAI" },
        role: {
          ko: "가볍고 선이 매끄러워 선화에 강점이 있는 페인팅 소프트웨어",
          en: "Lightweight painting software prized for smooth line art",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "PureRef", en: "PureRef" },
        role: {
          ko: "참고 이미지를 한 화면에 모아 띄워 두는 레퍼런스 뷰어",
          en: "Reference viewer that keeps inspiration images floating in one board",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "에이블러 (ABLUR)", en: "ABLUR (Abler)" },
        role: {
          ko: "3D 모델에서 선화(Line Art)를 추출하는 기능",
          en: "Extracts line art from 3D models",
        },
        kind: "external",
      },
      {
        name: { ko: "FireAlpaca", en: "FireAlpaca" },
        role: {
          ko: "패널 템플릿과 스냅 룰러를 갖춘 무료 만화 페인팅 도구",
          en: "Free comic painting tool with panel templates and snap rulers",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "그림나비", en: "그림나비" },
        role: {
          ko: "스케치·선화 단계만 따로 맡는 모듈형 제작 서비스",
          en: "Modular production service covering just the sketch and line art stages",
        },
        kind: "external",
      },
      {
        name: { ko: "컷툰 에디터", en: "Cuttoon Editor" },
        role: {
          ko: "컷·페이지·애니메이션을 편집하는 실제 작화 편집기 본체 (실시간 공동 편집 포함)",
          en: "The main drawing editor for panels, pages, and animation, with real-time co-editing",
        },
        kind: "builtin",
        href: "/studio/canvas",
      },
      {
        name: { ko: "사진에서 선 추출", en: "On-Device Line Extraction" },
        role: {
          ko: "참조 사진을 밑그림용 흑백 선화로 바꾸는 기기 내 ONNX 기능 (에디터 안)",
          en: "On-device ONNX feature turning reference photos into line art (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "브러시 랩", en: "Brush Lab" },
        role: {
          ko: "브러시를 만들고 설정을 실험하는 실험실",
          en: "Lab for creating brushes and testing their settings",
        },
        kind: "builtin",
        href: "/studio/assets/brushes/new",
      },
    ],
  },
  {
    id: "color",
    title: { ko: "채색·밑색", en: "Coloring" },
    summary: {
      ko: "캐릭터 팔레트와 장면 광원을 기준으로 밑색부터 최종 채색까지 채우는 단계입니다.",
      en: "The stage that fills flats through final color, guided by character palettes and scene lighting.",
    },
    tools: [
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "밑색 채우기와 톤·그림자 보조 기능으로 채색을 진행하는 도구",
          en: "Flat fills plus tone and shading assists for coloring",
        },
        kind: "external",
      },
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "색 조정과 그라데이션으로 장면 톤을 맞추는 후반 채색 도구",
          en: "Color grading and gradients for unifying scene tone",
        },
        kind: "external",
      },
      {
        name: { ko: "Procreate", en: "Procreate" },
        role: {
          ko: "ColorDrop 채우기와 색 조화 도구로 채색을 돕는 iPad 드로잉 앱",
          en: "iPad drawing app with ColorDrop fills and color harmony tools",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "ibis Paint", en: "ibis Paint" },
        role: {
          ko: "브러시와 소재가 풍부한 모바일 채색 앱",
          en: "Mobile coloring app with a large brush and material library",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "MediBang Paint", en: "MediBang Paint" },
        role: {
          ko: "톤과 채우기 도구로 만화 채색을 진행하는 페인팅 앱",
          en: "Painting app with tones and fill tools for comic coloring",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Krita", en: "Krita" },
        role: {
          ko: "채색 마스크와 브러시 엔진이 강한 무료 페인팅 프로그램",
          en: "Free painting program with colorize masks and a deep brush engine",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "PaintTool SAI", en: "PaintTool SAI" },
        role: {
          ko: "색 번짐과 혼합이 자연스러운 채색용 페인팅 소프트웨어",
          en: "Painting software with natural color blending for coloring",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "Coolors", en: "Coolors" },
        role: {
          ko: "색상 팔레트를 빠르게 만들고 탐색하는 도구",
          en: "Fast color palette generator and explorer",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "AI Painter (네이버웹툰)", en: "AI Painter (WEBTOON)" },
        role: {
          ko: "선화에 색을 자동으로 입혀 주는 네이버웹툰의 자동 채색 도구",
          en: "WEBTOON's automatic coloring tool that paints color onto line art",
        },
        kind: "external",
      },
      {
        name: { ko: "style2paints", en: "style2paints" },
        role: {
          ko: "힌트 색을 찍으면 채색하고 레이어가 나뉜 PSD로 내보내는 오픈소스 자동 채색 도구",
          en: "Open-source auto-coloring tool that paints from color hints and exports layered PSDs",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Petalica Paint", en: "Petalica Paint" },
        role: {
          ko: "브라우저에서 선화를 자동으로 채색하는 도구",
          en: "Browser tool that auto-colors line art",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "그림나비", en: "그림나비" },
        role: {
          ko: "채색·효과 단계를 따로 맡는 모듈형 제작 서비스",
          en: "Modular production service covering the coloring and effects stages",
        },
        kind: "external",
      },
      {
        name: { ko: "기기에서 채색", en: "On-Device Colorize" },
        role: {
          ko: "서버 없이 이 기기에서 바로 자동 채색하는 ONNX 기능 (에디터 안, 오프라인 가능)",
          en: "ONNX auto-coloring that runs on this device, even offline (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "AI 채색 패널", en: "AI Colorize Panel" },
        role: {
          ko: "내 API 키로 서버 AI 채색을 쓰는 대체 경로 (에디터 안)",
          en: "Server AI coloring using your own API key (inside the editor)",
        },
        kind: "builtin",
      },
    ],
  },
  {
    id: "post",
    title: { ko: "보정·후보정", en: "Finishing & post" },
    summary: {
      ko: "조명·효과와 화면 완성도를 다듬는 단계입니다.",
      en: "The stage that polishes lighting, effects, and overall frame finish.",
    },
    tools: [
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "색보정·합성·후보정의 대표 도구",
          en: "The go-to tool for color correction, compositing, and finishing",
        },
        kind: "external",
      },
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "집중선·효과선과 스크린톤으로 화면 효과를 더하는 도구",
          en: "Focus lines, effect lines, and screentones for impact",
        },
        kind: "external",
      },
      {
        name: { ko: "Topaz", en: "Topaz" },
        role: {
          ko: "AI 업스케일로 이미지 해상도를 높이는 화질 개선 도구",
          en: "AI upscaling tool that raises image resolution and quality",
        },
        kind: "external",
      },
      {
        name: { ko: "그림나비", en: "그림나비" },
        role: {
          ko: "효과·후처리 단계를 따로 맡는 모듈형 제작 서비스",
          en: "Modular production service covering the effects and finishing stages",
        },
        kind: "external",
      },
      {
        name: { ko: "AI 업스케일", en: "On-Device AI Upscale" },
        role: {
          ko: "선택 이미지를 기기에서 4배로 확대하는 ONNX 기능 (에디터 안)",
          en: "On-device ONNX upscaling that enlarges images 4x (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "빠른 배경 제거", en: "Quick Background Removal" },
        role: {
          ko: "인물과 사물의 배경을 기기에서 지우는 ONNX 기능 (에디터 안)",
          en: "On-device ONNX background removal for people and objects (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "오디오 에셋", en: "Audio Assets" },
        role: {
          ko: "BGM과 오디오 에셋을 관리하는 라이브러리",
          en: "Library for managing BGM and audio assets",
        },
        kind: "builtin",
        href: "/studio/assets/audio",
      },
    ],
  },
  {
    id: "lettering",
    title: { ko: "식자·편집", en: "Lettering" },
    summary: {
      ko: "대사와 효과음을 말풍선에 넣고 독서 흐름에 맞게 배치하는 단계입니다.",
      en: "The stage that sets dialogue and sound effects into balloons along the reading flow.",
    },
    tools: [
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "말풍선과 대사 식자를 한 도구에서 처리하는 기능",
          en: "Balloons and dialogue lettering handled in one tool",
        },
        kind: "external",
      },
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "전통적으로 대사 식자와 레터링에 쓰여 온 도구",
          en: "Long used for dialogue lettering and typesetting",
        },
        kind: "external",
      },
      {
        name: { ko: "Google Fonts", en: "Google Fonts" },
        role: {
          ko: "무료 오픈소스 폰트를 받아 쓸 수 있는 폰트 라이브러리",
          en: "Library of free open-source fonts for lettering",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "산돌구름", en: "Sandoll Cloud" },
        role: {
          ko: "폰트 구독과 AI 폰트 찾기·추천을 제공하는 산돌의 폰트 플랫폼",
          en: "Sandoll's font platform with font subscriptions and AI font matching and recommendations",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "툰잉 AI Losy", en: "툰잉 AI Losy" },
        role: {
          ko: "번역과 함께 식자까지 자동으로 배치하는 현지화 서비스",
          en: "Localization service that also auto-places lettering together with translation",
        },
        kind: "external",
      },
      {
        name: { ko: "말풍선·식자 도구", en: "Balloon & Lettering Tools" },
        role: {
          ko: "말풍선 모양·꼬리와 효과음 식자, 사용자 폰트를 다루는 도구군 (에디터 안)",
          en: "Balloon shapes, tails, SFX lettering, and custom fonts (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "대사 일괄 관리", en: "Dialogue Batch Manager" },
        role: {
          ko: "문서 전체 대사를 목록으로 모아 한 번에 편집하는 패널 (에디터 안)",
          en: "Panel listing every line in a document for batch editing (inside the editor)",
        },
        kind: "builtin",
      },
    ],
  },
  {
    id: "ai",
    title: { ko: "AI 제작 보조", en: "AI assistance" },
    summary: {
      ko: "반복 작업과 초안 생성을 보조하는 AI 도구들이 들어오는 단계입니다.",
      en: "The stage where AI tools assist with repetitive work and first drafts.",
    },
    tools: [
      {
        name: { ko: "GenToon", en: "GenToon" },
        role: {
          ko: "대본을 넣으면 캐릭터 일관성을 유지하며 컷을 구성하는 AI 제작 플랫폼",
          en: "AI production platform that composes panels from a script while keeping characters consistent",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 (Tooning)", en: "Tooning" },
        role: {
          ko: "문장을 입력하면 상황에 맞는 포즈·표정·컷을 추천하는 AI 보조 도구",
          en: "AI assistant that suggests poses, expressions, and panels from a sentence",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 플러스 (Tooning Plus)", en: "Tooning Plus" },
        role: {
          ko: "AI 시나리오(스토리즈)·3D 연출(3D 스튜디오)·협업 편집(에디터)을 하나로 묶은 투닝의 통합 제작 서비스",
          en: "Tooning's integrated suite combining AI story writing (Stories), 3D staging (3D Studio), and collaborative editing (Editor)",
        },
        kind: "external",
      },
      {
        name: { ko: "CREAM", en: "CREAM" },
        role: {
          ko: "스튜디오 고유의 화풍과 캐릭터를 학습시킨 전용 AI 파트너를 구축하는 솔루션",
          en: "Solution that trains a studio-private AI partner on its own style and characters",
        },
        kind: "external",
      },
      {
        name: { ko: "OpenArt", en: "OpenArt" },
        role: {
          ko: "100종이 넘는 AI 모델을 한곳에서 골라 쓰는 이미지 생성·편집 플랫폼",
          en: "Image generation and editing platform aggregating 100+ AI models",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "대시툰 스튜디오", en: "Dashtoon Studio" },
        role: {
          ko: "스토리보드를 올리면 캐릭터 라이브러리와 AI로 만화를 완성하는 제작 플랫폼",
          en: "Creation platform that turns storyboards into comics with a character library and AI",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "투툰 (TooToon)", en: "TooToon" },
        role: {
          ko: "아이디어를 넣으면 시나리오부터 풀컬러 아트워크까지 만드는 올인원 AI 웹툰 플랫폼 (오노마에이아이)",
          en: "All-in-one AI webtoon platform that goes from an idea to scenario and full-color artwork (Onoma AI)",
        },
        kind: "external",
      },
      {
        name: { ko: "위툰 (WeToon)", en: "WeToon" },
        role: {
          ko: "줄거리를 넣으면 시나리오·캐릭터·컷을 단계별로 생성하는 AI 웹툰 제작 서비스",
          en: "AI webtoon service that generates scenario, characters, and panels step by step from a plot",
        },
        kind: "external",
      },
      {
        name: { ko: "LlamaGen.ai", en: "LlamaGen.ai" },
        role: {
          ko: "스토리를 넣으면 캐릭터 일관성을 유지하며 멀티 패널 코믹을 생성하는 AI 도구",
          en: "AI tool that turns a story into multi-panel comics with consistent characters",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "PixAI", en: "PixAI" },
        role: {
          ko: "애니메이션풍 캐릭터 생성과 LoRA에 특화된 AI 아트 플랫폼",
          en: "Anime-focused AI art platform for character generation and LoRAs",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "ComicAI", en: "ComicAI" },
        role: {
          ko: "스토리에서 캐릭터를 뽑아 패널을 생성하는 AI 만화 제작 도구",
          en: "AI comic tool that extracts characters from a story and generates panels",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Stable Diffusion", en: "Stable Diffusion" },
        role: {
          ko: "로컬 실행이 가능한 오픈 이미지 생성 모델과 그 생태계 (ControlNet 등)",
          en: "Open image generation model ecosystem, runnable locally with ControlNet controls",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "ComfyUI", en: "ComfyUI" },
        role: {
          ko: "노드 그래프로 이미지 생성 과정을 조립하는 무료 워크플로 도구",
          en: "Free node-graph workflow tool for assembling image generation pipelines",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Midjourney", en: "Midjourney" },
        role: {
          ko: "캐릭터·스타일 참조로 그림체를 유지하는 이미지 생성 서비스",
          en: "Image generation service with character and style references",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "NovelAI", en: "NovelAI" },
        role: {
          ko: "AI 스토리텔링과 애니메풍 이미지 생성을 함께 제공하는 구독 서비스",
          en: "Subscription service combining AI storytelling with anime-style image generation",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "Adobe Firefly", en: "Adobe Firefly" },
        role: {
          ko: "Photoshop 안에서 생성형 채우기로 합성·확장을 돕는 Adobe의 AI",
          en: "Adobe's generative AI for fill, compositing, and expansion inside Photoshop",
        },
        kind: "external",
      },
      {
        name: { ko: "리얼드로우", en: "리얼드로우" },
        role: {
          ko: "작가 본인의 화풍을 학습해 드로잉을 보조하는 AI 도구",
          en: "AI drawing assistant trained on the artist's own style",
        },
        kind: "external",
      },
      {
        name: { ko: "AI 코믹 디렉터", en: "AI Comic Director" },
        role: {
          ko: "시나리오 비트를 장면 후보 이미지로 만들어 검토·적용하는 AI 연출",
          en: "AI directing that turns scenario beats into scene candidates to review and apply",
        },
        kind: "builtin",
      },
      {
        name: { ko: "생성형 제작", en: "Generative Creation" },
        role: {
          ko: "이미지와 비디오를 생성하는 전용 제작 화면",
          en: "Dedicated screen for generating images and video",
        },
        kind: "builtin",
        href: "/studio/generate",
      },
      {
        name: { ko: "개인 AI 런타임", en: "Personal AI Runtime" },
        role: {
          ko: "개인 ONNX·외부 런타임으로 추론을 돌리는 작업공간",
          en: "Workspace for running personal ONNX and external runtime inference",
        },
        kind: "builtin",
        href: "/studio/ai-lab",
      },
      {
        name: { ko: "AI 설정", en: "AI Settings" },
        role: {
          ko: "내 API 키를 등록해 AI 기능을 켜는 통합 설정",
          en: "Unified settings where you register your API keys to enable AI features",
        },
        kind: "builtin",
        href: "/studio/ai-settings",
      },
    ],
  },
  {
    id: "localization",
    title: { ko: "번역·현지화", en: "Translation & localization" },
    summary: {
      ko: "해외 연재를 위해 대사를 번역하고 언어별로 다시 식자하는 단계입니다.",
      en: "The stage that translates dialogue and re-letters each language edition for overseas serialization.",
    },
    tools: [
      {
        name: { ko: "레터웍스 (letr.ai)", en: "LETR WORKS (letr.ai)" },
        role: {
          ko: "이미지 속 대사를 인식·추출하고 다국어 번역·식자를 자동화하는 현지화 도구",
          en: "Localization tool that extracts dialogue from images and automates multilingual translation and lettering",
        },
        kind: "external",
      },
      {
        name: { ko: "KAISTORY", en: "KAISTORY" },
        role: {
          ko: "같은 원고 데이터에서 언어별 판본을 편집하는 다국어 편집",
          en: "Multilingual editions edited from the same source data",
        },
        kind: "external",
      },
      {
        name: { ko: "DeepL", en: "DeepL" },
        role: {
          ko: "문서 번역과 API를 제공하는 AI 기계번역 서비스",
          en: "AI machine translation service with document translation and an API",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "네이버 파파고", en: "NAVER Papago" },
        role: {
          ko: "텍스트·이미지 번역을 제공하는 네이버의 무료 AI 번역 서비스",
          en: "Naver's free AI translator for text and images",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Tesseract", en: "Tesseract" },
        role: {
          ko: "완성 이미지에서 대사 텍스트를 뽑는 오픈소스 OCR 엔진",
          en: "Open-source OCR engine that extracts dialogue text from finished images",
        },
        kind: "external",
      },
      {
        name: { ko: "툰잉 AI Losy", en: "툰잉 AI Losy" },
        role: {
          ko: "번역·식자·효과음을 한 흐름으로 처리하는 End-to-End 현지화 서비스",
          en: "End-to-end localization service handling translation, lettering, and SFX in one flow",
        },
        kind: "external",
      },
      {
        name: { ko: "대사 번역", en: "Dialogue Translation" },
        role: {
          ko: "말풍선 대사를 내 API 키로 일괄 번역하고 원문과 나란히 검토하는 패널 (에디터 안)",
          en: "Batch-translates balloon dialogue with your API key, reviewed side by side (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "번역 메모리", en: "Translation Memory" },
        role: {
          ko: "번역 쌍과 용어집을 저장해 재사용하는 패널 (에디터 안)",
          en: "Stores translation pairs and glossaries for reuse (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "현지화 QA", en: "Localization QA" },
        role: {
          ko: "문체와 말풍선 넘침을 검사해 현지화 품질 점수를 매기는 기능 (에디터 안)",
          en: "Checks style and balloon overflow to score localization quality (inside the editor)",
        },
        kind: "builtin",
      },
    ],
  },
  {
    id: "distribution",
    title: { ko: "연재·배포", en: "Serialization & distribution" },
    summary: {
      ko: "완성 회차를 플랫폼 규격에 맞춰 납품하고 공개를 관리하는 단계입니다.",
      en: "The stage that packages finished episodes to platform specs and manages release.",
    },
    tools: [
      {
        name: { ko: "KAISTORY", en: "KAISTORY" },
        role: {
          ko: "제작 데이터에서 배포까지 이어지는 통합 플랫폼의 배포 흐름",
          en: "Distribution flow of the integrated platform, from production data to release",
        },
        kind: "external",
      },
      {
        name: { ko: "네이버웹툰", en: "Naver Webtoon" },
        role: {
          ko: "도전만화부터 정식 연재까지 이어지는 국내 대표 연재 플랫폼",
          en: "Korea's leading serialization platform, from amateur uploads to official series",
        },
        kind: "external",
      },
      {
        name: { ko: "카카오웹툰·카카오페이지", en: "Kakao Webtoon & KakaoPage" },
        role: {
          ko: "카카오의 웹툰·웹소설 연재 플랫폼",
          en: "Kakao's webtoon and web novel serialization platforms",
        },
        kind: "external",
      },
      {
        name: { ko: "WEBTOON Canvas", en: "WEBTOON Canvas" },
        role: {
          ko: "누구나 올릴 수 있는 글로벌 자가 연재 플랫폼",
          en: "Global self-publishing platform open to any creator",
        },
        kind: "external",
      },
      {
        name: { ko: "Tapas", en: "Tapas" },
        role: {
          ko: "인디 창작자 중심의 글로벌 연재 플랫폼",
          en: "Global serialization platform centered on indie creators",
        },
        kind: "external",
      },
      {
        name: { ko: "포스타입", en: "Postype" },
        role: {
          ko: "누구나 글을 연재·판매할 수 있는 개방형 플랫폼으로 멤버십·후원을 함께 제공",
          en: "Open platform where anyone can serialize and sell posts, with memberships and patronage",
        },
        kind: "external",
      },
      {
        name: { ko: "MANGA Plus Creators", en: "MANGA Plus Creators" },
        role: {
          ko: "해외 작가 투고를 받아 월간 어워드를 거쳐 정식 연재로 잇는 슈에이샤의 플랫폼",
          en: "Shueisha's platform taking overseas submissions through monthly awards toward official serialization",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 플러스 툰비", en: "투닝 플러스 툰비" },
        role: {
          ko: "제작한 웹툰을 공유·업로드하는 투닝 플러스의 오픈 플랫폼",
          en: "Tooning Plus's open platform for sharing and uploading produced webtoons",
        },
        kind: "external",
      },
      {
        name: { ko: "대시툰 (Dashtoon)", en: "Dashtoon" },
        role: {
          ko: "전용 리더로 작품을 퍼블리싱하고 수익을 나누는 배포 플랫폼",
          en: "Publishing platform with a dedicated reader and revenue sharing",
        },
        kind: "external",
      },
      {
        name: { ko: "작품 게시", en: "Studio Publishing" },
        role: {
          ko: "게시 패키지와 사전 점검으로 작품 발행을 진행하는 화면",
          en: "Publishes titles with release packages and preflight checks",
        },
        kind: "builtin",
        href: "/studio/publish",
      },
      {
        name: { ko: "게시 센터", en: "Publish Center" },
        role: {
          ko: "발행 패키지를 만드는 통합 게시 센터",
          en: "Unified publish center for building release packages",
        },
        kind: "builtin",
        href: "/publish",
      },
      {
        name: { ko: "연재 예약 발행", en: "Scheduled Publishing" },
        role: {
          ko: "공개 시각을 예약하고 예약 캘린더로 관리하는 기능 (게시 화면 안)",
          en: "Schedules releases and manages them on a calendar (inside the publish screen)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "모션 웹툰", en: "Motion Webtoon" },
        role: {
          ko: "움직이는 모션 웹툰을 제작하는 화면",
          en: "Screen for creating motion webtoons",
        },
        kind: "builtin",
        href: "/studio/motion-webtoon",
      },
    ],
  },
  {
    id: "promotion",
    title: { ko: "홍보·마케팅", en: "Promotion & marketing" },
    summary: {
      ko: "연재 소식을 알리고 독자 반응을 다음 회차에 잇는 단계입니다.",
      en: "The stage that spreads release news and carries reader response into the next episode.",
    },
    tools: [
      {
        name: { ko: "X", en: "X" },
        role: {
          ko: "연재 소식과 대표 컷을 전하는 단문 SNS 채널",
          en: "Short-form social channel for release news and key panels",
        },
        kind: "external",
      },
      {
        name: { ko: "Instagram", en: "Instagram" },
        role: {
          ko: "이미지 중심으로 작품과 작가를 알리는 SNS 채널",
          en: "Image-first social channel for promoting titles and creators",
        },
        kind: "external",
      },
      {
        name: { ko: "YouTube", en: "YouTube" },
        role: {
          ko: "숏폼과 영상으로 작품을 알리는 영상 채널",
          en: "Video channel for shorts and trailers that promote titles",
        },
        kind: "external",
      },
      {
        name: { ko: "Buffer", en: "Buffer" },
        role: {
          ko: "여러 SNS 채널의 게시를 한곳에서 예약·관리하는 도구",
          en: "Schedules and manages posts across multiple social channels",
        },
        kind: "external",
      },
      {
        name: { ko: "Later", en: "Later" },
        role: {
          ko: "인스타그램 그리드 미리보기를 갖춘 SNS 예약 게시 도구",
          en: "Social scheduling tool with an Instagram grid preview",
        },
        kind: "external",
      },
      {
        name: { ko: "Linktree", en: "Linktree" },
        role: {
          ko: "연재처·SNS·굿즈 링크를 한 페이지로 모으는 링크 허브",
          en: "Link hub gathering serialization, social, and merch links on one page",
        },
        kind: "external",
      },
      {
        name: { ko: "Canva", en: "Canva" },
        role: {
          ko: "템플릿으로 홍보 이미지와 SNS 소재를 빠르게 만드는 디자인 도구",
          en: "Template-based design tool for promo images and social assets",
        },
        kind: "external",
      },
      {
        name: { ko: "브런치 (Brunch)", en: "Brunch" },
        role: {
          ko: "작가의 글과 작품 소식을 쌓아 독자와 만나는 카카오의 플랫폼",
          en: "Kakao's platform where writers publish essays and title news",
        },
        kind: "external",
      },
      {
        name: { ko: "스티비 (Stibee)", en: "Stibee" },
        role: {
          ko: "구독자 관리와 발송 통계를 갖춘 국내 뉴스레터 서비스",
          en: "Korean newsletter service with subscriber management and send analytics",
        },
        kind: "external",
      },
      {
        name: { ko: "Substack", en: "Substack" },
        role: {
          ko: "구독자 목록과 발송을 한곳에서 처리하는 글로벌 뉴스레터 도구",
          en: "Global newsletter tool handling lists, sending, and analytics",
        },
        kind: "external",
      },
      {
        name: { ko: "Mailchimp", en: "Mailchimp" },
        role: {
          ko: "캠페인 발송과 구독자 관리를 제공하는 이메일 마케팅 도구",
          en: "Email marketing tool for campaign sending and list management",
        },
        kind: "external",
      },
      {
        name: { ko: "텀블벅 (Tumblbug)", en: "Tumblbug" },
        role: {
          ko: "웹툰 단행본과 굿즈를 올리는 국내 크라우드펀딩 플랫폼",
          en: "Korean crowdfunding platform for webtoon books and merch",
        },
        kind: "external",
      },
      {
        name: { ko: "Helix Shorts", en: "Helix Shorts" },
        role: {
          ko: "웹툰 회차를 AI로 40초 숏폼 영상으로 바꿔 주는 카카오의 도구",
          en: "Kakao's tool that turns webtoon episodes into 40-second AI short-form videos",
        },
        kind: "external",
      },
      {
        name: { ko: "Vrew", en: "Vrew" },
        role: {
          ko: "텍스트 기반으로 영상을 편집하고 자막을 자동으로 다는 무빙툰·홍보 영상 도구",
          en: "Text-based video editing with automatic captions for motion toons and promo videos",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "홍보 게시판", en: "Promotion Board" },
        role: {
          ko: "신작과 연재 소식을 알리는 작품 홍보 게시판",
          en: "Board for promoting new titles and serialization news",
        },
        kind: "builtin",
        href: "/community/promote",
      },
      {
        name: { ko: "작품 홍보 페이지", en: "Work Promo Page" },
        role: {
          ko: "쇼케이스 안에 작품을 알리는 홍보 화면",
          en: "Promo screen presenting titles inside the showcase",
        },
        kind: "builtin",
        href: "/showcase/promo",
      },
      {
        name: { ko: "뉴스레터", en: "Newsletter" },
        role: {
          ko: "작가 뉴스레터를 쓰고 구독자에게 보내는 도구",
          en: "Writes and sends author newsletters to subscribers",
        },
        kind: "builtin",
        href: "/newsletter",
      },
      {
        name: { ko: "컷츠 스튜디오", en: "Cuts Studio" },
        role: {
          ko: "회차를 홍보용 숏폼 클립으로 만드는 스튜디오",
          en: "Studio that turns episodes into promotional short-form clips",
        },
        kind: "builtin",
        href: "/cuts/studio",
      },
      {
        name: { ko: "창작자 애널리틱스", en: "Creator Analytics" },
        role: {
          ko: "작품 성과 지표를 보는 창작자 대시보드",
          en: "Creator dashboard for title performance metrics",
        },
        kind: "builtin",
        href: "/studio/analytics",
      },
      {
        name: { ko: "작가 성장·IP 확장", en: "Creator Growth & IP" },
        role: {
          ko: "작가 성장과 IP 확장을 다루는 화면",
          en: "Screen for creator growth and IP expansion",
        },
        kind: "builtin",
        href: "/studio/growth",
      },
      {
        name: { ko: "AI 캐릭터 챗 관리", en: "AI Character Chat Manager" },
        role: {
          ko: "작품 캐릭터 챗을 운영·관리하는 자리",
          en: "Manages the title's AI character chat for readers",
        },
        kind: "builtin",
        href: "/character-chat/manage",
      },
    ],
  },
] as const;
