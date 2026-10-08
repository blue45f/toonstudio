import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";
import { ENGINEERING_ATLAS_AI_DEV_LOOP } from "./engineering-atlas-ai-dev-loop";

/**
 * 기술 도감 · AI 개발 도구 카드 4장(category: platform-ops). 조정자가 집계 모듈에 연결한다.
 * 제품 안의 AI 기능이 아니라 제품을 만들 때 쓴 AI 개발 도구·하네스를 다룬다.
 * 기준: 2026-10-07 저장소 읽기와 공식 문서 확인. 실행 기록·계정 설정·정량 효과는 확인하지 못했고 카드에도 쓰지 않았다.
 * 샘플 코드는 설정·스크립트의 구조를 보여주는 교육용이며 비밀값을 담지 않는다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });
const lines = (...rows: readonly string[]): string => rows.join("\n");

/* ───────────────────────── 1. AGENTS.md 단일 정책 ───────────────────────── */

const AGENTS_MD_DIAGRAM: EngineeringDiagram = {
  id: "agents-md-single-policy-diagram",
  kind: "graph",
  title: t("정책 한 곳, 어댑터는 포인터", "One policy, adapters as pointers"),
  caption: t(
    "도구마다 규칙을 복사하지 않고, 모든 길이 AGENTS.md로 모입니다.",
    "Rules are never copied per tool; every path leads to AGENTS.md.",
  ),
  alt: t(
    "Claude Code, Gemini, Copilot, Cursor 같은 도구는 짧은 어댑터 파일을 읽고, 어댑터는 중앙의 AGENTS.md를 가리킵니다. 영역별 규칙은 하위 AGENTS.md가 더하고, Codex와 OpenCode는 AGENTS.md를 바로 읽습니다. 하네스가 연결과 정책 문장이 남아 있는지 검사합니다.",
    "Tools such as Claude Code, Gemini, Copilot and Cursor read short adapter files, and each adapter points to the central AGENTS.md. Nested AGENTS.md files add area rules, while Codex and OpenCode read AGENTS.md directly. The harness checks that links and policy text remain.",
  ),
  nodes: [
    {
      id: "harness",
      label: t("harness:check", "harness:check"),
      sub: t("연결·정책 문장 검사", "Checks links and text"),
      tone: "good",
      at: [2, 0],
    },
    {
      id: "tools",
      label: t("개별 도구", "AI tools"),
      sub: t("Claude · Gemini · Copilot · Cursor", "Claude · Gemini · Copilot · Cursor"),
      tone: "ai",
      at: [0, 1],
    },
    {
      id: "adapters",
      label: t("어댑터 파일", "Adapter files"),
      sub: t("CLAUDE.md 등 짧은 포인터", "Short pointers like CLAUDE.md"),
      tone: "neutral",
      at: [1, 1],
    },
    {
      id: "policy",
      label: t("AGENTS.md", "AGENTS.md"),
      sub: t("단일 기준 · 10개 절", "Single source · 10 sections"),
      tone: "good",
      at: [2, 1],
    },
    {
      id: "nested",
      label: t("하위 AGENTS.md", "Nested AGENTS.md"),
      sub: t("web·api·docs 외 6곳", "web, api, docs and six more"),
      tone: "neutral",
      at: [3, 1],
    },
    {
      id: "native",
      label: t("직접 읽는 도구", "Direct readers"),
      sub: t("Codex · OpenCode", "Codex · OpenCode"),
      tone: "ai",
      at: [2, 2],
    },
  ],
  edges: [
    { from: "tools", to: "adapters", label: t("읽음", "Reads") },
    { from: "adapters", to: "policy", label: t("가리킴", "Points to") },
    { from: "policy", to: "nested", label: t("영역 규칙", "Area rules") },
    { from: "native", to: "policy", label: t("바로 읽음", "Reads directly") },
    { from: "harness", to: "policy", style: "dashed", label: t("매번 검사", "Checks") },
  ],
};

