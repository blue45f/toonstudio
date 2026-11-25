/**
 * Wave 58C — 자가 신고 표본의 머클 체크섬·메타데이터 예제 제어판.
 *
 * - 고정 자가 신고 이벤트 3종의 체크섬·포함 경로 시각화
 * - 합성 표본 스트로크 추가, 표본 필드 변조 주입 토글(4종 변조 모드), O(log N) 머클 포함 증명 검증
 * - 순수 시맨틱 SVG 이진 머클 트리·해시 체인 & 자가 신고 이벤트 구성 비율(OKLCH·currentColor 전용)
 * - 권리 정본·실제 캔버스·서명·인증·저장은 연결하지 않고 JSON 메모를 복사한다.
 */

import {
  AlertTriangle, CheckCircle2, Code2, Copy, Fingerprint, GitBranch, Layers, Lock, PenTool, RotateCcw, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  CRYPTOGRAPHIC_SCOPE_PREVIEW, HUMAN_INK_SCENARIOS, MERKLE_SVG_HEIGHT, MERKLE_SVG_WIDTH, RATIO_GAUGE_SVG_HEIGHT, RATIO_GAUGE_SVG_WIDTH,
  buildHumanInkMerkleLedger, createNextHumanPenStrokeEvent, exportC2paHumanInkManifestJson, formatOklch, getHumanInkScenario,
  injectSingleByteTamper, verifyHumanInkLedger, verifyMerkleInclusionProof,
  type HumanInkEventKind, type HumanInkLedgerEvent, type HumanInkMerkleLedger, type HumanInkScenarioId,
  type LedgerVerificationReport, type MerkleInclusionProof, type MerkleInclusionVerificationResult, type RightsBomLicenseClass, type TamperMutationMode,
} from "./human-ink-ledger-engine";
import { MAX_LEDGER_EVENTS } from "./human-ink-input-contract";
import { useLedgerExport, useLedgerNotification } from "./use-ledger-operations";

export interface StudioHumanInkLedgerPanelProps {
  readonly initialScenarioId?: HumanInkScenarioId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onLedgerChange?: (ledger: HumanInkMerkleLedger, verification: LedgerVerificationReport) => void | Promise<void>;
  readonly onExportJson?: (json: string, ledger: HumanInkMerkleLedger) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const BTN_DANGER = `${BTN_BASE} border border-bad bg-bad/10 px-3 py-2 text-bad hover:bg-bad/15`;

const SVG_BG = formatOklch({ l: 0.965, c: 0.007, h: 88 });
const SVG_HUD_BG = formatOklch({ l: 0.19, c: 0.015, h: 236 }, 0.92);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.005, h: 86 });
const SVG_NODE_BG = formatOklch({ l: 0.992, c: 0.004, h: 84 });
const SVG_EDGE_MUTED = formatOklch({ l: 0.62, c: 0.025, h: 228 });
const SVG_TEXT_DARK = formatOklch({ l: 0.21, c: 0.016, h: 238 });
const SVG_TEXT_SUB = formatOklch({ l: 0.44, c: 0.022, h: 230 });
const SVG_COLOR_HUMAN = formatOklch({ l: 0.52, c: 0.13, h: 156 });
const SVG_COLOR_CC0 = formatOklch({ l: 0.53, c: 0.125, h: 222 });
const SVG_COLOR_3D = formatOklch({ l: 0.62, c: 0.13, h: 76 });
const SVG_COLOR_FILTER = formatOklch({ l: 0.55, c: 0.07, h: 204 });
const SVG_COLOR_CONTAM = formatOklch({ l: 0.55, c: 0.185, h: 24 });
const SVG_COLOR_TAMPER_BG = formatOklch({ l: 0.94, c: 0.045, h: 26 });
const SVG_COLOR_PROOF_BG = formatOklch({ l: 0.94, c: 0.035, h: 222 });
const SVG_CHAIN_ARROW = formatOklch({ l: 0.48, c: 0.08, h: 172 });

const TAMPER_MODES: readonly { readonly id: TamperMutationMode; readonly ko: string; readonly en: string }[] = [
  { id: "pressure-1bit", ko: "필압 소수 변경", en: "Pressure Decimal Change" },
  { id: "timestamp-1ms", ko: "타임스탬프 +1ms", en: "Timestamp +1ms" },
  { id: "source-spoof", ko: "출처 라이선스 위조", en: "License Spoof" },
  { id: "tile-hash-1byte", ko: "타일 해시 1자리", en: "Tile Hash Digit" },
];

const KIND_LABELS: Readonly<Record<HumanInkEventKind, { readonly ko: string; readonly en: string }>> = {
  "human-pen-stroke": { ko: "인간 펜 스트로크", en: "Human Stroke" },
  "procedural-cc0-asset": { ko: "절차적 CC0", en: "Procedural CC0" },
  "3d-bg-placement": { ko: "3D 배경 배치", en: "3D BG Place" },
  "non-destructive-filter": { ko: "비파괴 필터", en: "Filter Layer" },
  "unverified-external-scan": { ko: "미검증 외부 스캔", en: "Unverified Scan" },
};

