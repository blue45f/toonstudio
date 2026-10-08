import {
  AI_DEV_GATE_ROWS,
  AI_DEV_LOOP_ROWS,
  AI_DEV_POLICY_ROWS,
  AI_DEV_TOOL_ROWS,
  AI_DEV_WIKI_ROWS,
  t,
} from "./engineering-map-ai-dev-rows";

import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringMap } from "./engineering-map-types";

/**
 * 기술 지도 · ai-dev — 제품을 만들 때 쓴 AI 개발 도구와, 그 도구를 우리 개발 방식에 맞춘 장치의 지도.
 * 계약과 작성 규칙은 engineering-map-types.ts 를 따른다. 행은 engineering-map-ai-dev-rows.ts 에 있다.
 * 기준: 2026-10-07 저장소 읽기. 운영 서버의 키 등록·AI 도구의 실제 사용 빈도·정량 효과는 확인하지 못했다(미확인).
 * 이 지도는 제품 안의 AI 기능이 아니라 개발 도구를 다룬다.
 */

/** 사람의 요청이 정책·도구·검증을 지나 배포 승인에 이르는 길. 배포는 사람의 별도 승인이다. */
const AI_DEV_FLOW_DIAGRAM: EngineeringDiagram = {
  id: "ai-dev-flow-diagram",
  kind: "graph",
  title: t("AI 개발 도구가 따르는 길", "The path AI development tools follow"),
  caption: t(
    "도구가 바뀌어도 규칙은 AGENTS.md 한 곳이고, 완료는 자동 검증과 사람의 승인으로 판정합니다.",
    "Whatever the tool, the rules live in AGENTS.md, and 'done' is decided by automatic verification and human approval.",
  ),
  alt: t(
    "사람의 요청이 AGENTS.md의 규칙을 거쳐 도구별 어댑터로 전달되고, 에이전트와 스킬이 작업합니다. 작업은 harness:verify를 통과할 때까지 반복한 뒤 커밋과 PR이 되고, 사람이 승인해야만 운영 배포로 이어집니다. OpenWiki는 에이전트가 코드를 찾아가는 길잡이로 곁에서 돕습니다.",
    "A person's request passes through the rules in AGENTS.md to tool adapters, and agents and skills do the work. The work repeats until harness:verify passes, becomes a commit and PR, and reaches production only after a person approves. OpenWiki helps agents navigate the code from the side.",
  ),
  nodes: [
    {
      id: "request",
      label: t("사람의 요청", "Person's request"),
      sub: t("목표와 제한을 대화로", "Goals and limits in chat"),
      tone: "neutral",
      shape: "pill",
      at: [0, 0],
    },
    {
      id: "policy",
      label: t("AGENTS.md", "AGENTS.md"),
      sub: t("단일 정책 · 영역별 규칙", "One policy, area rules"),
      tone: "good",
      at: [1, 0],
    },
    {
      id: "adapters",
      label: t("도구별 어댑터", "Tool adapters"),
      sub: t("각 도구가 읽는 안내판", "Pointers for each tool"),
      tone: "neutral",
      at: [2, 0],
    },
    {
      id: "agents",
      label: t("에이전트·스킬", "Agents & skills"),
      sub: t("루프 명령 · MCP 도구", "Loops · MCP tools"),
      tone: "ai",
      at: [3, 0],
    },
    {
      id: "verify",
      label: t("harness:verify", "harness:verify"),
      sub: t("변경 범위별 검증", "Checks by change scope"),
      tone: "good",
      at: [4, 0],
    },
    {
      id: "pr",
      label: t("커밋·PR", "Commit & PR"),
      sub: t("한글 제목 · CI core", "Korean subject · CI core"),
      tone: "server",
      at: [5, 0],
    },
    {
      id: "wiki",
      label: t("OpenWiki", "OpenWiki"),
      sub: t("길 찾기용 지식 베이스", "Knowledge base for navigation"),
      tone: "ai",
      at: [3, 1],
    },
    {
      id: "deploy",
      label: t("운영 배포", "Release"),
      sub: t("별도 명시 승인", "Separate approval"),
      tone: "warn",
      shape: "pill",
      at: [4, 1],
    },
    {
      id: "approval",
      label: t("사람 승인", "Human approval"),
      tone: "warn",
      shape: "diamond",
      at: [5, 1],
    },
  ],
  edges: [
    { from: "request", to: "policy", label: t("규칙 확인", "Read rules") },
    { from: "policy", to: "adapters", label: t("포인터", "Pointers") },
    { from: "adapters", to: "agents", label: t("읽음", "Read by") },
    { from: "agents", to: "verify", both: true, label: t("통과까지", "Until pass") },
    { from: "verify", to: "pr", label: t("통과", "Pass") },
    { from: "pr", to: "approval", label: t("리뷰·CI", "Review · CI") },
    { from: "approval", to: "deploy", label: t("승인 시에만", "If approved") },
    { from: "wiki", to: "agents", style: "dashed", label: t("길 찾기", "Navigation") },
  ],
};