const AGENTS_MD_SINGLE_POLICY: EngineeringAtlasEntry = {
  id: "agents-md-single-policy",
  category: "platform-ops",
  name: "AGENTS.md",
  title: t("도구가 달라도 규칙은 한 곳", "Different tools, one rulebook"),
  status: "live",
  tagline: t(
    "규칙은 AGENTS.md 한 곳에 두고, 도구별 파일은 그곳을 가리키기만 합니다.",
    "Rules live in one AGENTS.md; each tool's file only points to it.",
  ),
  background: [
    t(
      "AI 코딩 도구는 여러 가지이고, 도구마다 읽는 안내 파일 이름이 다릅니다(CLAUDE.md, GEMINI.md, Copilot 지침, Cursor 규칙 등). 규칙을 파일마다 따로 적어 두면 시간이 지나며 서로 달라지고, 어느 도구가 어떤 규칙을 따르는지 아무도 모르게 됩니다. 건물마다 다른 규약집을 붙여 두는 것과 같습니다.",
      "AI coding tools are many, and each reads a differently named instruction file (CLAUDE.md, GEMINI.md, Copilot instructions, Cursor rules). If every file carries its own copy of the rules, the copies drift apart and nobody knows which tool follows which rule. It is like posting a different rulebook in every building.",
    ),
    t(
      "ToonStudio는 규칙을 루트 AGENTS.md(작업 계약 10개 절) 한 곳에 두고, 앱·문서·스크립트 같은 영역별 규칙은 하위 AGENTS.md 9곳에 더합니다. 도구별 파일은 'AGENTS.md를 먼저 읽고 한글로 보고하며 완료 전 harness:verify를 실행하라'는 짧은 포인터이고, Codex와 OpenCode는 AGENTS.md를 직접 읽습니다(OpenCode에는 같은 취지의 전용 에이전트 파일도 하나 있습니다).",
      "ToonStudio keeps the rules in the root AGENTS.md (ten sections) and adds area rules in nine nested AGENTS.md files for apps, docs and scripts. Each tool's file is a short pointer: read AGENTS.md first, report in Korean, run harness:verify before finishing. Codex and OpenCode read AGENTS.md directly (OpenCode also has one dedicated agent file with the same intent).",
    ),
    t(
      "대안은 도구마다 규칙을 복사하는 방식이지만 복사본은 반드시 어긋납니다. 대신 이 방식의 약점은 '읽도록 시키는 것'과 '실제로 읽는 것'이 다르다는 점입니다. 예를 들어 Claude Code는 CLAUDE.md가 있으면 기본으로 AGENTS.md를 따로 읽지 않으므로, CLAUDE.md의 지시를 모델이 따를 때 규칙이 불러와집니다.",
      "The alternative is copying rules into every tool's file, but copies always drift. The weakness of this approach is that telling a tool to read is not the same as it reading. For example, Claude Code by default does not load AGENTS.md when a CLAUDE.md exists, so the rules arrive when the model follows the instruction in CLAUDE.md.",
    ),
    t(
      "하네스(pnpm harness:check)는 어댑터 5개가 AGENTS.md를 '언급'하는지, 필수 파일 19개와 정책 문장 7곳이 남아 있는지 매번 검사합니다. 다만 이는 언급 여부 검사이지 도구가 실제로 읽었다는 증명이 아니며, Gemini·Copilot·Cursor를 실제로 썼는지는 저장소에서 확인하지 못했습니다.",
      "The harness (pnpm harness:check) verifies every time that five adapters mention AGENTS.md and that 19 required files and seven policy passages remain. That is a mention check, not proof that a tool read the file, and the repository shows no sign that Gemini, Copilot or Cursor were actually used.",
    ),
  ],
  keyPoints: [
    t("규칙은 AGENTS.md 한 곳, 영역 규칙은 하위 9곳", "Rules in one AGENTS.md, area rules in nine more"),
    t("어댑터는 포인터만 두고 정책을 복사하지 않음", "Adapters only point; no policy is copied"),
    t("하네스가 어댑터 연결과 정책 문장을 매번 검사", "The harness checks adapter links and policy text every time"),
    t("읽도록 지시하는 것과 실제로 읽는 것은 다름", "Telling a tool to read is not proof it did"),
  ],
  diagram: AGENTS_MD_DIAGRAM,
  usage: [
    {
      feature: t("에이전트 작업 규칙(전 영역)", "Agent working rules (whole repository)"),
      role: t(
        "모든 AI 작업이 한글 기본·증거 우선·검증·배포 승인 규칙으로 시작합니다. 영역별 규칙은 가장 가까운 AGENTS.md가 더합니다.",
        "Every AI task starts from the same rules: Korean by default, evidence first, verification and release approval. The nearest nested AGENTS.md adds area rules.",
      ),
      paths: ["AGENTS.md", "apps/web/AGENTS.md", "apps/api/AGENTS.md", "docs/AGENTS.md", "scripts/AGENTS.md"],
    },
    {
      feature: t("도구별 어댑터", "Tool adapters"),
      role: t(
        "Claude·Gemini·Copilot·Cursor·OpenCode가 AGENTS.md를 읽도록 안내하는 짧은 파일입니다.",
        "Short files that send Claude, Gemini, Copilot, Cursor and OpenCode to AGENTS.md.",
      ),
      paths: [
        "CLAUDE.md",
        "GEMINI.md",
        ".github/copilot-instructions.md",
        ".cursor/rules/toonstudio.mdc",
        ".opencode/agent/toonstudio.md",
      ],
    },
    {
      feature: t("하네스 무결성 검사", "Harness integrity check"),
      role: t(
        "어댑터 어긋남·필수 파일 누락·정책 문장 삭제를 커밋 직전과 CI 사전 테스트에서 잡습니다.",
        "Catches adapter drift, missing files and deleted policy text before each commit and in CI's pre-install tests.",
      ),
      paths: ["scripts/agent-harness.mjs", "scripts/agent-harness.test.mjs", "docs/operations/agent-harness.md"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("어댑터 파일의 모양(GEMINI.md)", "Shape of an adapter file (GEMINI.md)"),
      language: "text",
      code: lines(
        "# Gemini CLI 저장소 지침",
        "이 파일은 도구용 어댑터다. 정책의 단일 기준은 루트 AGENTS.md다.",
        "- 작업 시작 전 루트와 가까운 AGENTS.md를 읽고 따른다.",
        "- 커밋·PR·문서·주석·결과 보고는 한글을 기본으로 한다.",
        "- 완료 전 pnpm harness:verify와 관련 영역 테스트를 실행한다.",
        "세부 규칙은 복제하지 않으며 충돌 시 AGENTS.md가 우선한다.",
      ),
      codeEn: lines(
        "# Gemini CLI repository instructions",
        "This file is a tool adapter. The single source of policy is the root AGENTS.md.",
        "- Before starting, read and follow the root and nearest AGENTS.md.",
        "- Commits, PRs, docs, comments and reports are in Korean by default.",
        "- Before finishing, run pnpm harness:verify and the relevant area tests.",
        "Detailed rules are not copied; AGENTS.md wins on conflict.",
      ),
      explain: t(
        "어댑터에는 정책이 없고 '어디를 읽을지'만 있습니다. 실제 파일은 이보다 항목이 조금 더 많지만 같은 구조입니다.",
        "An adapter holds no policy, only where to read it. The real file has a few more items but the same structure.",
      ),
      source: "GEMINI.md",
      verify: "none",
    },
    {
      kind: "teaching",
      title: t("어댑터가 정책에서 벗어났는지 찾기", "Finding adapters that drifted from the policy"),
      language: "ts",
      code: lines(
        'const ADAPTERS = ["CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"] as const;',
        "",
        "// read: 파일이 없으면 null 을 돌려주는 읽기 함수",
        "export function findDriftedAdapters(read: (path: string) => string | null): string[] {",
        "  return ADAPTERS.filter((path) => {",
        "    const text = read(path);",
        '    return text !== null && !text.includes("AGENTS.md");',
        "  });",
        "}",
      ),
      codeEn: lines(
        'const ADAPTERS = ["CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"] as const;',
        "",
        "// read: a reader that returns null when the file is missing",
        "export function findDriftedAdapters(read: (path: string) => string | null): string[] {",
        "  return ADAPTERS.filter((path) => {",
        "    const text = read(path);",
        '    return text !== null && !text.includes("AGENTS.md");',
        "  });",
        "}",
      ),
      explain: t(
        "하네스 검사의 아이디어입니다. 어댑터 파일이 있는데 AGENTS.md를 언급하지 않으면 어긋난 것으로 봅니다. 언급 여부만 보며 도구가 실제로 읽는지는 증명하지 않습니다. 실제 구현은 scripts/agent-harness.mjs의 inspectHarness입니다.",
        "The idea behind the harness check: an adapter that exists but does not mention AGENTS.md has drifted. It tests mention only and does not prove a tool reads it. The real implementation is inspectHarness in scripts/agent-harness.mjs.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "AGENTS.md",
      url: "https://agents.md/",
      kind: "guide",
      note: t("AGENTS.md 형식과 지원 도구 소개", "The format and the tools that support it"),
    },
    {
      title: "Claude Code · Memory",
      url: "https://code.claude.com/docs/en/memory",
      kind: "docs",
      note: t("CLAUDE.md와 AGENTS.md를 읽는 조건(기본값 포함)", "When Claude Code reads CLAUDE.md and AGENTS.md, defaults included"),
    },
    {
      title: "Codex · Custom instructions with AGENTS.md",
      url: "https://learn.chatgpt.com/docs/agent-configuration/agents-md",
      kind: "docs",
    },
    {
      title: "OpenCode · Rules",
      url: "https://opencode.ai/docs/rules/",
      kind: "docs",
      note: t("AGENTS.md가 있으면 CLAUDE.md보다 우선", "AGENTS.md takes precedence over CLAUDE.md"),
    },
    { title: "Cursor · Rules", url: "https://cursor.com/docs/rules", kind: "docs" },
    {
      title: "GitHub Copilot · Repository custom instructions",
      url: "https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions",
      kind: "docs",
    },
  ],
  chapterIds: ["ai-assisted-engineering", "quality"],
  talk: {
    pitch: t(
      "AI 도구가 여러 개라서 규칙을 도구마다 따로 쓰면 금방 서로 달라집니다. 그래서 우리는 규칙을 AGENTS.md 한 곳에 두고, 도구별 파일에는 '그 문서를 읽어라'만 적었습니다. 그 연결이 끊기지 않았는지는 자동 점검이 매번 확인합니다.",
      "With several AI tools, rules written per tool drift apart quickly. So we keep the rules in one AGENTS.md, and each tool's file only says 'read that document'. An automatic check confirms on every commit that the links still hold.",
    ),
    analogy: t(
      "건물마다 다른 규약집을 붙이는 대신, 규약집은 관리실에 한 권만 두고 각 층 안내판에는 '관리실 규약집을 보세요'라고 적어 두는 것과 같습니다.",
      "Instead of posting a different rulebook in every building, keep one at the management office and put a sign on each floor saying 'see the office rulebook'.",
    ),
    questions: [
      {
        question: t("AI가 정말 그 규칙을 읽나요?", "Does the AI really read those rules?"),
        answer: t(
          "도구마다 다릅니다. Codex와 OpenCode는 AGENTS.md를 직접 읽고, Claude Code는 안내 파일의 지시를 따라 읽습니다. 자동 점검은 안내 파일이 AGENTS.md를 언급하는지까지만 확인하므로, 최종 확인은 결과물을 검증하는 하네스·CI와 사람의 리뷰가 맡습니다.",
          "It depends on the tool. Codex and OpenCode read AGENTS.md directly; Claude Code reads it by following the instruction in its guide file. The automatic check only confirms that the guide file mentions AGENTS.md, so final assurance comes from the harness, CI and human review of the result.",
        ),
      },
      {
        question: t("도구를 바꾸거나 새로 추가하면요?", "What if a tool is replaced or added?"),
        answer: t(
          "AGENTS.md를 가리키는 얇은 파일만 추가합니다. 정책을 복사하지 않는 것이 원칙이고, 하네스의 필수 파일 목록과 테스트를 함께 고칩니다(docs/operations/agent-harness.md).",
          "Add only a thin file that points to AGENTS.md. Never copy policy, and update the harness's required-file list and tests together (docs/operations/agent-harness.md).",
        ),
      },
      {
        question: t("규칙끼리 부딪히면 무엇이 이기나요?", "Which rule wins when they conflict?"),
        answer: t(
          "AGENTS.md §1 순서입니다. 현재 대화의 사용자 지시, 가장 가까운 AGENTS.md, 루트 AGENTS.md, 승인된 ADR·아키텍처·운영 정책, 그 밖의 문서와 OpenWiki 순입니다.",
          "The order in AGENTS.md section 1: the user's request in the current conversation, the nearest AGENTS.md, the root AGENTS.md, accepted ADRs, architecture and operations policy, then other docs and OpenWiki.",
        ),
      },
    ],
    pitfall: t(
      "'AI가 규칙을 자동으로 지킨다'고 말하지 않습니다. 자동으로 확인되는 것은 어댑터 연결과 정책 문장의 존재이고, Gemini·Copilot·Cursor를 실제로 썼는지는 저장소에서 확인하지 못했습니다.",
      "Do not say the AI follows the rules automatically. What is checked automatically is the adapter links and the existence of policy text, and the repository does not show whether Gemini, Copilot or Cursor were actually used.",
    ),
  },
  technologies: ["AGENTS.md", "CLAUDE.md", "Gemini CLI", "GitHub Copilot", "Cursor", "OpenCode", "Codex"],
  facts: [
    {
      value: "10",
      label: t("하네스가 필수로 확인하는 AGENTS.md 파일 수(루트 1 + 영역 9)", "AGENTS.md files the harness requires (1 root + 9 area)"),
      source: "scripts/agent-harness.mjs",
    },
    {
      value: "7",
      label: t("하네스가 지키는 AGENTS.md 필수 문장 수", "Required AGENTS.md passages the harness enforces"),
      source: "scripts/agent-harness.mjs",
    },
  ],
  reviewedAt: "2026-10-07",
};

/* ───────────────────────── 2. OpenWiki와 사실 우선순위 ───────────────────────── */

const OPENWIKI_DIAGRAM: EngineeringDiagram = {
  id: "openwiki-fact-precedence-diagram",
  kind: "layers",
  title: t("충돌하면 위쪽이 이긴다", "On conflict, the upper layer wins"),
  caption: t(
    "OpenWiki는 코드를 찾아가는 길잡이이며, 사실 판정은 소스·테스트가 먼저입니다.",
    "OpenWiki is a guide to the code; source and tests decide what is true.",
  ),
  alt: t(
    "사실을 판정하는 순서를 위에서 아래로 보여줍니다. 소스 코드와 테스트가 가장 위, 그다음 승인된 ADR, 아키텍처 문서, 가장 아래가 OpenWiki입니다. 두 자료가 충돌하면 위쪽이 이기고 아래쪽 문서를 고칩니다.",
    "The fact-finding order from top to bottom: source code and tests first, then accepted ADRs, architecture docs and, at the bottom, OpenWiki. When two sources conflict, the upper one wins and the lower document is corrected.",
  ),
  layers: [
    {
      id: "code",
      label: t("소스 코드·테스트", "Source code and tests"),
      sub: t("지금 실제로 동작하는 것", "What actually runs today"),
      tone: "local",
      chips: ["Vitest", "Playwright"],
    },
    {
      id: "adr",
      label: t("승인된 ADR", "Accepted ADRs"),
      sub: t("그때 왜 그렇게 정했는지(결정 기록)", "Why it was decided that way (decision records)"),
      tone: "neutral",
      chips: ["ADR"],
    },
    {
      id: "arch",
      label: t("아키텍처 문서", "Architecture docs"),
      sub: t("현재 구조와 목표 구조", "Current and target structure"),
      tone: "neutral",
      chips: ["ARCHITECTURE.md"],
    },
    {
      id: "wiki",
      label: t("OpenWiki", "OpenWiki"),
      sub: t("빠른 탐색을 돕는 설명(가장 낮은 권위)", "Explanations for quick navigation (lowest authority)"),
      tone: "ai",
      chips: ["openwiki", "MCP"],
    },
  ],
  brackets: [
    {
      label: t("충돌하면 위쪽이 이깁니다", "On conflict, the upper layer wins"),
      layerIds: ["code", "adr", "arch", "wiki"],
    },
  ],
};

const OPENWIKI_FACT_PRECEDENCE: EngineeringAtlasEntry = {
  id: "openwiki-fact-precedence",
  category: "platform-ops",
  name: "OpenWiki",
  title: t("코드가 먼저, 위키는 길잡이", "Code first, the wiki as a guide"),
  status: "configured",
  tagline: t(
    "OpenWiki는 코드를 찾아가는 길잡이일 뿐, 사실 판정은 코드·테스트가 먼저입니다.",
    "OpenWiki guides you to the code; code and tests decide what is true.",
  ),
  background: [
    t(
      "AI는 문서를 그럴듯하게 쓰지만 그 문서가 코드와 맞는지는 스스로 알지 못합니다. 낡은 설명을 사실로 믿고 작업하면 없는 기능을 고치려 하거나 이미 바뀐 규칙을 따릅니다. 그래서 이 저장소는 두 자료가 어긋날 때 어느 쪽이 틀렸다고 판정되는지를 미리 정해 두었습니다.",
      "AI writes plausible documents but cannot tell by itself whether they match the code. Trusting a stale explanation leads to fixing features that do not exist or following rules that have changed. So this repository decides in advance which source is judged wrong when two disagree.",
    ),
    t(
      "사실 판정 순서는 소스·테스트, 승인된 ADR(결정 기록), 아키텍처 문서, OpenWiki입니다(AGENTS.md §1). OpenWiki는 외부 CLI(openwiki)가 코드를 읽어 만드는 연결된 Markdown 위키이며, 저장소에는 스킬 1개(.agents/skills/openwiki), Codex용 MCP 연결 블록, 안내 문서 5쪽이 있습니다. 문서마다 현재·마이그레이션·목표·레거시 상태를 밝힙니다.",
      "The fact-finding order is source and tests, then accepted ADRs (decision records), then architecture docs, then OpenWiki (AGENTS.md section 1). OpenWiki is an external CLI that reads the code and produces a linked Markdown wiki. The repository holds one skill (.agents/skills/openwiki), an MCP block for Codex and five orientation pages, each marked current, migrating, target or legacy.",
    ),
    t(
      "스킬은 에이전트가 위키를 만들 때의 절차서입니다. 계획을 제출하고, 배정된 한 쪽만 쓰고, 주장마다 코드 위치(repo:// 증거)를 달아 제출한 뒤 마무리합니다. 소스 코드는 고치지 않고 저장소 내용은 명령이 아니라 증거로만 다룹니다. 갱신은 GitHub Actions가 주 1회 돌리되 키·토큰·제공자·모델 4개 설정이 모두 있어야 하며, 결과 PR은 자동 병합하지 않습니다.",
      "The skill is the procedure agents follow when writing the wiki: submit a plan, write only the assigned page, attach code locations (repo:// evidence) to each claim, then finish. It never edits source and treats repository content as evidence rather than instructions. A weekly GitHub Actions job runs the update only when four settings (key, token, provider, model) exist, and its PR is never auto-merged.",
    ),
    t(
      "한계도 분명합니다. 현재 openwiki/의 5쪽에는 생성 산출물(검증 기록·색인)이나 규약 머리말이 없어 수기로 관리되는 문서로 보이고, 주간 갱신이 실제로 PR을 낸 적이 있는지는 저장소에서 확인하지 못했습니다. README·ARCHITECTURE는 기계 원장과 역사 자료까지 넣어 ADR과 아키텍처 문서의 순서를 AGENTS.md와 다르게 적습니다.",
      "The limits are clear too. The five pages in openwiki/ carry no generated artifacts (verification records, indexes) or convention headers, so they appear hand-maintained, and the repository does not show whether the weekly update ever opened a PR. README and ARCHITECTURE also add machine ledgers and historical reports and order ADRs and architecture docs differently from AGENTS.md.",
    ),
  ],
  keyPoints: [
    t("충돌하면 소스·테스트가 이기고 OpenWiki가 가장 낮음", "On conflict, source and tests win; OpenWiki ranks last"),
    t("스킬은 계획 → 한 쪽 작성 → 증거 제출 → 마무리", "The skill is plan, write one page, submit evidence, finish"),
    t("주 1회 갱신 PR, 자동 병합 없음, 설정 4개 필요", "Weekly update PR, no auto-merge, four settings needed"),
  ],
  diagram: OPENWIKI_DIAGRAM,
  usage: [
    {
      feature: t("에이전트 사실 판정 규칙", "Agent fact-finding rule"),
      role: t(
        "문서와 코드가 다르면 소스·테스트를 먼저 믿고 문서를 고치게 합니다. 저장소 문서도 같은 순서로 읽습니다.",
        "When docs and code disagree, agents trust source and tests first and fix the document. Repository docs are read in the same order.",
      ),
      paths: ["AGENTS.md", "docs/README.md", "ARCHITECTURE.md"],
    },
    {
      feature: t("OpenWiki 스킬·MCP 연결", "OpenWiki skill and MCP link"),
      role: t(
        "Codex가 위키를 만들거나 고칠 때 따르는 절차(스킬)와, 위키를 도구로 부르는 MCP 연결 블록입니다.",
        "The procedure Codex follows to build or update the wiki (the skill) and the MCP block that exposes the wiki as a tool.",
      ),
      paths: [
        ".agents/skills/openwiki/SKILL.md",
        ".agents/skills/openwiki/.openwiki-install.json",
        ".codex/config.toml",
        ".openwikiignore",
      ],
    },
    {
      feature: t("안내 문서 5쪽", "Five orientation pages"),
      role: t(
        "빠른 시작·저장소 지도·의존 방향·Admin·작성 규칙입니다. 문서 원장이 존재·한글·링크를 검사합니다.",
        "Quickstart, repository map, dependency direction, Admin and writing rules. The documentation ledger checks existence, Korean text and links.",
      ),
      paths: ["openwiki/quickstart.md", "openwiki/INSTRUCTIONS.md", "config/documentation-authority.json"],
    },
    {
      feature: t("주간 갱신 워크플로", "Weekly update workflow"),
      role: t(
        "일요일 18:30 UTC에 OpenWiki를 돌려 갱신 PR을 만듭니다. 설정이 없으면 건너뛰고, 병합은 사람이 합니다.",
        "Runs OpenWiki on Sundays at 18:30 UTC and opens an update PR. It skips when settings are missing, and a person merges.",
      ),
      paths: [".github/workflows/openwiki-update.yml"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("위키 갱신 수명주기(스킬)", "Wiki update lifecycle (the skill)"),
      language: "text",
      code: lines(
        "openwiki_begin(root, mode)      # 변경이 없으면 noop 으로 바로 끝",
        "openwiki_submit_plan(pages)     # 쪽 목록과 목적을 확정",
        "반복:",
        "  openwiki_next_page            # 배정된 한 쪽만 받음",
        "  (코드·테스트를 읽고 그 쪽만 작성)",
        "  openwiki_submit_page(claims)  # 주장마다 repo://경로#L시작-L끝 증거",
        "openwiki_finish                 # 여기서만 완료 보고",
      ),
      codeEn: lines(
        "openwiki_begin(root, mode)      # ends at once with noop when nothing changed",
        "openwiki_submit_plan(pages)     # fix the page list and purposes",
        "repeat:",
        "  openwiki_next_page            # receive exactly one assigned page",
        "  (read code and tests, write only that page)",
        "  openwiki_submit_page(claims)  # each claim carries repo://path#Lstart-Lend evidence",
        "openwiki_finish                 # the only place to report completion",
      ),
      explain: t(
        "SKILL.md가 정한 호출 순서를 줄여 옮겼습니다. 에이전트는 한 번에 한 쪽만 쓰고, 완료는 마지막 호출에서만 보고합니다.",
        "A condensed copy of the call order defined in SKILL.md. The agent writes one page at a time and reports completion only on the last call.",
      ),
      source: ".agents/skills/openwiki/SKILL.md",
      verify: "none",
    },
    {
      kind: "teaching",
      title: t("주간 갱신: 설정이 없으면 건너뜀", "Weekly update: skipped when settings are missing"),
      language: "yaml",
      code: lines(
        "on:",
        "  workflow_dispatch:                # 수동 실행도 가능",
        "  schedule:",
        '    - cron: "30 18 * * 0"           # 일요일 18:30 UTC, 매일이 아니라 주 1회',
        "jobs:",
        "  update:",
        "    steps:",
        "      - name: 설정 확인             # 키·토큰·제공자·모델 중 하나라도 없으면 건너뜀",
        "      - name: 위키 갱신             # 설정이 있을 때만 openwiki --update 실행",
        "      - name: 갱신 PR 만들기        # 브랜치 openwiki/update, 자동 병합 없음",
      ),
      codeEn: lines(
        "on:",
        "  workflow_dispatch:                # manual runs are possible too",
        "  schedule:",
        '    - cron: "30 18 * * 0"           # Sundays 18:30 UTC, weekly rather than daily',
        "jobs:",
        "  update:",
        "    steps:",
        "      - name: Check settings        # skipped if any of key, token, provider or model is missing",
        "      - name: Update the wiki       # runs openwiki --update only when settings exist",
        "      - name: Open the update PR    # branch openwiki/update, no auto-merge",
      ),
      explain: t(
        "실제 워크플로의 뼈대만 남긴 교육용 윤곽입니다(각 단계의 실행 명령은 생략). 비용을 묶기 위해 주 1회로 돌리고, 설정이 없으면 건너뛰며, 결과는 PR로만 올라옵니다.",
        "A teaching outline of the real workflow with the commands of each step omitted. It runs weekly to bound cost, skips without settings, and only ever lands as a PR.",
      ),
      verify: "none",
    },
  ],
  links: [
    {
      title: "OpenWiki (GitHub)",
      url: "https://github.com/langchain-ai/openwiki",
      kind: "repo",
      note: t("코드베이스에서 연결된 Markdown 위키를 만드는 CLI(MIT)", "A CLI that builds a linked Markdown wiki from a codebase (MIT)"),
    },
    {
      title: "Model Context Protocol · Specification",
      url: "https://modelcontextprotocol.io/specification/latest",
      kind: "spec",
    },
    {
      title: "Codex · Model Context Protocol",
      url: "https://learn.chatgpt.com/docs/extend/mcp",
      kind: "docs",
      note: t("프로젝트의 MCP 서버 연결 방법", "How MCP servers are connected"),
    },
    {
      title: "Architecture Decision Records",
      url: "https://adr.github.io/",
      kind: "guide",
      note: t("결정 기록(ADR)이 무엇인지", "What an architecture decision record is"),
    },
    {
      title: "GitHub Actions · Events that trigger workflows",
      url: "https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows",
      kind: "docs",
      note: t("schedule 이벤트와 수동 실행", "The schedule event and manual runs"),
    },
  ],
  chapterIds: ["ai-assisted-engineering", "architecture"],
  talk: {
    pitch: t(
      "문서가 코드보다 앞서 말하면 AI도 사람도 잘못된 곳을 고칩니다. 그래서 규칙을 하나 정했습니다. 충돌하면 코드와 테스트가 이기고, 위키는 코드를 찾아가는 길잡이일 뿐입니다. OpenWiki는 그 길잡이를 AI가 만들고 유지하게 돕는 도구이고, 갱신은 주 1회 PR로만 올라옵니다.",
      "When a document speaks ahead of the code, both AI and people fix the wrong thing. So we set one rule: on conflict, code and tests win, and the wiki is only a guide to the code. OpenWiki helps AI build and maintain that guide, and updates arrive weekly as a PR only.",
    ),
    analogy: t(
      "여행 가이드북과 실제 지도의 관계입니다. 가이드북이 길을 안내해 주지만, 가이드북과 도로가 다르면 도로를 믿습니다.",
      "Like a guidebook and the real map: the guidebook points the way, but when it disagrees with the road, you trust the road.",
    ),
    questions: [
      {
        question: t("OpenWiki가 AI 모델을 쓰나요? 비용은요?", "Does OpenWiki use an AI model? What does it cost?"),
        answer: t(
          "갱신은 외부 AI 제공자의 키가 필요한 작업이라, 비용을 묶으려고 매일이 아니라 주 1회로 정했고 키·토큰·제공자·모델 설정이 없으면 건너뜁니다. 어떤 모델을 쓰는지는 저장소 변수에 있어 저장소만으로는 확인할 수 없습니다.",
          "Updating needs a key from an external AI provider, so it runs weekly rather than daily to bound cost and is skipped when the key, token, provider or model setting is missing. Which model it uses lives in repository variables and cannot be seen from the repository itself.",
        ),
      },
      {
        question: t("위키가 틀리면 어떻게 하나요?", "What if the wiki is wrong?"),
        answer: t(
          "코드와 테스트가 이기므로 위키가 틀린 것으로 보고 고칩니다. 안내 문서 5쪽은 존재·한글·링크를 검사하지만 내용의 정확성까지 자동으로 보증하지는 않아서, 의심되면 코드를 직접 확인합니다.",
          "Code and tests win, so the wiki is treated as wrong and corrected. The five pages are checked for existence, Korean text and links but not for factual accuracy, so when in doubt, read the code.",
        ),
      },
      {
        question: t("위키가 자동으로 코드를 고치나요?", "Does the wiki change code by itself?"),
        answer: t(
          "아니요. 스킬은 소스 수정을 금지하고, 갱신 결과는 PR로 올라오며 자동 병합하지 않습니다.",
          "No. The skill forbids editing source, and update results arrive as a PR that is never auto-merged.",
        ),
      },
    ],
    pitfall: t(
      "OpenWiki가 '자동으로 돌고 있다'고 말하지 않습니다. 설정 파일은 있지만 키 설정과 실행 기록은 저장소에서 확인하지 못했고, 현재 5쪽은 수기 문서로 보입니다. ADR과 아키텍처 문서의 순서는 문서마다 다르게 적혀 있으니 순서를 단정할 때는 AGENTS.md §1을 인용하세요.",
      "Do not say OpenWiki is 'running automatically'. The workflow file exists, but key settings and run records cannot be seen from the repository, and the current five pages appear hand-maintained. Documents order ADRs and architecture docs differently, so cite AGENTS.md section 1 when stating the order.",
    ),
  },
  technologies: ["OpenWiki", "MCP", "Codex", "GitHub Actions", "ADR"],
  facts: [
    {
      value: "5",
      label: t("openwiki/ 폴더의 Markdown 파일 수", "Markdown files in the openwiki/ folder"),
      source: "openwiki",
    },
    {
      value: "0.5.2",
      label: t("저장소가 고정한 openwiki 버전", "openwiki version pinned in the repository"),
      source: ".agents/skills/openwiki/.openwiki-install.json",
    },
    {
      value: "30 18 * * 0",
      label: t("주간 갱신 크론(UTC, 일요일 18:30)", "Weekly update cron (UTC, Sunday 18:30)"),
      source: ".github/workflows/openwiki-update.yml",
    },
  ],
  reviewedAt: "2026-10-07",
};

/* ───────────────────────── 3. 하네스 검증 게이트 ───────────────────────── */

const HARNESS_GATES_DIAGRAM: EngineeringDiagram = {
  id: "agent-harness-verify-gates-diagram",
  kind: "graph",
  title: t("AI 변경이 지나는 문들", "Gates an AI change passes"),
  caption: t(
    "완료는 AI의 말이 아니라 하네스·훅·CI가 순서대로 통과시킨 결과이고, 배포는 그 뒤 별도 승인입니다.",
    "'Done' is the result of the harness, hooks and CI passing in order, and release is a separate approval after that.",
  ),
  alt: t(
    "작업 변경은 먼저 harness:verify로 점검하고, 커밋 훅과 푸시 훅을 거쳐 PR의 CI core 검사를 통과해야 합니다. 이어서 사람이 리뷰하고, 운영 배포는 별도 승인 뒤에만 합니다. 점검이나 훅에서 막히면 고쳐서 다시 시도합니다.",
    "A change is first checked with harness:verify, then passes the commit hook, the push hook and the CI core checks on the PR. A person then reviews it, and production release happens only after a separate approval. If a check or hook blocks it, the change is fixed and retried.",
  ),
  nodes: [
    { id: "change", label: t("작업 변경", "Change"), sub: t("사람 또는 에이전트", "Person or agent"), tone: "neutral", shape: "pill", at: [0, 0] },
    { id: "verify", label: t("harness:verify", "harness:verify"), sub: t("변경 범위별 점검", "Checks by scope"), tone: "good", at: [1, 0] },
    { id: "commit", label: t("커밋 훅", "Commit hook"), sub: t("하네스·lint·한글 제목", "Harness, lint, subject"), tone: "local", at: [2, 0] },
    { id: "push", label: t("푸시 훅", "Push hook"), sub: t("아키텍처·타입·lint", "Architecture, types, lint"), tone: "local", at: [3, 0] },
    { id: "ci", label: t("CI core", "CI core"), sub: t("필수 7개 검사", "7 required checks"), tone: "server", at: [4, 0] },
    { id: "review", label: t("사람 리뷰", "Human review"), tone: "warn", shape: "diamond", at: [5, 0] },
    { id: "fix", label: t("실패 → 수정", "Fail → fix"), tone: "warn", at: [1, 1] },
    { id: "deploy", label: t("운영 배포", "Release"), sub: t("별도 명시 승인", "Separate approval"), tone: "warn", shape: "pill", at: [5, 1] },
  ],
  edges: [
    { from: "change", to: "verify", label: t("완료 전", "Before done") },
    { from: "verify", to: "commit", label: t("통과", "Pass") },
    { from: "commit", to: "push", label: t("통과", "Pass") },
    { from: "push", to: "ci", label: t("PR", "PR") },
    { from: "ci", to: "review", label: t("7개 통과", "7 pass") },
    { from: "review", to: "deploy", label: t("별도 승인", "Approval") },
    { from: "verify", to: "fix", style: "dashed", label: t("실패", "Fail") },
    { from: "commit", to: "fix", style: "dashed", label: t("거부", "Rejected") },
    { from: "fix", to: "change", style: "dashed", label: t("다시 시도", "Retry") },
  ],
};

const AGENT_HARNESS_VERIFY_GATES: EngineeringAtlasEntry = {
  id: "agent-harness-verify-gates",
  category: "platform-ops",
  name: "agent-harness",
  title: t("AI의 '다 했어요'를 확인하는 문", "Gates that check an AI's “done”"),
  status: "live",
  tagline: t(
    "하네스와 훅·CI가 AI가 만든 변경도 사람의 변경과 같은 문으로 통과시킵니다.",
    "Hooks, the harness and CI pass AI-made changes through the same gates as anyone's.",
  ),
  background: [
    t(
      "AI는 '다 했습니다'라고 자신 있게 말하지만 실제로 돌려 본 것인지는 알 수 없습니다. 사람이 매번 전부 확인하기는 어렵기 때문에 확인을 사람의 기억이 아니라 스크립트에 맡겼습니다. 공항 보안 검색처럼 가방이 누구 것이든 같은 게이트를 지나야 합니다.",
      "An AI says 'done' with confidence, but you cannot tell whether anything was actually run. People cannot re-check everything each time, so the checking is delegated to scripts rather than memory. Like airport security, every bag goes through the same gate whoever carries it.",
    ),
    t(
      "게이트는 네 겹입니다. ① 작업자가 pnpm harness:verify로 바뀐 파일 범위를 점검합니다(하네스 검사·lockfile·lint·비밀값, 앱·패키지면 아키텍처 검사, TS면 타입). ② 커밋 훅이 하네스 무결성·lint-staged·한글 제목 규칙을 검사합니다. ③ 푸시 훅이 하네스 테스트·아키텍처·타입·lint를 확인합니다. ④ PR에서는 CI core가 lint·타입·회귀·성능·접근성·빌드·DB 7개를 모두 실제로 통과시켜야 합니다.",
      "There are four layers. (1) The worker runs pnpm harness:verify on the changed files: harness check, lockfile, lint and secrets, plus architecture checks for app or package changes and types for TypeScript. (2) The commit hook checks harness integrity, lint-staged and the Korean subject rule. (3) The push hook runs harness tests, architecture, types and lint. (4) On a PR, CI core passes only when all seven checks (lint, types, regression, performance, accessibility, build, database) truly succeed.",
    ),
    t(
      "이렇게 나눈 이유는 중복 비용과 신뢰의 균형입니다. 예전에는 커밋 훅이 전체 타입 검사를 돌려 무관한 파일의 오류가 커밋을 막았고, 푸시 훅은 20~45분 걸리는 전체 체인을 돌렸습니다. 그래서 가벼운 검사는 로컬 훅에, 무거운 보증은 CI 한 곳에 두었습니다. 우회(--no-verify)는 AGENTS.md가 금지하고 CI가 같은 검사를 다시 합니다.",
      "The split balances duplicated cost against trust. The commit hook once ran a full type check, so errors in unrelated files blocked commits, and the push hook ran a 20 to 45 minute chain. Light checks now run in local hooks and heavy assurance lives in CI. AGENTS.md forbids bypassing with --no-verify, and CI repeats the same checks.",
    ),
    t(
      "한계: harness:verify는 변경 범위 기반의 빠른 게이트라서 UI·API 변경에는 브라우저·통합 테스트가 더 필요하다는 안내만 출력하고, 전체 보증은 pnpm verify:push와 CI의 몫입니다. 앱 경계 상한(래칫)은 숫자를 고치면 바뀌므로 그 변경은 사람이 리뷰해야 합니다. AI 리뷰 봇은 설정돼 있지만 2026-10-08에 본 최근 PR에는 건너뜀·한도 안내만 있어 실제 관문은 CI와 사람 리뷰입니다.",
      "Limits: harness:verify is a fast gate scoped to changes. For UI or API changes it only prints a reminder that browser or integration tests are needed, and full assurance belongs to pnpm verify:push and CI. Ceilings such as the app-boundary ratchet change when their numbers are edited, so those edits need human review. AI review bots are configured, but recent PRs seen on 2026-10-08 show only skip or limit notices, so the real gates are CI and human review.",
    ),
  ],
  keyPoints: [
    t("변경 범위에 맞춰 lint·비밀값·아키텍처·타입을 골라 검사", "Picks lint, secrets, architecture and types by change scope"),
    t("한글 제목 커밋 규칙을 훅과 CI가 두 번 확인", "Hooks and CI both enforce Korean commit subjects"),
    t("CI core: 필수 7개가 모두 실제 성공해야 통과", "CI core passes only if all seven checks truly succeed"),
    t("운영 배포는 이 문들과 별개로 사람의 승인", "Production release stays a separate human approval"),
  ],
  diagram: HARNESS_GATES_DIAGRAM,
  usage: [
    {
      feature: t("작업 마무리 점검", "End-of-task check"),
      role: t(
        "pnpm harness:verify가 바뀐 파일을 모아 lint·비밀값·(조건부) 아키텍처·타입 검사를 실행합니다. --staged와 --full 옵션이 있습니다.",
        "pnpm harness:verify gathers the changed files and runs lint, secret scan and, when relevant, architecture and type checks. --staged and --full options exist.",
      ),
      paths: ["scripts/agent-harness.mjs", "scripts/agent-harness.test.mjs", "docs/operations/agent-harness.md"],
    },
    {
      feature: t("커밋·푸시 훅", "Commit and push hooks"),
      role: t(
        "하네스 무결성, lint-staged, 한글 제목(commitlint), 푸시 전 아키텍처·타입·lint를 로컬에서 먼저 막습니다.",
        "Block problems locally first: harness integrity, lint-staged, Korean subjects (commitlint) and architecture, types and lint before a push.",
      ),
      paths: [".husky/pre-commit", ".husky/pre-push", ".husky/commit-msg", "commitlint.config.cjs"],
    },
    {
      feature: t("PR 관문(CI core)", "PR gate (CI core)"),
      role: t(
        "필수 7개 검사가 모두 실제로 성공해야 core가 통과합니다. 접근성(axe)과 비밀값 검사도 여기에 있습니다.",
        "core passes only if all seven required checks truly succeed, including accessibility (axe) and the secret scan.",
      ),
      paths: [".github/workflows/ci.yml", "e2e/a11y-smoke.spec.ts", ".github/pull_request_template.md"],
    },
    {
      feature: t("경계·문서 검사", "Boundary and doc checks"),
      role: t(
        "앱 사이 직접 import, 퇴역한 Vercel 설정의 재등장, 깨진 문서 링크를 스크립트가 막습니다.",
        "Scripts block direct imports across apps, the return of retired Vercel config and broken doc links.",
      ),
      paths: ["scripts/validate-architecture.mjs", "config/architecture-boundary-ratchet.json", "scripts/validate-documentation.mjs"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("하네스 명령 모음", "Harness commands"),
      language: "bash",
      code: lines(
        "pnpm harness:doctor                        # 도구 버전·훅 연결 진단",
        "pnpm harness:check                         # 필수 파일·어댑터 연결·정책 문장 검사",
        "pnpm harness:verify                        # 현재 변경 범위 점검",
        "pnpm harness:verify -- --staged            # 커밋 전: 스테이징한 파일만",
        "pnpm harness:verify -- --base=origin/main  # 기준 브랜치와 비교",
        "pnpm harness:verify -- --full              # 루트 테스트·보안·라이선스 검사 추가",
      ),
      codeEn: lines(
        "pnpm harness:doctor                        # diagnose tool versions and hook wiring",
        "pnpm harness:check                         # required files, adapter links, policy text",
        "pnpm harness:verify                        # check the current change scope",
        "pnpm harness:verify -- --staged            # before a commit: staged files only",
        "pnpm harness:verify -- --base=origin/main  # compare against a base branch",
        "pnpm harness:verify -- --full              # add root tests, security and license audits",
      ),
      explain: t(
        "docs/operations/agent-harness.md의 명령 표를 옮겼습니다. 같은 도구를 가볍게(check)부터 넓게(--full)까지 쓰는 방법입니다.",
        "The command table from docs/operations/agent-harness.md, from light (check) to broad (--full) use of the same tool.",
      ),
      source: "docs/operations/agent-harness.md",
      verify: "none",
    },
    {
      kind: "simplified",
      title: t("바뀐 파일로 검사 고르기", "Choosing gates from changed files"),
      language: "ts",
      code: lines(
        "interface Gates { docsOnly: boolean; typecheck: boolean; architecture: boolean }",
        "",
        "export function classifyChanges(files: readonly string[]): Gates {",
        '  const docsOnly = files.length > 0 && files.every((f) => f.endsWith(".md") || f.startsWith("docs/"));',
        "  const typecheck = files.some((f) => /\\.(ts|tsx|mts|cts)$/u.test(f));",
        '  const architecture = files.some((f) => f.startsWith("apps/") || f.startsWith("packages/"));',
        "  return { docsOnly, typecheck, architecture };",
        "}",
        "// 문서만 바뀌면 타입 검사를 건너뛰고, apps/·packages/ 가 바뀌면 아키텍처 검사를 켠다.",
      ),
      codeEn: lines(
        "interface Gates { docsOnly: boolean; typecheck: boolean; architecture: boolean }",
        "",
        "export function classifyChanges(files: readonly string[]): Gates {",
        '  const docsOnly = files.length > 0 && files.every((f) => f.endsWith(".md") || f.startsWith("docs/"));',
        "  const typecheck = files.some((f) => /\\.(ts|tsx|mts|cts)$/u.test(f));",
        '  const architecture = files.some((f) => f.startsWith("apps/") || f.startsWith("packages/"));',
        "  return { docsOnly, typecheck, architecture };",
        "}",
        "// Docs-only changes skip the type check; changes under apps/ or packages/ switch on architecture checks.",
      ),
      explain: t(
        "classifyChangedFiles를 줄여 옮긴 것입니다. 원본은 UI·API·의존성 변경까지 더 많은 갈래를 나눕니다. 핵심은 모든 변경에 모든 검사를 돌리지 않고 범위에 맞게 고른다는 점입니다.",
        "A condensed version of classifyChangedFiles; the original separates more cases such as UI, API and dependency changes. The point is to pick checks by scope instead of running everything on every change.",
      ),
      source: "scripts/agent-harness.mjs",
      verify: "types",
    },
  ],
  links: [
    { title: "Husky", url: "https://typicode.github.io/husky/", kind: "docs", note: t("Git 훅 관리", "Managing Git hooks") },
    { title: "commitlint", url: "https://commitlint.js.org/", kind: "docs", note: t("커밋 메시지 규칙 검사", "Checking commit message rules") },
    { title: "Conventional Commits 1.0.0 (한국어)", url: "https://www.conventionalcommits.org/ko/v1.0.0/", kind: "spec" },
    { title: "Secretlint", url: "https://github.com/secretlint/secretlint", kind: "repo", note: t("비밀값 패턴 검사", "Secret pattern linting") },
    { title: "lint-staged", url: "https://github.com/lint-staged/lint-staged", kind: "repo" },
    { title: "Playwright · Accessibility testing", url: "https://playwright.dev/docs/accessibility-testing", kind: "docs" },
  ],
  chapterIds: ["ai-assisted-engineering", "quality", "delivery"],
  talk: {
    pitch: t(
      "AI가 '다 했습니다'라고 말해도 믿지 않고 확인합니다. 작업자는 harness:verify를 돌리고, 커밋과 푸시에서 훅이 한 번 더 막고, PR에서는 CI core가 일곱 가지를 모두 통과해야 합니다. 이 문들을 AI가 만든 변경도 사람이 만든 변경도 똑같이 지나갑니다. 운영 배포는 이 문들과 별개로 사람이 따로 승인합니다.",
      "Even when an AI says 'done', we check instead of trusting. The worker runs harness:verify, the hooks block again at commit and push, and on a PR CI core must pass all seven checks. AI-made and human-made changes pass the same gates, and production release is a separate approval by a person.",
    ),
    analogy: t(
      "공항 보안 검색과 같습니다. 가방이 누구 것이든 같은 검색대를 통과하고, 비행기에 타는 것(배포)은 또 다른 확인입니다.",
      "Like airport security: every bag goes through the same scanner whoever owns it, and boarding the plane (release) is another check.",
    ),
    questions: [
      {
        question: t("AI가 훅을 우회하면요?", "What if the AI bypasses the hooks?"),
        answer: t(
          "AGENTS.md가 --no-verify와 CI 우회를 금지하고, CI가 PR에서 같은 검사를 다시 실행하므로 로컬 우회만으로 같은 검사를 피할 수는 없습니다. 다만 검사 기준 자체를 바꾸는 변경(예: 상한 수치 조정)은 사람의 리뷰가 필요합니다.",
          "AGENTS.md forbids --no-verify and CI bypasses, and CI reruns the same checks on the PR, so a local bypass alone cannot skip them. Changes to the criteria themselves, such as adjusting a ceiling number, still need human review.",
        ),
      },
      {
        question: t("그럼 테스트가 전부 통과했다는 뜻인가요?", "Does that mean every test passed?"),
        answer: t(
          "아닙니다. harness:verify는 바뀐 범위의 빠른 점검이고, CI core의 초록불도 전체 시험 통과 주장이 아니라고 워크플로 주석에 적혀 있습니다. 전체 보증은 pnpm verify:push와 CI 진단 워크플로가 맡습니다.",
          "No. harness:verify is a quick check of the changed scope, and the workflow notes say a green CI core is not a full-suite claim. Full assurance belongs to pnpm verify:push and the CI diagnostic workflows.",
        ),
      },
      {
        question: t("검사가 얼마나 걸리나요?", "How long do the checks take?"),
        answer: t(
          "변경 범위에 따라 다릅니다. 그래서 하네스는 바뀐 파일만 고르고 전체 체인은 CI 한 곳에서만 돌립니다. 푸시 훅이 20~45분 걸리던 전체 체인을 돌려 CI로 옮긴 이유가 .husky/pre-push 주석에 기록돼 있습니다.",
          "It depends on the scope. That is why the harness picks only changed files and the full chain runs in CI alone. The reason for moving the 20 to 45 minute chain from the push hook to CI is recorded in the comments of .husky/pre-push.",
        ),
      },
    ],
    pitfall: t(
      "'AI가 알아서 배포한다'는 말은 사실이 아닙니다. 배포는 AGENTS.md §8에 따라 사람의 별도 명시 승인과 승인된 SHA가 필요합니다. 또 하네스가 확인하는 것은 연결과 무결성이고, 커밋 문구와 코드 품질은 commitlint·lint·타입 검사가 맡습니다.",
      "It is untrue that an AI deploys by itself. Under AGENTS.md section 8, release needs a separate explicit human approval and an approved SHA. The harness checks wiring and integrity, while commit wording and code quality belong to commitlint, lint and type checks.",
    ),
  },
  technologies: ["Husky", "commitlint", "lint-staged", "Secretlint", "GitHub Actions", "Playwright", "@axe-core/playwright", "ESLint"],
  facts: [
    {
      value: "19",
      label: t("하네스가 확인하는 필수 파일 수", "Required files the harness checks"),
      source: "scripts/agent-harness.mjs",
    },
    {
      value: "7",
      label: t("CI core가 요구하는 필수 검사 수", "Checks CI core requires"),
      source: ".github/workflows/ci.yml",
    },
    {
      value: "10 · 4",
      label: t("접근성 검사 경로 수(데스크톱 · 모바일)", "Routes in the accessibility check (desktop · mobile)"),
      source: "e2e/a11y-smoke.spec.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_AI_DEV: readonly EngineeringAtlasEntry[] = [
  AGENTS_MD_SINGLE_POLICY,
  OPENWIKI_FACT_PRECEDENCE,
  AGENT_HARNESS_VERIFY_GATES,
  ...ENGINEERING_ATLAS_AI_DEV_LOOP,
];
