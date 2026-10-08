import type { EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 지도 · ai-dev 의 행. 한 행은 "AI 개발 도구 구성 하나"를 4개 칸(종류·무엇을·어디서·안전장치)으로 설명한다.
 * 기준: 2026-10-07 코드 읽기와 공식 문서 확인. 상태는 정직하게 쓴다.
 * - live: 저장소의 검증 파이프라인(훅·CI)에서 실제로 실행되거나, 사용 흔적이 저장소에 남은 것
 * - configured: 설정 파일은 있으나 계정·키·실행 기록을 저장소에서 확인하지 못한 것
 * 특정 도구·모델이 더 낫다는 비교와 시간 단축 같은 정량 효과는 근거가 없어 싣지 않는다.
 */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

interface RowCells {
  readonly kind: LocalizedText;
  readonly what: LocalizedText;
  readonly where: LocalizedText;
  readonly guard: LocalizedText;
}

const POLICY = t("정책", "Policy");
const ADAPTER = t("어댑터", "Adapter");
const AGENT = t("에이전트", "Agent");
const LOOP = t("루프 명령", "Loop command");
const SKILL = t("스킬", "Skill");
const KNOWLEDGE = t("지식 베이스", "Knowledge base");
const HARNESS = t("검증 하네스", "Verification harness");
const REVIEW = t("리뷰 자동화", "Review automation");
const MCP = t("MCP 도구", "MCP tool");

const cells = (value: RowCells): Readonly<Record<string, LocalizedText>> => ({ ...value });

/** 정책·도구 연결 계층: 규칙을 어디에 두고 각 도구가 어떻게 읽는가. */
export const AI_DEV_POLICY_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "agents-md",
    name: "AGENTS.md",
    status: "live",
    link: { title: "AGENTS.md", url: "https://agents.md/" },
    evidence: ["AGENTS.md", "apps/web/AGENTS.md", "docs/operations/agent-harness.md"],
    cells: cells({
      kind: POLICY,
      what: t(
        "AI 에이전트와 사람이 함께 지키는 작업 규칙 한 권입니다. 한글 기본, 증거 우선, 커밋 형식, 검증 절차, 배포 승인을 적어 둡니다.",
        "One rulebook that AI agents and people both follow: Korean by default, evidence first, commit format, verification steps and release approval.",
      ),
      where: t(
        "모든 작업의 시작점 · 루트 AGENTS.md에 영역별 AGENTS.md 9곳(web·api·admin·mobile·docs·scripts 등)이 규칙을 더합니다.",
        "The starting point of every task. The root AGENTS.md is extended by nine area files (web, api, admin, mobile, docs, scripts and more).",
      ),
      guard: t(
        "충돌하면 사용자 지시, 가까운 AGENTS.md, 루트 순입니다. 하네스가 필수 문장 7곳이 지워지지 않았는지 매번 검사합니다.",
        "On conflict: the user's request, then the nearest AGENTS.md, then the root one. The harness checks every time that seven required passages have not been removed.",
      ),
    }),
  },
  {
    id: "claude-code-adapter",
    name: "CLAUDE.md · Claude Code",
    status: "live",
    link: { title: "Claude Code · Memory", url: "https://code.claude.com/docs/en/memory" },
    evidence: ["CLAUDE.md", ".gitignore"],
    cells: cells({
      kind: ADAPTER,
      what: t(
        "Claude Code가 시작할 때 읽는 안내판입니다. AGENTS.md를 먼저 읽고, 한글로 보고하고, harness:verify로 마무리하라는 8개 항목만 둡니다.",
        "The signpost Claude Code reads first. Eight items only: read AGENTS.md, report in Korean, finish with harness:verify. No rules are copied.",
      ),
      where: t(
        "Claude Code로 작업할 때 · CLAUDE.md. 개인 설정·스킬·훅이 들어가는 .claude/ 폴더는 로컬 전용이라 커밋하지 않습니다.",
        "When working with Claude Code: CLAUDE.md. The local .claude/ folder for personal settings, skills and hooks is never committed.",
      ),
      guard: t(
        "하네스는 'AGENTS.md를 언급하는가'만 검사합니다. 실제로 읽는지는 도구와 모델이 지시를 따르는지에 달려 있습니다.",
        "The harness only checks that the file mentions AGENTS.md. Whether it is actually read depends on the tool and model following the instruction.",
      ),
    }),
  },
  {
    id: "other-adapters",
    name: "Gemini · Copilot · Cursor",
    status: "configured",
    evidence: ["GEMINI.md", ".github/copilot-instructions.md", ".cursor/rules/toonstudio.mdc"],
    cells: cells({
      kind: ADAPTER,
      what: t(
        "GEMINI.md, Copilot 지침, Cursor 규칙(항상 적용)이 같은 취지로 AGENTS.md를 가리키는 짧은 파일입니다.",
        "Short files for Gemini, GitHub Copilot and Cursor (an always-apply rule) that all point to AGENTS.md in the same way.",
      ),
      where: t(
        "각 도구를 쓸 때만 · GEMINI.md, .github/copilot-instructions.md, .cursor/rules/toonstudio.mdc",
        "Only when those tools are used: GEMINI.md, .github/copilot-instructions.md and .cursor/rules/toonstudio.mdc.",
      ),
      guard: t(
        "파일 존재와 연결은 harness:check가 매번 검사합니다. 다만 이 세 도구를 실제로 썼다는 흔적은 저장소에서 확인하지 못했습니다.",
        "The harness checks the files and their links every time, but the repository shows no sign that these three tools were actually used.",
      ),
    }),
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    status: "live",
    link: { title: "Codex · AGENTS.md", url: "https://learn.chatgpt.com/docs/agent-configuration/agents-md" },
    evidence: [".codex/config.toml", "AGENTS.md"],
    cells: cells({
      kind: AGENT,
      what: t(
        "Codex는 어댑터 없이 AGENTS.md를 직접 읽습니다. 프로젝트 설정에는 OpenWiki 지식 베이스를 도구로 부르는 MCP 연결 블록 하나만 있습니다.",
        "Codex reads AGENTS.md directly, with no adapter. Its project config holds a single block that exposes the OpenWiki knowledge base as an MCP tool.",
      ),
      where: t(
        "코드 작성·수정 작업 · .codex/config.toml. Git 이력에 작성자 'OpenAI Codex'의 커밋이 남아 있습니다.",
        "Coding and editing tasks: .codex/config.toml. The Git history contains commits authored as 'OpenAI Codex'.",
      ),
      guard: t(
        "프로젝트 설정은 Codex가 프로젝트를 신뢰할 때만 적용됩니다. OpenWiki 연결을 실제로 쓴 기록은 저장소에서 확인하지 못했습니다.",
        "Project config applies only when Codex trusts the project. The repository shows no record of the OpenWiki connection actually being used.",
      ),
    }),
  },
  {
    id: "opencode-agent",
    name: "OpenCode toonstudio agent",
    status: "configured",
    link: { title: "OpenCode · Agents", url: "https://opencode.ai/docs/agents/" },
    evidence: [".opencode/agent/toonstudio.md", "opencode.json"],
    cells: cells({
      kind: AGENT,
      what: t(
        "OpenCode용 기본 구현 에이전트입니다. 무작위성(temperature)을 0.2로 낮추고 AGENTS.md 준수, 한글 보고, 검증을 건너뛰면 사유 공개를 지시합니다. 모델은 지정하지 않습니다.",
        "The default implementation agent for OpenCode. It lowers randomness (temperature 0.2) and requires AGENTS.md compliance, Korean reports and a stated reason whenever a check is skipped. No model is pinned.",
      ),
      where: t(
        "OpenCode로 작업할 때 · .opencode/agent/toonstudio.md. 기본 에이전트(default_agent)로 지정돼 있지 않아 직접 골라야 합니다.",
        "When working in OpenCode: .opencode/agent/toonstudio.md. It is not set as default_agent, so it has to be selected.",
      ),
      guard: t(
        "OpenCode는 AGENTS.md를 직접 읽으므로 이 에이전트를 고르지 않아도 규칙은 적용됩니다. 모델과 권한은 OpenCode 설정과 사용자의 선택을 따릅니다.",
        "OpenCode reads AGENTS.md itself, so the rules apply even if this agent is not chosen. Model and permissions follow the OpenCode settings and the user's choice.",
      ),
    }),
  },
];

