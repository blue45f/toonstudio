import { describe, expect, it } from "vitest";

import {
  CLIP_CHUNK_LABEL_BYTES,
  CLIP_CHUNK_SIZE_FIELD_BYTES,
  CLIP_CONTAINER_HEADER_BYTES,
  CLIP_CONTAINER_MAGIC,
  encodeClipContainer,
  encodeClipExternalChunkPayload,
  extractClipSqliteDatabase,
  inspectClipContainerKind,
  parseClipContainer,
  readClipExternalBlockData,
} from "../chunked-sqlite-container";

const UTF8 = new TextEncoder();

/** inspectCspToolFile가 container="sqlite3"로 판정하도록 100바이트 이상의 최소 SQLite 헤더를 만든다. */
function makeSqlitePayload(userBytes: number[] = []): Uint8Array {
  const payload = new Uint8Array(100 + userBytes.length);
  payload.set(UTF8.encode("SQLite format 3\0"), 0);
  const view = new DataView(payload.buffer);
  view.setUint16(16, 4096, false); // page size
  payload[18] = 1; // write version
  payload[19] = 1; // read version
  view.setUint32(56, 1, false); // text encoding = utf-8
  payload.set(userBytes, 100);
  return payload;
}

const EXTERNAL_ID = "extrnlid0f8c5d2a-1b3e-4c7f-9a2d-6e5f4c3b2a10";

