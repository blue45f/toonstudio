import { createContext } from "react";

/** 원래 mutation 영수증을 사용하는 실제 제작 프로젝트 세션의 복구 동작만 전달한다. */
export const ProductionTaskOutputRefreshContext = createContext<(() => Promise<void>) | null>(null);
