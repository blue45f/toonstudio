import {
  BookOpen,
  Boxes,
  Brush,
  CheckCircle2,
  ClipboardCheck,
  FileOutput,
  FolderKanban,
  History,
  ImagePlus,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MessageSquareCheck,
  MoreHorizontal,
  Palette,
  Presentation,
  Settings,
  Sparkles,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

import type { StudioProjectStatus } from "../studio-project-library-store";
import type { StudioProjectSection } from "../studio-project-views";

import type { BilingualText } from "@/shared/lib/i18n-bilingual-copy";

export type ProjectAction = Readonly<{
  title: BilingualText;
  description: BilingualText;
  href: (projectId: string) => string;
  icon: LucideIcon;
  badge?: BilingualText;
}>;

export interface SectionDefinition {
  label: BilingualText;
  eyebrow: string;
  title: BilingualText;
  description: BilingualText;
  icon: LucideIcon;
  actions: readonly ProjectAction[];
}

function action(
  icon: LucideIcon,
  koTitle: string,
  enTitle: string,
  koDescription: string,
  enDescription: string,
  href: (projectId: string) => string,
  badge?: BilingualText,
): ProjectAction {
  return {
    icon,
    title: { ko: koTitle, en: enTitle },
    description: { ko: koDescription, en: enDescription },
    href,
    ...(badge ? { badge } : {}),
  };
}

export function workHref(projectId: string, surface = "canvas"): string {
  return `/studio/work/${encodeURIComponent(projectId)}/${surface}`;
}

function queryHref(pathname: string, values: Readonly<Record<string, string>>): string {
  const params = new URLSearchParams(values);
  params.sort();
  return `${pathname}?${params.toString()}`;
}

export function projectViewHref(
  projectId: string,
  section: StudioProjectSection,
  view: string,
  currentSearch = "",
): string {
  const params = new URLSearchParams(currentSearch);
  params.delete("view");
  params.set("view", view);
  params.sort();
  return `/studio/p/${encodeURIComponent(projectId)}/${section}?${params.toString()}`;
}

export const SECTION_DEFINITIONS: Readonly<Record<StudioProjectSection, SectionDefinition>> = {
  overview: {
    label: { ko: "홈", en: "Home" },
    eyebrow: "PROJECT OVERVIEW",
    title: { ko: "이어서 할 일을 바로 확인하세요.", en: "See what to do next." },
    description: {
      ko: "최근 원고, 검토 요청과 배포 준비만 간단히 확인합니다.",
      en: "See recent work, review requests and delivery readiness without extra dashboards.",
    },
    icon: LayoutDashboard,
    actions: [
      action(Brush, "원고 이어서 작업", "Continue manuscript", "최근 캔버스와 도구 상태에서 바로 시작합니다.", "Open the latest canvas with recent tools and view restored.", (id) => workHref(id)),
      action(BookOpen, "기획 정리", "Open planning", "대본·캐릭터·세계관과 참고자료를 확인합니다.", "Review scripts, characters, worldbuilding and references.", (id) => `/studio/p/${encodeURIComponent(id)}/story`),
      action(MessageSquareCheck, "검토할 내용", "Review work", "댓글·수정 요청·승인 대기를 한 흐름으로 봅니다.", "See comments, change requests and approvals in one flow.", (id) => `/studio/p/${encodeURIComponent(id)}/review`),
      action(FileOutput, "배포 준비", "Prepare delivery", "플랫폼 규격과 사용 권리를 확인한 뒤 파일을 만듭니다.", "Check platform rules and usage rights before creating files.", (id) => `/studio/p/${encodeURIComponent(id)}/export`),
    ],
  },
  story: {
    label: { ko: "기획", en: "Planning" },
    eyebrow: "STORY",
    title: { ko: "대본과 작품 설정을 정리하세요.", en: "Organize scripts and project details." },
    description: {
      ko: "회차, 대본, 캐릭터와 세계관을 원고 가까이에서 관리합니다.",
      en: "Keep episodes, scripts, characters and worldbuilding close to the manuscript.",
    },
    icon: BookOpen,
    actions: [
      action(ListChecks, "개연성 점검", "Plausibility review", "원고나 설정을 기준으로 이야기가 앞뒤가 맞는지 근거와 함께 점검합니다. 찾은 것은 판정이 아니라 작가에게 드리는 질문입니다.", "Check whether the story holds together, with supporting evidence. Findings are questions for you, not verdicts.", (id) => queryHref(workHref(id, "storyworld"), { view: "plausibility" })),
      action(BookOpen, "회차 줄거리", "Episode synopses", "회차마다 목표와 줄거리, 마음의 변화를 적어 콘티로 이어갑니다.", "Write each episode's goal, synopsis and emotional arc, then carry it into storyboards.", (id) => projectViewHref(id, "story", "episodes")),
      action(Users, "캐릭터 시트·관계", "Character sheets & relations", "말투·배경·바라는 것과 캐릭터 사이 관계를 시트로 정리합니다.", "Capture voice, background, motivation and relationships in character sheets.", (id) => projectViewHref(id, "story", "characters")),
      action(Boxes, "세계관 설정 허브", "World lore hub", "장소·세력·종족·규칙·연표를 항목으로 적고 서로 잇습니다. 이름 표기의 정본도 여기서 정해집니다.", "Record places, factions, species, rules and timeline events as linked entries — the canonical spellings live here too.", (id) => projectViewHref(id, "story", "world")),
      action(History, "연표", "Timeline", "세계관 사건을 시간 순서대로 모아 봅니다. 허브의 연표와 같은 설정을 봅니다.", "See world events in chronological order — the same entries as the lore hub timeline.", (id) => projectViewHref(id, "story", "timeline")),
      action(Sparkles, "세계관·연속성", "World & continuity", "설정 충돌과 장면 간 불일치를 근거와 함께 확인합니다.", "Review continuity and story conflicts with supporting references.", (id) => workHref(id, "storyworld")),
      action(ImagePlus, "참고자료", "References", "출처와 사용 조건을 유지하며 자료를 모읍니다.", "Collect references while preserving source and usage information.", (id) => queryHref(workHref(id, "storyworld"), { focus: "references" })),
    ],
  },
  production: {
    label: { ko: "제작", en: "Production" },
    eyebrow: "PRODUCTION",
    title: { ko: "원고를 만들고 다듬으세요.", en: "Create and refine the manuscript." },
    description: {
      ko: "드로잉, 컷 편집, 3D 참고와 모션 도구를 같은 프로젝트에서 사용합니다.",
      en: "Use drawing, panel editing, 3D reference and motion tools in the same project.",
    },
    icon: FolderKanban,
    actions: [
      action(Brush, "드로잉", "Drawing", "브러시·레이어·선택·보정으로 원고를 제작합니다.", "Create with brushes, layers, selections and adjustments.", (id) => workHref(id, "canvas")),
      action(LayoutGrid, "웹툰·컷 편집", "Webtoon & panels", "컷·대사·말풍선과 긴 세로 원고를 편집합니다.", "Edit panels, dialogue, balloons and long vertical canvases.", (id) => workHref(id, "comic")),
      action(Presentation, "애니메이션·모션", "Animation & motion", "애니매틱, 키프레임과 장면 타이밍을 만듭니다.", "Create animatics, keyframes and scene timing.", (id) => workHref(id, "animation")),
      action(Boxes, "3D 장면 연출", "3D scene direction", "배경·포즈·구도를 먼저 잡고 원고의 작화 가이드로 적용합니다.", "Block backgrounds, poses and composition, then apply them as drawing guides.", (id) => workHref(id, "bg3d")),
    ],
  },
  assets: {
    label: { ko: "소재", en: "Assets" },
    eyebrow: "PROJECT ASSETS",
    title: { ko: "이 프로젝트에 쓰는 소재를 관리하세요.", en: "Manage the assets used by this project." },
    description: {
      ko: "브러시, 이미지, 3D, 글꼴과 사용 권리를 한곳에서 확인합니다.",
      en: "Review brushes, images, 3D, fonts and usage rights in one place.",
    },
    icon: Boxes,
    actions: [
      action(Boxes, "사용 중인 소재", "Assets in use", "현재 프로젝트에 설치·사용된 에셋을 확인합니다.", "Review installed and used assets for this project.", (id) => queryHref("/studio/assets", { project: id })),
      action(Brush, "브러시", "Brushes", "전체·내 브러시·팀 브러시를 하나의 라이브러리에서 찾습니다.", "Find built-in, personal and team brushes in one library.", () => "/studio/assets/brushes"),
      action(Palette, "작품 스타일", "Project style", "작품 로고·색상·글꼴·말풍선·출력 규칙을 재사용합니다.", "Reuse logos, colors, fonts, balloons and export rules.", (id) => queryHref("/studio/assets", { project: id, view: "series-kit" })),
      action(WandSparkles, "새 소재 찾기", "Find assets", "호환성과 상업 이용 조건을 확인한 뒤 프로젝트에 설치합니다.", "Check compatibility and commercial-use terms before installing.", (id) => queryHref("/market", { project: id })),
    ],
  },
  review: {
    label: { ko: "검토", en: "Review" },
    eyebrow: "REVIEW",
    title: { ko: "피드백을 확인하고 마무리하세요.", en: "Review feedback and finish the work." },
    description: {
      ko: "댓글, 수정 요청, 승인과 버전 비교를 한곳에서 처리합니다.",
      en: "Handle comments, change requests, approvals and version comparison in one place.",
    },
    icon: ClipboardCheck,
    actions: [
      action(MessageSquareCheck, "댓글·수정 요청", "Comments & changes", "위치·컷·대사에 연결된 검토 내용을 해결합니다.", "Resolve review notes attached to positions, panels and dialogue.", (id) => workHref(id, "review")),
      action(CheckCircle2, "승인", "Approvals", "단계별 승인 상태를 확인하고 승인본을 자동 보관합니다.", "Review stage approvals and preserve approved versions automatically.", (id) => workHref(id, "review")),
      action(LayoutGrid, "버전 비교", "Version comparison", "두 결과를 좌우·오버레이·변경 영역으로 비교합니다.", "Compare versions side by side, overlaid or by changed areas.", (id) => workHref(id, "versions")),
      action(Users, "공유·외부 검토", "Share & external review", "편집 권한 또는 가벼운 검토 링크를 만듭니다.", "Invite editors or create a lightweight review link.", (id) => queryHref("/studio/share", { scope: `work:${id}` })),
    ],
  },
  export: {
    label: { ko: "배포", en: "Delivery" },
    eyebrow: "EXPORT",
    title: { ko: "연재할 곳에 맞는 파일을 만드세요.", en: "Create files for where the work will be published." },
    description: {
      ko: "플랫폼, SNS, 인쇄 목적을 고르면 필요한 규격과 파일을 준비합니다.",
      en: "Choose a platform, social or print destination and prepare the required files.",
    },
    icon: FileOutput,
    actions: [
      action(LayoutGrid, "연재본 만들기", "Create release files", "분할·용량·썸네일·글자 가독성을 자동 검사합니다.", "Check slicing, file size, thumbnails and text readability automatically.", (id) => workHref(id, "publish")),
      action(ImagePlus, "이미지·PDF", "Images & PDF", "SNS 공유와 검토용 이미지·PDF를 만듭니다.", "Create image and PDF packages for sharing and review.", (id) => workHref(id, "publish")),
      action(Presentation, "PPTX·피칭", "PPTX & pitch", "작품 소개와 피칭 자료를 편집 가능한 문서로 내보냅니다.", "Export project introductions and pitches as editable documents.", (id) => workHref(id, "present")),
      action(FileOutput, "전체 프로젝트 백업", "Full project backup", "원고·에셋·설정·권리 정보를 포함한 완전한 사본을 만듭니다.", "Create a complete copy with documents, assets, settings and rights data.", (id) => workHref(id, "publish")),
    ],
  },
  settings: {
    label: { ko: "설정", en: "Settings" },
    eyebrow: "PROJECT SETTINGS",
    title: { ko: "작품과 팀의 기본 규칙을 관리하세요.", en: "Manage project and team defaults." },
    description: {
      ko: "이름·템플릿·제작 단계·권한·자동 버전과 기본 출력 목적을 설정합니다.",
      en: "Configure name, templates, production stages, permissions, automatic versions and export defaults.",
    },
    icon: Settings,
    actions: [
      action(Settings, "프로젝트 정보", "Project information", "작품명·설명·대표 이미지와 기본 규격을 관리합니다.", "Manage title, description, cover image and default specifications.", (id) => projectViewHref(id, "settings", "general")),
      action(Users, "팀·권한", "Team & permissions", "역할과 편집·검토·게시 권한을 관리합니다.", "Manage roles and edit, review and publish permissions.", (id) => queryHref("/studio/share", { scope: `work:${id}` })),
      action(Sparkles, "자동화", "Automation", "자동 버전·작업 단계·출력 규칙을 설정합니다.", "Configure automatic versions, workflow stages and export rules.", (id) => projectViewHref(id, "settings", "automation")),
      action(MoreHorizontal, "보관·삭제", "Archive & delete", "복구 가능한 상태로 보관하거나 휴지통으로 이동합니다.", "Archive safely or move the project to trash with recovery available.", (id) => projectViewHref(id, "settings", "archive")),
    ],
  },
};

export const PRIMARY_SECTIONS = [
  "overview",
  "story",
  "production",
  "review",
  "export",
] as const satisfies readonly StudioProjectSection[];

export const SECONDARY_SECTIONS = ["assets", "settings"] as const satisfies readonly StudioProjectSection[];

export function localeFromLanguage(language: string) {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

export const PROJECT_STATUS_LABELS: Readonly<Record<StudioProjectStatus, BilingualText>> = {
  active: { ko: "작업 중", en: "In progress" },
  archived: { ko: "보관됨", en: "Archived" },
  trashed: { ko: "휴지통", en: "In trash" },
};

export function projectStatusChipClasses(status: StudioProjectStatus): string {
  if (status === "active") return "bg-accent-soft text-accent";
  if (status === "archived") return "border border-line bg-panel text-fg-2";
  return "border border-danger/35 bg-danger/10 text-danger";
}