/** OpenCode Loop·Goal 플러그인 계층: 이름표 파일과 플러그인의 역할 분담. */
export const AI_DEV_LOOP_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "loop-schedule-commands",
    name: "Loop schedule commands",
    status: "configured",
    link: { title: "opencode-loop (GitHub)", url: "https://github.com/ByBrawe/opencode-loop" },
    evidence: [".opencode/command/loop.md", ".opencode/agent/opencode-loop-local.md", "opencode.json"],
    cells: cells({
      kind: LOOP,
      what: t(
        "외부 플러그인(opencode-loop 0.5.32)의 반복·예약 명령 7개를 메뉴에 올려 둔 이름표입니다. 프롬프트·명령·셸·compact를 정해진 간격으로 되풀이합니다.",
        "Name tags that list seven repeat-and-schedule commands of an external plugin (opencode-loop 0.5.32) in the menu: repeat a prompt, command, shell line or compact at set intervals.",
      ),
      where: t(
        "OpenCode에서 같은 일을 되풀이할 때 · .opencode/command/loop.md 외 6개와 opencode.json의 플러그인 선언",
        "Repeating the same job in OpenCode: .opencode/command/loop.md and six more files, plus the plugin declaration in opencode.json.",
      ),
      guard: t(
        "이름표는 업무를 모릅니다. 처리 에이전트는 모든 도구를 거부하고 'OK'만 답하며, 횟수·시간·실패 한도는 플러그인 옵션입니다. 실행 기록은 확인하지 못했습니다.",
        "The tags know no business logic. The handling agent denies every tool and only replies 'OK'; run, time and failure limits are plugin options. No run history was found.",
      ),
    }),
  },
  {
    id: "loop-dev-presets",
    name: "Loop dev presets",
    status: "configured",
    evidence: [
      ".opencode/command/loop-dev.md",
      ".opencode/command/loop-safe-dev.md",
      ".opencode/command/loop-progress.md",
      ".opencode/command/loop-testfix.md",
    ],
    cells: cells({
      kind: LOOP,
      what: t(
        "진행표(progress.md)를 이어 가는 dev·safe-dev·progress와, 테스트를 돌려 고치고 다시 돌리는 testfix, 프리셋 4개의 이름표입니다. 지시문은 플러그인이 갖고 있습니다.",
        "Name tags for four presets: dev, safe-dev and progress continue a progress.md to-do list; testfix runs tests, fixes failures and runs them again. The instructions live in the plugin.",
      ),
      where: t(
        "길게 이어지는 개발 작업 · loop-dev, loop-safe-dev, loop-progress, loop-testfix 명령 파일. 저장소에 progress.md가 없어 /loop-init으로 만들어야 합니다.",
        "Long-running development work: the loop-dev, loop-safe-dev, loop-progress and loop-testfix command files. The repo has no progress.md, so /loop-init must create one.",
      ),
      guard: t(
        "testfix의 기본 검증은 npm test(루트 전체 테스트)입니다. 저장소 정책에 맞추려면 --verify 옵션으로 harness:verify를 직접 지정해야 합니다.",
        "testfix defaults to npm test (the whole root suite). To match repository policy, harness:verify must be set explicitly with the --verify option.",
      ),
    }),
  },
  {
    id: "loop-control-commands",
    name: "Loop control commands",
    status: "configured",
    evidence: [".opencode/command/loop-status.md", ".opencode/command/loop-stop.md", ".gitignore"],
    cells: cells({
      kind: LOOP,
      what: t(
        "상태·로그·진단·도움말, 일시정지·중지·재개·삭제·전체 삭제, 지금 실행, 시작 파일 만들기, 내보내기를 맡는 점검·제어 명령 12개의 이름표입니다.",
        "Name tags for twelve inspection and control commands: status, logs, doctor and help; pause, resume, stop, remove and clear; run now; init; and export.",
      ),
      where: t(
        "반복 작업을 살피고 멈출 때 · loop-status.md, loop-stop.md 등 12개. 세션별 상태는 .opencode/opencode-loop/에 저장되고 Git이 무시합니다.",
        "When inspecting or stopping loops: twelve files such as loop-status.md and loop-stop.md. Session state lives in .opencode/opencode-loop/, which Git ignores.",
      ),
      guard: t(
        "멈춤 명령으로 사람이 언제든 끊을 수 있습니다. --git-checkpoint는 커밋할 수 있어 의도할 때만 쓰라고 플러그인 문서가 경고합니다.",
        "A person can stop a loop at any time with the stop commands. The plugin docs warn that --git-checkpoint may commit, so it should only be used on purpose.",
      ),
    }),
  },
  {
    id: "opencode-goal-plugin",
    name: "OpenCode Goal plugin",
    status: "configured",
    link: { title: "OpenCode-goal-plugin (GitHub)", url: "https://github.com/william-ricchiuti/OpenCode-goal-plugin" },
    evidence: ["opencode.json"],
    cells: cells({
      kind: LOOP,
      what: t(
        "세션 목표를 정해 두면 에이전트가 쉴 때마다 이어서 진행하고, 완료·막힘·안전 한도에서 멈추는 외부 플러그인의 /goal 명령입니다.",
        "The /goal command of an external plugin: set a session goal and the agent keeps going whenever it goes idle, stopping on completion, a blocker or a safety limit.",
      ),
      where: t(
        "OpenCode의 긴 작업 · opencode.json의 플러그인 선언과 goal 명령(build 에이전트에 연결)",
        "Long OpenCode tasks: the plugin declaration and the goal command in opencode.json (routed to the build agent).",
      ),
      guard: t(
        "플러그인 문서상 턴 수·시간·토큰·무진행 한도로 멈춥니다. 버전을 고정하지 않아 업데이트의 영향을 받을 수 있고, 실행 기록은 확인하지 못했습니다.",
        "Per the plugin docs it stops on turn, time, token and no-progress limits. The version is not pinned, so updates can change behavior, and no run history was found.",
      ),
    }),
  },
];

