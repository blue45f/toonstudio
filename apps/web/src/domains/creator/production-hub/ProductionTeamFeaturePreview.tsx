import { ProductionAssetLicenseDistributionSuite } from "./ProductionAssetLicenseDistributionSuite";
import { ProductionCrewWorkloadContractMatrixSuite } from "./ProductionCrewWorkloadContractMatrixSuite";
import { ProductionJiraConfluenceWorkflowSuite } from "./ProductionJiraConfluenceWorkflowSuite";
import { ProductionWorkspaceGovernanceSuite } from "./ProductionWorkspaceGovernanceSuite";

/** 서버에 연결되지 않은 예시는 샘플 프로젝트의 명시적 체험 경계에서만 연다. */
export function ProductionTeamFeaturePreview() {
  return <>
    <ProductionCrewWorkloadContractMatrixSuite />
    <ProductionWorkspaceGovernanceSuite />
    <ProductionJiraConfluenceWorkflowSuite />
    <ProductionAssetLicenseDistributionSuite />
  </>;
}
