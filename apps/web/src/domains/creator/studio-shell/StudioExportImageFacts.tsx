import { useEffect, useId, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { selectStudioUploadDecodedPixelLimit } from "../studio-upload-image-safety";
import { probeImageBlob } from "../submission-package/submission-image-probe";

type Measurement =
  | { state: "loading" | "unsupported" | "unreadable" | "tooLarge" }
  | { state: "ready"; width: number; height: number; bytes: number };

interface Props {
  readonly draft: string;
  readonly maxLength: number;
  readonly onChange: (draft: string) => void;
}

export function StudioExportImageFacts({ draft, maxLength, onChange }: Props) {
  const bt = useBilingual("studio.exportImageFacts");
  const id = useId();
  const activeRead = useRef<AbortController | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  useEffect(() => () => activeRead.current?.abort(), []);

  async function inspect(file: File) {
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    setMeasurement({ state: "loading" });
    try {
      const header = await probeImageBlob(file, controller.signal);
      if (controller.signal.aborted) return;
      if (!header.ok || (header.mime !== "image/png" && header.mime !== "image/jpeg")) {
        setMeasurement({ state: !header.ok && header.failure !== "unsupported" ? "unreadable" : "unsupported" });
        return;
      }
      const limit = selectStudioUploadDecodedPixelLimit({
        coarsePointer: globalThis.matchMedia?.("(pointer: coarse)").matches ?? false,
        deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      });
      if (header.width * header.height > limit) {
        setMeasurement({ state: "tooLarge" });
        return;
      }

      const { decodeStudioArchiveImageBlob } = await import("../studio-archive-import-apply");
      const decoded = await decodeStudioArchiveImageBlob(file, controller.signal);
      if (controller.signal.aborted) return;
      // 일부 브라우저는 JPEG EXIF 회전을 적용한다. 원고에는 파일에 인코딩된 폭과 높이를 기록한다.
      const same = decoded.width === header.width && decoded.height === header.height;
      const rotatedJpeg = header.mime === "image/jpeg" && decoded.height === header.width && decoded.width === header.height;
      setMeasurement(same || rotatedJpeg
        ? { state: "ready", width: header.width, height: header.height, bytes: file.size }
        : { state: "unreadable" });
    } catch {
      if (!controller.signal.aborted) setMeasurement({ state: "unreadable" });
    }
  }

  const facts = measurement?.state === "ready"
    ? `${bt("내보내기 이미지", "Export image")}: ${measurement.width} × ${measurement.height} px · ${measurement.bytes} B`
    : "";
  const nextDraft = draft && !draft.endsWith("\n") ? `${draft}\n${facts}` : `${draft}${facts}`;
  const alreadyAdded = Boolean(facts) && draft.split("\n").includes(facts);
  const tooLong = nextDraft.length > maxLength;

  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-card px-3 py-2.5 text-xs">
      <label className="block font-bold text-fg" htmlFor={id}>
        {bt("내 기기에서 이미지 규격 확인", "Check image dimensions on this device")}
      </label>
      <input
        id={id} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        aria-describedby={`${id}-hint`}
        className="block min-h-11 max-w-full text-fg-2 file:mr-2 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-panel file:px-3 focus-visible:outline-2 focus-visible:outline-accent"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void inspect(file);
        }}
      />
      <p id={`${id}-hint`} className="text-fg-2">
        {bt("PNG 또는 JPEG를 선택한 뒤, 폭·높이·용량만 원고에 추가할 수 있어요.", "Choose a PNG or JPEG, then add its width, height and file size to the brief.")}
      </p>
      <div role="status" aria-live="polite" className="text-fg">
        {measurement?.state === "loading" && bt("이미지 규격을 확인하는 중…", "Checking image dimensions…")}
        {measurement?.state === "unsupported" && bt("PNG 또는 JPEG 파일을 선택해 주세요.", "Choose a PNG or JPEG file.")}
        {measurement?.state === "unreadable" && bt("이미지를 읽지 못했어요. 파일을 다시 확인해 주세요.", "Could not read this image. Check the file and try again.")}
        {measurement?.state === "tooLarge" && bt("이 기기에서 확인하기에는 해상도가 너무 높아요. 나눈 이미지로 시도해 주세요.", "This image is too large to decode on this device. Try an exported slice.")}
        {facts && (
          <>
            <p>{facts}</p>
            {tooLong && !alreadyAdded && <p>{bt("측정값을 넣을 수 있도록 원고를 조금 줄여 주세요.", "Shorten the brief to make room for the measurements.")}</p>}
          </>
        )}
      </div>
      {facts && (
        <button
          type="button" disabled={alreadyAdded || tooLong}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
          onClick={() => onChange(nextDraft)}
        >
          {alreadyAdded ? bt("원고에 추가됨", "Added to brief") : bt("측정값을 원고에 추가", "Add measurements to brief")}
        </button>
      )}
    </div>
  );
}