/** OpenWiki 계층: 스킬·지식 베이스·주간 갱신. */
export const AI_DEV_WIKI_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "openwiki-skill",
    name: "OpenWiki skill",
    status: "configured",
    link: { title: "OpenWiki (GitHub)", url: "https://github.com/langchain-ai/openwiki" },
    evidence: [".agents/skills/openwiki/SKILL.md", ".agents/skills/openwiki/.openwiki-install.json"],
    cells: cells({
      kind: SKILL,
      what: t(
        "에이전트가 저장소 설명 문서(위키)를 만들고 고칠 때 따르는 절차서입니다. 계획 → 한 쪽씩 작성 → 증거 제출 → 마무리 순이고 소스 코드는 건드리지 않습니다.",
        "A procedure for agents that create or update the repository's explanatory wiki: plan, write one page at a time, submit evidence, finish. Source code is never edited.",
      ),
      where: t(
        "문서 생성·갱신 작업 · .agents/skills/openwiki(openwiki 0.5.2, Codex용으로 설치). 저장소에 있는 유일한 스킬입니다.",
        "Wiki creation and updates: .agents/skills/openwiki (openwiki 0.5.2, installed for Codex). It is the only skill in the repository.",
      ),
      guard: t(
        "저장소 내용은 명령이 아니라 증거로만 다루고, 생성 상태 파일을 직접 고치지 못하게 합니다. 실제로 실행한 기록은 저장소에서 확인하지 못했습니다.",
        "Repository content is treated as evidence, not instructions, and generated state files may not be edited by hand. No record of an actual run was found.",
      ),
    }),
  },
  {
    id: "openwiki-knowledge-base",
    name: "OpenWiki knowledge base",
    status: "documented",
    evidence: ["openwiki/quickstart.md", "openwiki/INSTRUCTIONS.md", "config/documentation-authority.json"],
    cells: cells({
      kind: KNOWLEDGE,
      what: t(
        "에이전트와 사람이 저장소를 빨리 훑는 안내 문서 5쪽(빠른 시작·저장소 지도·의존 방향·Admin·작성 규칙)입니다. 문서마다 현재·마이그레이션·목표 상태를 밝힙니다.",
        "Five orientation pages (quickstart, repository map, dependency direction, Admin, writing rules) for quick navigation. Each page states whether it is current, migrating or target.",
      ),
      where: t(
        "작업을 시작해 길을 찾을 때 · openwiki/quickstart.md부터 읽습니다. 문서 권위 순서에서는 맨 끝입니다.",
        "When starting a task and finding the way: begin at openwiki/quickstart.md. It ranks last in the documentation authority order.",
      ),
      guard: t(
        "코드·테스트·ADR·아키텍처 문서와 다르면 OpenWiki가 틀린 것입니다. 푸시 전 검증이 존재·한글·링크는 확인하지만 내용의 정확성까지 보증하지는 않습니다.",
        "If it disagrees with code, tests, ADRs or architecture docs, the wiki is wrong. The pre-push check verifies existence, Korean text and links, not factual accuracy.",
      ),
    }),
  },
  {
    id: "openwiki-weekly-update",
    name: "OpenWiki weekly update",
    status: "configured",
    link: {
      title: "GitHub Actions · Events that trigger workflows",
      url: "https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows",
    },
    evidence: [".github/workflows/openwiki-update.yml"],
    cells: cells({
      kind: KNOWLEDGE,
      what: t(
        "일주일에 한 번 OpenWiki를 돌려 문서 갱신 PR을 만드는 자동 작업입니다. 키·토큰·제공자·모델 설정 4개가 모두 있어야 하고 하나라도 없으면 건너뜁니다.",
        "A weekly job that runs OpenWiki and opens a documentation-update PR. All four settings (key, token, provider, model) must exist; if any is missing the job is skipped.",
      ),
      where: t(
        ".github/workflows/openwiki-update.yml · 일요일 18:30 UTC 정기 실행과 수동 실행. 추론 비용을 묶어 두려고 매일이 아닌 주 1회로 정했습니다.",
        ".github/workflows/openwiki-update.yml: runs Sundays 18:30 UTC or manually. Weekly rather than daily to keep documentation inference cost bounded.",
      ),
      guard: t(
        "자동 병합은 하지 않아 사람이 PR을 검토해야 반영됩니다. 실제로 실행되어 PR을 낸 적이 있는지와 쓰는 모델은 저장소에서 확인하지 못했습니다.",
        "It never auto-merges, so a person must review the PR. Whether it has ever run and opened a PR, and which model it uses, cannot be seen from the repository.",
      ),
    }),
  },
];