describe("Clip Studio .clip (CSFCHUNK) 통합 컨테이너 리더/라이터", () => {
  it("Head/Exta/SQLi/Foot 4청크 컨테이너를 라운드트립 파싱한다", () => {
    const sqlitePayload = makeSqlitePayload([0xde, 0xad, 0xbe, 0xef]);
    const layerPixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const extaPayload = encodeClipExternalChunkPayload({
      externalId: EXTERNAL_ID,
      data: layerPixels,
    });

    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: new Uint8Array(40) },
        { label: "CHNKExta", payload: extaPayload },
        { label: "SQLi", payload: sqlitePayload },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });

    // 헤더: 매직 + uint64 두 필드(기본 직렬화 순서는 선언 길이 → 청크 시작 24, 미검증 가정)
    expect(new TextDecoder("latin1").decode(encoded.subarray(0, 8))).toBe(CLIP_CONTAINER_MAGIC);

    const parsed = parseClipContainer(encoded);
    expect(parsed.kind).toBe("csfchunk");
    expect(parsed.headerLayout).toBe("length-then-offset");
    expect(parsed.truncated).toBe(false);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.declaredChunkStart).toBe(CLIP_CONTAINER_HEADER_BYTES);
    expect(parsed.declaredFileLength).toBe(encoded.byteLength);
    expect(parsed.chunks.map((chunk) => chunk.type)).toEqual(["Head", "Exta", "SQLi", "Foot"]);

    // SQLite 섹션은 선언 길이 기준으로 정밀하게 잡힌다.
    expect(parsed.sqlite).not.toBeNull();
    expect(parsed.sqlite?.inspection.container).toBe("sqlite3");
    expect(parsed.sqlite?.payloadLength).toBe(sqlitePayload.byteLength);

    // 외부 블록은 외부 ID로 복원되고 데이터가 그대로 나온다.
    expect(parsed.externalBlocks).toHaveLength(1);
    const block = parsed.externalBlocks[0]!;
    expect(block.parsed).toBe(true);
    expect(block.externalId).toBe(EXTERNAL_ID);
    expect(block.dataLength).toBe(layerPixels.byteLength);
    expect(readClipExternalBlockData(encoded, block)).toEqual(layerPixels);
  });

  it("extractClipSqliteDatabase는 CHNKSQLi 페이로드만 정확히 복사한다", () => {
    const sqlitePayload = makeSqlitePayload([0x11, 0x22, 0x33]);
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: new Uint8Array(40) },
        { label: "SQLi", payload: sqlitePayload },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });

    const extracted = extractClipSqliteDatabase(encoded);
    expect(extracted).not.toBeNull();
    expect(extracted).toEqual(sqlitePayload);
    // 선형 스캔으로 EOF까지 긁지 않으므로 Foot 라벨 바이트가 섞이지 않는다.
    expect(extracted!.byteLength).toBe(sqlitePayload.byteLength);
  });

  it("SQLi 청크가 없으면 extractClipSqliteDatabase는 null을 반환한다", () => {
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: new Uint8Array(40) },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });
    expect(extractClipSqliteDatabase(encoded)).toBeNull();
  });

  it(".lip raw SQLite(SQLite format 3) 컨테이너를 인식한다", () => {
    const lip = makeSqlitePayload([0xaa, 0xbb]);
    expect(inspectClipContainerKind(lip)).toBe("lip-sqlite3");

    const parsed = parseClipContainer(lip);
    expect(parsed.kind).toBe("lip-sqlite3");
    expect(parsed.chunks).toHaveLength(0);
    expect(parsed.sqlite?.payloadOffset).toBe(0);
    expect(parsed.sqlite?.payloadLength).toBe(lip.byteLength);
    expect(extractClipSqliteDatabase(lip)).toEqual(lip);
  });

  it("매직을 알 수 없으면 issue와 함께 kind=unknown을 돌려준다", () => {
    const parsed = parseClipContainer(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]));
    expect(parsed.kind).toBe("unknown");
    expect(parsed.sqlite).toBeNull();
    expect(parsed.issues.map((entry) => entry.code)).toContain("clip-magic-unrecognized");
  });

  it("페이로드 길이가 파일을 넘으면 truncated로 보고하고 중단한다", () => {
    const bytes = new Uint8Array(CLIP_CONTAINER_HEADER_BYTES + CLIP_CHUNK_LABEL_BYTES + CLIP_CHUNK_SIZE_FIELD_BYTES + 4);
    const view = new DataView(bytes.buffer);
    bytes.set(UTF8.encode(CLIP_CONTAINER_MAGIC), 0);
    view.setBigUint64(8, BigInt(CLIP_CONTAINER_HEADER_BYTES), false);
    view.setBigUint64(16, BigInt(bytes.byteLength), false);
    bytes.set(UTF8.encode("CHNKSQLi"), CLIP_CONTAINER_HEADER_BYTES);
    // 선언 페이로드 길이 999999 >> 실제 남은 4바이트
    view.setBigUint64(CLIP_CONTAINER_HEADER_BYTES + CLIP_CHUNK_LABEL_BYTES, 999_999n, false);

    const parsed = parseClipContainer(bytes);
    expect(parsed.truncated).toBe(true);
    expect(parsed.chunks).toHaveLength(0);
    expect(parsed.issues.map((entry) => entry.code)).toContain("clip-chunk-overruns-file");
  });

  it("CHNKExta 하위 레이아웃이 손상되면 원본 보존으로 폴백한다", () => {
    // idLen 필드를 비현실적으로 크게 설정한 16바이트 Exta 페이로드.
    const corruptExta = new Uint8Array(16);
    new DataView(corruptExta.buffer).setBigUint64(0, 0xffff_ffffn, false);
    const encoded = encodeClipContainer({
      chunks: [{ label: "CHNKExta", payload: corruptExta }],
    });

    const parsed = parseClipContainer(encoded);
    expect(parsed.externalBlocks).toHaveLength(1);
    const block = parsed.externalBlocks[0]!;
    expect(block.parsed).toBe(false);
    expect(block.externalId).toBe("clip-exta-unparsed-0");
    expect(block.dataLength).toBe(corruptExta.byteLength);
    expect(parsed.issues.map((entry) => entry.code)).toContain("clip-exta-id-length-invalid");
  });

  it("라벨이 4자/8자 모두 허용되고 비정상 길이는 거부한다", () => {
    expect(() =>
      encodeClipContainer({ chunks: [{ label: "TooLongLabel", payload: new Uint8Array(0) }] }),
    ).toThrow(RangeError);
  });

  it("maxChunkBytes 한도를 초과하는 청크는 파싱을 중단한다", () => {
    const encoded = encodeClipContainer({
      chunks: [{ label: "Head", payload: new Uint8Array(40) }],
    });
    const parsed = parseClipContainer(encoded, { limits: { maxChunkBytes: 8 } });
    expect(parsed.truncated).toBe(true);
    expect(parsed.issues.map((entry) => entry.code)).toContain("clip-chunk-size-invalid");
  });

  it("헤더 두 필드가 반대 순서여도 같은 청크 디렉터리를 복원한다", () => {
    const chunks = [
      { label: "Head", payload: new Uint8Array(40) },
      { label: "SQLi", payload: makeSqlitePayload([0x01]) },
      { label: "Foot", payload: new Uint8Array(0) },
    ];
    const lengthFirst = parseClipContainer(encodeClipContainer({ chunks }));
    const offsetFirst = parseClipContainer(
      encodeClipContainer({ chunks, headerLayout: "offset-then-length" }),
    );

    expect(lengthFirst.headerLayout).toBe("length-then-offset");
    expect(offsetFirst.headerLayout).toBe("offset-then-length");
    expect(offsetFirst.declaredChunkStart).toBe(CLIP_CONTAINER_HEADER_BYTES);
    expect(offsetFirst.declaredFileLength).toBe(lengthFirst.declaredFileLength);
    expect(offsetFirst.chunks.map((chunk) => chunk.type)).toEqual(
      lengthFirst.chunks.map((chunk) => chunk.type),
    );
    expect(offsetFirst.issues).toHaveLength(0);
  });

  it("헤더 필드를 판정할 수 없어도 24바이트 뒤에서 청크를 읽고 issue로 알린다", () => {
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: new Uint8Array(40) },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });
    // 두 필드를 모두 0으로 덮어 판정 불가 상태를 만든다.
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    view.setBigUint64(8, 0n, false);
    view.setBigUint64(16, 0n, false);

    const parsed = parseClipContainer(encoded);
    expect(parsed.headerLayout).toBe("unrecognized");
    expect(parsed.declaredChunkStart).toBeNull();
    expect(parsed.declaredFileLength).toBeNull();
    expect(parsed.chunks.map((chunk) => chunk.type)).toEqual(["Head", "Foot"]);
    expect(parsed.issues.map((entry) => entry.code)).toEqual(["clip-header-fields-unrecognized"]);
  });

  it("선언 길이보다 파일이 짧으면 truncated와 길이 불일치 issue로 보고한다", () => {
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: new Uint8Array(40) },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });
    // Foot 프레임의 길이 필드 8바이트를 잘라낸다.
    const cut = encoded.slice(0, encoded.byteLength - 8);

    const parsed = parseClipContainer(cut);
    expect(parsed.truncated).toBe(true);
    expect(parsed.issues.map((entry) => entry.code)).toContain("clip-declared-length-mismatch");
  });

  it("푸터 청크가 없으면 clip-footer-missing으로 알린다", () => {
    const encoded = encodeClipContainer({
      chunks: [{ label: "Head", payload: new Uint8Array(40) }],
    });

    const parsed = parseClipContainer(encoded);
    expect(parsed.truncated).toBe(false);
    expect(parsed.issues.map((entry) => entry.code)).toEqual(["clip-footer-missing"]);
  });

  it("Foot까지 읽었다면 선언 길이가 실제보다 커도 truncated로 단정하지 않는다", () => {
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: new Uint8Array(40) },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });
    // 기본 직렬화 순서(선언 길이 → 청크 시작)에서 오프셋 8의 선언 길이를 실제보다 크게 바꾼다.
    new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength).setBigUint64(
      8,
      BigInt(encoded.byteLength + 100),
      false,
    );

    const parsed = parseClipContainer(encoded);
    expect(parsed.truncated).toBe(false);
    expect(parsed.chunks.map((chunk) => chunk.type)).toEqual(["Head", "Foot"]);
    expect(parsed.issues.map((entry) => entry.code)).toEqual(["clip-declared-length-mismatch"]);
  });

  it("Node Buffer 입력에서도 추출 결과는 원본과 메모리를 공유하지 않는다", () => {
    const extaPayload = encodeClipExternalChunkPayload({
      externalId: EXTERNAL_ID,
      data: Uint8Array.from([9, 8, 7]),
    });
    const input = Buffer.from(
      encodeClipContainer({
        chunks: [
          { label: "CHNKExta", payload: extaPayload },
          { label: "SQLi", payload: makeSqlitePayload([0x42]) },
          { label: "Foot", payload: new Uint8Array(0) },
        ],
      }),
    );

    const database = extractClipSqliteDatabase(input);
    const block = parseClipContainer(input).externalBlocks[0]!;
    const data = readClipExternalBlockData(input, block);
    expect(database).not.toBeNull();

    // 결과를 바꿔도 입력 컨테이너 바이트는 그대로여야 한다.
    const before = Uint8Array.from(input);
    database!.fill(0xff);
    data.fill(0xff);
    expect(Uint8Array.from(input)).toEqual(before);
    expect(database!.buffer).not.toBe(input.buffer);
    expect(data.buffer).not.toBe(input.buffer);
  });
});
