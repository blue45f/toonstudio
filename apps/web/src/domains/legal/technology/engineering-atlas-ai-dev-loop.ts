import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · AI 개발 도구 카드 — OpenCode 루프 명령(category: platform-ops).
 * 기준: 2026-10-07 저장소 읽기와 공식 문서 확인. 실행 기록·계정 설정·정량 효과는 확인하지 못했고 카드에도 쓰지 않았다.
 * 한 파일이 1,000줄을 넘지 않도록 engineering-atlas-ai-dev-cards.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });
const lines = (...rows: readonly string[]): string => rows.join("\n");

/* ───────────────────────── 4. OpenCode 루프 명령 ───────────────────────── */

const OPENCODE_LOOP_DIAGRAM: EngineeringDiagram = {
  id: "opencode-loop-commands-diagram",
  kind: "sequence",
  title: t("루프 명령이 실행되는 순서", "How a loop command runs"),
  caption: t(
    "이름표는 메뉴 등록과 'OK' 응답뿐이고, 예약·대기·한도는 플러그인이 맡습니다.",
    "The tag only registers the command and replies 'OK'; scheduling, waiting and limits belong to the plugin.",
  ),
  alt: t(
    "개발자가 루프 명령을 입력하면 OpenCode는 플러그인에 처리를 맡기고, 이름표 본문은 도구 권한이 없는 숨은 에이전트에게 보내 'OK'만 받습니다. 플러그인은 에이전트가 쉬는 때까지 기다렸다가 예약한 지시문을 작업 에이전트에 전달하고, 한도에 닿으면 멈춥니다.",
    "When the developer types a loop command, OpenCode leaves the handling to the plugin and sends the tag's body to a hidden agent without tool permissions, which only replies 'OK'. The plugin waits until the agent is idle, passes the scheduled prompt to the work agent, and stops when a limit is reached.",
  ),
  actors: [
    { id: "person", label: t("개발자", "Developer"), tone: "neutral" },
    { id: "opencode", label: t("OpenCode", "OpenCode"), sub: t("명령 메뉴·실행기", "Command menu, runner"), tone: "local" },
    { id: "plugin", label: t("Loop 플러그인", "Loop plugin"), sub: t("예약·상태·한도", "Schedule, state, limits"), tone: "external" },
    { id: "stub", label: t("숨은 에이전트", "Hidden agent"), sub: t("opencode-loop-local", "opencode-loop-local"), tone: "warn" },
    { id: "worker", label: t("작업 에이전트", "Work agent"), sub: t("세션의 현재 에이전트", "The session's current agent"), tone: "ai" },
  ],
  messages: [
    {
      from: "person",
      to: "opencode",
      label: t("/loop-testfix 입력", "Types /loop-testfix"),
      note: t("이름표 파일이 메뉴에 등록돼 있음", "The tag file is registered in the menu"),
    },
    {
      from: "opencode",
      to: "plugin",
      label: t("플러그인이 로컬 처리", "Plugin handles it locally"),
      note: t("작업 예약·상태 저장", "Schedules the job, saves state"),
    },
    {
      from: "opencode",
      to: "stub",
      label: t("이름표 본문 전달", "Passes the tag's body"),
      note: t("agent: opencode-loop-local", "agent: opencode-loop-local"),
    },
    {
      from: "stub",
      to: "opencode",
      label: t("OK만 응답", "Replies only “OK”"),
      style: "dashed",
      note: t("도구 권한 전부 거부", "Every tool call is denied"),
    },
    {
      from: "plugin",
      to: "plugin",
      label: t("유휴일 때까지 대기", "Waits until idle"),
      note: t("예약 시각이어도 유휴일 때만 실행", "Runs only when idle, even if due"),
    },
    { from: "plugin", to: "worker", label: t("예약한 지시문 전달", "Sends the scheduled prompt") },
    {
      from: "worker",
      to: "worker",
      label: t("AGENTS.md대로 작업", "Works per AGENTS.md"),
      note: t("완료 전 harness:verify", "harness:verify before finishing"),
    },
    { from: "worker", to: "plugin", label: t("결과·검증 상태 보고", "Reports result and checks"), style: "dashed" },
    {
      from: "plugin",
      to: "person",
      label: t("한도에 닿으면 중지", "Stops at a limit"),
      style: "dashed",
      note: t("횟수·시간·실패 한도 또는 /loop-stop", "Run, time or failure limit, or /loop-stop"),
    },
  ],
};