/** 검증·안전 계층: 에이전트가 만든 변경도 같은 문을 지나게 하는 장치. */
export const AI_DEV_GATE_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "harness-check",
    name: "harness:check",
    status: "live",
    evidence: ["scripts/agent-harness.mjs", "scripts/agent-harness.test.mjs"],
    cells: cells({
      kind: HARNESS,
      what: t(
        "AI 도구 설정이 어긋나지 않았는지 보는 자동 점검입니다. 필수 파일 19개, 어댑터의 AGENTS.md 연결, 스크립트 이름, 정책 문장 7곳, 한글 커밋 규칙 연결을 확인합니다.",
        "An automatic check that the AI tooling setup has not drifted: 19 required files, adapter links to AGENTS.md, script names, seven policy passages and the Korean commit-rule wiring.",
      ),
      where: t(
        "pnpm harness:check · 커밋 직전(pre-commit)과 CI 사전 테스트에서 실행 · scripts/agent-harness.mjs",
        "pnpm harness:check, run before each commit (pre-commit) and in CI's pre-install tests: scripts/agent-harness.mjs.",
      ),
      guard: t(
        "커밋 문구나 코드 품질은 보지 않습니다(그 몫은 commitlint·lint·타입 검사). 어댑터가 AGENTS.md를 '언급'하는지만 확인합니다.",
        "It does not judge commit wording or code quality (commitlint, lint and type checks do). It only confirms that adapters mention AGENTS.md.",
      ),
    }),
  },
  {
    id: "harness-verify",
    name: "harness:verify",
    status: "live",
    evidence: ["scripts/agent-harness.mjs", "docs/operations/agent-harness.md"],
    cells: cells({
      kind: HARNESS,
      what: t(
        "바뀐 파일만 골라 하는 완료 점검입니다. 하네스 검사 → lockfile → lint → 비밀값 검사 → (앱·패키지 변경 시) 아키텍처 검사 → (TS 변경 시) 타입 검사 순으로 실행합니다.",
        "A completion check scoped to the changed files: harness check, lockfile, lint and secret scan, then architecture checks for app or package changes and type checks for TypeScript changes.",
      ),
      where: t(
        "작업을 끝내기 전 · pnpm harness:verify (--staged는 커밋 전, --full은 루트 테스트와 보안·라이선스 검사를 더함)",
        "Before finishing work: pnpm harness:verify (--staged before a commit, --full adds the root tests plus security and license audits).",
      ),
      guard: t(
        "빠른 게이트이며 전체 보증은 verify:push와 CI의 몫입니다. UI·API 변경에는 브라우저·통합 테스트가 더 필요하다는 안내만 출력합니다.",
        "It is a fast gate; full assurance belongs to verify:push and CI. For UI or API changes it only prints a reminder that browser or integration tests are still needed.",
      ),
    }),
  },
  {
    id: "git-hooks-commitlint",
    name: "Husky hooks · commitlint",
    status: "live",
    link: { title: "Husky", url: "https://typicode.github.io/husky/" },
    evidence: [".husky/pre-commit", ".husky/pre-push", ".husky/commit-msg", "commitlint.config.cjs"],
    cells: cells({
      kind: HARNESS,
      what: t(
        "커밋·푸시 때 자동으로 도는 문입니다. 한글 제목 Conventional Commit 검사, 변경 파일 lint·비밀값 검사, 푸시 전 아키텍처·타입 검사를 합니다.",
        "Gates that run automatically on commit and push: Korean-subject Conventional Commit check, lint and secret scan on changed files, and architecture and type checks before a push.",
      ),
      where: t(
        "git commit · git push 순간 · .husky/*, commitlint.config.cjs, .gitmessage.ko(한글 작성 안내를 자동 삽입)",
        "At git commit and git push: .husky/*, commitlint.config.cjs and .gitmessage.ko (a Korean writing guide inserted automatically).",
      ),
      guard: t(
        "--no-verify 같은 우회는 AGENTS.md가 금지하고, 같은 검사를 CI가 PR에서 다시 실행합니다(커밋 메시지 검사 포함).",
        "Bypasses such as --no-verify are forbidden by AGENTS.md, and CI repeats the same checks on every PR, including the commit-message check.",
      ),
    }),
  },
  {
    id: "pr-template",
    name: "PR template",
    status: "live",
    evidence: [".github/pull_request_template.md", "AGENTS.md"],
    cells: cells({
      kind: POLICY,
      what: t(
        "PR을 올릴 때 변경 목적·검증 결과·위험과 복구·문서 증거를 적게 하고, '이 PR 병합만으로 운영 배포하지 않음'을 확인하게 하는 양식입니다.",
        "A form that asks for a PR's purpose, verification results, risk and recovery plan and evidence, and confirms that merging this PR alone does not deploy to production.",
      ),
      where: t(
        "모든 PR 본문 · .github/pull_request_template.md. AI든 사람이든 실행한 명령과 그 결과를 본문에 남깁니다.",
        "In every PR description: .github/pull_request_template.md. Whether AI or a person, the commands run and their results are written into the description.",
      ),
      guard: t(
        "양식은 기록을 이끌 뿐 내용이 사실인지는 보지 않습니다. AGENTS.md §5는 실행하지 않은 검증을 실행한 것처럼 보고하지 말라고 요구합니다.",
        "A form prompts a record but cannot tell whether it is true. AGENTS.md section 5 forbids reporting a check as run when it was not.",
      ),
    }),
  },
  {
    id: "ci-core-gate",
    name: "CI core gate",
    status: "live",
    link: { title: "GitHub Actions", url: "https://docs.github.com/en/actions" },
    evidence: [".github/workflows/ci.yml", ".github/pull_request_template.md"],
    cells: cells({
      kind: HARNESS,
      what: t(
        "PR·main에서 lint·타입·회귀 분할·성능·접근성·빌드·DB 불변식 7개 검사가 모두 실제로 성공해야 통과하는 하나의 관문입니다. 건너뜀은 성공으로 치지 않습니다.",
        "A single gate on PRs and main: lint, types, regression shards, performance, accessibility, build and DB invariants must all truly succeed. A skipped check does not count.",
      ),
      where: t(
        "모든 PR · .github/workflows/ci.yml의 core·verify 잡. PR에서는 커밋 메시지 규칙(commitlint)도 검사합니다.",
        "Every PR: the core and verify jobs in .github/workflows/ci.yml. On PRs it also runs the commit-message rule (commitlint).",
      ),
      guard: t(
        "AI가 쓴 코드도 같은 관문을 지납니다. 워크플로 주석대로 넓은 QA는 진단용이라 core 초록불이 전체 시험 통과 주장은 아닙니다.",
        "AI-written code passes the same gate. As the workflow notes, broad QA stays diagnostic, so a green core is not a claim that every test passed.",
      ),
    }),
  },
  {
    id: "architecture-doc-gates",
    name: "Architecture · docs gates",
    status: "live",
    evidence: [
      "scripts/validate-architecture.mjs",
      "config/architecture-boundary-ratchet.json",
      "config/architecture-source-ratchet.json",
      "scripts/validate-documentation.mjs",
      "config/documentation-authority.json",
    ],
    cells: cells({
      kind: HARNESS,
      what: t(
        "사람이 놓치기 쉬운 약속을 스크립트가 지킵니다. 앱 사이 직접 import 6종은 0건, 레거시 부채는 상한 고정, 퇴역한 Vercel 설정은 되살릴 수 없고, 문서 링크가 깨지면 실패합니다.",
        "Scripts keep promises people forget: zero direct imports across six app pairs, legacy debt frozen at a ceiling, retired Vercel config cannot return, and broken doc links fail the check.",
      ),
      where: t(
        "푸시 전 훅과, 앱·패키지 변경 시 harness:verify · pnpm validate:architecture, config/*-ratchet.json, config/documentation-authority.json",
        "In the pre-push hook and in harness:verify for app or package changes: pnpm validate:architecture, config/*-ratchet.json and config/documentation-authority.json.",
      ),
      guard: t(
        "상한(래칫)은 숫자를 고치면 바뀌므로 그 변경은 리뷰 대상입니다. 이 검사는 구조와 링크를 보며, 문장이 사실인지는 보지 않습니다.",
        "A ceiling changes when its number is edited, so such edits need review. The checks cover structure and links, not whether a sentence is factually true.",
      ),
    }),
  },
  {
    id: "secret-policy",
    name: "Secret policy · Secretlint",
    status: "live",
    link: { title: "Secretlint", url: "https://github.com/secretlint/secretlint" },
    evidence: ["AGENTS.md", ".secretlintrc.json", "scripts/secretlint-files.mjs", ".gitignore"],
    cells: cells({
      kind: POLICY,
      what: t(
        "작업 중 받은 키를 코드·문서·로그·PR에 쓰지 않고 Git이 무시하는 로컬 파일에만 두는 규칙입니다. 값은 다시 출력하지 않고 변수 이름만 적습니다.",
        "A rule that keys received during work live only in a Git-ignored local file, never in code, docs, logs or PRs. Values are not echoed back; only variable names are written.",
      ),
      where: t(
        "작업 전 구간 · AGENTS.md §9, .secretlintrc.json, scripts/secretlint-files.mjs(커밋 훅·harness:verify·CI), 로컬 에이전트 폴더를 막는 .gitignore",
        "Throughout the work: AGENTS.md section 9, .secretlintrc.json, scripts/secretlint-files.mjs (commit hook, harness:verify, CI) and the .gitignore rules for local agent folders.",
      ),
      guard: t(
        "Secretlint는 알려진 패턴만 잡습니다. 그래서 값을 출력하지 않는 정책과 gitignore가 먼저 막고, 하네스가 정책 문장이 남아 있는지 검사합니다.",
        "Secretlint only catches known patterns, so the never-echo policy and gitignore come first, and the harness checks that the policy text still exists.",
      ),
    }),
  },
  {
    id: "a11y-design-gates",
    name: "Accessibility · design gates",
    status: "live",
    link: { title: "Playwright · Accessibility testing", url: "https://playwright.dev/docs/accessibility-testing" },
    evidence: ["e2e/a11y-smoke.spec.ts", "eslint.config.mjs", "docs/SHADCN_RAW_COLORS_EXCEPTIONS.md", "apps/web/AGENTS.md"],
    cells: cells({
      kind: HARNESS,
      what: t(
        "화면 변경이 AI 작업이든 사람 작업이든 같은 기준을 지나게 합니다. axe 접근성 검사에서 심각·치명 위반이 있으면 실패하고, 하드코딩 색은 디자인 토큰으로 바꾸라고 경고합니다.",
        "UI changes, whether written by AI or people, meet the same bar: serious or critical axe violations fail the build, and hard-coded colors trigger a warning to use design tokens.",
      ),
      where: t(
        "UI 변경 · e2e/a11y-smoke.spec.ts(데스크톱 10개·모바일 4개 경로), eslint.config.mjs, DESIGN.md, apps/web/AGENTS.md",
        "UI changes: e2e/a11y-smoke.spec.ts (10 desktop and 4 mobile routes), eslint.config.mjs, DESIGN.md and apps/web/AGENTS.md.",
      ),
      guard: t(
        "자동 검사는 일부 문제만 잡습니다. 색 규칙은 경고 수준이며, 예외는 사유와 함께 docs/SHADCN_RAW_COLORS_EXCEPTIONS.md 원장에 등재해야 합니다.",
        "Automated checks catch only part of the problems. The color rule is a warning, and each exception must be listed with a reason in docs/SHADCN_RAW_COLORS_EXCEPTIONS.md.",
      ),
    }),
  },
];

