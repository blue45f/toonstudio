import type { ProductionClientCommand } from "./production-api";

export interface ProductionCommandExecutionOptions { readonly expectedRevision: number }
export type ProductionCommandExecutor = (command: ProductionClientCommand, message: string, options?: ProductionCommandExecutionOptions) => Promise<void>;

/** 새 wire가 전혀 없는 로컬 충돌이다. 현재 내용을 검토한 뒤 명시적으로 다시 편집할 수 있다. */
export class ProductionCommandRevisionChangedError extends Error {
  constructor(message: string) { super(message); this.name = "ProductionCommandRevisionChangedError"; }
}