const OPENCODE_LOOP_COMMANDS: EngineeringAtlasEntry = {
  id: "opencode-loop-commands",
  category: "platform-ops",
  name: "OpenCode Loop",
  title: t("반복 작업 명령은 이름표, 일은 플러그인이", "Loop commands are name tags; the plugin does the work"),
  status: "configured",
  tagline: t(
    "loop 명령 파일 23개는 외부 플러그인 명령의 이름표이며, 반복과 한도는 플러그인이 맡습니다.",
    "The 23 loop files are name tags for an external plugin that handles repeats and limits.",
  ),
  background: [
    t(
      "긴 작업을 AI에게 맡기면 사람이 계속 '이어서 해줘'를 입력해야 합니다. 반복·예약 플러그인은 에이전트가 쉬는 틈마다 다음 지시를 자동으로 넣어 줍니다. 다만 제한 없이 계속 돌리면 같은 실수를 반복하거나 비용이 새므로, 한도와 멈춤 장치가 함께 필요합니다.",
      "Handing a long task to AI means a person keeps typing 'please continue'. A repeat-and-schedule plugin feeds the next instruction automatically whenever the agent goes idle. Left unlimited, though, it can repeat mistakes or burn cost, so limits and stop controls are needed.",
    ),
    t(
      ".opencode/command/에는 loop 명령 파일 23개가 있지만 업무 내용은 없습니다. 파일은 외부 커뮤니티 플러그인(@bybrawe/opencode-loop 0.5.32)의 슬래시 명령을 OpenCode 메뉴에 등록하는 이름표이고, 모두 숨은 서브에이전트(opencode-loop-local)로 연결됩니다. 이 에이전트는 모든 도구 권한이 거부돼 있으며 'OK'만 답합니다. 반복 예약과 상태 저장은 플러그인이 로컬에서 합니다.",
      ".opencode/command/ holds 23 loop command files, but none contains business logic. They are name tags that register the slash commands of an external community plugin (@bybrawe/opencode-loop 0.5.32) in the OpenCode menu, and all route to a hidden subagent (opencode-loop-local). That agent has every tool permission denied and only replies 'OK'. Scheduling and state are handled locally by the plugin.",
    ),
    t(
      "명령은 세 묶음입니다. 예약 7개(loop, ask, prompt, command, cmd, shell, compact), 개발 프리셋 4개(dev, safe-dev, progress, testfix), 점검·제어 12개입니다. 프리셋은 진행표(progress.md)를 읽고 이어 가거나 테스트를 돌려 고치게 합니다. 플러그인 문서의 한도 옵션(--max-runs, --max-runtime, --max-failures)으로 횟수·시간·실패를 제한할 수 있습니다.",
      "The commands fall into three groups: seven scheduling commands (loop, ask, prompt, command, cmd, shell, compact), four development presets (dev, safe-dev, progress, testfix) and twelve inspection and control commands. Presets continue a progress.md to-do list or run tests and fix failures. The plugin's limit options (--max-runs, --max-runtime, --max-failures) cap runs, time and failures.",
    ),
    t(
      "이 저장소 정책과 맞출 때 주의할 점이 있습니다. 플러그인 문서에 따르면(저장소·설치본에서 확인 불가) testfix의 기본 검증 명령은 npm test(루트 전체 테스트)라 AGENTS.md의 harness:verify로 바꿔 지정해야 하고, progress.md는 저장소에 없어 /loop-init으로 만들어야 합니다. 플러그인 버전을 올리면 명령 이름이 달라질 수 있고(0.6.6 문서 표에는 6개 이름이 없음), 실제로 루프를 돌린 기록은 저장소에서 확인하지 못했습니다.",
      "Aligning it with repository policy needs care. According to the plugin's documentation (not verifiable from the repository or an installed copy), the testfix preset defaults to npm test (the whole root suite), so harness:verify from AGENTS.md must be set explicitly, and progress.md does not exist in the repo and must be created with /loop-init. Upgrading the plugin may rename commands (six names are absent from the 0.6.6 docs table), and no record of actual loop runs was found.",
    ),
  ],
  keyPoints: [
    t("명령 파일 23개는 플러그인 명령의 이름표", "The 23 command files are name tags for the plugin"),
    t("처리 에이전트는 도구 권한을 전부 거부하고 'OK'만 답함", "The handler agent denies every tool and only replies 'OK'"),
    t("횟수·시간·실패 한도와 멈춤 명령으로 통제", "Run, time and failure limits plus stop commands keep it in check"),
    t("실행 기록이 없어 상태는 '설정 필요'", "No run record exists, so the status is setup required"),
  ],
  diagram: OPENCODE_LOOP_DIAGRAM,
  usage: [
    {
      feature: t("OpenCode 반복 작업(루프 명령)", "OpenCode repeat jobs (loop commands)"),
      role: t(
        "/loop 계열 명령 23개를 메뉴에 등록하고, 명령 확인 응답은 도구 권한이 없는 숨은 에이전트가 맡습니다.",
        "Registers the 23 /loop commands in the menu; a hidden agent with no tool permission handles the acknowledgement.",
      ),
      paths: [".opencode/command/loop.md", ".opencode/command/loop-testfix.md", ".opencode/agent/opencode-loop-local.md"],
    },
    {
      feature: t("OpenCode 설정(플러그인 고정)", "OpenCode config (plugin pins)"),
      role: t(
        "루프 플러그인은 0.5.32로 고정하고, goal 플러그인과 goal 명령(build 에이전트)을 선언합니다. 로컬 상태 폴더는 Git이 무시합니다.",
        "Pins the loop plugin at 0.5.32 and declares the goal plugin plus a goal command (build agent). Local state folders are Git-ignored.",
      ),
      paths: ["opencode.json", ".gitignore"],
    },
    {
      feature: t("정책을 따르는 기본 에이전트", "Policy-following default agent"),
      role: t(
        "toonstudio 에이전트는 temperature 0.2로 AGENTS.md 준수, 한글 보고, 검증 생략 사유 공개를 지시합니다.",
        "The toonstudio agent sets temperature 0.2 and instructs AGENTS.md compliance, Korean reports and disclosure of any skipped check.",
      ),
      paths: [".opencode/agent/toonstudio.md", "AGENTS.md"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("명령을 확인만 하는 숨은 에이전트", "The hidden agent that only acknowledges"),
      language: "yaml",
      code: lines(
        "# .opencode/agent/opencode-loop-local.md 머리말(요약)",
        "description: Handles OpenCode Loop slash-command acknowledgements without tools.",
        "mode: subagent",
        "hidden: true            # 메뉴에 보이지 않는 서브에이전트",
        "permission:",
        '  "*": deny             # 모든 도구 호출을 거부',
        "# 본문: 도구·서브에이전트·파일 열람 없이 정확히 OK 만 답하라",
      ),
      codeEn: lines(
        "# Front matter of .opencode/agent/opencode-loop-local.md (condensed)",
        "description: Handles OpenCode Loop slash-command acknowledgements without tools.",
        "mode: subagent",
        "hidden: true            # a subagent that is not shown in the menu",
        "permission:",
        '  "*": deny             # deny every tool call',
        "# Body: with no tools, subagents or file reads, reply exactly OK",
      ),
      explain: t(
        "권한을 전부 거부하고 한 단어만 답하게 해서, 이름표를 눌러도 모델이 아무 일도 하지 못하게 합니다. 실제 반복 실행은 플러그인이 합니다.",
        "Denying all permissions and allowing one word means pressing a tag cannot make the model do anything. The actual repeating is done by the plugin.",
      ),
      source: ".opencode/agent/opencode-loop-local.md",
      verify: "none",
    },
    {
      kind: "simplified",
      title: t("플러그인 선언(opencode.json)", "Plugin declaration (opencode.json)"),
      language: "json",
      code: lines(
        "{",
        '  "plugin": ["@bybrawe/opencode-loop@0.5.32", "opencode-goal-plugin"],',
        '  "command": {',
        '    "goal": { "template": "$ARGUMENTS", "agent": "build" }',
        "  }",
        "}",
      ),
      explain: t(
        "루프 플러그인은 버전을 0.5.32로 고정했고 goal 플러그인은 고정하지 않았습니다. 실제 파일에는 $schema와 설명 문구가 더 있습니다.",
        "The loop plugin is pinned at 0.5.32 while the goal plugin is not. The real file also carries a $schema and a description.",
      ),
      source: "opencode.json",
    },
  ],
  links: [
    { title: "OpenCode · Commands", url: "https://opencode.ai/docs/commands/", kind: "docs" },
    { title: "OpenCode · Agents", url: "https://opencode.ai/docs/agents/", kind: "docs", note: t("서브에이전트와 권한 설정", "Subagents and permissions") },
    { title: "OpenCode · Plugins", url: "https://opencode.ai/docs/plugins/", kind: "docs" },
    {
      title: "opencode-loop (GitHub)",
      url: "https://github.com/ByBrawe/opencode-loop",
      kind: "repo",
      note: t("외부 커뮤니티 플러그인(MIT)", "An external community plugin (MIT)"),
    },
    {
      title: "OpenCode-goal-plugin (GitHub)",
      url: "https://github.com/william-ricchiuti/OpenCode-goal-plugin",
      kind: "repo",
      note: t("목표를 이어 가는 /goal 플러그인(MIT)", "The /goal plugin that keeps a goal going (MIT)"),
    },
  ],
  chapterIds: ["ai-assisted-engineering", "delivery"],
  talk: {
    pitch: t(
      "긴 작업을 AI에게 맡길 때 쓰는 반복 실행 도구입니다. 저장소의 loop 명령 파일은 일을 정의하는 게 아니라 외부 플러그인 명령을 메뉴에 올려 두는 이름표이고, 이름표를 처리하는 에이전트는 도구 권한이 하나도 없습니다. 반복에는 횟수·시간·실패 한도가 있고, 사람이 언제든 멈출 수 있습니다.",
      "It is a repeat-execution tool for handing long tasks to AI. The loop files in the repository do not define the work; they are name tags that put an external plugin's commands in the menu, and the agent that handles a tag has no tool permission at all. Repeats have run, time and failure limits, and a person can stop them any time.",
    ),
    analogy: t(
      "집안 타이머 콘센트와 같습니다. 콘센트(플러그인)가 시간을 재고 전원을 넣어 주고, 벽의 스위치 이름표(명령 파일)는 어떤 스위치인지만 알려 줍니다.",
      "Like a timer socket at home: the socket (the plugin) keeps time and switches power on, while the label on the wall switch (the command file) only says which switch it is.",
    ),
    questions: [
      {
        question: t("AI가 밤새 혼자 코드를 바꾸나요?", "Does the AI change code on its own overnight?"),
        answer: t(
          "이 저장소에는 그런 운영 기록이 없습니다. 루프는 설정만 되어 있고 실행 기록을 확인하지 못했습니다. 돌리더라도 한도 옵션과 멈춤 명령이 있고 AGENTS.md의 검증·배포 승인 규칙이 그대로 적용됩니다. 운영 배포는 사람의 별도 승인이 필요합니다.",
          "The repository holds no such operating record. Loops are only configured, and no run history was found. Even when run, limit options and stop commands exist and the verification and release-approval rules of AGENTS.md still apply. Production release needs a separate human approval.",
        ),
      },
      {
        question: t("플러그인을 믿어도 되나요?", "Can the plugin be trusted?"),
        answer: t(
          "외부 커뮤니티가 만든 MIT 라이선스 플러그인이라 OpenCode 팀의 제품이 아닙니다. 루프는 0.5.32로 버전을 고정했고 goal 플러그인은 고정하지 않아 업데이트의 영향을 받을 수 있습니다. 도입 전에 소스와 버전 정책을 확인해야 합니다.",
          "It is an MIT-licensed plugin from an external community, not a product of the OpenCode team. The loop plugin is pinned at 0.5.32 but the goal plugin is not, so updates can affect it. Check the source and version policy before adopting it.",
        ),
      },
      {
        question: t("다른 도구에도 같은 기능이 있나요?", "Do other tools have the same feature?"),
        answer: t(
          "이 저장소의 루프는 OpenCode 전용 설정입니다. Codex나 Claude Code의 반복 실행 설정은 저장소에서 확인하지 못했습니다.",
          "The loops here are OpenCode-specific settings. The repository shows no repeat-execution setup for Codex or Claude Code.",
        ),
      },
    ],
    pitfall: t(
      "'루프 25개로 업무를 자동화한다'고 말하지 않습니다. 파일은 23개이고 업무 내용이 없는 이름표이며, 실제 실행 기록과 .opencode.jsonc(Cloudflare MCP 연결)의 로드 여부는 확인하지 못했습니다. 플러그인 문서 기준으로 testfix의 기본 검증은 npm test라(저장소·설치본에서 확인 불가) 정책의 harness:verify와 다릅니다.",
      "Do not say 25 loops automate the work. There are 23 files, they are name tags without business logic, and neither actual runs nor whether .opencode.jsonc (the Cloudflare MCP connection) is loaded could be confirmed. Per the plugin's documentation (not verifiable from the repository or an installed copy), the testfix default check is npm test, not the policy's harness:verify.",
    ),
  },
  technologies: ["OpenCode", "opencode-loop", "opencode-goal-plugin", "AGENTS.md"],
  facts: [
    { value: "23", label: t("loop 명령 파일 수", "Loop command files"), source: ".opencode/command" },
    { value: "0.5.32", label: t("고정한 루프 플러그인 버전", "Pinned loop plugin version"), source: "opencode.json" },
    {
      value: "deny",
      label: t("숨은 에이전트의 permission '*' 값", "The hidden agent's permission for '*'"),
      source: ".opencode/agent/opencode-loop-local.md",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_AI_DEV_LOOP: readonly EngineeringAtlasEntry[] = [
  OPENCODE_LOOP_COMMANDS,
];