/** 리뷰 자동화와 MCP 도구 계층. */
export const AI_DEV_TOOL_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "ai-review-bots",
    name: "CodeRabbit · Codex review",
    status: "configured",
    asOf: "2026-10-08",
    link: { title: "CodeRabbit docs", url: "https://docs.coderabbit.ai/" },
    evidence: [".coderabbit.yaml", "docs/coderabbit-auto-review.md"],
    cells: cells({
      kind: REVIEW,
      what: t(
        "PR에 AI가 리뷰 댓글을 남기도록 붙인 두 경로입니다. CodeRabbit은 draft PR도 푸시마다 다시 보게 설정했고, Codex 커넥터는 draft에서 ready로 바뀔 때 리뷰한다고 문서에 적혀 있습니다.",
        "Two paths that let AI comment on pull requests. CodeRabbit is configured to review drafts and every push; the Codex connector is documented to review when a draft turns ready.",
      ),
      where: t(
        "PR 단계 · .coderabbit.yaml, docs/coderabbit-auto-review.md (수동 트리거: PR 댓글 @coderabbitai review)",
        "At the PR stage: .coderabbit.yaml and docs/coderabbit-auto-review.md (manual trigger: comment @coderabbitai review).",
      ),
      guard: t(
        "계정 조건(별 10개 미만 제외)과 사용 한도로 건너뛴 기록이 있고, 2026-10-08에 본 최근 PR 댓글도 안내문뿐이었습니다. 실제 관문은 CI와 사람 리뷰입니다.",
        "Reviews are skipped by account rules (fewer than 10 stars) and usage limits; recent PR comments seen on 2026-10-08 were notices only. The real gates are CI and human review.",
      ),
    }),
  },
  {
    id: "opencode-cloudflare-mcp",
    name: "OpenCode Cloudflare MCP",
    status: "configured",
    link: { title: "OpenCode · MCP servers", url: "https://opencode.ai/docs/mcp-servers/" },
    evidence: [".opencode.jsonc"],
    cells: cells({
      kind: MCP,
      what: t(
        "OpenCode가 Cloudflare의 원격 MCP 서버 2곳(Cloudflare 도구 서버, 공식 문서 서버)에 연결하도록 적어 둔 설정입니다.",
        "A setting that lets OpenCode connect to two remote Cloudflare MCP servers: the Cloudflare tools server and the official docs server.",
      ),
      where: t(
        ".opencode.jsonc의 mcp 항목 2개(cloudflare, cloudflare-docs). 운영 배포는 이 연결과 별개로 AGENTS.md §8의 별도 명시 승인이 필요합니다.",
        "Two mcp entries in .opencode.jsonc (cloudflare, cloudflare-docs). Production release still needs the separate explicit approval of AGENTS.md section 8.",
      ),
      guard: t(
        "설정 파일에는 주소와 사용 여부만 있고 비밀값이 없습니다. 점으로 시작하는 루트 파일 이름은 OpenCode 공식 설정 위치에 없어 실제로 읽히는지 확인하지 못했습니다.",
        "The file holds only addresses and an enabled flag, no secrets. A dot-prefixed root file name is not among OpenCode's documented config locations, so whether it is actually read is unconfirmed.",
      ),
    }),
  },
  {
    id: "blender-mcp-allowlist",
    name: "Blender MCP allow-list",
    status: "experimental",
    evidence: ["tools/blender/toonstudio_blender_kit/mcp.py", "scripts/studio-vrm-generate-mcp-host.mts"],
    cells: cells({
      kind: MCP,
      what: t(
        "AI·MCP 서버가 Blender를 움직일 때 허용된 명령만 부르게 하는 문입니다. eval·셸·네트워크·패키지 설치·임의 연산 이름은 열지 않고 입력값을 검증합니다.",
        "A gate so that AI or MCP servers drive Blender only through allow-listed commands. No eval, shell, network, package install or arbitrary operator names are exposed, and inputs are validated.",
      ),
      where: t(
        "캐릭터·에셋 제작 파이프라인 · tools/blender/toonstudio_blender_kit/mcp.py, VRM 생성 호스트 scripts/studio-vrm-generate-mcp-host.mts",
        "The character and asset pipeline: tools/blender/toonstudio_blender_kit/mcp.py and the VRM generation host scripts/studio-vrm-generate-mcp-host.mts.",
      ),
      guard: t(
        "목적은 임의 코드 실행 차단이며 제품의 저장·렌더 권위와 분리돼 있습니다. 연결 호스트가 확인될 때만 쓰는 선택형 경계라 실험 단계입니다.",
        "Its purpose is to block arbitrary code execution, and it stays separate from product authority (saving, rendering). It is an optional boundary used only when a host is confirmed, so it is experimental.",
      ),
    }),
  },
  {
    id: "asset-generation-mcp",
    name: "3D asset generation MCP",
    status: "documented",
    link: { title: "Model Context Protocol", url: "https://modelcontextprotocol.io/" },
    evidence: [
      "docs/studio-3d-mcp-cli.md",
      "apps/web/public/assets/3d/environments/mcp-free-v1/manifest.json",
    ],
    cells: cells({
      kind: MCP,
      what: t(
        "Tripo의 공식 MCP로 환경 에셋 10개를 만들고(Meshy·Hyper3D는 연결만 준비), 공급자·작업 ID·처리 스크립트·크레딧·라이선스를 manifest에 남겼습니다. 결제수단은 쓰지 않았습니다.",
        "Ten environment assets were made through Tripo's official MCP (Meshy and Hyper3D are only prepared for connection), and the provider, task IDs, processing script, credits and license were recorded in a manifest. No payment method was used.",
      ),
      where: t(
        "에셋 제작 단계 · docs/studio-3d-mcp-cli.md, apps/web/public/assets/3d/environments/mcp-free-v1/manifest.json (2026-09-25 생성)",
        "The asset production stage: docs/studio-3d-mcp-cli.md and apps/web/public/assets/3d/environments/mcp-free-v1/manifest.json (generated 2026-09-25).",
      ),
      guard: t(
        "유료 업그레이드·카드 등록·자동 충전은 금지이고, 유료 API 제출은 --confirm이 없으면 시험 실행입니다. MCP 서버 등록은 개발자 PC에만 있어 저장소로 검증할 수 없습니다.",
        "Paid upgrades, card registration and auto-recharge are forbidden, and paid API submission is a dry run unless --confirm is given. MCP server registration lives only on the developer's PC and cannot be verified from the repository.",
      ),
    }),
  },
];
