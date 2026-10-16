/**
 * run.mjs 의 인자 해석과 실행 계획(순수 함수). 계획은 --dry 출력과 실제 실행이 같은 코드를 쓴다.
 */
import { JOURNEY_ORDER, journeyNeedsLogin } from "./journey-meta.mjs";
import { ROUTES, VIEWPORTS, planCells, requiresLogin, selectPlan } from "./routes.mjs";

export class UsageError extends Error {}

export const USAGE = [
  "사용법: node scripts/ux-audit/run.mjs [옵션]",
  "",
  "  --dry                    라우트 목록과 실행 계획만 출력한다(브라우저·스택·자격증명을 쓰지 않는다)",
  "  --routes a,b             측정할 라우트 id(기본 전체). id 는 --dry 로 확인한다",
  "  --viewports mobile,...   mobile · tablet · desktop 중 선택(기본 전체)",
  "  --auth public|user       공개 또는 로그인 필요 라우트만",
  "  --journeys 목록|all|none  실행할 여정 id(기본 all)",
  "  --journeys-only          라우트 측정 없이 여정만",
  "  --base-url URL           기본: 환경 파일의 TOONSTUDIO_LOCAL_WEB_ORIGIN 또는 http://127.0.0.1:5273",
  "  --server dev|production  서버 종류(기본 자동 판정). dev 이면 시간 지표(CLS·LCP·준비 시간)를 점수에서 제외한다",
  "  --out DIR                결과 폴더(기본 artifacts/ux-audit/<UTC시각>)",
  "  --no-screenshots         화면 스크린샷을 저장하지 않는다",
  "  --no-warmup              개발 서버 예열(첫 컴파일 비용 제거)을 건너뛴다",
  "  --print-rubric           점수 규칙 표(Markdown)를 출력하고 끝낸다",
  "  --compare A.json B.json  두 보고서의 점수 차이를 출력하고 끝낸다",
  "  --self-check             내장 HTML 로 측정 도구 자체를 점검한다(스택 불필요, Chromium 필요)",
  "  --json                   요약을 JSON 으로도 출력한다",
  "  --help                   이 도움말",
  "",
  "예: node scripts/ux-audit/run.mjs --dry",
  "    PLAYWRIGHT_EXECUTABLE_PATH=/opt/pw-browsers/chromium node scripts/ux-audit/run.mjs --routes home --viewports desktop --journeys none",
].join("\n");

const FLAGS = new Set(["dry", "journeys-only", "no-screenshots", "no-warmup", "print-rubric", "self-check", "json", "help"]);
const VALUE_OPTIONS = new Set(["routes", "viewports", "auth", "journeys", "base-url", "server", "out"]);

/** @param {readonly string[]} argv */
export function parseArguments(argv) {
  const options = {
    dry: false, journeysOnly: false, screenshots: true, warmup: true, printRubric: false, selfCheck: false, json: false, help: false,
    routes: [], viewports: [], auth: null, journeys: "all", baseUrl: null, server: "auto", out: null, compare: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new UsageError(`알 수 없는 인자: ${argument}`);
    const name = argument.slice(2);
    if (name === "compare") {
      const first = argv[index + 1];
      const second = argv[index + 2];
      if (!first || !second || first.startsWith("--") || second.startsWith("--")) throw new UsageError("--compare 에는 보고서 두 개가 필요합니다.");
      options.compare = [first, second];
      index += 2;
    } else if (FLAGS.has(name)) {
      const key = name.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
      if (name === "no-screenshots") options.screenshots = false;
      else if (name === "no-warmup") options.warmup = false;
      else options[key] = true;
    } else if (VALUE_OPTIONS.has(name)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`--${name} 에는 값이 필요합니다.`);
      index += 1;
      if (name === "routes" || name === "viewports") options[name] = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      else if (name === "base-url") options.baseUrl = value;
      else options[name] = value;
    } else {
      throw new UsageError(`알 수 없는 옵션: ${argument}`);
    }
  }
  if (options.auth !== null && !["public", "user"].includes(options.auth)) throw new UsageError("--auth 는 public 또는 user 여야 합니다.");
  if (!["auto", "dev", "production"].includes(options.server)) throw new UsageError("--server 는 dev 또는 production 이어야 합니다.");
  return options;
}

/** --journeys 값을 실행할 여정 id 목록으로. */
export function resolveJourneyIds(spec) {
  if (spec === "none") return [];
  if (spec === "all") return [...JOURNEY_ORDER];
  const ids = spec.split(",").map((entry) => entry.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !JOURNEY_ORDER.includes(id));
  if (unknown.length > 0) throw new UsageError(`알 수 없는 여정: ${unknown.join(", ")} (가능: ${JOURNEY_ORDER.join(", ")})`);
  return JOURNEY_ORDER.filter((id) => ids.includes(id));
}

/**
 * 실행 계획. 로그인 상태가 필요한 칸·여정이 몇 개인지까지 센다.
 * @param {ReturnType<typeof parseArguments>} options
 */
export function buildPlan(options) {
  const selection = selectPlan({ routeIds: options.routes, viewportIds: options.viewports, ...(options.auth ? { auth: options.auth } : {}) });
  if (selection.unknownRoutes.length > 0) {
    throw new UsageError(`알 수 없는 라우트: ${selection.unknownRoutes.join(", ")} (가능: ${ROUTES.map((entry) => entry.id).join(", ")})`);
  }
  if (selection.unknownViewports.length > 0) {
    throw new UsageError(`알 수 없는 뷰포트: ${selection.unknownViewports.join(", ")} (가능: ${VIEWPORTS.map((entry) => entry.id).join(", ")})`);
  }
  const routes = options.journeysOnly ? [] : selection.routes;
  const cells = planCells(routes, selection.viewports);
  const journeyIds = resolveJourneyIds(options.journeys);
  return {
    routes,
    viewports: selection.viewports,
    cells,
    journeyIds,
    loginCells: cells.filter((cell) => requiresLogin(cell.route)).length,
    loginJourneys: journeyIds.filter((id) => journeyNeedsLogin(id)).length,
    publicRoutes: routes.filter((entry) => !requiresLogin(entry)).length,
    userRoutes: routes.filter((entry) => requiresLogin(entry)).length,
  };
}

/** 사람이 읽는 계획 출력. */
export function formatPlan(plan, { outDir } = {}) {
  const lines = [];
  lines.push("UI/UX 자동 측정 실행 계획");
  lines.push("");
  lines.push(`라우트 ${plan.routes.length}개(공개 ${plan.publicRoutes} · 로그인 필요 ${plan.userRoutes}) × 뷰포트 ${plan.viewports.length}종 = 측정 칸 ${plan.cells.length}개`);
  lines.push(`뷰포트: ${plan.viewports.map((viewport) => viewport.label).join(" · ")}`);
  lines.push(`여정 ${plan.journeyIds.length}개: ${plan.journeyIds.join(", ") || "(없음)"}`);
  lines.push(`로그인 필요: 칸 ${plan.loginCells}개 · 여정 ${plan.loginJourneys}개 (시드 테스트 계정, 자격증명은 읽기만 하고 출력하지 않음)`);
  if (outDir) lines.push(`결과 폴더: ${outDir}`);
  lines.push("");
  lines.push("| id | 경로 | 상태 | 구분 | 설명 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const route of plan.routes) {
    lines.push(`| ${route.id} | ${route.path} | ${route.auth === "user" ? "로그인" : "공개"} | ${route.group} | ${route.label} |`);
  }
  return lines.join("\n");
}
