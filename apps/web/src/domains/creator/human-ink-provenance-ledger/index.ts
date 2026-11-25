/**
 * Wave 58C — 자가 신고 작화 표본의 로컬 체크섬·unsigned JSON 메모 공개 배럴.
 */

export {
  CRYPTOGRAPHIC_SCOPE_PREVIEW,
  GENESIS_CHAIN_HASH_HEX,
  HUMAN_INK_SCENARIOS,
  MERKLE_SVG_HEIGHT,
  MERKLE_SVG_WIDTH,
  RATIO_GAUGE_SVG_HEIGHT,
  RATIO_GAUGE_SVG_WIDTH,
  VIOLET_SLOP_MAX_HUE,
  VIOLET_SLOP_MIN_HUE,
  buildHumanInkMerkleLedger,
  buildScenarioHumanInkLedger,
  computeChainStepHashHex,
  computeEventDigestHex,
  computeLeafHashHex,
  computeParentHashHex,
  computePressureEntropyBits,
  computeTileDeltaHashHex,
  computeVelocityVariance,
  createNextHumanPenStrokeEvent,
  encodeUtf8Bytes,
  evaluateRightsBomContaminationGate,
  exportC2paHumanInkManifestJson,
  fnv1a64Hex,
  fnv1a64Words,
  formatOklch,
  getHumanInkScenario,
  injectSingleByteTamper,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  serializeEventCanonical,
  verifyHumanInkLedger,
  verifyMerkleInclusionProof,
  type BuildHumanInkLedgerOptions,
  type HumanInkEventKind,
  type HumanInkLedgerEvent,
  type HumanInkMerkleLedger,
  type HumanInkScenarioId,
  type HumanInkScenarioSpec,
  type HumanInkSummaryProof,
  type LedgerVerificationReport,
  type MerkleInclusionProof,
  type MerkleInclusionVerificationResult,
  type MerkleProofStep,
  type OklchColor,
  type RightsBomContaminationGateResult,
  type RightsBomLicenseClass,
  type SingleByteTamperResult,
  type TamperMutationMode,
} from "./human-ink-ledger-engine";

export {
  StudioHumanInkLedgerPanel,
  type StudioHumanInkLedgerPanelProps,
} from "./StudioHumanInkLedgerPanel";

export { digestHumanInkNoteJson, type HumanInkNoteDigest } from "./human-ink-note-digest";
export { MAX_LEDGER_EVENTS, MAX_TELEMETRY_SAMPLES, MAX_LEDGER_TEXT_UNITS } from "./human-ink-input-contract";
