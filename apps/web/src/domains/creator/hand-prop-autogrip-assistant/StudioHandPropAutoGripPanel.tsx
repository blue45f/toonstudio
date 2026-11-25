/**
 * Wave 48D — 손·소품 상호작용 자동 그립 제안기(Hand-to-Prop Auto-Grip Assistant) 스튜디오 패널.
 *
 * - 8종 3D 소품 카드 선택 + 좌/우 손 전환 + 3종 감정·행동 의도(가볍게 쥠·긴장한 힘·건네기)
 * - Top-3 비파괴 그립 제안 카드(접촉점 수·관통 회피 점수·실루엣 가독성·미리보기/적용/되돌리기)
 * - 순수 시맨틱 SVG 15관절 손 + 소품 상호작용 실루엣 프리뷰(oklch + currentColor 전용, 탈-바이올렛)
 * - 5손가락 굴곡 · 전체 파지 강도 · 손목 3축 미세 슬라이더 및 15관절 3D 리깅 JSON 내보내기
 */

import {
  Check, CheckCircle2, Code2, Eye, Hand, RotateCcw,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Undo2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ANATOMICAL_JOINT_LIMITS, FINGER_IDS, FINGER_META, GRIP_INTENTS,
  HAND_GRIP_TYPE_LABELS, HAND_PROP_CATALOG,
  applyHandGripProposal, createBaselineHandSnapshot, createHandGripSessionState,
  evaluateHandPropPoseMetrics, exportHandGripRigJson, getHandPropSpec,
  previewHandGripProposal, proposeHandPropGripsTop3, revertHandGripProposal,
  tweakFingerCurl, tweakGripTightness, tweakWristOrientation,
  type FingerId, type GripIntent, type HandGripMetrics, type HandGripSessionState,
  type HandPropGripProposal, type HandPropId, type HandRigPose15, type HandSide, type PenetrationRisk,
} from "./hand-prop-autogrip-engine";

export interface StudioHandPropAutoGripPanelProps {
  readonly initialPropId?: HandPropId;
  readonly initialHandSide?: HandSide;
  readonly initialGripIntent?: GripIntent;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (proposal: HandPropGripProposal, pose: HandRigPose15, session: HandGripSessionState) => void;
  readonly onRevert?: (session: HandGripSessionState) => void;
  readonly onExportJson?: (json: string, session: HandGripSessionState) => void;
}

interface FineTweakOffsets {
  readonly fingers: Readonly<Record<FingerId, number>>;
  readonly tightnessDelta: number;
  readonly wristFlexionDelta: number;
  readonly wristDeviationDelta: number;
  readonly wristPronationDelta: number;
}

