/**
 * 후보 비교 상태 — 후보 파일 목록, 분석 큐, 앵커 특징, 점수·정렬·선택·나란히 보기.
 *
 * 상태 소유와 파생
 * - 후보 기록(records)과 앵커 특징(anchorRun)만 상태다. 점수·정렬·선택·비교·차이 항목은 모두 이 둘에서 파생한다
 *   (앵커가 바뀌어도 후보를 다시 풀지 않고 저장해 둔 특징으로 점수만 다시 계산한다).
 * - 이미지는 한 장씩 풀어 분석한다. 취소하면 진행 중인 것과 남은 것이 취소되고, 실패한 후보만 다시 시도할 수 있다.
 * - 후보는 최대 ANCHOR_CANDIDATE_LIMITS.maxCandidates 장. 넘친 파일은 넣지 않고 개수를 알린다.
 *
 * 점수는 휴리스틱 참고 값이다. 같은 캐릭터인지 판정하지 않으며 이 훅은 그런 값을 만들지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AnchorAngleId } from "../anchor-capture-spec";
import type { AnchorCapturedFrame } from "../anchor-capture-session";
import {
  ANCHOR_CANDIDATE_LIMITS,
  defaultAnchorCandidateDeps,
  extractAnchorSetFeatures,
  runAnchorCandidateQueue,
  type AnchorCandidateDeps,
  type AnchorCandidateErrorCode,
  type AnchorCandidateJob,
  type AnchorCandidatePatch,
  type AnchorCandidateStatus,
} from "../anchor-candidate-session";
import type { AnchorPairComparison } from "../anchor-consistency-compare";
import { describeAnchorDifferences, type AnchorDifference } from "../anchor-consistency-differences";
import {
  displayedAnchorScore,
  scoreCandidateAgainstAnchors,
  sortAnchorCandidates,
  type AnchorCandidateAnchorScore,
  type AnchorCandidateScore,
  type AnchorReferenceFeatures,
  type AnchorSortMode,
} from "../anchor-consistency-score";
import type { AnchorImageFeatures } from "../anchor-image-features";

export interface AnchorCandidateItem {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly file: File;
  readonly status: AnchorCandidateStatus;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly features?: AnchorImageFeatures;
  readonly errorCode?: AnchorCandidateErrorCode;
  readonly errorParams?: Readonly<Record<string, number>>;
  /** 앵커 특징이 준비되고 후보 분석이 끝났을 때만 있다. 여섯 앵커와의 비교를 모두 담는다. */
  readonly score: AnchorCandidateScore | null;
  /**
   * 목록과 나란히 보기가 그리는 점수. 견줄 앵커를 골랐으면 그 앵커와의 비교, 자동이면 후보마다 가장 비슷한 앵커와의 비교다.
   * 정렬 키와 같은 값을 쓰므로 화면의 숫자와 순서가 어긋나지 않는다. `score` 와 같은 시점에만 있다.
   */
  readonly displayed: AnchorCandidateAnchorScore | null;
}

type CandidateRecord = Omit<AnchorCandidateItem, "score" | "displayed">;

export type AnchorFeaturesStatus = "idle" | "computing" | "ready" | "error";

interface AnchorRun {
  readonly forFrames: readonly AnchorCapturedFrame[] | null;
  readonly status: "ready" | "error";
  readonly features: readonly AnchorReferenceFeatures[];
  readonly failedAngles: number;
}

export interface AnchorSelection {
  readonly item: AnchorCandidateItem;
  /** 실제로 견준 앵커 각도(자동이면 가장 비슷한 각도). */
  readonly anchorAngleId: AnchorAngleId;
  readonly comparison: AnchorPairComparison;
  readonly differences: readonly AnchorDifference[];
}

export interface AnchorCandidates {
  /** 정렬된 후보 목록. */
  readonly items: readonly AnchorCandidateItem[];
  readonly counts: { readonly total: number; readonly settled: number; readonly failed: number; readonly active: number };
  readonly maxCandidates: number;
  readonly skippedNotice: number | null;
  readonly anchorStatus: AnchorFeaturesStatus;
  readonly anchorFailedAngles: number;
  readonly anchorAngles: readonly AnchorAngleId[];
  readonly sortMode: AnchorSortMode;
  readonly setSortMode: (mode: AnchorSortMode) => void;
  readonly anchorChoice: AnchorAngleId | "best";
  readonly setAnchorChoice: (choice: AnchorAngleId | "best") => void;
  readonly selectedId: string | null;
  readonly selection: AnchorSelection | null;
  readonly select: (id: string) => void;
  readonly selectRelative: (delta: number) => void;
  readonly selectEdge: (edge: "first" | "last") => void;
  readonly addFiles: (files: readonly File[]) => void;
  readonly remove: (id: string) => void;
  readonly clearAll: () => void;
  readonly cancel: () => void;
  readonly retry: (ids: readonly string[]) => void;
  readonly retryAnchors: () => void;
}

