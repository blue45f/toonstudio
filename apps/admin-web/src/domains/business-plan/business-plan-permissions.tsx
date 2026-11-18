import { createContext, useContext } from "react";

import type { BusinessPlanState } from "@toonstudio/contracts/business-plan";

/** 표시 권한은 서버 응답에서 받으며, 파일 생성은 매번 서버 재확인을 통과한다. */
export const BusinessPlanPermissions = createContext({
  canWrite: false,
  canExport: false,
  exportBoard: async (): Promise<BusinessPlanState | null> => null,
});

export const useBusinessPlanPermissions = () => useContext(BusinessPlanPermissions);