const ZERO_TWEAKS: FineTweakOffsets = {
  fingers: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
  tightnessDelta: 0, wristFlexionDelta: 0, wristDeviationDelta: 0, wristPronationDelta: 0,
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

// 탈-바이올렛 에디토리얼 안료(Hue 28 / 72 / 158 / 198 / 245, 바이올렛 270~320° 완전 배제)
const SVG_PROP_STROKE = "oklch(0.74 0.135 245)";
const SVG_PROP_FILL = "oklch(0.74 0.135 245 / 0.15)";
const SVG_JOINT_FILL = "oklch(0.79 0.158 72)";
const SVG_WRIST_GUIDE = "oklch(0.78 0.125 198)";
const SVG_CONTACT_GOOD = "oklch(0.765 0.155 158)";
const SVG_CONTACT_TIGHT = "oklch(0.79 0.158 72)";
const SVG_CONTACT_OVERLAP = "oklch(0.715 0.165 28)";

function hasActiveTweaks(t: FineTweakOffsets): boolean {
  return (
    t.tightnessDelta !== 0 || t.wristFlexionDelta !== 0 || t.wristDeviationDelta !== 0 ||
    t.wristPronationDelta !== 0 || FINGER_IDS.some((f) => t.fingers[f] !== 0)
  );
}

function applyFineTweaks(basePose: HandRigPose15, tweaks: FineTweakOffsets): HandRigPose15 {
  let next = tweaks.tightnessDelta !== 0 ? tweakGripTightness(basePose, tweaks.tightnessDelta) : basePose;
  for (const finger of FINGER_IDS) {
    if (tweaks.fingers[finger] !== 0) next = tweakFingerCurl(next, finger, tweaks.fingers[finger]);
  }
  if (tweaks.wristFlexionDelta !== 0 || tweaks.wristDeviationDelta !== 0 || tweaks.wristPronationDelta !== 0) {
    next = tweakWristOrientation(next, {
      flexionDeg: next.wrist.flexionDeg + tweaks.wristFlexionDelta,
      deviationDeg: next.wrist.deviationDeg + tweaks.wristDeviationDelta,
      pronationDeg: next.wrist.pronationDeg + tweaks.wristPronationDelta,
    });
  }
  return next;
}

function formatSignedDeg(deg: number): string {
  const r = Math.round(deg);
  return `${r > 0 ? "+" : ""}${r}°`;
}

function riskBadgeClass(risk: PenetrationRisk): string {
  if (risk === "overlap") return "border-bad bg-bad-soft text-bad";
  return risk === "tight" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function contactColorForRisk(risk: PenetrationRisk): string {
  if (risk === "overlap") return SVG_CONTACT_OVERLAP;
  return risk === "tight" ? SVG_CONTACT_TIGHT : SVG_CONTACT_GOOD;
}

interface Point2D { readonly x: number; readonly y: number; }
interface FingerChain2D {
  readonly finger: FingerId;
  readonly mcp: Point2D; readonly pip: Point2D; readonly dip: Point2D; readonly tip: Point2D;
}

function pt(x: number, y: number): Point2D {
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function computeFingerChains(pose: HandRigPose15): readonly FingerChain2D[] {
  const rad = Math.PI / 180;
  const wristShift = pose.wrist.flexionDeg * 0.08;
  const cfgMap: Readonly<Record<FingerId, {
    readonly origin: Point2D; readonly baseDeg: number; readonly dir: number; readonly segs: readonly [number, number, number];
  }>> = {
    thumb: { origin: { x: 92, y: 146 }, baseDeg: -132, dir: 1, segs: [21, 18, 15] },
    index: { origin: { x: 106, y: 112 }, baseDeg: -96, dir: 1, segs: [25, 19, 15] },
    middle: { origin: { x: 124, y: 106 }, baseDeg: -90, dir: 1, segs: [28, 21, 16] },
    ring: { origin: { x: 142, y: 110 }, baseDeg: -84, dir: -1, segs: [25, 19, 15] },
    pinky: { origin: { x: 158, y: 120 }, baseDeg: -74, dir: -1, segs: [21, 16, 13] },
  };

  return FINGER_IDS.map((finger) => {
    const cfg = cfgMap[finger];
    const j = pose.fingers[finger];
    const mcp = pt(cfg.origin.x, cfg.origin.y + wristShift);

    if (finger === "thumb") {
      const a1 = (cfg.baseDeg + pose.thumbOppositionDeg * 0.78 + j.mcpDeg * 0.42) * rad;
      const a2 = a1 + j.pipDeg * 0.55 * rad;
      const a3 = a2 + j.dipDeg * 0.58 * rad;
      const pip = pt(mcp.x + Math.cos(a1) * cfg.segs[0], mcp.y + Math.sin(a1) * cfg.segs[0]);
      const dip = pt(pip.x + Math.cos(a2) * cfg.segs[1], pip.y + Math.sin(a2) * cfg.segs[1]);
      const tip = pt(dip.x + Math.cos(a3) * cfg.segs[2], dip.y + Math.sin(a3) * cfg.segs[2]);
      return { finger, mcp, pip, dip, tip };
    }

    const f1 = Math.max(0.45, Math.cos(j.mcpDeg * 0.72 * rad));
    const f2 = Math.max(0.36, Math.cos((j.mcpDeg * 0.4 + j.pipDeg * 0.65) * rad));
    const f3 = Math.max(0.32, Math.cos((j.pipDeg * 0.45 + j.dipDeg * 0.7) * rad));
    const a1 = (cfg.baseDeg + cfg.dir * j.mcpDeg * 0.14) * rad;
    const a2 = (cfg.baseDeg + cfg.dir * (j.mcpDeg * 0.24 + j.pipDeg * 0.3)) * rad;
    const a3 = (cfg.baseDeg + cfg.dir * (j.pipDeg * 0.42 + j.dipDeg * 0.55)) * rad;
    const pip = pt(mcp.x + Math.cos(a1) * cfg.segs[0] * f1, mcp.y + Math.sin(a1) * cfg.segs[0] * f1);
    const dip = pt(pip.x + Math.cos(a2) * cfg.segs[1] * f2, pip.y + Math.sin(a2) * cfg.segs[1] * f2);
    const tip = pt(dip.x + Math.cos(a3) * cfg.segs[2] * f3, dip.y + Math.sin(a3) * cfg.segs[2] * f3);
    return { finger, mcp, pip, dip, tip };
  });
}

function renderPropSilhouette(propId: HandPropId): ReactElement {
  switch (propId) {
    case "mug":
      return (<g data-prop-shape="mug"><rect x="136" y="42" width="66" height="84" rx="10" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="2" /><path d="M 136 58 C 102 58, 102 108, 136 108" fill="none" stroke={SVG_PROP_STROKE} strokeWidth="7" strokeLinecap="round" /><ellipse cx="169" cy="46" rx="31" ry="6" fill="none" stroke={SVG_PROP_STROKE} strokeWidth="1.5" strokeOpacity={0.7} /></g>);
    case "sword":
      return (<g data-prop-shape="sword"><rect x="122" y="16" width="16" height="44" rx="2" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="1.8" /><rect x="84" y="56" width="92" height="10" rx="4" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="2" /><rect x="120" y="66" width="20" height="72" rx="6" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="2" /><circle cx="130" cy="146" r="10" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="2" /></g>);
    case "smartphone":
      return (<g data-prop-shape="smartphone"><rect x="98" y="24" width="64" height="114" rx="12" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="2" /><rect x="104" y="34" width="52" height="90" rx="5" fill="none" stroke={SVG_PROP_STROKE} strokeWidth="1.3" strokeOpacity={0.75} /><line x1="120" y1="131" x2="140" y2="131" stroke={SVG_PROP_STROKE} strokeWidth="2" strokeLinecap="round" /></g>);
    case "pen":
      return (<g data-prop-shape="pen"><line x1="80" y1="124" x2="178" y2="34" stroke={SVG_PROP_STROKE} strokeWidth="8" strokeLinecap="round" /><path d="M 76 128 L 62 140 L 84 134 Z" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="1.8" /><line x1="146" y1="54" x2="168" y2="34" stroke={SVG_JOINT_FILL} strokeWidth="2" strokeLinecap="round" /></g>);
    case "umbrella":
      return (<g data-prop-shape="umbrella"><line x1="128" y1="18" x2="128" y2="122" stroke={SVG_PROP_STROKE} strokeWidth="6" strokeLinecap="round" /><path d="M 128 122 C 128 156, 174 156, 174 124" fill="none" stroke={SVG_PROP_STROKE} strokeWidth="7" strokeLinecap="round" /></g>);
    case "teacup":
      return (<g data-prop-shape="teacup"><path d="M 134 46 L 198 46 Q 194 98 166 102 Q 138 98 134 46 Z" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="2" /><path d="M 134 56 C 110 56, 110 86, 136 86" fill="none" stroke={SVG_PROP_STROKE} strokeWidth="4" strokeLinecap="round" /><line x1="126" y1="108" x2="206" y2="108" stroke={SVG_PROP_STROKE} strokeWidth="2.2" strokeLinecap="round" /></g>);
    case "cane":
      return (<g data-prop-shape="cane"><line x1="128" y1="44" x2="128" y2="178" stroke={SVG_PROP_STROKE} strokeWidth="8" strokeLinecap="round" /><path d="M 128 46 C 128 20, 172 20, 172 48" fill="none" stroke={SVG_PROP_STROKE} strokeWidth="8" strokeLinecap="round" /><circle cx="172" cy="48" r="5" fill={SVG_JOINT_FILL} /></g>);
    case "letter":
      return (<g data-prop-shape="letter"><rect x="86" y="34" width="96" height="68" rx="5" fill={SVG_PROP_FILL} stroke={SVG_PROP_STROKE} strokeWidth="2" /><path d="M 86 38 L 134 74 L 182 38" fill="none" stroke={SVG_PROP_STROKE} strokeWidth="1.7" strokeLinejoin="round" /></g>);
  }
}

function HandPropSilhouetteSvg(props: {
  readonly propId: HandPropId;
  readonly handSide: HandSide;
  readonly pose: HandRigPose15;
  readonly metrics: HandGripMetrics;
  readonly ariaLabel: string;
}): ReactElement {
  const { propId, handSide, pose, metrics, ariaLabel } = props;
  const chains = computeFingerChains(pose);
  const contactColor = contactColorForRisk(metrics.penetrationRisk);
  const wristRotate = Math.round(pose.wrist.deviationDeg * 0.45 * 10) / 10;
  const palmScaleX = Math.round((1 - Math.abs(pose.wrist.pronationDeg) / 290) * 100) / 100;
  const mirrorTransform = handSide === "left" ? "translate(260 0) scale(-1 1)" : undefined;

  return (
    <svg
      data-testid="autogrip-silhouette-svg"
      data-prop-id={propId}
      data-hand-side={handSide}
      data-contact-points={metrics.contactPoints}
      data-clearance-score={metrics.clearanceScore}
      data-wrist-flexion={pose.wrist.flexionDeg}
      data-joint-count={15}
      viewBox="0 0 260 216"
      className="h-56 w-full rounded-xl border border-line bg-canvas text-fg"
      role="img"
      aria-label={ariaLabel}
    >
      <g transform={mirrorTransform}>
        {renderPropSilhouette(propId)}
        <g transform={`translate(130 184) rotate(${wristRotate}) scale(${palmScaleX} 1) translate(-130 -184)`}>
          <line x1="114" y1="204" x2="114" y2="174" stroke={SVG_WRIST_GUIDE} strokeWidth="2.4" strokeLinecap="round" />
          <line x1="146" y1="204" x2="146" y2="174" stroke={SVG_WRIST_GUIDE} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="130" cy="186" r="5" fill={SVG_WRIST_GUIDE} fillOpacity={0.35} stroke={SVG_WRIST_GUIDE} strokeWidth="1.8" />
          <path
            d="M 102 174 L 90 144 L 106 112 L 124 106 L 142 110 L 158 120 L 156 168 Q 130 182 102 174 Z"
            fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
          />
          {chains.map((chain) => {
            const isContact = metrics.contactFingers.includes(chain.finger);
            const pathD = `M ${chain.mcp.x} ${chain.mcp.y} L ${chain.pip.x} ${chain.pip.y} L ${chain.dip.x} ${chain.dip.y} L ${chain.tip.x} ${chain.tip.y}`;
            return (
              <g key={chain.finger} data-finger-chain={chain.finger}>
                <path d={pathD} fill="none" stroke="currentColor" strokeWidth={chain.finger === "thumb" ? 4.4 : 3.6} strokeLinecap="round" strokeLinejoin="round" />
                <circle data-testid={`joint-${chain.finger}-mcp`} cx={chain.mcp.x} cy={chain.mcp.y} r="3.2" fill={SVG_JOINT_FILL} stroke="currentColor" strokeWidth="1.2" />
                <circle data-testid={`joint-${chain.finger}-pip`} cx={chain.pip.x} cy={chain.pip.y} r="2.9" fill={SVG_JOINT_FILL} stroke="currentColor" strokeWidth="1.1" />
                <circle data-testid={`joint-${chain.finger}-dip`} cx={chain.dip.x} cy={chain.dip.y} r="2.6" fill={SVG_JOINT_FILL} stroke="currentColor" strokeWidth="1.1" />
                {isContact ? (
                  <g data-testid={`contact-point-${chain.finger}`}>
                    <circle cx={chain.tip.x} cy={chain.tip.y} r="6.8" fill={contactColor} fillOpacity={0.22} stroke={contactColor} strokeWidth="1.6" />
                    <circle cx={chain.tip.x} cy={chain.tip.y} r="3" fill={contactColor} />
                  </g>
                ) : (
                  <circle cx={chain.tip.x} cy={chain.tip.y} r="2.4" fill="currentColor" fillOpacity={0.65} />
                )}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}

/** 3D 소품 기반 15관절 손 자동 그립 제안 및 관절 미세조정 스튜디오 패널. */
export function StudioHandPropAutoGripPanel(props: StudioHandPropAutoGripPanelProps): ReactElement {
  const {
    initialPropId = "mug",
    initialHandSide = "right",
    initialGripIntent = "relaxed-hold",
    locale = "ko",
    className,
    onApply,
    onRevert,
    onExportJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [propId, setPropId] = useState<HandPropId>(initialPropId);
  const [handSide, setHandSide] = useState<HandSide>(initialHandSide);
  const [intent, setIntent] = useState<GripIntent>(initialGripIntent);
  const [session, setSession] = useState<HandGripSessionState>(() =>
    createHandGripSessionState(createBaselineHandSnapshot(initialPropId, initialHandSide, initialGripIntent)),
  );
  const [tweaks, setTweaks] = useState<FineTweakOffsets>(ZERO_TWEAKS);
  const [showBaselinePreview, setShowBaselinePreview] = useState<boolean>(false);
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const bundle = useMemo(() => proposeHandPropGripsTop3({ propId, handSide, intent }), [propId, handSide, intent]);
  const propSpec = useMemo(() => getHandPropSpec(propId), [propId]);

  const previewProposal = useMemo<HandPropGripProposal | null>(() => {
    if (!session.previewingProposalId) return null;
    return bundle.proposals.find((p) => p.id === session.previewingProposalId) ?? null;
  }, [bundle.proposals, session.previewingProposalId]);

  const activeProposal = useMemo<HandPropGripProposal>(() => {
    if (previewProposal) return previewProposal;
    const applied = session.appliedProposalId ? bundle.proposals.find((p) => p.id === session.appliedProposalId) : null;
    return applied ?? bundle.proposals[0];
  }, [bundle.proposals, previewProposal, session.appliedProposalId]);

  const basePose = useMemo<HandRigPose15>(() => {
    if (showBaselinePreview && !previewProposal) return session.current.pose;
    if (previewProposal) return previewProposal.pose;
    if (session.status === "applied" && session.current.propId === propId && session.current.handSide === handSide && session.current.intent === intent) {
      return session.current.pose;
    }
    return bundle.proposals[0].pose;
  }, [bundle.proposals, handSide, intent, previewProposal, propId, session, showBaselinePreview]);

  const activePose = useMemo<HandRigPose15>(() => applyFineTweaks(basePose, tweaks), [basePose, tweaks]);
  const activeMetrics = useMemo<HandGripMetrics>(
    () => evaluateHandPropPoseMetrics(activePose, propSpec, handSide, intent),
    [activePose, handSide, intent, propSpec],
  );
  const jsonText = useMemo(
    () =>
      exportHandGripRigJson({
        prop: propSpec, handSide, intent, pose: activePose, metrics: activeMetrics, session,
        activeProposalId: previewProposal?.id ?? session.appliedProposalId ?? activeProposal.id,
      }),
    [activeMetrics, activePose, activeProposal.id, handSide, intent, previewProposal?.id, propSpec, session],
  );

  const handleSelectProp = (nextPropId: HandPropId): void => {
    setPropId(nextPropId);
    setTweaks(ZERO_TWEAKS);
    setShowBaselinePreview(false);
    setSession((prev) => previewHandGripProposal(prev, null));
    const nextSpec = getHandPropSpec(nextPropId);
    setStatusMessage(pick(`'${nextSpec.labelKo}'(Ø ${nextSpec.diameterMm}mm) 파지 후보 3안을 갱신했습니다.`, `Updated Top-3 grip proposals for '${nextSpec.labelEn}' (Ø ${nextSpec.diameterMm}mm).`));
  };

  const handleSelectHandSide = (nextSide: HandSide): void => {
    setHandSide(nextSide);
    setTweaks(ZERO_TWEAKS);
    setShowBaselinePreview(false);
    setSession((prev) => previewHandGripProposal(prev, null));
    setStatusMessage(pick(`파지 대상을 ${nextSide === "left" ? "왼손" : "오른손"} 15관절 리그로 전환했습니다.`, `Switched 15-joint rig target to the ${nextSide} hand.`));
  };

  const handleSelectIntent = (nextIntent: GripIntent): void => {
    setIntent(nextIntent);
    setTweaks(ZERO_TWEAKS);
    setShowBaselinePreview(false);
    setSession((prev) => previewHandGripProposal(prev, null));
    const meta = GRIP_INTENTS.find((item) => item.id === nextIntent) ?? GRIP_INTENTS[0];
    setStatusMessage(pick(`행동 의도를 '${meta.labelKo}'으로 바꿨습니다.`, `Switched grip intent to '${meta.labelEn}'.`));
  };

  const handleTogglePreview = (proposal: HandPropGripProposal): void => {
    const next = previewHandGripProposal(session, proposal.id);
    setSession(next);
    setTweaks(ZERO_TWEAKS);
    setShowBaselinePreview(false);
    setStatusMessage(
      next.previewingProposalId
        ? pick(`'${proposal.titleKo}' 미리보기 중입니다. 원본 손 포즈는 아직 바뀌지 않았습니다.`, `Previewing '${proposal.titleEn}'. Baseline hand pose remains untouched.`)
        : pick("미리보기를 닫았습니다.", "Closed grip preview."),
    );
  };

  const handleApplyProposal = (proposal: HandPropGripProposal): void => {
    const poseToCommit = activeProposal.id === proposal.id && hasActiveTweaks(tweaks) ? activePose : proposal.pose;
    const next = applyHandGripProposal(session, proposal, poseToCommit);
    setSession(next);
    setTweaks(ZERO_TWEAKS);
    setShowBaselinePreview(false);
    onApply?.(proposal, poseToCommit, next);
    setStatusMessage(pick(`작가 승인으로 '${proposal.titleKo}'을 비파괴 적용했습니다. 언제든 원본으로 되돌릴 수 있습니다.`, `Applied '${proposal.titleEn}' non-destructively. Baseline remains restorable.`));
  };

  const handleRevert = (): void => {
    const next = revertHandGripProposal(session);
    setSession(next);
    setTweaks(ZERO_TWEAKS);
    setShowBaselinePreview(true);
    onRevert?.(next);
    setStatusMessage(pick("원본 컷의 기본 손 포즈로 되돌렸습니다.", "Reverted hand rig to the original baseline pose."));
  };

  const handleResetAll = (): void => {
    setPropId(initialPropId);
    setHandSide(initialHandSide);
    setIntent(initialGripIntent);
    setTweaks(ZERO_TWEAKS);
    setShowBaselinePreview(false);
    setSession(createHandGripSessionState(createBaselineHandSnapshot(initialPropId, initialHandSide, initialGripIntent)));
    setStatusMessage(pick("소품 선택, 관절 보정, 적용 상태를 초기값으로 복원했습니다.", "Reset prop selection, fine tweaks, and session state."));
  };

  const handleCopyJson = (): void => {
    onExportJson?.(jsonText, session);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(jsonText).catch(() => undefined);
    }
    setShowJson(true);
    setStatusMessage(pick(`15관절 핸드 리깅 JSON(${jsonText.length.toLocaleString("ko-KR")}B)을 내보냈습니다.`, `Exported 15-joint hand rig JSON (${jsonText.length.toLocaleString("en-US")} B).`));
  };

  const updateFingerDelta = (finger: FingerId, value: number): void => {
    setShowBaselinePreview(false);
    setTweaks((prev) => ({ ...prev, fingers: { ...prev.fingers, [finger]: value } }));
  };

  const sessionStateLabel = session.status === "applied"
    ? pick("비파괴 적용됨", "Applied (Revertible)")
    : session.status === "previewing"
      ? pick("미리보기 중", "Previewing")
      : session.status === "reverted"
        ? pick("원본 되돌림 완료", "Reverted to Baseline")
        : pick("원본 유지 중", "Baseline Intact");

  const activeStageLabel = showBaselinePreview
    ? (isEn ? session.current.labelEn : session.current.labelKo)
    : previewProposal
      ? pick(`미리보기 (미적용) · ${previewProposal.titleKo}`, `Previewing (Uncommitted) · ${previewProposal.titleEn}`)
      : session.status === "applied" && session.appliedProposalId === activeProposal.id
        ? (isEn ? session.current.labelEn : session.current.labelKo)
        : pick(`추천 1안 시뮬레이션 · ${activeProposal.titleKo}`, `Top-1 Simulation · ${activeProposal.titleEn}`);

  const riskLabel = activeMetrics.penetrationRisk === "overlap"
    ? pick("관통 주의", "Overlap Risk")
    : activeMetrics.penetrationRisk === "tight"
      ? pick("밀착 경계", "Tight Clearance")
      : pick("관통 없음", "Collision Clear");

  const wristSliders = [
    { key: "wristFlexionDelta" as const, testId: "autogrip-slider-wrist-flexion", labelKo: "손목 굴곡", labelEn: "Wrist Flexion", actualDeg: activePose.wrist.flexionDeg, delta: tweaks.wristFlexionDelta, min: -35, max: 35 },
    { key: "wristDeviationDelta" as const, testId: "autogrip-slider-wrist-deviation", labelKo: "손목 편위", labelEn: "Wrist Deviation", actualDeg: activePose.wrist.deviationDeg, delta: tweaks.wristDeviationDelta, min: -25, max: 25 },
    { key: "wristPronationDelta" as const, testId: "autogrip-slider-wrist-pronation", labelKo: "손목 회내", labelEn: "Wrist Pronation", actualDeg: activePose.wrist.pronationDeg, delta: tweaks.wristPronationDelta, min: -40, max: 40 },
  ];

  return (
    <section
      data-testid="studio-hand-prop-autogrip-panel"
      aria-label={pick("손·소품 상호작용 자동 그립 제안기", "Hand-to-Prop Auto-Grip Assistant")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Hand className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("15관절 손·소품 자동 그립", "15-Joint Hand-to-Prop Auto-Grip")}
            </span>
            <span data-testid="autogrip-approval-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("작가 승인 후 적용", "Author Approval Required")}
            </span>
            <span data-testid="autogrip-session-status-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums [word-break:keep-all]">
              {sessionStateLabel}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("3D 소품 기반 15관절 손 파지 자동 제안 및 관절 미세 보정", "3D Prop 15-Joint Hand Auto-Grip & Joint Micro-Tweak")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "웹툰 실전 3D 소품 8종의 물리 지름과 충돌 반경을 계산해 관통 없는 Top-3 손 파지안을 제안합니다. 미리보기 후 선택 적용하고 언제든 원본 손으로 되돌릴 수 있습니다.",
              "Computes collision-aware Top-3 15-joint hand grips for 8 webtoon props with non-destructive preview, selective apply, and instant revert.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="autogrip-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("원본 되돌리기", "Revert")}
          </button>
          <button type="button" data-testid="autogrip-export-json-btn" onClick={handleCopyJson} className={BTN_SOLID}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("3D 리깅 JSON 내보내기", "Export Rig JSON")}
          </button>
          <button type="button" data-testid="autogrip-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="autogrip-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-line bg-raised p-4 xl:col-span-7">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("8종 웹툰 실전 3D 소품 선택", "Select 3D Prop (8 Catalog Items)")}</span>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`Ø ${propSpec.diameterMm}mm · R ${propSpec.collisionRadiusMm}mm`}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={pick("소품 카탈로그 선택", "Select 3D prop")}>
              {HAND_PROP_CATALOG.map((item) => {
                const isSelected = item.id === propId;
                const gripTypeText = isEn ? HAND_GRIP_TYPE_LABELS[item.gripType].en : HAND_GRIP_TYPE_LABELS[item.gripType].ko;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`autogrip-prop-${item.id}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectProp(item.id)}
                    className={`flex min-h-11 cursor-pointer flex-col items-start justify-between gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                      isSelected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg hover:border-line-strong hover:bg-panel"
                    }`}
                  >
                    <span className="text-xs font-bold leading-snug">{isEn ? item.labelEn : item.labelKo}</span>
                    <span className="flex w-full items-center justify-between gap-1 text-[10px] text-fg-3 tabular-nums">
                      <span className="truncate">{gripTypeText}</span>
                      <span>{`${item.diameterMm}mm`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="rounded-lg border border-line bg-card px-3 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
              {isEn ? propSpec.sceneNoteEn : propSpec.sceneNoteKo}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("손 좌/우 전환", "Hand Side")}</span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={pick("손 좌우 선택", "Select hand side")}>
                {(["left", "right"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    data-testid={`autogrip-side-${side}`}
                    aria-pressed={side === handSide}
                    onClick={() => handleSelectHandSide(side)}
                    className={side === handSide ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {side === "left" ? pick("왼손", "Left Hand") : pick("오른손", "Right Hand")}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("감정·행동 의도", "Grip Intent")}</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("파지 의도 선택", "Select grip intent")}>
                {GRIP_INTENTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`autogrip-intent-${item.id}`}
                    aria-pressed={item.id === intent}
                    onClick={() => handleSelectIntent(item.id)}
                    className={item.id === intent ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {isEn ? item.labelEn : item.labelKo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("5손가락 굴곡 · 파지 강도 · 손목 각도 미세 보정", "Finger Curl, Tightness & Wrist Micro-Tweaks")}
              </span>
              <button type="button" data-testid="autogrip-reset-tweaks-btn" disabled={!hasActiveTweaks(tweaks)} onClick={() => setTweaks(ZERO_TWEAKS)} className={BTN_OUTLINE}>
                {pick("미세 보정 초기화", "Clear Tweaks")}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {FINGER_META.map((finger) => {
                const sliderId = `${uid}-finger-${finger.id}`;
                const j = activePose.fingers[finger.id];
                return (
                  <div key={finger.id} className="space-y-1 rounded-lg border border-line bg-raised px-2.5 py-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor={sliderId} className="font-semibold text-fg [word-break:keep-all]">{isEn ? finger.labelEn : finger.labelKo}</label>
                      <span data-testid={`autogrip-finger-readout-${finger.id}`} className="font-mono text-fg-2 tabular-nums">
                        {`${Math.round(j.mcpDeg)}/${Math.round(j.pipDeg)}/${Math.round(j.dipDeg)}°`}
                      </span>
                    </div>
                    <input
                      id={sliderId} data-testid={`autogrip-slider-finger-${finger.id}`}
                      type="range" min={-35} max={35} step={1} value={tweaks.fingers[finger.id]}
                      onChange={(e) => updateFingerDelta(finger.id, Number(e.target.value))}
                      className="min-h-11 w-full cursor-pointer accent-accent"
                    />
                  </div>
                );
              })}

              <div className="space-y-1 rounded-lg border border-line bg-raised px-2.5 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor={`${uid}-tightness`} className="font-semibold text-fg [word-break:keep-all]">{pick("파지 강도", "Tightness")}</label>
                  <span data-testid="autogrip-tightness-readout" className="font-mono text-fg-2 tabular-nums">{`${activePose.tightness}%`}</span>
                </div>
                <input
                  id={`${uid}-tightness`} data-testid="autogrip-slider-tightness"
                  type="range" min={-35} max={35} step={1} value={tweaks.tightnessDelta}
                  onChange={(e) => {
                    setShowBaselinePreview(false);
                    setTweaks((prev) => ({ ...prev, tightnessDelta: Number(e.target.value) }));
                  }}
                  className="min-h-11 w-full cursor-pointer accent-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 border-t border-line pt-3 sm:grid-cols-3">
              {wristSliders.map((axis) => {
                const axisId = `${uid}-${axis.key}`;
                return (
                  <div key={axis.key} className="space-y-1 rounded-lg border border-line bg-raised px-2.5 py-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor={axisId} className="font-semibold text-fg [word-break:keep-all]">{isEn ? axis.labelEn : axis.labelKo}</label>
                      <span data-testid={`${axis.testId}-readout`} className="font-mono text-fg-2 tabular-nums">{formatSignedDeg(axis.actualDeg)}</span>
                    </div>
                    <input
                      id={axisId} data-testid={axis.testId}
                      type="range" min={axis.min} max={axis.max} step={1} value={axis.delta}
                      onChange={(e) => {
                        setShowBaselinePreview(false);
                        const nextVal = Number(e.target.value);
                        setTweaks((prev) => ({ ...prev, [axis.key]: nextVal }));
                      }}
                      className="min-h-11 w-full cursor-pointer accent-accent"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">{pick("15관절 손·소품 실루엣 프리뷰", "15-Joint Hand & Prop Silhouette")}</h3>
            <span
              data-testid="autogrip-clearance-badge"
              data-risk={activeMetrics.penetrationRisk}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${riskBadgeClass(activeMetrics.penetrationRisk)}`}
            >
              {activeMetrics.penetrationRisk === "none" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {`${riskLabel} · ${activeMetrics.clearanceScore}점`}
            </span>
          </div>

          <HandPropSilhouetteSvg
            propId={propId} handSide={handSide} pose={activePose} metrics={activeMetrics}
            ariaLabel={pick(`${propSpec.labelKo} ${handSide === "left" ? "왼손" : "오른손"} 15관절 파지 실루엣 프리뷰`, `${handSide} hand 15-joint silhouette gripping ${propSpec.labelEn}`)}
          />

          <div data-testid="autogrip-active-stage-label" className="rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg [word-break:keep-all]">
            {activeStageLabel}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-line bg-card px-2.5 py-2">
              <div className="text-[10px] text-fg-3 [word-break:keep-all]">{pick("접촉점", "Contacts")}</div>
              <div data-testid="autogrip-metric-contacts" className="mt-0.5 text-sm font-bold text-fg tabular-nums">{`${activeMetrics.contactPoints} / 5`}</div>
            </div>
            <div className="rounded-lg border border-line bg-card px-2.5 py-2">
              <div className="text-[10px] text-fg-3 [word-break:keep-all]">{pick("관통 회피", "Clearance")}</div>
              <div data-testid="autogrip-metric-clearance" className="mt-0.5 text-sm font-bold text-fg tabular-nums">{`${activeMetrics.clearanceScore}점`}</div>
            </div>
            <div className="rounded-lg border border-line bg-card px-2.5 py-2">
              <div className="text-[10px] text-fg-3 [word-break:keep-all]">{pick("실루엣 가독", "Silhouette")}</div>
              <div data-testid="autogrip-metric-silhouette" className="mt-0.5 text-sm font-bold text-fg tabular-nums">{`${activeMetrics.silhouetteScore}점`}</div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[11px] text-fg-2 tabular-nums">
            {`Thumb Opp ${Math.round(activePose.thumbOppositionDeg)}° (0~${ANATOMICAL_JOINT_LIMITS.thumbOppositionDeg.max}°) · Wrist (${formatSignedDeg(activePose.wrist.flexionDeg)}, ${formatSignedDeg(activePose.wrist.deviationDeg)}, ${formatSignedDeg(activePose.wrist.pronationDeg)})`}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">{pick("Top-3 비파괴 파지 제안 (선택 시에만 적용)", "Top-3 Non-Destructive Grip Proposals")}</h3>
          <span className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
            {pick(`15관절 해부학 안전 범위 자동 클램프 · ${handSide === "left" ? "왼손" : "오른손"} 기준`, `15-joint anatomical clamp active · ${handSide} hand`)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {bundle.proposals.map((proposal) => {
            const isPreviewing = session.previewingProposalId === proposal.id;
            const isApplied = session.appliedProposalId === proposal.id;
            return (
              <article
                key={proposal.id}
                data-testid={`autogrip-proposal-card-${proposal.rank}`}
                className={`flex flex-col justify-between space-y-3 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${
                  isApplied ? "border-accent bg-accent-soft" : isPreviewing ? "border-line-strong bg-raised" : "border-line bg-raised"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-accent bg-card px-2 py-0.5 text-[11px] font-bold text-accent tabular-nums">{`TOP ${proposal.rank}`}</span>
                        <span className="rounded-md border border-line bg-card px-2 py-0.5 text-[11px] font-medium text-fg-2 tabular-nums">
                          {pick(`접촉 ${proposal.contactPoints}점`, `${proposal.contactPoints} pts`)}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-fg [word-break:keep-all]">{isEn ? proposal.titleEn : proposal.titleKo}</h4>
                    </div>
                    <span className="font-mono text-xs font-bold text-fg-2 tabular-nums">{`${proposal.overallScore}점`}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                    <div className="rounded-lg border border-line bg-card px-2.5 py-1.5">
                      <span className="text-fg-3">{pick("충돌 회피", "Clearance")}</span>
                      <div className="font-mono font-bold text-fg">{`${proposal.clearanceScore} / 100`}</div>
                    </div>
                    <div className="rounded-lg border border-line bg-card px-2.5 py-1.5">
                      <span className="text-fg-3">{pick("실루엣 가독", "Silhouette")}</span>
                      <div className="font-mono font-bold text-fg">{`${proposal.silhouetteScore} / 100`}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 font-mono text-[10px] text-fg-3 tabular-nums">
                    {FINGER_META.map((f) => {
                      const j = proposal.pose.fingers[f.id];
                      const activeContact = proposal.contactFingers.includes(f.id);
                      return (
                        <span key={f.id} className={`rounded border px-1.5 py-0.5 ${activeContact ? "border-accent bg-card text-fg" : "border-line bg-canvas text-fg-3"}`}>
                          {`${isEn ? f.shortEn : f.shortKo} ${Math.round(j.mcpDeg)}°/${Math.round(j.pipDeg)}°`}
                        </span>
                      );
                    })}
                  </div>

                  <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
                    {isEn ? proposal.descriptionEn : proposal.descriptionKo}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button type="button" data-testid={`autogrip-preview-btn-${proposal.rank}`} aria-pressed={isPreviewing} onClick={() => handleTogglePreview(proposal)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("미리보기", "Preview")}
                  </button>
                  <button type="button" data-testid={`autogrip-apply-btn-${proposal.rank}`} aria-pressed={isApplied} onClick={() => handleApplyProposal(proposal)} className={BTN_SOLID}>
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {isApplied ? pick("적용 중", "Applied") : pick("적용", "Apply")}
                  </button>
                  <button type="button" data-testid={`autogrip-card-revert-btn-${proposal.rank}`} disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
                    <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("되돌리기", "Revert")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("3D 15관절 핸드 리깅 JSON (VRM Humanoid 본 매핑)", "3D 15-Joint Hand Rig JSON (VRM Humanoid Mapping)")}</div>
          <button type="button" data-testid="autogrip-toggle-json-btn" onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJson ? pick("JSON 미리보기 숨기기", "Hide JSON Preview") : pick("JSON 미리보기 열기", "Show JSON Preview")}
          </button>
        </div>
        {showJson ? (
          <pre data-testid="autogrip-json-preview" className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {jsonText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
