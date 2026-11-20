#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wave 30: ToonStudio 거버넌스 스위트 결과를 GitHub Code Scanning / 엔터프라이즈 감사 시스템 호환
 * SARIF 2.1.0 JSON 포맷으로 직렬화·검증하는 무의존성 독립 CLI.
 */
export function buildGovernanceSarifReport(suiteResult) {
  const checks = Array.isArray(suiteResult?.checks) ? suiteResult.checks : [];
  const results = checks
    .filter((c) => !c.ok)
    .map((c) => ({
      ruleId: `TOONSTUDIO-GOV-${c.name.toUpperCase()}`,
      level: "error",
      message: {
        text: `Commercial governance check failed: ${c.name}`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: `scripts/${c.name}.mjs` },
          },
        },
      ],
    }));

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "ToonStudio Commercial Governance Suite",
            informationUri: "https://github.com/blue45f/toonstudio",
            rules: checks.map((c) => ({
              id: `TOONSTUDIO-GOV-${c.name.toUpperCase()}`,
              shortDescription: { text: `Verify ${c.name}` },
            })),
          },
        },
        properties: {
          receiptHash: suiteResult?.receiptHash ?? "unknown",
          passedCount: suiteResult?.passedCount ?? 0,
          totalCount: suiteResult?.totalCount ?? checks.length,
        },
        results,
      },
    ],
  };
}

export function verifyGovernanceSarifReport(sarif) {
  const ok =
    Boolean(sarif) &&
    sarif.version === "2.1.0" &&
    Array.isArray(sarif.runs) &&
    sarif.runs.length > 0 &&
    Array.isArray(sarif.runs[0].results) &&
    sarif.runs[0].results.length === 0;
  return {
    ok,
    summary: ok
      ? `SARIF 2.1.0 거버넌스 리포트 검증 통과 (0 errors · rules ${sarif.runs[0].tool.driver.rules.length})`
      : "SARIF 2.1.0 거버넌스 리포트에 실패 항목 또는 스키마 오류가 존재합니다.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sample = {
    receiptHash: "fnv1a-bc0b4c27",
    passedCount: 1,
    totalCount: 1,
    checks: [{ name: "verify-rights-bom-receipt-cli", ok: true }],
  };
  const sarif = buildGovernanceSarifReport(sample);
  console.log(JSON.stringify(sarif, null, 2));
}
