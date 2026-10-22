/**
 * Production 원고 워크스페이스 — 보기 카탈로그·역량 카탈로그와 표시 보조 함수(비컴포넌트).
 *
 * `ProductionManuscriptNavigator.tsx`는 Fast Refresh 경계를 지키려고 컴포넌트만 내보낸다.
 * 내비게이터와 워크스페이스가 함께 쓰는 보기 정의·카탈로그 데이터·순수 함수는 이 모듈이 소유한다.
 */

import {
  Download,
  FileArchive,
  GitCompareArrows,
  History,
  Layers3,
  MessageSquare,
  MonitorSmartphone,
  Sparkles,
  Users,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { productionManuscriptAttention } from "./production-manuscript-ux";

export type ManuscriptView = "processes" | "workbench" | "versions" | "feedback" | "delivery" | "assistant" | "permissions" | "start" | "activity";

export const VIEW_ITEMS: readonly {
  readonly id: ManuscriptView;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "processes", label: "공정·원고", icon: Workflow },
  { id: "workbench", label: "전문 비교", icon: GitCompareArrows },
  { id: "versions", label: "버전·비교", icon: FileArchive },
  { id: "feedback", label: "피드백", icon: MessageSquare },
  { id: "delivery", label: "공유·내보내기", icon: Download },
  { id: "assistant", label: "AI 도우미", icon: WandSparkles },
  { id: "permissions", label: "팀·권한", icon: Users },
  { id: "start", label: "시작 가이드", icon: Sparkles },
  { id: "activity", label: "활동", icon: History },
];

export const CAPABILITIES: readonly {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly destination: "workspace" | "production" | "versions" | "feedback" | "delivery" | "assistant";
}[] = [
  { title: "워크스페이스·멤버·권한", description: "소유자·관리자·편집자·댓글·보기 권한을 서버에서 다시 확인합니다.", icon: Users, destination: "workspace" },
  { title: "이미지·텍스트 공정", description: "대본·콘티·작화·배경·식자·현지화·오디오·납품 공정을 한 회차에 묶습니다.", icon: Layers3, destination: "production" },
  { title: "불변 버전·최종본", description: "자동 저장·체크포인트·검수본·승인본·게시본을 덮어쓰지 않고 보존합니다.", icon: FileArchive, destination: "versions" },
  { title: "원고 비교·복원", description: "버전 간 비교와 과거 revision의 새 체크포인트 복원을 지원합니다.", icon: GitCompareArrows, destination: "versions" },
  { title: "페이지·컷 피드백", description: "위치 주석, 필수 수정, 해결 상태, 댓글과 검수 결정을 고정 원고에 연결합니다.", icon: MessageSquare, destination: "feedback" },
  { title: "보호 공유·모바일 검수", description: "고정된 검수본만 공유하고 접근·만료·폐기를 매 열기마다 검증합니다.", icon: MonitorSmartphone, destination: "delivery" },
  { title: "다중 형식 내보내기", description: "플랫폼·SNS·인쇄·PDF·편집본·전자책·영상·보관 규격을 사전 검사합니다.", icon: Download, destination: "delivery" },
  { title: "AI 제작 보조", description: "대사·구도·배경·캐릭터·팔레트 요청을 편집기로 넘기고 원본은 보호합니다.", icon: Sparkles, destination: "assistant" },
];

export function attentionBadgeClass(
  level: ReturnType<typeof productionManuscriptAttention>["level"],
): string {
  if (level === "danger") return "border-bad/35 bg-bad/10 text-bad";
  if (level === "warning") return "border-warn/35 bg-warn/10 text-warn";
  if (level === "success") return "border-good/35 bg-good/10 text-good";
  return "border-line bg-raised text-fg-2";
}

export function episodeLabels(aggregate: ProductionProjectAggregate): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {};
  for (const plan of aggregate.episodePlans) {
    labels[plan.episodeId] = `${plan.episodeNumber}화 · ${plan.title}`;
  }
  for (const [index, episode] of aggregate.episodes.entries()) {
    labels[episode.episodeId] ??= `${index + 1}화 · ${episode.episodeId}`;
  }
  return Object.freeze(labels);
}
