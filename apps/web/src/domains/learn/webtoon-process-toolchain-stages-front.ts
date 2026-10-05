/**
 * 웹툰 제작 공정별 도구 카탈로그 — 단계 데이터 분리 파일.
 * 수록 원칙은 `webtoon-process-toolchain.ts` 머리말이 정본이며, 이 파일은
 * 파일 크기 래칫 준수를 위해 단계 묶음만 분리한 것이다.
 */

import type { ProcessToolchainStage } from "./webtoon-process-toolchain";

export const TOOLCHAIN_STAGES_FRONT: readonly ProcessToolchainStage[] = [
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
];
