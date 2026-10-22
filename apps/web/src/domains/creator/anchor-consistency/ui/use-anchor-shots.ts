/**
 * 샷 포즈·구도 이미지 상태 — 참조 팩에 방법(method) 참조로 더할 이미지 두 장(포즈, 구도)과 샷 id.
 *
 * 파일은 이 기기 안에서만 읽는다. 읽기는 앵커 파일과 같은 검사(형식·크기·헤더)를 거치고, 각 칸은 읽는 중·준비·읽지 못함을
 * 따로 가진다. 참조 id 는 샷 id 뒤에 `-pose`·`-composition` 을 붙여 둘이 겹치지 않게 만든다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isAnchorImageMimeType } from "../anchor-capture-spec";
import {
  AnchorCaptureError,
  type AnchorCaptureErrorCode,
} from "../anchor-capture-session";
import type { AnchorShotFrame } from "../anchor-export";
import { readAnchorImageFile } from "../anchor-frame-sources";
import { hashAnchorBytes } from "../anchor-image-io";
import type { AnchorShotCaptureKind } from "../anchor-reference-pack";

/** 샷 id 입력 규칙. 참조 id 에 쓰는 접미어(-composition)를 붙여도 80자를 넘지 않게 60자까지 받는다. */
export const ANCHOR_SHOT_BASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/u;

export const ANCHOR_SHOT_KINDS: readonly AnchorShotCaptureKind[] = Object.freeze(["pose", "composition"]);

export interface AnchorShotSlot {
  readonly status: "empty" | "reading" | "ready" | "failed";
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly errorCode?: AnchorCaptureErrorCode;
  readonly errorParams?: Readonly<Record<string, number>>;
}

interface ShotRead {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mimeType: AnchorShotFrame["capture"]["mimeType"];
  readonly width: number;
  readonly height: number;
  readonly imageSha256: string;
}

export interface AnchorShots {
  readonly baseId: string;
  readonly baseIdValid: boolean;
  readonly setBaseId: (value: string) => void;
  readonly slots: Readonly<Record<AnchorShotCaptureKind, AnchorShotSlot>>;
  /** 샷 id 가 올바르고 읽기를 마친 칸만 모은 참조 팩 입력. */
  readonly frames: readonly AnchorShotFrame[];
  readonly choose: (kind: AnchorShotCaptureKind, file: File) => void;
  readonly clear: (kind: AnchorShotCaptureKind) => void;
}

const EMPTY_SLOT: AnchorShotSlot = Object.freeze({ status: "empty" });

function withoutRead(
  reads: Readonly<Partial<Record<AnchorShotCaptureKind, ShotRead>>>,
  kind: AnchorShotCaptureKind,
): Readonly<Partial<Record<AnchorShotCaptureKind, ShotRead>>> {
  const next = { ...reads };
  delete next[kind];
  return next;
}

export function useAnchorShots(): AnchorShots {
  const [baseId, setBaseId] = useState("");
  const [slots, setSlots] = useState<Readonly<Record<AnchorShotCaptureKind, AnchorShotSlot>>>({ pose: EMPTY_SLOT, composition: EMPTY_SLOT });
  const [reads, setReads] = useState<Readonly<Partial<Record<AnchorShotCaptureKind, ShotRead>>>>({});
  const controllersRef = useRef<Partial<Record<AnchorShotCaptureKind, AbortController>>>({});

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of Object.values(controllers)) controller.abort();
    };
  }, []);

  const clear = useCallback((kind: AnchorShotCaptureKind) => {
    controllersRef.current[kind]?.abort();
    setSlots((current) => ({ ...current, [kind]: EMPTY_SLOT }));
    setReads((current) => withoutRead(current, kind));
  }, []);

  const choose = useCallback((kind: AnchorShotCaptureKind, file: File) => {
    controllersRef.current[kind]?.abort();
    const controller = new AbortController();
    controllersRef.current[kind] = controller;
    setSlots((current) => ({ ...current, [kind]: { status: "reading", name: file.name } }));
    setReads((current) => withoutRead(current, kind));
    void (async () => {
      try {
        const frame = await readAnchorImageFile(file, controller.signal);
        const imageSha256 = await hashAnchorBytes(frame.bytes);
        if (controller.signal.aborted) return;
        const mimeType = frame.mimeType;
        if (!isAnchorImageMimeType(mimeType)) throw new AnchorCaptureError("unsupported-format");
        setReads((current) => ({
          ...current,
          [kind]: { name: file.name, bytes: frame.bytes, mimeType, width: frame.width, height: frame.height, imageSha256 },
        }));
        setSlots((current) => ({ ...current, [kind]: { status: "ready", name: file.name, width: frame.width, height: frame.height } }));
      } catch (error) {
        if (controller.signal.aborted) return;
        const code: AnchorCaptureErrorCode = error instanceof AnchorCaptureError ? error.code : "source-failed";
        const params = error instanceof AnchorCaptureError ? error.params : {};
        setSlots((current) => ({
          ...current,
          [kind]: { status: "failed", name: file.name, errorCode: code, ...(Object.keys(params).length > 0 ? { errorParams: params } : {}) },
        }));
      }
    })();
  }, []);

  const baseIdValid = ANCHOR_SHOT_BASE_ID_PATTERN.test(baseId);
  const frames = useMemo<readonly AnchorShotFrame[]>(() => {
    if (!baseIdValid) return [];
    return ANCHOR_SHOT_KINDS.flatMap((kind) => {
      const read = reads[kind];
      if (!read) return [];
      return [{
        capture: {
          shotId: `${baseId}-${kind}`,
          kind,
          mimeType: read.mimeType,
          width: read.width,
          height: read.height,
          byteLength: read.bytes.byteLength,
          imageSha256: read.imageSha256,
        },
        bytes: read.bytes,
      }];
    });
  }, [baseId, baseIdValid, reads]);

  return { baseId, baseIdValid, setBaseId, slots, frames, choose, clear };
}
