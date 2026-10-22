/**
 * 앵커 세트 만들기 상태 — 식별자, 권리 확인, 각도별 파일 배정, 읽기 세션, 세트·점검 결과.
 *
 * 상태 소유: 이 훅이 앵커 연구실의 "세트" 쪽 상태를 모두 가진다. 파일 읽기와 진행 관리는 순수 세션(anchor-capture-session)이
 * 하고, 이 훅은 그 스냅샷을 React 상태로 옮기며 세트·완전성 점검·권리 기록을 스냅샷에서 파생한다(파생값을 effect 로 복제하지 않는다).
 *
 * 규칙
 * - 권리 확인(rights.confirmed)이 없으면 파일을 받지 않는다. 확인한 시각은 체크한 순간 한 번 기록한다.
 * - 읽는 동안에는 새 파일을 받지 않는다(취소하거나 끝나기를 기다린다).
 * - 여러 장을 한꺼번에 놓으면 파일 이름에서 각도가 하나로 정해질 때만 칸에 넣고, 나머지는 넣지 않고 개수를 알린다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isValidAnchorCharacterId, isValidAnchorId, type AnchorAngleId } from "../anchor-capture-spec";
import {
  AnchorSetError,
  checkAnchorCompleteness,
  createAnchorCaptureSet,
  guessAnchorAngleFromFileName,
  parseAnchorImageFileName,
  type AnchorCaptureSet,
  type AnchorCompletenessReport,
  type AnchorValidationIssue,
} from "../anchor-capture-set";
import {
  clearAnchorSlot,
  collectAnchorFrames,
  createEmptyAnchorSession,
  runAnchorCapture,
  summarizeAnchorSession,
  type AnchorCapturedFrame,
  type AnchorSessionSnapshot,
  type AnchorSessionSummary,
} from "../anchor-capture-session";
import { createFileFrameSource } from "../anchor-frame-sources";
import { hashAnchorBytes } from "../anchor-image-io";
import { createAnchorRights, ANCHOR_RIGHTS_NOTE_MAX_LENGTH, type AnchorRights } from "../anchor-rights";

export interface AnchorIntakeReport {
  /** 파일 이름으로 각도를 짐작해 넣은 장수(내보낸 이름 규칙과 정확히 맞는 파일은 세지 않는다). */
  readonly guessed: number;
  /** 각도를 하나로 정하지 못해 넣지 않은 장수. */
  readonly unassigned: number;
}

export interface AnchorSetBuilder {
  readonly anchorId: string;
  readonly sourceCharacterId: string;
  readonly anchorIdValid: boolean;
  readonly characterIdValid: boolean;
  readonly setAnchorId: (value: string) => void;
  readonly setSourceCharacterId: (value: string) => void;
  readonly rightsConfirmed: boolean;
  readonly setRightsConfirmed: (confirmed: boolean) => void;
  readonly rightsNote: string;
  readonly setRightsNote: (value: string) => void;
  /** 식별자가 올바르고 권리를 확인했을 때만 있다. */
  readonly rights: AnchorRights | null;
  readonly snapshot: AnchorSessionSnapshot;
  readonly summary: AnchorSessionSummary;
  readonly running: boolean;
  readonly frames: readonly AnchorCapturedFrame[];
  readonly set: AnchorCaptureSet | null;
  /** 세트를 만들지 못한 이유(식별자 문제는 입력란이 따로 알리므로 여기에 넣지 않는다). */
  readonly setIssues: readonly AnchorValidationIssue[];
  readonly completeness: AnchorCompletenessReport;
  readonly intake: AnchorIntakeReport | null;
  readonly canAcceptFiles: boolean;
  readonly assignToAngle: (angleId: AnchorAngleId, file: File) => void;
  readonly assignMany: (files: readonly File[]) => void;
  readonly clearAngle: (angleId: AnchorAngleId) => void;
  readonly retryAngles: (angleIds: readonly AnchorAngleId[]) => void;
  readonly cancel: () => void;
}

function frameInputs(frames: readonly AnchorCapturedFrame[]) {
  return frames.map((frame) => ({
    angleId: frame.angleId,
    mimeType: frame.mimeType,
    width: frame.width,
    height: frame.height,
    byteLength: frame.byteLength,
    imageSha256: frame.imageSha256,
  }));
}

