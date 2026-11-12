/**
 * 스토리월드 랩 표시 규칙 — 축·심각도·기능 성숙도 라벨, 점수 톤, 시간·숫자 포맷, 심각도 아이콘 선택.
 *
 * 컴포넌트가 아닌 값·함수만 모아 react-refresh 규칙과 분리한다.
 * 페이지·공용 부품·탭·모순 목록이 함께 쓴다.
 */
import { AlertTriangle, Info, XCircle } from "lucide-react";

import type { StoryworldCapabilityMaturity } from "./studio-storyworld-catalog";
import type {
  StoryworldAxisId,
  StoryworldSeverity,
} from "./studio-storyworld-causality";

export const AXIS_LABELS: Readonly<Record<StoryworldAxisId, string>> = {
  canon: "캐논",
  "character-knowledge": "인물 지식",
  "setup-payoff": "복선·회수",
  "spoiler-safety": "스포일러",
  "emotional-continuity": "감정 연속성",
  production: "제작",
  localization: "현지화",
  accessibility: "접근성",
  "rights-provenance": "권리·출처",
};

export const SEVERITY_LABELS: Readonly<Record<StoryworldSeverity, string>> = {
  error: "오류",
  warning: "경고",
  info: "확인",
};

export const STORYWORLD_MATURITY_LABELS: Readonly<Record<StoryworldCapabilityMaturity, string>> = {
  engine: "바로 사용 가능",
  adapter: "다른 기능과 연결",
  experimental: "시험 중 기능",
};

export function formatStoryworldNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatStoryworldMinutes(value: number): string {
  if (value < 60) return `${formatStoryworldNumber(value)}분`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

export function scoreTone(score: number): "good" | "warn" | "bad" {
  if (score >= 85) return "good";
  if (score >= 65) return "warn";
  return "bad";
}

export function severityIcon(severity: StoryworldSeverity): typeof XCircle {
  if (severity === "error") return XCircle;
  if (severity === "warning") return AlertTriangle;
  return Info;
}
