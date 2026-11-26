// --plan은 합성 S1 요청 직렬화만 실행한다. HTTP 응답 생성이나 실제 키가 필요 없다.
// 저장소 루트에서 TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx \
//   scripts/two-cut-server-approval.mts --plan gpt-4o-mini
// root는 단독 QA 프로젝트에서 동시 사용이 없고 크레딧 잔액·만료·모델 적격·추가 유료 지출 차단과
// 현 단가(입력 $1/출력 $2 이하, 각 100만 토큰 기준), 실제 전송 경계를 확인한 뒤에만 승인한다.
// --arm-S1 MODEL 잔액(정수 microUSD) 크레딧만료(UTC ISO 시각). 키/조직/프로젝트는 환경으로만 받는다.
// API와 같은 전용 OS 사용자로 실행한다. 서버 소비 기록은 브라우저의 S1.spent와 별개다.
import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkDirectory, deniedPlan, directory, endpoint, inspectBody, keyBinding, verifyApproval } from "./two-cut-server-egress.mjs";

async function main() {
  const [command, model, credit, expiry] = process.argv.slice(2);
  if (!(command === "--plan" && process.argv.length === 4)
    && !(command === "--arm-S1" && process.argv.length === 6)) throw new Error();
  if (process.env.TWO_CUT_QA_PHASE === "S1") throw new Error();
  const { StudioOpenAiCreativeAssistService } = await import("../apps/api/src/modules/studio-ai/studio-openai-creative-assist.service");
  const { CREDIT_EVALUATION_FIXTURES } = await import("./studio-openai-credit-evaluation-fixtures");
  const fixture = CREDIT_EVALUATION_FIXTURES.find(item => item.id === "S1-continuity");
  if (!fixture) throw new Error();
  const { mode, inputText, targetPlatform } = fixture.input;
  // fetchImpl을 주입하지 않고 API가 선택한 실제 fetch에서 거부된 요청만 관찰한다.
  const plans: ReturnType<typeof inspectBody>[] = [];
  deniedPlan.subscribe((observed) => { plans.push(observed as ReturnType<typeof inspectBody>); });
  await new StudioOpenAiCreativeAssistService().assist("qa-two-cut-synthetic", { mode, inputText, targetPlatform }, {
    env: { OPENAI_API_KEY: "offline-placeholder", OPENAI_MODEL: model },
  }).catch(() => undefined);
  const [plan] = plans;
  if (plans.length !== 1 || plan.model !== model) throw new Error();
  if (command === "--plan") {
    console.log(JSON.stringify({ phase: "S1", endpoint, ...plan }));
    return;
  }

  const verifiedAt = Date.now();
  const creditExpiresAt = Date.parse(expiry);
  if (!/^\d+$/u.test(credit) || !expiry.endsWith("Z")) throw new Error();
  const gate = { phase: "S1", decision: "root-verified-promo-only", endpoint, ...plan,
    keyBinding: keyBinding(process.env.OPENAI_API_KEY, process.env.OPENAI_ORG_ID, process.env.OPENAI_PROJECT_ID),
    creditMicroUsd: Number(credit), verifiedAt, expiresAt: Math.min(verifiedAt + 900_000, creditExpiresAt), creditExpiresAt };
  verifyApproval(gate);
  mkdirSync(directory, { mode: 0o700, recursive: true });
  checkDirectory(directory);
  const fd = openSync(join(directory, "S1.json"), "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(gate));
    fsyncSync(fd);
  } finally { closeSync(fd); }
  console.log("S1 서버 승인 파일을 생성했습니다.");
}

main().catch(() => {
  console.error("S1 승인 실패. 실행 인자, 모델, 크레딧, 키 귀속, 전용 디렉터리와 기존 승인 여부를 확인하세요.");
  process.exitCode = 1;
});
