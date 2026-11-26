import { zlibSync } from "fflate";

import type { PackagePublishInput, PdfX4PageGeometry } from "./cmyk-pdfx4-epub3-print-packager";
import { isValidPublishRaster } from "./publish-raster-validation";
import { srgbToPrintCmyk, type ManuscriptSliceInput } from "./publish-spec-and-cmyk-softproof";

const encoder = new TextEncoder();
const text = (value: string): Uint8Array => encoder.encode(value);
const number = (value: number): string => String(Math.round(value * 1000) / 1000);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function stream(dictionary: string, bytes: Uint8Array): Uint8Array {
  return concat([text(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`), bytes, text("\nendstream")]);
}

function cmykPixels(slice: ManuscriptSliceInput, gcrStrength?: number): Uint8Array {
  const rgba = slice.rgba;
  if (!isValidPublishRaster(rgba, slice.widthPx, slice.heightPx)) {
    throw new RangeError(`인쇄 원고 ${slice.sliceId}에 크기가 일치하는 RGBA 픽셀이 필요합니다.`);
  }
  const pixels = new Uint8Array(rgba.length);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    // 투명 원고는 흰 종이 위에 합성한 다음 기존 TAC 제한을 적용한다.
    const alpha = rgba[offset + 3] / 255;
    const paper = 255 * (1 - alpha);
    const sample = srgbToPrintCmyk(rgba[offset] * alpha + paper, rgba[offset + 1] * alpha + paper,
      rgba[offset + 2] * alpha + paper, { maxTacPercent: 300, gcrStrength });
    pixels[offset] = Math.round(sample.c * 255);
    pixels[offset + 1] = Math.round(sample.m * 255);
    pixels[offset + 2] = Math.round(sample.y * 255);
    pixels[offset + 3] = Math.round(sample.k * 255);
  }
  return pixels;
}

function pageContents(page: PdfX4PageGeometry): Uint8Array {
  const box = page.bleedBoxPt;
  const operators = [
    "q", `${number(box.width)} 0 0 ${number(box.height)} ${number(box.x)} ${number(box.y)} cm`, "/Im0 Do", "Q",
    "q", "0 0 0 1 K", "0.25 w",
  ];
  for (const mark of page.cropMarksPt) {
    operators.push(`${number(mark.x1)} ${number(mark.y1)} m ${number(mark.x2)} ${number(mark.y2)} l S`);
  }
  for (const mark of page.registrationMarksPt) {
    operators.push(`${number(mark.cx - mark.radiusPt)} ${number(mark.cy)} m ${number(mark.cx + mark.radiusPt)} ${number(mark.cy)} l S`,
      `${number(mark.cx)} ${number(mark.cy - mark.radiusPt)} m ${number(mark.cx)} ${number(mark.cy + mark.radiusPt)} l S`);
  }
  operators.push("Q");
  return text(operators.join("\n"));
}

/** 이미지 XObject·페이지 콘텐츠·교차 참조를 포함하는 완결된 인쇄 PDF를 기록한다. */
export function buildPublishCmykPdfBytes(input: PackagePublishInput, pages: readonly PdfX4PageGeometry[], iccProfileName: string): Uint8Array {
  const kids = pages.map((_, index) => `${5 + index * 3} 0 R`).join(" ");
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" pdfxid:GTS_PDFXVersion="PDF/X-4"/>` +
    `</rdf:RDF></x:xmpmeta>`;
  const profile = iccProfileName.replace(/[\\()]/g, "\\$&");
  const objects = [
    text("<< /Type /Catalog /Pages 2 0 R /Metadata 3 0 R /OutputIntents [4 0 R] >>"),
    text(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`),
    stream("/Type /Metadata /Subtype /XML", text(xmp)),
    text(`<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (${profile}) /RegistryName (http://www.color.org) >>`),
  ];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const slice = input.slices[index];
    const id = 5 + index * 3;
    const { mediaBoxPt: media, bleedBoxPt: bleed, trimBoxPt: trim } = page;
    const box = (value: typeof bleed): string => `[${number(value.x)} ${number(value.y)} ${number(value.x + value.width)} ${number(value.y + value.height)}]`;
    objects.push(
      text(`<< /Type /Page /Parent 2 0 R /MediaBox ${box(media)} /BleedBox ${box(bleed)} /TrimBox ${box(trim)} ` +
        `/Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`),
      stream(`/Type /XObject /Subtype /Image /Width ${slice.widthPx} /Height ${slice.heightPx} /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /FlateDecode`,
        zlibSync(cmykPixels(slice, input.gcrStrength))),
      stream("", pageContents(page)),
    );
  }
  const chunks = [text("%PDF-1.6\n%ToonStudio-Local-PDFX4\n")];
  const offsets: number[] = [0];
  let length = chunks[0].length;
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(length);
    const object = concat([text(`${index + 1} 0 obj\n`), objects[index], text("\nendobj\n")]);
    chunks.push(object);
    length += object.length;
  }
  const entries = offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  chunks.push(text(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}` +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return concat(chunks);
}