export interface UseAnchorCandidatesOptions {
  readonly frames: readonly AnchorCapturedFrame[];
  /** false 면 파일을 받지 않는다(권리 확인 전). */
  readonly canAcceptFiles: boolean;
  readonly deps?: AnchorCandidateDeps;
}

function applyPatch(record: CandidateRecord, patch: AnchorCandidatePatch): CandidateRecord {
  return { ...record, ...patch, errorCode: patch.errorCode, errorParams: patch.errorParams };
}

export function useAnchorCandidates(options: UseAnchorCandidatesOptions): AnchorCandidates {
  const { frames, canAcceptFiles } = options;
  const deps = options.deps ?? defaultAnchorCandidateDeps;
  const [records, setRecords] = useState<readonly CandidateRecord[]>([]);
  const [anchorRun, setAnchorRun] = useState<AnchorRun>({ forFrames: null, status: "ready", features: [], failedAngles: 0 });
  const [anchorRetry, setAnchorRetry] = useState(0);
  const [sortMode, setSortMode] = useState<AnchorSortMode>("score-desc");
  const [anchorChoice, setAnchorChoice] = useState<AnchorAngleId | "best">("best");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skippedNotice, setSkippedNotice] = useState<number | null>(null);
  const recordsRef = useRef<readonly CandidateRecord[]>(records);
  const idRef = useRef(0);
  const orderRef = useRef(0);
  const controllerRef = useRef(new AbortController());
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const featureCacheRef = useRef(new Map<string, AnchorImageFeatures>());

  useEffect(() => {
    const controller = controllerRef;
    // 화면을 떠날 때 진행 중인 분석을 멈춘다. 개발 모드의 효과 재실행(StrictMode)에서 이미 중단된 신호가 남아
    // 이후 분석이 모두 취소되지 않도록 새 신호로 바꿔 둔다.
    return () => {
      controller.current.abort();
      controller.current = new AbortController();
    };
  }, []);

  const commit = useCallback((next: readonly CandidateRecord[]) => {
    recordsRef.current = next;
    setRecords(next);
  }, []);

  const patchRecord = useCallback((id: string, patch: AnchorCandidatePatch) => {
    commit(recordsRef.current.map((record) => (record.id === id ? applyPatch(record, patch) : record)));
  }, [commit]);

  const enqueue = useCallback((jobs: readonly AnchorCandidateJob[]) => {
    if (jobs.length === 0) return;
    const signal = controllerRef.current.signal;
    chainRef.current = chainRef.current.then(() => runAnchorCandidateQueue({ jobs, deps, signal, onUpdate: patchRecord }));
  }, [deps, patchRecord]);

  const hasCandidates = records.length > 0;
  useEffect(() => {
    if (!hasCandidates || frames.length === 0) return undefined;
    const controller = new AbortController();
    void extractAnchorSetFeatures(frames, deps, controller.signal, featureCacheRef.current)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAnchorRun({
          forFrames: frames,
          status: result.features.length === 0 ? "error" : "ready",
          features: result.features,
          failedAngles: result.failed.length,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAnchorRun({ forFrames: frames, status: "error", features: [], failedAngles: frames.length });
      });
    return () => { controller.abort(); };
  }, [anchorRetry, deps, frames, hasCandidates]);

  const anchorStatus: AnchorFeaturesStatus = !hasCandidates || frames.length === 0
    ? "idle"
    : anchorRun.forFrames !== frames ? "computing" : anchorRun.status;
  const anchorFeatures = useMemo<readonly AnchorReferenceFeatures[]>(
    () => (anchorStatus === "ready" ? anchorRun.features : []),
    [anchorRun.features, anchorStatus],
  );
  const anchorAngles = useMemo(() => anchorFeatures.map((entry) => entry.angleId), [anchorFeatures]);
  const effectiveChoice: AnchorAngleId | "best" = anchorChoice !== "best" && anchorAngles.includes(anchorChoice) ? anchorChoice : "best";

  const comparedAngleId = effectiveChoice === "best" ? null : effectiveChoice;
  const scored = useMemo<readonly AnchorCandidateItem[]>(
    () => records.map((record) => {
      const score = record.features && anchorFeatures.length > 0 ? scoreCandidateAgainstAnchors(anchorFeatures, record.features) : null;
      return { ...record, score, displayed: score ? displayedAnchorScore(score, comparedAngleId) : null };
    }),
    [anchorFeatures, comparedAngleId, records],
  );
  const items = useMemo(
    () => sortAnchorCandidates(scored, sortMode, comparedAngleId),
    [comparedAngleId, scored, sortMode],
  );

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const selection = useMemo<AnchorSelection | null>(() => {
    const features = selectedItem?.features;
    const displayed = selectedItem?.displayed;
    if (!selectedItem || !features || !displayed) return null;
    const anchor = anchorFeatures.find((entry) => entry.angleId === displayed.angleId);
    if (!anchor) return null;
    // 나란히 보기는 목록 카드와 같은 displayed 를 읽는다. 이 비교는 같은 두 특징으로 compareAnchorFeatures 가 만든 값이라
    // 차이 항목이 점수와 같은 입력에서 나온다.
    return {
      item: selectedItem,
      anchorAngleId: displayed.angleId,
      comparison: displayed.comparison,
      differences: describeAnchorDifferences(anchor.features, features, displayed.comparison),
    };
  }, [anchorFeatures, selectedItem]);

  const counts = useMemo(() => {
    let settled = 0;
    let failed = 0;
    let active = 0;
    for (const record of records) {
      if (record.status === "queued" || record.status === "analyzing") active += 1;
      else settled += 1;
      if (record.status === "failed" || record.status === "cancelled") failed += 1;
    }
    return { total: records.length, settled, failed, active };
  }, [records]);

  const addFiles = useCallback((files: readonly File[]) => {
    if (!canAcceptFiles || files.length === 0) return;
    const room = Math.max(0, ANCHOR_CANDIDATE_LIMITS.maxCandidates - recordsRef.current.length);
    const accepted = files.slice(0, room);
    setSkippedNotice(files.length > accepted.length ? files.length - accepted.length : null);
    if (accepted.length === 0) return;
    const created: CandidateRecord[] = accepted.map((file) => {
      idRef.current += 1;
      orderRef.current += 1;
      return { id: `candidate-${idRef.current}`, name: file.name || `candidate-${idRef.current}`, order: orderRef.current, file, status: "queued" };
    });
    commit([...recordsRef.current, ...created]);
    enqueue(created.map((record) => ({ id: record.id, file: record.file })));
  }, [canAcceptFiles, commit, enqueue]);

  const remove = useCallback((id: string) => {
    commit(recordsRef.current.filter((record) => record.id !== id));
  }, [commit]);

  const cancel = useCallback(() => {
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
  }, []);

  const clearAll = useCallback(() => {
    cancel();
    commit([]);
    setSelectedId(null);
    setSkippedNotice(null);
  }, [cancel, commit]);

  const retry = useCallback((ids: readonly string[]) => {
    const wanted = new Set(ids);
    const jobs: AnchorCandidateJob[] = [];
    const next = recordsRef.current.map((record) => {
      if (!wanted.has(record.id) || (record.status !== "failed" && record.status !== "cancelled")) return record;
      jobs.push({ id: record.id, file: record.file });
      return applyPatch(record, { status: "queued" });
    });
    commit(next);
    enqueue(jobs);
  }, [commit, enqueue]);

  const retryAnchors = useCallback(() => {
    setAnchorRun((current) => ({ ...current, forFrames: null }));
    setAnchorRetry((count) => count + 1);
  }, []);

  const selectRelative = useCallback((delta: number) => {
    const index = items.findIndex((item) => item.id === selectedItem?.id);
    const next = items[Math.min(items.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
    if (next) setSelectedId(next.id);
  }, [items, selectedItem?.id]);

  const selectEdge = useCallback((edge: "first" | "last") => {
    const target = edge === "first" ? items[0] : items[items.length - 1];
    if (target) setSelectedId(target.id);
  }, [items]);

  return {
    items,
    counts,
    maxCandidates: ANCHOR_CANDIDATE_LIMITS.maxCandidates,
    skippedNotice,
    anchorStatus,
    anchorFailedAngles: anchorRun.failedAngles,
    anchorAngles,
    sortMode,
    setSortMode,
    anchorChoice: effectiveChoice,
    setAnchorChoice,
    selectedId: selectedItem?.id ?? null,
    selection,
    select: setSelectedId,
    selectRelative,
    selectEdge,
    addFiles,
    remove,
    clearAll,
    cancel,
    retry,
    retryAnchors,
  };
}
