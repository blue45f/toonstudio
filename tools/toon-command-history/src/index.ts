export {
  VALID_PANEL_KINDS,
  VALID_TEXT_FIELDS,
  ToonCommandHistoryError,
  deepFreezeClone,
  isValidPanelId,
  normalizeVirtualPanelDraft,
  reindexVirtualPanels,
  createVirtualPanelBoard,
} from "./virtual-panel-model.ts";

export type {
  VirtualPanelKind,
  VirtualPanelTextField,
  VirtualPanelTextContent,
  VirtualPanel,
  VirtualPanelBoardState,
  VirtualPanelDraftInput,
  VirtualPanelBoardSeedInput,
  CommandErrorCode,
} from "./virtual-panel-model.ts";

export { applyPanelEditCommand } from "./panel-commands.ts";

export type {
  AddPanelCommand,
  RemovePanelCommand,
  ReorderPanelCommand,
  EditPanelTextCommand,
  PanelEditCommand,
  ReversibleAtomicStep,
  ApplyPanelCommandResult,
} from "./panel-commands.ts";

export {
  DEFAULT_HISTORY_CAPACITY,
  ToonPanelCommandHistoryEngine,
} from "./command-history-engine.ts";

export type {
  HistoryTransactionRecord,
  HistoryAtomicRecord,
  HistoryRecord,
  HistoryEntrySummary,
  ToonCommandHistoryOptions,
  HistoryTransitionResult,
} from "./command-history-engine.ts";
