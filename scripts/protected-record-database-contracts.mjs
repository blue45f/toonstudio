import { buildAiOperationsRuntimeAclSql, buildAiOperationsCapabilitySql } from "./ai-operations-database-contract.mjs";
import { buildCustomerSupportRuntimeAclSql, buildCustomerSupportCapabilitySql } from "./customer-support-database-contract.mjs";

// 공용 운영 기록과 비공개 상담 기록은 감사·원문 보존 권한을 각각 적용하고 곧바로 검증한다.
const contracts = [
  [buildAiOperationsRuntimeAclSql, buildAiOperationsCapabilitySql],
  [buildCustomerSupportRuntimeAclSql, buildCustomerSupportCapabilitySql],
];

export function applyProtectedRecordRuntimeContracts(executeSql, runtimeRole) {
  const statements = contracts.flatMap(([acl, capability]) => [acl(runtimeRole), capability(runtimeRole)]);
  // 호출자는 각 SQL의 기존 연결·오류 정책을 유지한다. 실패하면 다음 계약을 적용하지 않는다.
  for (const statement of statements) executeSql(statement);
}

export function buildProtectedRecordCapabilitySql(runtimeRole) {
  return contracts.map(([, capability]) => capability(runtimeRole)).join("\n");
}