export const ENGINEERING_MAP_AI_DEV: EngineeringMap | null = {
  id: "ai-dev",
  title: t("AI 개발 도구 지도", "AI development tools map"),
  intro: t(
    "AI 도구를 우리 개발 방식에 어떻게 맞췄나? 도구마다 규칙을 따로 쓰지 않고, 규칙 한 곳(AGENTS.md)과 자동 검사, 사람의 승인으로 묶은 구성을 한 표로 봅니다.",
    "How were AI tools fitted to our way of building? One table shows how everything is tied to a single rulebook (AGENTS.md), automatic checks and human approval instead of per-tool rules.",
  ),
  takeaway: t(
    "AI 도구는 바뀌어도 규칙은 한 곳이고, 끝났다는 판정은 AI의 말이 아니라 자동 검사와 사람의 승인이 합니다.",
    "Tools may change, but the rules live in one place, and 'done' is decided by automatic checks and human approval, not by what an AI says.",
  ),
  columns: [
    { id: "kind", label: t("종류", "Kind"), narrow: true },
    { id: "what", label: t("무엇을 하나 · 쉬운 설명", "What it does · in plain words") },
    { id: "where", label: t("어디서 쓰이나", "Where it is used") },
    { id: "guard", label: t("안전장치 · 한계", "Safeguards · limits") },
  ],
  rows: [...AI_DEV_POLICY_ROWS, ...AI_DEV_WIKI_ROWS, ...AI_DEV_LOOP_ROWS, ...AI_DEV_GATE_ROWS, ...AI_DEV_TOOL_ROWS],
  diagram: AI_DEV_FLOW_DIAGRAM,
  notes: [
    t(
      "상태 표기: '운영 경로'는 저장소의 검증 파이프라인에서 실제로 실행되는 것, '설정 필요'는 설정 파일은 있으나 계정·키·실행 기록을 저장소에서 확인하지 못한 것입니다.",
      "Status labels: 'Live path' runs in the repository's verification pipeline; 'Setup required' has configuration files but no account, key or run record visible in the repository.",
    ),
    t(
      "특정 도구나 모델이 더 낫다고 비교하지 않으며, 시간 단축 같은 효과 수치는 근거 자료가 없어 싣지 않았습니다.",
      "No tool or model is ranked above another, and effect figures such as time saved are left out because no evidence is recorded.",
    ),
    t(
      "PR을 병합해도 배포되지 않습니다. 운영 배포는 사람의 별도 명시 승인과 DEPLOY.md 절차가 있어야 합니다(AGENTS.md §8).",
      "Merging a PR does not deploy. Production release needs a separate explicit human approval and the DEPLOY.md procedure (AGENTS.md section 8).",
    ),
  ],
  reviewedAt: "2026-10-07",
};