export function useAnchorSetBuilder(): AnchorSetBuilder {
  const [anchorId, setAnchorIdState] = useState("");
  const [sourceCharacterId, setSourceCharacterIdState] = useState("");
  const [rightsConfirmed, setRightsConfirmedState] = useState(false);
  const [attestedAt, setAttestedAt] = useState<string | null>(null);
  const [rightsNote, setRightsNoteState] = useState("");
  const [snapshot, setSnapshot] = useState<AnchorSessionSnapshot>(() => createEmptyAnchorSession());
  const [intake, setIntake] = useState<AnchorIntakeReport | null>(null);
  const snapshotRef = useRef(snapshot);
  const assignmentsRef = useRef(new Map<AnchorAngleId, File>());
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => { controllerRef.current?.abort(); }, []);

  const anchorIdValid = isValidAnchorId(anchorId);
  const characterIdValid = isValidAnchorCharacterId(sourceCharacterId);
  const running = snapshot.phase === "running";
  const canAcceptFiles = rightsConfirmed && !running;

  const publish = useCallback((next: AnchorSessionSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const run = useCallback((angles: readonly AnchorAngleId[]) => {
    if (angles.length === 0) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const assignments = [...assignmentsRef.current].map(([angleId, file]) => ({ angleId, file }));
    void runAnchorCapture({
      angles,
      source: createFileFrameSource(assignments),
      signal: controller.signal,
      previous: snapshotRef.current,
      hashBytes: hashAnchorBytes,
      onProgress: publish,
    });
  }, [publish]);

  const assignToAngle = useCallback((angleId: AnchorAngleId, file: File) => {
    if (snapshotRef.current.phase === "running") return;
    setIntake(null);
    assignmentsRef.current.set(angleId, file);
    run([angleId]);
  }, [run]);

  const assignMany = useCallback((files: readonly File[]) => {
    if (snapshotRef.current.phase === "running") return;
    const chosen = new Map<AnchorAngleId, File>();
    let guessed = 0;
    let unassigned = 0;
    for (const file of files) {
      const angleId = guessAnchorAngleFromFileName(file.name);
      if (!angleId || chosen.has(angleId)) {
        unassigned += 1;
        continue;
      }
      chosen.set(angleId, file);
      if (!parseAnchorImageFileName(file.name)) guessed += 1;
    }
    setIntake({ guessed, unassigned });
    for (const [angleId, file] of chosen) assignmentsRef.current.set(angleId, file);
    run([...chosen.keys()]);
  }, [run]);

  const clearAngle = useCallback((angleId: AnchorAngleId) => {
    if (snapshotRef.current.phase === "running") return;
    assignmentsRef.current.delete(angleId);
    publish(clearAnchorSlot(snapshotRef.current, angleId));
  }, [publish]);

  const retryAngles = useCallback((angleIds: readonly AnchorAngleId[]) => {
    if (snapshotRef.current.phase === "running") return;
    setIntake(null);
    run(angleIds.filter((angleId) => assignmentsRef.current.has(angleId)));
  }, [run]);

  const cancel = useCallback(() => { controllerRef.current?.abort(); }, []);

  const setRightsConfirmed = useCallback((confirmed: boolean) => {
    setRightsConfirmedState(confirmed);
    setAttestedAt(confirmed ? new Date().toISOString() : null);
  }, []);

  const frames = useMemo(() => collectAnchorFrames(snapshot), [snapshot]);
  const summary = useMemo(() => summarizeAnchorSession(snapshot), [snapshot]);
  const completeness = useMemo(() => checkAnchorCompleteness(frameInputs(frames)), [frames]);

  const built = useMemo(() => {
    if (!anchorIdValid || !characterIdValid || frames.length === 0) {
      return { set: null, issues: [] as readonly AnchorValidationIssue[] };
    }
    try {
      return { set: createAnchorCaptureSet({ anchorId, sourceCharacterId }, frameInputs(frames)), issues: [] as readonly AnchorValidationIssue[] };
    } catch (error) {
      if (error instanceof AnchorSetError) return { set: null, issues: error.issues };
      throw error;
    }
  }, [anchorId, anchorIdValid, characterIdValid, frames, sourceCharacterId]);

  const rights = useMemo(() => {
    if (!rightsConfirmed || attestedAt === null || !anchorIdValid || !characterIdValid) return null;
    return createAnchorRights({ confirmed: true, attestedAt, anchorId, sourceCharacterId, note: rightsNote });
  }, [anchorId, anchorIdValid, attestedAt, characterIdValid, rightsConfirmed, rightsNote, sourceCharacterId]);

  return {
    anchorId,
    sourceCharacterId,
    anchorIdValid,
    characterIdValid,
    setAnchorId: setAnchorIdState,
    setSourceCharacterId: setSourceCharacterIdState,
    rightsConfirmed,
    setRightsConfirmed,
    rightsNote,
    setRightsNote: (value: string) => { setRightsNoteState(value.slice(0, ANCHOR_RIGHTS_NOTE_MAX_LENGTH)); },
    rights,
    snapshot,
    summary,
    running,
    frames,
    set: built.set,
    setIssues: built.issues,
    completeness,
    intake,
    canAcceptFiles,
    assignToAngle,
    assignMany,
    clearAngle,
    retryAngles,
    cancel,
  };
}