const LICENSE_LABELS: Readonly<Record<RightsBomLicenseClass, { readonly ko: string; readonly en: string }>> = {
  "human-ink-original": { ko: "직접 작화 신고", en: "human-ink-original" },
  "clean-procedural-cc0": { ko: "절차적 CC0 신고", en: "clean-procedural-cc0" },
  "byot-personal-render": { ko: "BYOT 신고 렌더", en: "byot-personal-render" },
  "external-unverified-raw-scan": { ko: "미검증 스캔 태그", en: "external-unverified-raw-scan" },
};

function MerkleTreeHashChainSvg(props: {
  readonly ledger: HumanInkMerkleLedger; readonly verification: LedgerVerificationReport;
  readonly selectedLeafIndex: number; readonly proof: MerkleInclusionProof | null; readonly isEn: boolean;
}): ReactElement {
  const { ledger, verification, selectedLeafIndex, proof, isEn } = props;
  const levels = ledger.treeLevels;
  const levelCount = levels.length;
  const tamperedSet = new Set<string>();
  for (const idx of verification.tamperedLeafIndices) {
    let cur = idx;
    for (let lv = 0; lv < levelCount; lv += 1) { tamperedSet.add(`${lv}:${cur}`); cur = Math.floor(cur / 2); }
  }
  const proofPathSet = new Set<string>();
  const siblingSet = new Set<string>();
  if (proof) {
    let cur = proof.leafIndex;
    for (let lv = 0; lv < levelCount; lv += 1) {
      proofPathSet.add(`${lv}:${cur}`);
      const step = proof.siblings[lv];
      if (step) siblingSet.add(`${lv}:${step.position === "left" ? cur - 1 : step.duplicated ? cur : cur + 1}`);
      cur = Math.floor(cur / 2);
    }
  }
  const contaminatedLeafSet = new Set<number>(ledger.rightsBomGate.contaminatedIndices);
  const topPad = 24;
  const rowStep = levelCount > 1 ? (MERKLE_SVG_HEIGHT - topPad - 48) / (levelCount - 1) : 0;
  const getPos = (lv: number, idx: number, count: number): { x: number; y: number } => ({
    x: count <= 1 ? MERKLE_SVG_WIDTH / 2 : 28 + ((MERKLE_SVG_WIDTH - 56) * idx) / (count - 1),
    y: topPad + (levelCount - 1 - lv) * rowStep,
  });
  const leafNodes = levels[0] ?? [];

  return (
    <svg
      data-testid="human-ink-merkle-svg" data-merkle-root={ledger.merkleRootHex}
      data-recomputed-root={verification.recomputedMerkleRootHex} data-leaf-count={ledger.events.length}
      data-tree-depth={ledger.treeDepth} data-tampered={String(verification.tampered)}
      data-selected-leaf={selectedLeafIndex} data-violet-free="true"
      viewBox={`0 0 ${MERKLE_SVG_WIDTH} ${MERKLE_SVG_HEIGHT}`} role="img"
      aria-label={isEn ? `Binary Merkle tree and sequential hash chain with ${ledger.events.length} leaves, depth ${ledger.treeDepth}` : `리프 ${ledger.events.length}건, 깊이 ${ledger.treeDepth}단계 이진 머클 트리 및 해시 체인`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width={MERKLE_SVG_WIDTH} height={MERKLE_SVG_HEIGHT} fill={SVG_BG} />
      <g fill="none">
        {levels.map((nodes, lv) => {
          if (lv === 0) return null;
          const children = levels[lv - 1] ?? [];
          return nodes.map((_, pIdx) => {
            const pPos = getPos(lv, pIdx, nodes.length);
            const left = pIdx * 2;
            const childIndices = left + 1 < children.length ? [left, left + 1] : [left];
            return childIndices.map((cIdx) => {
              const cPos = getPos(lv - 1, cIdx, children.length);
              const edgeTampered = tamperedSet.has(`${lv}:${pIdx}`) && tamperedSet.has(`${lv - 1}:${cIdx}`);
              const edgeProof = proofPathSet.has(`${lv}:${pIdx}`) && (proofPathSet.has(`${lv - 1}:${cIdx}`) || siblingSet.has(`${lv - 1}:${cIdx}`));
              const stroke = edgeTampered ? SVG_COLOR_CONTAM : edgeProof ? SVG_COLOR_CC0 : SVG_EDGE_MUTED;
              return <line key={`e-${lv}-${pIdx}-${cIdx}`} x1={pPos.x} y1={pPos.y + 11} x2={cPos.x} y2={cPos.y - 11} stroke={stroke} strokeWidth={edgeTampered || edgeProof ? 1.8 : 1.1} strokeDasharray={edgeTampered ? "3 2" : undefined} />;
            });
          });
        })}
      </g>
      <g fill="none" stroke={verification.chainTipMatches ? SVG_CHAIN_ARROW : SVG_COLOR_CONTAM} strokeWidth="1.2">
        {leafNodes.map((_, idx) => {
          if (idx + 1 >= leafNodes.length) return null;
          const a = getPos(0, idx, leafNodes.length);
          const b = getPos(0, idx + 1, leafNodes.length);
          return <line key={`chain-${idx}`} x1={a.x + 14} y1={a.y} x2={b.x - 14} y2={b.y} strokeDasharray="2 2" />;
        })}
      </g>
      <g>
        {levels.map((nodes, lv) => {
          const isRoot = lv === levelCount - 1;
          const isLeaf = lv === 0;
          const boxW = isRoot ? 112 : isLeaf ? Math.max(30, Math.min(42, Math.floor(330 / Math.max(1, nodes.length)))) : 52;
          const boxH = isRoot ? 24 : 21;
          return nodes.map((hashHex, idx) => {
            const pos = getPos(lv, idx, nodes.length);
            const key = `${lv}:${idx}`;
            const isTampered = tamperedSet.has(key);
            const isSelected = isLeaf && idx === selectedLeafIndex;
            const isSibling = siblingSet.has(key);
            const isContam = isLeaf && contaminatedLeafSet.has(idx);
            const border = isTampered || isContam ? SVG_COLOR_CONTAM : isSelected || isSibling ? SVG_COLOR_CC0 : isRoot ? SVG_COLOR_HUMAN : SVG_EDGE_MUTED;
            const fill = isTampered || isContam ? SVG_COLOR_TAMPER_BG : isSelected || isSibling ? SVG_COLOR_PROOF_BG : SVG_NODE_BG;
            const label = isRoot ? `ROOT ${hashHex.slice(0, 8)}` : isLeaf ? `L${idx}` : hashHex.slice(0, 6);
            return (
              <g key={`n-${key}`}>
                <rect x={pos.x - boxW / 2} y={pos.y - boxH / 2} width={boxW} height={boxH} rx="5" fill={fill} stroke={border} strokeWidth={isSelected || isTampered || isRoot ? 1.8 : 1.1} />
                <text x={pos.x} y={pos.y + 3} textAnchor="middle" fill={isTampered || isContam ? SVG_COLOR_CONTAM : SVG_TEXT_DARK} fontSize={isRoot ? "8.2" : "7.6"} fontFamily="monospace" fontWeight={isSelected || isRoot || isTampered ? "700" : "600"}>{label}</text>
              </g>
            );
          });
        })}
      </g>
      <rect x="12" y={MERKLE_SVG_HEIGHT - 30} width={MERKLE_SVG_WIDTH - 24} height="22" rx="6" fill={SVG_HUD_BG} />
      <text x="20" y={MERKLE_SVG_HEIGHT - 16} fill={SVG_HUD_TEXT} fontSize="8" fontFamily="monospace" fontWeight="700">
        {verification.tampered
          ? `ALERT TAMPER LEAF #${verification.firstTamperedIndex ?? 0} · ROOT MISMATCH (${verification.recomputedMerkleRootHex.slice(0, 8)})`
          : `FNV1A-64 ROOT ${ledger.merkleRootHex.slice(0, 10)} · DEPTH ${ledger.treeDepth} · CHAIN ${ledger.chainTipHex.slice(0, 8)} OK`}
      </text>
    </svg>
  );
}

function AuthorshipRatioGaugeSvg(props: { readonly ledger: HumanInkMerkleLedger; readonly isEn: boolean }): ReactElement {
  const { ledger, isEn } = props;
  const s = ledger.summaryProof;
  const barX = 14; const barY = 24; const barW = RATIO_GAUGE_SVG_WIDTH - 28; const barH = 22;
  const segments = [
    { key: "human", pct: s.humanInkStrokeRatioPercent, color: SVG_COLOR_HUMAN, label: isEn ? "Human" : "인간 작화" },
    { key: "cc0", pct: s.proceduralCc0AssetRatioPercent, color: SVG_COLOR_CC0, label: "CC0" },
    { key: "bg3d", pct: s.bg3dPlacementRatioPercent, color: SVG_COLOR_3D, label: "3D BYOT" },
    { key: "filter", pct: s.nonDestructiveFilterRatioPercent, color: SVG_COLOR_FILTER, label: isEn ? "Filter" : "필터" },
    { key: "scan", pct: s.unverifiedExternalRatioPercent, color: SVG_COLOR_CONTAM, label: isEn ? "Scan" : "미검증 스캔" },
  ];
  const placed: { key: string; x: number; w: number; color: string }[] = [];
  let cursorX = barX;
  for (const seg of segments) {
    if (seg.pct <= 0) continue;
    const clampedW = Math.min(Math.max(4, (barW * seg.pct) / 100), barX + barW - cursorX);
    if (clampedW > 0) { placed.push({ key: seg.key, x: cursorX, w: clampedW, color: seg.color }); cursorX += clampedW; }
  }

  return (
    <svg
      data-testid="human-ink-ratio-gauge-svg" data-human-ratio={s.humanInkStrokeRatioPercent}
      data-cc0-ratio={s.proceduralCc0AssetRatioPercent} data-contaminated-count={s.unverifiedExternalScanCount}
      data-zero-pixel-exposure={String(s.zeroPixelExposure)} data-violet-free="true"
      viewBox={`0 0 ${RATIO_GAUGE_SVG_WIDTH} ${RATIO_GAUGE_SVG_HEIGHT}`} role="img"
      aria-label={isEn ? `Self-declared sample event ratios: human tag ${s.humanInkStrokeRatioPercent}%, CC0 ${s.proceduralCc0AssetRatioPercent}%, unverified scan ${s.unverifiedExternalScanCount}` : `자가 신고 이벤트 구성 비율: 인간 작화 ${s.humanInkStrokeRatioPercent}%, CC0 ${s.proceduralCc0AssetRatioPercent}%, 미검증 스캔 ${s.unverifiedExternalScanCount}건`}
      className="h-24 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width={RATIO_GAUGE_SVG_WIDTH} height={RATIO_GAUGE_SVG_HEIGHT} fill={SVG_BG} />
      <text x={barX} y="15" fill={SVG_TEXT_DARK} fontSize="8.5" fontFamily="monospace" fontWeight="700">
        {isEn ? `SAMPLE TAGS (NO PIXEL BUFFER) · HUMAN ${s.humanInkStrokeRatioPercent}% · CC0 ${s.proceduralCc0AssetRatioPercent}%` : `표본 태그 (픽셀 버퍼 없음) · 인간 ${s.humanInkStrokeRatioPercent}% · 절차적 CC0 ${s.proceduralCc0AssetRatioPercent}%`}
      </text>
      <rect x={barX} y={barY} width={barW} height={barH} rx="6" fill={SVG_NODE_BG} stroke={SVG_EDGE_MUTED} strokeWidth="1" />
      {placed.map((seg) => <rect key={seg.key} x={seg.x} y={barY + 1} width={seg.w} height={barH - 2} rx="3" fill={seg.color} />)}
      <g>
        {segments.map((seg, i) => (
          <g key={`leg-${seg.key}`}>
            <rect x={barX + i * 79} y="56" width="8" height="8" rx="2" fill={seg.color} />
            <text x={barX + i * 79 + 11} y="63" fill={SVG_TEXT_SUB} fontSize="7.6" fontFamily="monospace">{`${seg.label} ${seg.pct}%`}</text>
          </g>
        ))}
      </g>
      <text x={barX} y="78" fill={SVG_TEXT_SUB} fontSize="7.4" fontFamily="monospace">
        {`PRESSURE ENTROPY ${s.meanPressureEntropyBits.toFixed(2)} bits · VELOCITY VAR ${s.meanVelocityVariance.toFixed(2)} · SUMMARY ${s.summaryCommitmentHex.slice(0, 10)}`}
      </text>
    </svg>
  );
}

/** 자가 신고 표본의 머클 체크섬·메타데이터 예제 제어판. */
export function StudioHumanInkLedgerPanel(props: StudioHumanInkLedgerPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialScenario = getHumanInkScenario(props.initialScenarioId ?? "pure-human-ink");
  const [scenarioId, setScenarioId] = useState<HumanInkScenarioId>(initialScenario.id);
  const [committedEvents, setCommittedEvents] = useState<readonly HumanInkLedgerEvent[]>(initialScenario.events);
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number>(Math.min(2, Math.max(0, initialScenario.events.length - 1)));
  const [tamperActive, setTamperActive] = useState<boolean>(false);
  const [tamperMode, setTamperMode] = useState<TamperMutationMode>("pressure-1bit");
  const [proofCheckCount, setProofCheckCount] = useState<number>(0);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const exportOperation = useLedgerExport(props.onExportJson);
  const notification = useLedgerNotification<{ readonly ledger: HumanInkMerkleLedger; readonly verification: LedgerVerificationReport }>(props.onLedgerChange ? ({ ledger, verification: report }) => props.onLedgerChange?.(ledger, report) : undefined);
  const [jsonDrawerOpen, setJsonDrawerOpen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const activeScenario = useMemo(() => getHumanInkScenario(scenarioId), [scenarioId]);
  const safeSelectedLeaf = Math.min(selectedLeafIndex, Math.max(0, committedEvents.length - 1));

  const committedLedger = useMemo(
    () => buildHumanInkMerkleLedger(committedEvents, { workId: activeScenario.workId, scenarioId: activeScenario.id, episodeTitleKo: activeScenario.episodeTitleKo, episodeTitleEn: activeScenario.episodeTitleEn, recordedAtIso: activeScenario.recordedAtIso, pageCount: activeScenario.pageCount }),
    [activeScenario, committedEvents],
  );
  const tamperResult = useMemo(
    () => (tamperActive ? injectSingleByteTamper(committedEvents, safeSelectedLeaf, tamperMode) : null),
    [tamperActive, committedEvents, safeSelectedLeaf, tamperMode],
  );
  const inspectedEvents = tamperResult ? tamperResult.tamperedEvents : committedEvents;
  const verification = useMemo(() => verifyHumanInkLedger(committedLedger, inspectedEvents), [committedLedger, inspectedEvents]);
  const selectedProof = committedLedger.inclusionProofs[safeSelectedLeaf] ?? null;
  const selectedProofVerification: MerkleInclusionVerificationResult | null = useMemo(
    () => (selectedProof ? verifyMerkleInclusionProof(selectedProof, { candidateEvent: inspectedEvents[safeSelectedLeaf], expectedMerkleRootHex: committedLedger.merkleRootHex }) : null),
    [selectedProof, inspectedEvents, safeSelectedLeaf, committedLedger.merkleRootHex],
  );
  const c2paJsonText = useMemo(
    () => exportC2paHumanInkManifestJson(committedLedger, verification, safeSelectedLeaf),
    [committedLedger, verification, safeSelectedLeaf],
  );

  const notifyChange = (nextEvents: readonly HumanInkLedgerEvent[], nextScenarioId: HumanInkScenarioId, nextTamper: boolean, nextLeaf: number, nextMode: TamperMutationMode): void => {
    const sc = getHumanInkScenario(nextScenarioId);
    const nextLedger = buildHumanInkMerkleLedger(nextEvents, { workId: sc.workId, scenarioId: sc.id, episodeTitleKo: sc.episodeTitleKo, episodeTitleEn: sc.episodeTitleEn, recordedAtIso: sc.recordedAtIso, pageCount: sc.pageCount });
    const clampedIdx = Math.min(nextLeaf, Math.max(0, nextEvents.length - 1));
    const candidate = nextTamper ? injectSingleByteTamper(nextEvents, clampedIdx, nextMode).tamperedEvents : nextEvents;
    notification.notify({ ledger: nextLedger, verification: verifyHumanInkLedger(nextLedger, candidate) });
  };

  const handleSelectScenario = (nextId: HumanInkScenarioId): void => {
    const next = getHumanInkScenario(nextId);
    const defaultLeaf = nextId === "contaminated-external-scan" ? 3 : Math.min(2, next.events.length - 1);
    setScenarioId(next.id); setCommittedEvents(next.events); setSelectedLeafIndex(defaultLeaf); setTamperActive(false); setProofCheckCount(0);
    notifyChange(next.events, next.id, false, defaultLeaf, tamperMode);
    setStatusMessage(pick(`'${next.nameKo}' 원고 시나리오를 불러와 머클 원장을 재봉인했습니다.`, `Loaded '${next.nameEn}' scenario and sealed its Merkle ledger.`));
  };

  const handleAddHumanStroke = (): void => {
    const nextEvent = createNextHumanPenStrokeEvent(committedEvents);
    const nextEvents = [...committedEvents, nextEvent];
    const nextLeaf = nextEvents.length - 1;
    setCommittedEvents(nextEvents); setSelectedLeafIndex(nextLeaf); setTamperActive(false);
    notifyChange(nextEvents, scenarioId, false, nextLeaf, tamperMode);
    setStatusMessage(pick(`표본 펜 스트로크 ${nextEvent.eventId}(${nextEvent.toolLabel})를 원장에 추가하고 머클 루트를 갱신했습니다.`, `Appended sample pen stroke ${nextEvent.eventId} (${nextEvent.toolLabel}) and recomputed the Merkle root.`));
  };

  const handleToggleTamper = (): void => {
    const nextActive = !tamperActive;
    setTamperActive(nextActive);
    notifyChange(committedEvents, scenarioId, nextActive, safeSelectedLeaf, tamperMode);
    if (nextActive) {
      const injected = injectSingleByteTamper(committedEvents, safeSelectedLeaf, tamperMode);
      setStatusMessage(pick(`변조 시연 활성: ${injected.mutationSummaryKo} 머클 루트 불일치가 즉시 적발되었습니다.`, `Tamper drill active: ${injected.mutationSummaryEn} Merkle mismatch caught immediately.`));
    } else {
      setStatusMessage(pick("표본 필드 변조를 해제해 원본 봉인 상태로 복구했습니다.", "Cleared the sample field change and restored checksum consistency."));
    }
  };

  const handleSelectTamperMode = (nextMode: TamperMutationMode): void => {
    setTamperMode(nextMode);
    if (tamperActive) {
      notifyChange(committedEvents, scenarioId, true, safeSelectedLeaf, nextMode);
      const injected = injectSingleByteTamper(committedEvents, safeSelectedLeaf, nextMode);
      setStatusMessage(pick(injected.mutationSummaryKo, injected.mutationSummaryEn));
    }
  };

  const handleVerifyInclusionProof = (): void => {
    setProofCheckCount((c) => c + 1);
    if (!selectedProofVerification) return;
    setStatusMessage(
      selectedProofVerification.valid
        ? pick(`리프 #${selectedProofVerification.leafIndex}(${selectedProofVerification.eventId}) O(log N) 포함 증명 검증 통과(${selectedProofVerification.proofDepth}단계 형제 해시 일치).`, `Leaf #${selectedProofVerification.leafIndex} (${selectedProofVerification.eventId}) O(log N) inclusion proof verified (${selectedProofVerification.proofDepth} sibling steps).`)
        : pick(`리프 #${selectedProofVerification.leafIndex}(${selectedProofVerification.eventId}) 포함 증명 실패(${selectedProofVerification.reasonCode}): 루트 해시가 일치하지 않습니다.`, `Leaf #${selectedProofVerification.leafIndex} (${selectedProofVerification.eventId}) inclusion proof failed (${selectedProofVerification.reasonCode}).`),
    );
  };

  const handleCopyC2paJson = (): void => {
    setJsonDrawerOpen(true); setShowSnapshot(true);
    void exportOperation.run({ json: c2paJsonText, ledger: committedLedger });
    setStatusMessage(pick("표본 JSON의 SHA-256 계산·복사·알림을 기다립니다. 원장은 저장하지 않았습니다.", "Waiting for sample JSON SHA-256, copy, and notification. Ledger not saved."));
  };

  const handleReset = (): void => {
    const base = getHumanInkScenario(props.initialScenarioId ?? "pure-human-ink");
    const defaultLeaf = base.id === "contaminated-external-scan" ? 3 : Math.min(2, base.events.length - 1);
    setScenarioId(base.id); setCommittedEvents(base.events); setSelectedLeafIndex(defaultLeaf);
    setTamperActive(false); setTamperMode("pressure-1bit"); setProofCheckCount(0); setJsonDrawerOpen(false);
    notifyChange(base.events, base.id, false, defaultLeaf, "pressure-1bit");
    setStatusMessage(pick("초기 원고 시나리오와 검증 상태로 되돌렸습니다.", "Reset scenario and ledger verification state."));
  };

  const { summaryProof, rightsBomGate } = committedLedger;
  const exportBlocked = !rightsBomGate.exportAllowed || verification.tampered;
  const gateBadgeText = verification.tampered
    ? pick("표본 머클 변조 적발 · 출고 권한 없음", "Export Blocked · Sample Mismatch")
    : rightsBomGate.contaminatedEventCount > 0
      ? pick("출고 차단 · 외부 스캔 오염 태그", "Export Blocked · External Scan Tag")
      : pick("출고 차단 · 권리 미검증", "Export Blocked · Rights Unverified");

  return (
    <section
      data-testid="human-ink-ledger-panel"
      aria-label={pick("자가 신고 작화 표본 머클 원장·체크섬 예제", "Human Ink Provenance Merkle Ledger · Sample Checksums")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Fingerprint className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("표본 머클 체크섬", "Sample Merkle Checksums")}
            </span>
            <span data-testid="human-ink-gate-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${exportBlocked ? "border-bad bg-bad/10 text-bad" : "border-good bg-good-soft text-good"}`}>
              {exportBlocked ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {gateBadgeText}
            </span>
            <span data-testid="human-ink-crypto-scope-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-card px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
              <Lock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {pick("FNV-1a 64-bit 로컬 미리보기", "FNV-1a 64-bit Local Preview")}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("자가 신고 작화 표본·머클 체크섬 예제", "Human Ink Provenance Merkle Ledger · Sample Checksums")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("고정 표본의 자가 신고 태그·필압 통계를 계산합니다. 실제 캔버스 기록·저작자 인증·권리 확인·서명·C2PA 검증·저장 기능은 없습니다.", "Calculates self-declared tags and pressure statistics from fixed samples. No live canvas capture, author authentication, rights verification, signing, C2PA validation, or persistence.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="human-ink-add-stroke-btn" disabled={committedEvents.length >= MAX_LEDGER_EVENTS} onClick={handleAddHumanStroke} className={BTN_SOLID}>
            <PenTool className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("표본 스트로크 추가", "Add Sample Stroke")}
          </button>
          <button type="button" data-testid="human-ink-copy-json-btn" disabled={exportOperation.status === "pending"} onClick={handleCopyC2paJson} className={BTN_OUTLINE}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("표본 JSON 복사", "Copy Sample JSON")}
          </button>
          <button type="button" data-testid="human-ink-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="human-ink-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage || (isEn ? verification.detailEn : verification.detailKo)}
      </div>

      {/* 3종 원고 시나리오 선택 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("3종 고정 표본 시나리오", "3 Fixed Sample Scenarios")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${committedLedger.workId} · ${committedLedger.events.length} ${pick("리프", "leaves")}`}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3" role="group" aria-label={pick("원고 시나리오 선택", "Select manuscript scenario")}>
          {HUMAN_INK_SCENARIOS.map((sc) => {
            const active = sc.id === scenarioId;
            return (
              <button
                key={sc.id} type="button" data-testid={`human-ink-scenario-${sc.id}`} aria-pressed={active} onClick={() => handleSelectScenario(sc.id)}
                className={`flex min-h-11 flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <span className="text-xs font-bold text-fg">{isEn ? sc.nameEn : sc.nameKo}</span>
                <span className="text-[11px] leading-snug text-fg-2">{isEn ? sc.summaryEn : sc.summaryKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 표본 필드 변조 시연 토글 & 포함 증명 검증 제어 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="human-ink-tamper-toggle-btn" aria-pressed={tamperActive} onClick={handleToggleTamper} className={tamperActive ? BTN_DANGER : BTN_OUTLINE}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tamperActive ? pick(`표본 필드 변경 중 (리프 #${safeSelectedLeaf})`, `Sample Field Tamper Active (Leaf #${safeSelectedLeaf})`) : pick("표본 필드 변조 주입", "Inject Sample Field Tamper")}
          </button>
          <button type="button" data-testid="human-ink-verify-proof-btn" onClick={handleVerifyInclusionProof} className={BTN_ACTIVE}>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick(`리프 #${safeSelectedLeaf} 포함 증명 검증`, `Verify Leaf #${safeSelectedLeaf} Proof`)}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("변조 필드 모드 선택", "Select tamper mutation mode")}>
          {TAMPER_MODES.map((m) => (
            <button key={m.id} type="button" data-testid={`human-ink-tamper-mode-${m.id}`} aria-pressed={tamperMode === m.id} onClick={() => handleSelectTamperMode(m.id)} className={tamperMode === m.id ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick(m.ko, m.en)}
            </button>
          ))}
        </div>
      </div>

      {/* 순수 시맨틱 SVG 2종 + 4대 핵심 지표 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <GitBranch className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("이진 머클 트리 & 순차 해시 체인", "Binary Merkle Tree & Hash Chain")}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`O(log N) = ${committedLedger.treeDepth} · ROOT ${committedLedger.merkleRootHex.slice(0, 10)}`}</span>
          </div>
          <MerkleTreeHashChainSvg ledger={committedLedger} verification={verification} selectedLeafIndex={safeSelectedLeaf} proof={selectedProof} isEn={isEn} />
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-raised p-3.5 lg:col-span-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("자가 신고 이벤트 구성 비율", "Self-Declared Event Ratios")}</h3>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{pick("픽셀 유출 0B", "0B Pixels")}</span>
            </div>
            <AuthorshipRatioGaugeSvg ledger={committedLedger} isEn={isEn} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line bg-card p-2.5">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("인간 작화 태그 비율", "Human-Tagged Event Ratio")}</div>
              <div data-testid="human-ink-metric-human-ratio" className="mt-0.5 font-mono text-sm font-bold text-good tabular-nums">{`${summaryProof.humanInkStrokeRatioPercent}%`}</div>
              <div className="font-mono text-[10px] text-fg-3 tabular-nums">{`${summaryProof.humanStrokeCount}/${summaryProof.totalEventCount} · ${summaryProof.meanPressureEntropyBits.toFixed(2)}b`}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-2.5">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("절차적 CC0 · 3D", "Procedural CC0 · 3D")}</div>
              <div data-testid="human-ink-metric-cc0-ratio" className="mt-0.5 font-mono text-sm font-bold text-accent tabular-nums">{`${summaryProof.proceduralCc0AssetRatioPercent}% / ${summaryProof.bg3dPlacementRatioPercent}%`}</div>
              <div className="font-mono text-[10px] text-fg-3 tabular-nums">{`${pick("미검증 스캔", "Unverified")} ${summaryProof.unverifiedExternalScanCount}`}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-2.5">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("머클 무결성", "Merkle Integrity")}</div>
              <div data-testid="human-ink-metric-integrity" className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${verification.valid ? "text-good" : "text-bad"}`}>
                {verification.valid ? pick("검증 통과 (0 변조)", "VERIFIED (0 Tamper)") : pick(`변조 적발 #${verification.firstTamperedIndex ?? 0}`, `TAMPER #${verification.firstTamperedIndex ?? 0}`)}
              </div>
              <div className="truncate font-mono text-[10px] text-fg-3 tabular-nums">{verification.recomputedMerkleRootHex}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-2.5">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("Rights-BOM 게이트", "Rights-BOM Gate")}</div>
              <div data-testid="human-ink-metric-bom-gate" className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${exportBlocked ? "text-bad" : "text-good"}`}>
                {exportBlocked ? pick("차단 (Fail-Closed)", "BLOCKED") : pick("출고 허용", "ALLOWED")}
              </div>
              <div className="truncate font-mono text-[10px] text-fg-3 tabular-nums">{rightsBomGate.status}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 리프 선택 + O(log N) 머클 포함 증명 상세 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5 lg:col-span-7">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("작화 이벤트 리프 원장 (클릭해 포함 증명·변조 대상 선택)", "Provenance Leaf Ledger (Select Target for Proof / Tamper)")}</h3>
          <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-auto pr-1 sm:grid-cols-2">
            {inspectedEvents.map((ev, idx) => {
              const isSelected = idx === safeSelectedLeaf;
              const isAlert = verification.tamperedLeafIndices.includes(idx) || rightsBomGate.contaminatedIndices.includes(idx);
              return (
                <button
                  key={`${ev.eventId}-${idx}`} type="button" data-testid={`human-ink-leaf-btn-${idx}`} aria-pressed={isSelected} onClick={() => setSelectedLeafIndex(idx)}
                  className={`flex min-h-11 flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${isAlert ? "border-bad bg-bad/10 text-fg" : isSelected ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="font-mono text-[11px] font-bold tabular-nums">{`#${idx} · ${ev.eventId}`}</span>
                    <span className="font-mono text-[10px] text-fg-3 tabular-nums">{(committedLedger.leafHashes[idx] ?? "").slice(0, 8)}</span>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-between gap-1 text-[10px] text-fg-2">
                    <span>{isEn ? KIND_LABELS[ev.kind].en : KIND_LABELS[ev.kind].ko}</span>
                    <span className="font-mono tabular-nums">{`H ${ev.pressureEntropyBits.toFixed(2)}b · V ${ev.velocityVariance.toFixed(2)}`}</span>
                  </div>
                  <span className="truncate text-[10px] text-fg-3">{`${ev.toolLabel} · ${isEn ? LICENSE_LABELS[ev.licenseClass].en : LICENSE_LABELS[ev.licenseClass].ko}`}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div data-testid="human-ink-inclusion-proof-card" className="space-y-2.5 rounded-xl border border-line bg-raised p-3.5 lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick(`O(log N) 머클 포함 증명 (리프 #${safeSelectedLeaf})`, `O(log N) Merkle Inclusion Proof (Leaf #${safeSelectedLeaf})`)}</h3>
            <span data-testid="human-ink-proof-status-pill" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${selectedProofVerification?.valid ? "border-good bg-good-soft text-good" : "border-bad bg-bad/10 text-bad"}`}>
              {selectedProofVerification?.valid ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
              {selectedProofVerification?.valid ? pick("증명 일치", "PROOF VALID") : pick("증명 실패", "PROOF FAILED")}
              {proofCheckCount > 0 ? ` · #${proofCheckCount}` : ""}
            </span>
          </div>
          {selectedProof && selectedProofVerification ? (
            <div className="space-y-2 text-[11px]">
              <div className="rounded-lg border border-line bg-card p-2 font-mono text-[10px] text-fg-2 tabular-nums">
                <div>{`LEAF  : ${selectedProof.leafHashHex}`}</div>
                <div>{`CALC  : ${selectedProofVerification.computedRootHex}`}</div>
                <div>{`SEALED: ${selectedProofVerification.expectedRootHex}`}</div>
                <div>{`REASON: ${selectedProofVerification.reasonCode}`}</div>
              </div>
              <ol className="space-y-1" data-testid="human-ink-proof-siblings-list">
                {selectedProof.siblings.map((step) => (
                  <li key={`sib-${step.level}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-2 py-1 font-mono text-[10px] text-fg-2 tabular-nums">
                    <span>{`LV${step.level} · ${step.position.toUpperCase()}${step.duplicated ? " (DUP)" : ""}`}</span>
                    <span>{step.siblingHashHex}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {tamperResult ? (
            <div data-testid="human-ink-tamper-detail-alert" role="alert" className="rounded-lg border border-bad bg-bad/10 px-2.5 py-2 text-[11px] text-bad [word-break:keep-all]">
              {isEn ? tamperResult.mutationSummaryEn : tamperResult.mutationSummaryKo}
            </div>
          ) : null}
        </div>
      </div>

      {/* Rights-BOM Fail-Closed 게이트 & C2PA 정직 표기 + JSON 드로어 */}
      <div data-testid="human-ink-bom-gate-card" className="space-y-3 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            {exportBlocked ? <ShieldAlert className="h-3.5 w-3.5 text-bad" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />}
            {pick("자가 신고 태그 점검·unsigned JSON 메모", "Self-Declared Tags · Unsigned JSON Note")}
          </span>
          <button type="button" data-testid="human-ink-toggle-json-btn" aria-expanded={jsonDrawerOpen} onClick={() => { setShowSnapshot(false); setJsonDrawerOpen((p) => !p); }} className={jsonDrawerOpen ? BTN_ACTIVE : BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{jsonDrawerOpen ? pick("JSON 닫기", "Hide JSON") : pick("표본 JSON 미리보기", "Preview Sample JSON")}
          </button>
        </div>

        <div data-testid="human-ink-bom-gate-reason" className={`rounded-lg border px-3 py-2 text-xs leading-relaxed [word-break:keep-all] ${exportBlocked ? "border-bad bg-bad/10 text-bad" : "border-good bg-good-soft text-good"}`}>
          <p className="font-semibold">{verification.tampered ? (isEn ? verification.detailEn : verification.detailKo) : (isEn ? rightsBomGate.gateReasonEn : rightsBomGate.gateReasonKo)}</p>
          <p className="mt-0.5 text-[11px] opacity-90">{isEn ? rightsBomGate.redistributionPolicyEn : rightsBomGate.redistributionPolicyKo}</p>
        </div>

        <div data-testid="human-ink-honest-scope-notice" className="flex items-start gap-2 rounded-lg border border-warn bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warn [word-break:keep-all]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {pick(
              `증명 범위 고지 (${CRYPTOGRAPHIC_SCOPE_PREVIEW}): FNV는 비암호학적 체크섬이며 인간 저작자·CC0·C2PA를 보증하지 않습니다. 복사 시 계산하는 SHA-256도 JSON 바이트의 digest일 뿐 서명이나 신원 인증이 아닙니다. 픽셀 버퍼는 없지만 원고·도구 메타데이터를 포함하며 저장하지 않습니다.`,
              `Cryptographic scope (${CRYPTOGRAPHIC_SCOPE_PREVIEW}): FNV is a non-cryptographic checksum, not proof of authorship, CC0, or C2PA. SHA-256 on copy covers JSON bytes; it is not a signature or identity check. Metadata is included, pixel buffers are absent, and nothing is persisted.`,
            )}
          </span>
        </div>

        {jsonDrawerOpen ? (
          <pre data-testid="human-ink-json-preview" className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {showSnapshot && exportOperation.snapshot ? exportOperation.snapshot.json : c2paJsonText}
          </pre>
        ) : null}
      </div>
      {exportOperation.status === "pending" ? <p role="status" data-testid="human-ink-digest-pending" className="text-xs text-fg-2">{pick("SHA-256・복사・알림 처리 중입니다.", "SHA-256, copy, and notification pending.")}</p> : null}
      {exportOperation.status === "success" ? <p role="status" className="text-xs text-fg-2">{pick("요청한 표본 JSON을 복사했습니다. 서명·권리 확인·원장 저장은 하지 않았습니다.", "Copied the requested sample JSON. No signing, rights verification, or ledger persistence occurred.")}</p> : null}
      {exportOperation.status === "error" ? <p role="alert" className="text-xs text-warn">{pick("SHA-256·복사 또는 알림 실패. 같은 스냅샷으로 재시도하세요.", "SHA-256, copy, or notification failed. Retry the same snapshot.")} <button type="button" data-testid="human-ink-export-retry-btn" onClick={() => { void exportOperation.retry(); }} className={BTN_OUTLINE}>{pick("원문 재시도", "Retry snapshot")}</button></p> : null}
      {notification.status === "pending" ? <p role="status" data-testid="human-ink-notification-pending" className="text-xs text-fg-2">{pick("원장 계산을 유지하며 외부 알림을 기다립니다.", "Ledger calculation preserved; external notification pending.")}</p> : null}
      {notification.status === "error" ? <p role="alert" className="text-xs text-warn">{pick("알림에 실패했습니다. 원장은 유지했습니다.", "Notification failed; ledger preserved.")} <button type="button" data-testid="human-ink-notification-retry-btn" onClick={notification.retry} className={BTN_OUTLINE}>{pick("알림 재시도", "Retry notification")}</button></p> : null}
    </section>
  );
}
