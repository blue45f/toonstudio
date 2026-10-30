import { describe, expect, it } from "vitest";

import {
  CLIP_CHUNK_LABEL_BYTES,
  CLIP_CHUNK_SIZE_FIELD_BYTES,
  CLIP_CONTAINER_HEADER_BYTES,
  CLIP_CONTAINER_LIMITS,
  CLIP_CONTAINER_MAGIC,
  encodeClipContainer,
  encodeClipExternalChunkPayload,
  encodeClipHeadPayload,
  extractClipSqliteDatabase,
  inspectClipContainerKind,
  parseClipContainer,
  planClipContainerLayout,
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

/** 명세의 외부 ID 형식: `extrnlid` + 16진 32자리(전체 40자). S2가 측정한 파일에서는 대문자였다. */
const EXTERNAL_ID = "extrnlid0F8C5D2A1B3E4C7F9A2D6E5F4C3B2A10";

/** `CHNKSQLi`가 없는 시험용 Head: 가리킬 곳이 없으므로 위치는 0으로 둔다. */
const HEAD_WITHOUT_SQLITE = encodeClipHeadPayload({ sqliteChunkOffset: 0 });
/** Head 바로 뒤에 `CHNKSQLi`가 오는 배치의 Head: 24(헤더) + 16(청크 틀) + 40(Head 본문) = 80. */
const HEAD_BEFORE_SQLITE = encodeClipHeadPayload({ sqliteChunkOffset: 80 });

describe("Clip Studio .clip (CSFCHUNK) 통합 컨테이너 리더/라이터", () => {
  it("Head/Exta/SQLi/Foot 4청크 컨테이너를 라운드트립 파싱한다", () => {
    const sqlitePayload = makeSqlitePayload([0xde, 0xad, 0xbe, 0xef]);
    const layerPixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const extaPayload = encodeClipExternalChunkPayload({
      externalId: EXTERNAL_ID,
      data: layerPixels,
    });

    const layout = planClipContainerLayout([40, extaPayload.byteLength, sqlitePayload.byteLength, 0]);
    const fileId = Uint8Array.from({ length: 16 }, (_, index) => index * 17);
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: layout.headerOffsets[2]!, fileId }) },
        { label: "CHNKExta", payload: extaPayload },
        { label: "SQLi", payload: sqlitePayload },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });
    expect(encoded.byteLength).toBe(layout.totalBytes);

    // 헤더: 매직 + uint64 두 필드(기본 직렬화 순서는 선언 길이 → 청크 시작 24, 공개 명세와 같은 순서)
    expect(new TextDecoder("latin1").decode(encoded.subarray(0, 8))).toBe(CLIP_CONTAINER_MAGIC);

    const parsed = parseClipContainer(encoded);
    expect(parsed.kind).toBe("csfchunk");
    expect(parsed.headerLayout).toBe("length-then-offset");
    expect(parsed.truncated).toBe(false);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.declaredChunkStart).toBe(CLIP_CONTAINER_HEADER_BYTES);
    expect(parsed.declaredFileLength).toBe(encoded.byteLength);
    expect(parsed.chunks.map((chunk) => chunk.type)).toEqual(["Head", "Exta", "SQLi", "Foot"]);
    expect(parsed.head).toEqual({
      version: 256,
      sqliteChunkOffset: layout.headerOffsets[2],
      fileIdLength: 16,
      fileIdHex: "00112233445566778899aabbccddeeff",
    });
    expect(parsed.chunks[2]!.headerOffset).toBe(layout.headerOffsets[2]);

    // SQLite 섹션은 선언 길이 기준으로 정밀하게 잡힌다.
    expect(parsed.sqlite).not.toBeNull();
    expect(parsed.sqlite?.inspection.container).toBe("sqlite3");
    expect(parsed.sqlite?.payloadLength).toBe(sqlitePayload.byteLength);

    // 외부 블록은 외부 ID로 복원되고 데이터가 그대로 나온다.
    expect(parsed.externalBlocks).toHaveLength(1);
    const block = parsed.externalBlocks[0]!;
    expect(block.parsed).toBe(true);
    expect(block.idWellFormed).toBe(true);
    expect(block.externalId).toBe(EXTERNAL_ID);
    expect(block.dataLength).toBe(layerPixels.byteLength);
    expect(readClipExternalBlockData(encoded, block)).toEqual(layerPixels);
  });

  it("extractClipSqliteDatabase는 CHNKSQLi 페이로드만 정확히 복사한다", () => {
    const sqlitePayload = makeSqlitePayload([0x11, 0x22, 0x33]);
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: HEAD_BEFORE_SQLITE },
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
        { label: "Head", payload: HEAD_WITHOUT_SQLITE },
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

  it("종류 판정은 매직이 온전히 들어 있는 최소 길이에서 갈린다(경계): 24바이트 CSFCHUNK 머리, 16바이트 SQLite 매직", () => {
    const csfOnly = new Uint8Array(CLIP_CONTAINER_HEADER_BYTES);
    csfOnly.set(UTF8.encode(CLIP_CONTAINER_MAGIC), 0);
    expect(inspectClipContainerKind(csfOnly)).toBe("csfchunk");
    expect(inspectClipContainerKind(csfOnly.subarray(0, CLIP_CONTAINER_HEADER_BYTES - 1))).toBe("unknown");

    const sqliteMagic = UTF8.encode("SQLite format 3\0");
    expect(sqliteMagic.byteLength).toBe(16);
    expect(inspectClipContainerKind(sqliteMagic)).toBe("lip-sqlite3");
    expect(inspectClipContainerKind(sqliteMagic.subarray(0, 15))).toBe("unknown");
  });

  it("매직이 없는 입력은 길이가 매직보다 길어도 unknown이고, .lip·unknown 입력은 잘린 것으로 보고하지 않는다", () => {
    const longUnknown = Uint8Array.from({ length: 64 }, (_, index) => (index * 7 + 3) & 0xff);
    expect(inspectClipContainerKind(longUnknown)).toBe("unknown");
    const unknown = parseClipContainer(longUnknown);
    expect(unknown).toMatchObject({ kind: "unknown", truncated: false, sqlite: null, chunks: [], externalBlocks: [], head: null });
    expect(unknown.issues.map((entry) => entry.code)).toEqual(["clip-magic-unrecognized"]);

    // 매직 일부만 맞는 입력(CSFCHUNK 앞 7글자, SQLite 앞 15글자)은 어느 쪽도 아니다.
    const nearCsf = new Uint8Array(40);
    nearCsf.set(UTF8.encode(CLIP_CONTAINER_MAGIC.slice(0, 7)), 0);
    expect(inspectClipContainerKind(nearCsf)).toBe("unknown");
    const nearSqlite = new Uint8Array(40);
    nearSqlite.set(UTF8.encode("SQLite format 3"), 0);
    nearSqlite[15] = 0x01;
    expect(inspectClipContainerKind(nearSqlite)).toBe("unknown");

    const lip = parseClipContainer(makeSqlitePayload());
    expect(lip).toMatchObject({ kind: "lip-sqlite3", truncated: false, externalBlocks: [], head: null });
    expect(lip.issues).toEqual([]);
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
    expect(block.idWellFormed).toBe(false);
    expect(block.externalId).toBe("clip-exta-unparsed-0");
    expect(block.dataLength).toBe(corruptExta.byteLength);
    expect(parsed.issues.map((entry) => entry.code)).toContain("clip-exta-id-length-invalid");
  });

  it("CHNKExta 본문이 16바이트보다 짧으면 해석하지 않고 알리며, 16바이트면 해석한다(경계)", () => {
    const tooShort = parseClipContainer(encodeClipContainer({ chunks: [{ label: "CHNKExta", payload: new Uint8Array(15) }] }));
    expect(tooShort.externalBlocks[0]).toMatchObject({ parsed: false, idWellFormed: false, externalId: "clip-exta-unparsed-0", dataLength: 15 });
    expect(tooShort.issues.map((entry) => entry.code)).toContain("clip-exta-payload-too-short");

    // 두 길이 필드가 모두 0인 16바이트: 외부 ID는 빈 문자열이고 데이터도 비었다. 형식 경고는 나오지만 해석은 된다.
    const minimal = parseClipContainer(encodeClipContainer({ chunks: [{ label: "CHNKExta", payload: new Uint8Array(16) }] }));
    expect(minimal.externalBlocks[0]).toMatchObject({ parsed: true, externalId: "", idWellFormed: false, dataLength: 0 });
    expect(minimal.issues.map((entry) => entry.code)).toContain("clip-exta-id-format-unexpected");
    expect(minimal.issues.map((entry) => entry.code)).not.toContain("clip-exta-payload-too-short");
  });

  it("라벨이 4자/8자 모두 허용되고 비정상 길이는 거부한다", () => {
    expect(() =>
      encodeClipContainer({ chunks: [{ label: "TooLongLabel", payload: new Uint8Array(0) }] }),
    ).toThrow(RangeError);
  });

  it("maxChunkBytes 한도를 초과하는 청크는 파싱을 중단한다", () => {
    const encoded = encodeClipContainer({
      chunks: [{ label: "Head", payload: HEAD_WITHOUT_SQLITE }],
    });
    const parsed = parseClipContainer(encoded, { limits: { maxChunkBytes: 8 } });
    expect(parsed.truncated).toBe(true);
    expect(parsed.issues.map((entry) => entry.code)).toContain("clip-chunk-size-invalid");
  });

  it("헤더 두 필드가 반대 순서여도 같은 청크 디렉터리를 복원한다", () => {
    const chunks = [
      { label: "Head", payload: HEAD_BEFORE_SQLITE },
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
    expect(lengthFirst.issues).toHaveLength(0);
    // 명세에 없는 순서라 받아들이되 알린다.
    expect(offsetFirst.issues.map((entry) => entry.code)).toEqual(["clip-header-order-unexpected"]);
  });

  it("헤더 필드를 판정할 수 없어도 24바이트 뒤에서 청크를 읽고 issue로 알린다", () => {
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: HEAD_WITHOUT_SQLITE },
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
        { label: "Head", payload: HEAD_WITHOUT_SQLITE },
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
      chunks: [{ label: "Head", payload: HEAD_WITHOUT_SQLITE }],
    });

    const parsed = parseClipContainer(encoded);
    expect(parsed.truncated).toBe(false);
    expect(parsed.issues.map((entry) => entry.code)).toEqual(["clip-footer-missing"]);
  });

  it("Foot까지 읽었다면 선언 길이가 실제보다 커도 truncated로 단정하지 않는다", () => {
    const encoded = encodeClipContainer({
      chunks: [
        { label: "Head", payload: HEAD_WITHOUT_SQLITE },
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

describe("Clip Studio .clip 컨테이너: 공개 명세와 맞춰 본 Head·순서·ID 검사", () => {
  const codes = (issues: readonly { readonly code: string }[]) => issues.map((issue) => issue.code);
  const foot = { label: "Foot", payload: new Uint8Array(0) };
  const sqlite = { label: "SQLi", payload: makeSqlitePayload([1]) };

  it("Head 본문 40바이트의 필드를 그대로 읽는다(손으로 적은 바이트)", () => {
    const body = new Uint8Array(40);
    const view = new DataView(body.buffer);
    view.setBigUint64(0, 256n, false);
    view.setBigUint64(8, 80n, false);
    view.setBigUint64(16, 16n, false);
    body.set(Uint8Array.from({ length: 16 }, (_, index) => 0xa0 + index), 24);
    const parsed = parseClipContainer(encodeClipContainer({ chunks: [{ label: "Head", payload: body }, sqlite, foot] }));
    expect(parsed.head).toEqual({ version: 256, sqliteChunkOffset: 80, fileIdLength: 16, fileIdHex: "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf" });
    expect(parsed.issues).toHaveLength(0);
  });

  it("encodeClipHeadPayload는 같은 바이트를 만들고 파일 ID 길이를 검사한다", () => {
    const encoded = encodeClipHeadPayload({ sqliteChunkOffset: 80, fileId: Uint8Array.from({ length: 16 }, (_, index) => 0xa0 + index) });
    const view = new DataView(encoded.buffer);
    expect([view.getBigUint64(0, false), view.getBigUint64(8, false), view.getBigUint64(16, false)]).toEqual([256n, 80n, 16n]);
    expect(encoded[24]).toBe(0xa0);
    expect(encoded.byteLength).toBe(40);
    expect(() => encodeClipHeadPayload({ sqliteChunkOffset: 80, fileId: new Uint8Array(15) })).toThrow(RangeError);
  });

  it("Head 본문 길이가 40이 아니면 head는 null이고 issue를 남긴다", () => {
    const parsed = parseClipContainer(encodeClipContainer({ chunks: [{ label: "Head", payload: new Uint8Array(39) }, foot] }));
    expect(parsed.head).toBeNull();
    expect(codes(parsed.issues)).toEqual(["clip-head-length-unexpected"]);
  });

  it("Head의 첫 값이 256이 아니거나 파일 ID 길이가 16이 아니면 읽되 알린다", () => {
    const body = encodeClipHeadPayload({ sqliteChunkOffset: 0 });
    const view = new DataView(body.buffer);
    view.setBigUint64(0, 255n, false);
    view.setBigUint64(16, 8n, false);
    const parsed = parseClipContainer(encodeClipContainer({ chunks: [{ label: "Head", payload: body }, foot] }));
    expect(parsed.head).toMatchObject({ version: 255, fileIdLength: 8 });
    expect(codes(parsed.issues)).toEqual(["clip-head-version-unexpected", "clip-head-id-length-unexpected"]);
  });

  it("Head 숫자 필드가 안전 정수 범위를 넘으면 head는 null이다", () => {
    const body = encodeClipHeadPayload({ sqliteChunkOffset: 0 });
    new DataView(body.buffer).setBigUint64(8, 0xffff_ffff_ffff_ffffn, false);
    const parsed = parseClipContainer(encodeClipContainer({ chunks: [{ label: "Head", payload: body }, foot] }));
    expect(parsed.head).toBeNull();
    expect(codes(parsed.issues)).toEqual(["clip-head-field-out-of-range"]);
  });

  it("Head가 가리키는 SQLi 위치가 실제와 다르면 clip-head-sqlite-offset-mismatch다", () => {
    const parsed = parseClipContainer(
      encodeClipContainer({ chunks: [{ label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: 81 }) }, sqlite, foot] }),
    );
    expect(codes(parsed.issues)).toEqual(["clip-head-sqlite-offset-mismatch"]);
    expect(parsed.sqlite).not.toBeNull();
  });

  it("Foot 본문이 비어 있지 않으면 알린다", () => {
    const parsed = parseClipContainer(encodeClipContainer({ chunks: [{ label: "Head", payload: HEAD_WITHOUT_SQLITE }, { label: "Foot", payload: Uint8Array.of(1) }] }));
    expect(codes(parsed.issues)).toEqual(["clip-foot-not-empty"]);
  });

  it("첫 청크가 Head가 아니거나 Exta가 SQLi 뒤에 오면 clip-chunk-order-unexpected다", () => {
    const exta = { label: "Exta", payload: encodeClipExternalChunkPayload({ externalId: EXTERNAL_ID, data: Uint8Array.of(1) }) };
    const noHead = parseClipContainer(encodeClipContainer({ chunks: [sqlite, foot] }));
    expect(codes(noHead.issues)).toEqual(["clip-chunk-order-unexpected"]);
    const extaAfter = parseClipContainer(
      encodeClipContainer({ chunks: [{ label: "Head", payload: HEAD_BEFORE_SQLITE }, sqlite, exta, foot] }),
    );
    expect(codes(extaAfter.issues)).toEqual(["clip-chunk-order-unexpected"]);
    expect(extaAfter.externalBlocks).toHaveLength(1);
  });

  it("청크가 하나뿐이어도 그것이 Head가 아니면 첫 청크 순서를 알린다", () => {
    const only = parseClipContainer(encodeClipContainer({ chunks: [foot] }));
    expect(only.chunks.map((chunk) => chunk.type)).toEqual(["Foot"]);
    expect(only.issues.map((entry) => [entry.code, entry.message])).toEqual([["clip-chunk-order-unexpected", "first chunk is not CHNKHead"]]);

    // 청크가 하나도 없으면 비교할 첫 청크가 없다(24바이트 머리만 있으면 두 필드가 모두 24라 머리도 판정하지 못한다).
    const none = parseClipContainer(encodeClipContainer({ chunks: [] }));
    expect(none.chunks).toEqual([]);
    expect(none.issues.map((entry) => entry.code)).toEqual(["clip-header-fields-unrecognized", "clip-footer-missing"]);
  });

  it("SQLi가 첫 청크여도 뒤의 Exta와 Head를 같은 규칙으로 검사한다", () => {
    const exta = { label: "Exta", payload: encodeClipExternalChunkPayload({ externalId: EXTERNAL_ID, data: Uint8Array.of(1) }) };
    const parsed = parseClipContainer(
      encodeClipContainer({ chunks: [sqlite, { label: "Head", payload: HEAD_BEFORE_SQLITE }, exta, foot] }),
    );
    expect(parsed.issues.map((entry) => [entry.code, entry.message])).toEqual([
      ["clip-chunk-order-unexpected", "first chunk is not CHNKHead"],
      ["clip-chunk-order-unexpected", "a CHNKExta chunk follows CHNKSQLi"],
      ["clip-head-sqlite-offset-mismatch", "CHNKHead points at 80 but CHNKSQLi starts at 24"],
    ]);
    expect(parsed.sqlite?.payloadOffset).toBe(24 + 16);
  });

  it.each([
    ["접두사가 다르다", "extrnld0" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a10"],
    ["16진 자리가 31개", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1"],
    ["16진이 아닌 글자", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1g"],
  ])("외부 ID 형식이 명세와 다르면(%s) 읽되 clip-exta-id-format-unexpected로 알린다", (_name, externalId) => {
    const parsed = parseClipContainer(
      encodeClipContainer({
        chunks: [
          { label: "Head", payload: HEAD_WITHOUT_SQLITE },
          { label: "Exta", payload: encodeClipExternalChunkPayload({ externalId, data: Uint8Array.of(1) }) },
          foot,
        ],
      }),
    );
    expect(parsed.externalBlocks[0]).toMatchObject({ parsed: true, idWellFormed: false, externalId });
    expect(codes(parsed.issues)).toEqual(["clip-exta-id-format-unexpected"]);
  });

  it.each([
    ["대문자", "extrnlid" + "0F8C5D2A1B3E4C7F9A2D6E5F4C3B2A10"],
    ["소문자", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a10"],
    ["대소문자 혼합", "extrnlid" + "0F8c5D2a1B3e4C7f9A2d6E5f4C3b2A10"],
    ["경계 글자(0, 9, a, f, A, F만)", "extrnlid" + "09afAF09afAF09afAF09afAF09afAF09"],
  ])("외부 ID의 16진 글자가 %s이면 명세 형식으로 읽고 알리지 않는다", (_name, externalId) => {
    const parsed = parseClipContainer(
      encodeClipContainer({
        chunks: [
          { label: "Head", payload: HEAD_WITHOUT_SQLITE },
          { label: "Exta", payload: encodeClipExternalChunkPayload({ externalId, data: Uint8Array.of(1) }) },
          foot,
        ],
      }),
    );
    expect(parsed.externalBlocks[0]).toMatchObject({ parsed: true, idWellFormed: true, externalId });
    expect(codes(parsed.issues)).toEqual([]);
  });

  it.each([
    ["g(f 다음 글자)", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1g"],
    ["G", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1G"],
    ["@(A 앞 글자)", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1@"],
    ["/(0 앞 글자)", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1/"],
    [":(9 다음 글자)", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1:"],
    ["`(a 앞 글자)", "extrnlid" + "0f8c5d2a1b3e4c7f9a2d6e5f4c3b2a1`"],
  ])("외부 ID의 마지막 글자가 %s이면 명세 형식이 아니다", (_name, externalId) => {
    const parsed = parseClipContainer(
      encodeClipContainer({
        chunks: [
          { label: "Head", payload: HEAD_WITHOUT_SQLITE },
          { label: "Exta", payload: encodeClipExternalChunkPayload({ externalId, data: Uint8Array.of(1) }) },
          foot,
        ],
      }),
    );
    expect(parsed.externalBlocks[0]).toMatchObject({ parsed: true, idWellFormed: false });
    expect(codes(parsed.issues)).toEqual(["clip-exta-id-format-unexpected"]);
  });

  it("Head가 둘이면 첫 것만 읽고 둘째는 알린다(첫 것이 해석에 실패해도 둘째로 대신하지 않는다)", () => {
    const twoHeads = parseClipContainer(
      encodeClipContainer({ chunks: [{ label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: 80, fileId: new Uint8Array(16).fill(1) }) }, { label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: 0, fileId: new Uint8Array(16).fill(2) }) }, sqlite, foot] }),
    );
    expect(twoHeads.head?.fileIdHex).toBe("01".repeat(16));
    expect(codes(twoHeads.issues)).toEqual(expect.arrayContaining(["clip-chunk-order-unexpected"]));

    const brokenFirst = parseClipContainer(
      encodeClipContainer({ chunks: [{ label: "Head", payload: new Uint8Array(39) }, { label: "Head", payload: HEAD_WITHOUT_SQLITE }, foot] }),
    );
    expect(brokenFirst.head).toBeNull();
    expect(codes(brokenFirst.issues)).toEqual(["clip-head-length-unexpected", "clip-chunk-order-unexpected"]);
  });

  it("Exta 본문은 56 + 데이터 길이이고 데이터는 외부 ID 뒤 u64 길이 필드 다음에서 시작한다(손으로 적은 바이트)", () => {
    const body = new Uint8Array(8 + 40 + 8 + 3);
    const view = new DataView(body.buffer);
    view.setBigUint64(0, 40n, false);
    body.set(new TextEncoder().encode(EXTERNAL_ID), 8);
    view.setBigUint64(48, 3n, false);
    body.set([7, 8, 9], 56);
    expect(body.byteLength).toBe(56 + 3);
    const encoded = encodeClipContainer({ chunks: [{ label: "Head", payload: HEAD_WITHOUT_SQLITE }, { label: "Exta", payload: body }, foot] });
    const block = parseClipContainer(encoded).externalBlocks[0]!;
    expect(block).toMatchObject({ parsed: true, externalId: EXTERNAL_ID, dataLength: 3 });
    expect(block.dataOffset).toBe(24 + 16 + 40 + 16 + 56);
    expect(readClipExternalBlockData(encoded, block)).toEqual(Uint8Array.of(7, 8, 9));
    expect(encodeClipExternalChunkPayload({ externalId: EXTERNAL_ID, data: Uint8Array.of(7, 8, 9) })).toEqual(body);
  });

  it("planClipContainerLayout은 인코더가 만든 위치와 전체 길이를 정확히 미리 계산한다", () => {
    const chunks = [
      { label: "Head", payload: HEAD_WITHOUT_SQLITE },
      { label: "Exta", payload: new Uint8Array(100) },
      { label: "Exta", payload: new Uint8Array(7) },
      sqlite,
      foot,
    ];
    const layout = planClipContainerLayout(chunks.map((chunk) => chunk.payload.byteLength));
    const encoded = encodeClipContainer({ chunks });
    expect(layout.totalBytes).toBe(encoded.byteLength);
    expect(parseClipContainer(encoded).chunks.map((chunk) => chunk.headerOffset)).toEqual(layout.headerOffsets);
  });
});

describe("Clip Studio .clip 컨테이너: 안전 한도와 손상 보고", () => {
  const codes = (issues: readonly { readonly code: string }[]) => issues.map((issue) => issue.code);
  const head = { label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: 0 }) };
  const foot = { label: "Foot", payload: new Uint8Array(0) };
  const exta = (externalId: string, data = Uint8Array.of(1)) => ({ label: "CHNKExta", payload: encodeClipExternalChunkPayload({ externalId, data }) });
  const idOf = (index: number) => `extrnlid${index.toString(16).toUpperCase().padStart(32, "0")}`;

  it("입력 크기가 maxBytes와 같으면 파싱하고 1바이트 넘으면 파싱 없이 clip-input-too-large다(경계)", () => {
    const encoded = encodeClipContainer({ chunks: [head, foot] });
    const exact = parseClipContainer(encoded, { limits: { maxBytes: encoded.byteLength } });
    expect(exact.kind).toBe("csfchunk");
    expect(codes(exact.issues)).not.toContain("clip-input-too-large");

    const over = parseClipContainer(encoded, { limits: { maxBytes: encoded.byteLength - 1 } });
    expect(over).toMatchObject({ kind: "unknown", truncated: true, chunks: [], head: null, sqlite: null, headerLayout: "not-applicable" });
    expect(over.issues).toEqual([{ scope: "container", code: "clip-input-too-large", message: `input exceeds maxBytes=${encoded.byteLength - 1}` }]);
  });

  it("청크 수가 maxChunks를 넘으면 거기서 멈추고 truncated로 알린다(경계)", () => {
    const encoded = encodeClipContainer({ chunks: [head, exta(idOf(1)), exta(idOf(2)), foot] });
    const exact = parseClipContainer(encoded, { limits: { maxChunks: 4 } });
    expect(exact.chunks).toHaveLength(4);
    expect(exact.truncated).toBe(false);
    expect(codes(exact.issues)).not.toContain("clip-chunk-count-exceeded");

    const over = parseClipContainer(encoded, { limits: { maxChunks: 3 } });
    expect(over.chunks).toHaveLength(3);
    expect(over.truncated).toBe(true);
    expect(over.issues.find((entry) => entry.code === "clip-chunk-count-exceeded")?.message).toBe("chunk count exceeds maxChunks=3");
  });

  it("외부 블록이 maxExternalBlocks를 넘으면 초과분은 열거하지 않고 알림은 한 번만 낸다(경계)", () => {
    const chunks = [head, ...Array.from({ length: 5 }, (_, index) => exta(idOf(index + 1))), foot];
    const encoded = encodeClipContainer({ chunks });
    const exact = parseClipContainer(encoded, { limits: { maxExternalBlocks: 5 } });
    expect(exact.externalBlocks).toHaveLength(5);
    expect(codes(exact.issues)).not.toContain("clip-external-count-exceeded");

    const over = parseClipContainer(encoded, { limits: { maxExternalBlocks: 2 } });
    expect(over.externalBlocks.map((block) => block.externalId)).toEqual([idOf(1), idOf(2)]);
    expect(codes(over.issues).filter((code) => code === "clip-external-count-exceeded")).toEqual(["clip-external-count-exceeded"]);
    expect(over.issues.find((entry) => entry.code === "clip-external-count-exceeded")?.message).toBe("external block count exceeds maxExternalBlocks=2");
    // 열거하지 않았을 뿐 청크 디렉터리에는 모두 있다.
    expect(over.chunks.filter((chunk) => chunk.type === "Exta")).toHaveLength(5);
  });

  it("외부 ID 길이가 maxExternalIdBytes를 넘으면 해석하지 않고 알린다(경계)", () => {
    const body = (idLength: number): Uint8Array => {
      const payload = new Uint8Array(8 + idLength + 8);
      new DataView(payload.buffer).setBigUint64(0, BigInt(idLength), false);
      return payload;
    };
    const parse = (idLength: number, maxExternalIdBytes: number) => parseClipContainer(encodeClipContainer({ chunks: [{ label: "CHNKExta", payload: body(idLength) }] }), { limits: { maxExternalIdBytes } });

    expect(parse(40, 40).externalBlocks[0]!.parsed).toBe(true);
    const over = parse(41, 40);
    expect(over.externalBlocks[0]).toMatchObject({ parsed: false, externalId: "clip-exta-unparsed-0" });
    expect(codes(over.issues)).toContain("clip-exta-id-length-invalid");
    // 길이 필드가 본문보다 길어도 같은 결과다.
    const longer = new Uint8Array(24);
    new DataView(longer.buffer).setBigUint64(0, 17n, false);
    expect(codes(parseClipContainer(encodeClipContainer({ chunks: [{ label: "CHNKExta", payload: longer }] })).issues)).toContain("clip-exta-id-length-invalid");
  });

  it("외부 ID 본문이 길이 필드 두 개를 담고 딱 맞으면 해석한다(8 + idLen + 8 경계)", () => {
    const exact = new Uint8Array(8 + 5 + 8);
    new DataView(exact.buffer).setBigUint64(0, 5n, false);
    expect(parseClipContainer(encodeClipContainer({ chunks: [{ label: "CHNKExta", payload: exact }] })).externalBlocks[0]).toMatchObject({ parsed: true, dataLength: 0 });
    const short = exact.subarray(0, exact.byteLength - 1);
    expect(parseClipContainer(encodeClipContainer({ chunks: [{ label: "CHNKExta", payload: short }] })).externalBlocks[0]!.parsed).toBe(false);
  });

  it("데이터 길이가 본문 끝을 넘으면 원본 보존으로 폴백하고 clip-exta-data-length-invalid다(경계)", () => {
    const make = (dataLength: bigint): Uint8Array => {
      const payload = new Uint8Array(8 + 40 + 8 + 4);
      const view = new DataView(payload.buffer);
      view.setBigUint64(0, 40n, false);
      payload.set(UTF8.encode(idOf(1)), 8);
      view.setBigUint64(48, dataLength, false);
      return payload;
    };
    const parse = (dataLength: bigint) => parseClipContainer(encodeClipContainer({ chunks: [{ label: "CHNKExta", payload: make(dataLength) }] }));

    expect(parse(4n).externalBlocks[0]).toMatchObject({ parsed: true, dataLength: 4 });
    expect(codes(parse(4n).issues)).not.toContain("clip-exta-data-length-invalid");
    const over = parse(5n);
    expect(over.externalBlocks[0]).toMatchObject({ parsed: false, externalId: "clip-exta-unparsed-0" });
    expect(codes(over.issues)).toContain("clip-exta-data-length-invalid");
    expect(codes(parse(2n ** 64n - 1n).issues)).toContain("clip-exta-data-length-invalid");
  });

  it("CHNK로 시작하지 않는 라벨을 만나면 거기서 멈추고 truncated로 알린다", () => {
    const encoded = encodeClipContainer({ chunks: [head, exta(idOf(1)), foot] });
    const spoiled = Uint8Array.from(encoded);
    // 둘째 청크(첫 Exta)의 라벨 첫 글자를 바꾼다.
    const secondChunkAt = 24 + 16 + 40;
    spoiled[secondChunkAt] = "X".charCodeAt(0);
    const parsed = parseClipContainer(spoiled);

    expect(parsed.chunks.map((chunk) => chunk.type)).toEqual(["Head"]);
    expect(parsed.truncated).toBe(true);
    expect(codes(parsed.issues)).toContain("clip-chunk-label-invalid");
    expect(parsed.issues.find((entry) => entry.code === "clip-chunk-label-invalid")?.message).toBe(`expected a CHNK* label at offset ${secondChunkAt}`);
  });

  it("청크 길이 필드가 maxChunkBytes와 같으면 읽고 1 크면 clip-chunk-size-invalid다(경계), 안전 정수를 넘는 값도 마찬가지다", () => {
    const encoded = encodeClipContainer({ chunks: [head, foot] });
    expect(parseClipContainer(encoded, { limits: { maxChunkBytes: 40 } }).chunks.map((chunk) => chunk.type)).toEqual(["Head", "Foot"]);
    const over = parseClipContainer(encoded, { limits: { maxChunkBytes: 39 } });
    expect(over.chunks).toEqual([]);
    expect(codes(over.issues)).toContain("clip-chunk-size-invalid");

    const huge = Uint8Array.from(encoded);
    new DataView(huge.buffer).setBigUint64(24 + 8, 2n ** 64n - 1n, false);
    const parsed = parseClipContainer(huge);
    expect(parsed.truncated).toBe(true);
    expect(parsed.issues.find((entry) => entry.code === "clip-chunk-size-invalid")?.message).toBe("chunk CHNKHead declares an out-of-range payload length");
  });

  it("한도 값이 기본 상한과 같으면 받아들이고 1 크면 RangeError다(경계), 0은 받아들인다", () => {
    const encoded = encodeClipContainer({ chunks: [head, foot] });
    for (const key of Object.keys(CLIP_CONTAINER_LIMITS) as Array<keyof typeof CLIP_CONTAINER_LIMITS>) {
      expect(() => parseClipContainer(encoded, { limits: { [key]: CLIP_CONTAINER_LIMITS[key] } })).not.toThrow();
      expect(() => parseClipContainer(encoded, { limits: { [key]: CLIP_CONTAINER_LIMITS[key] + 1 } })).toThrow(
        `${key} must be an integer between 0 and ${CLIP_CONTAINER_LIMITS[key]}`,
      );
      expect(() => parseClipContainer(encoded, { limits: { [key]: 0 } })).not.toThrow();
    }
  });

  it("헤더의 uint64 값이 2^53−1이면 선언 길이로 읽고 2^53이면 선언 길이를 알 수 없다(경계)", () => {
    const encoded = encodeClipContainer({ chunks: [head, foot] });
    const exact = Uint8Array.from(encoded);
    new DataView(exact.buffer).setBigUint64(8, BigInt(Number.MAX_SAFE_INTEGER), false);
    const parsedExact = parseClipContainer(exact);
    expect(parsedExact).toMatchObject({ headerLayout: "length-then-offset", declaredChunkStart: 24, declaredFileLength: Number.MAX_SAFE_INTEGER });
    expect(codes(parsedExact.issues)).toEqual(["clip-declared-length-mismatch"]);

    const beyond = Uint8Array.from(encoded);
    new DataView(beyond.buffer).setBigUint64(8, 2n ** 53n, false);
    const parsedBeyond = parseClipContainer(beyond);
    // 안전 정수를 넘는 값은 "읽을 수 없는 값"이지 청크 시작 24가 아니므로, 다른 필드가 24이면 그쪽이 시작 위치이고 길이만 비어 있다.
    expect(parsedBeyond).toMatchObject({ headerLayout: "length-then-offset", declaredChunkStart: 24, declaredFileLength: null });
    expect(codes(parsedBeyond.issues)).toEqual([]);
  });

  it("Foot에서 순회를 마친다: 뒤따르는 바이트는 청크처럼 보여도 읽지 않고 알리지도 않는다", () => {
    const encoded = encodeClipContainer({ chunks: [head, foot] });
    const lookalikeChunk = encodeClipContainer({ chunks: [exta(idOf(7))] }).subarray(CLIP_CONTAINER_HEADER_BYTES);
    for (const trailing of [new Uint8Array(20).fill(0x5a), lookalikeChunk]) {
      const input = new Uint8Array(encoded.byteLength + trailing.byteLength);
      input.set(encoded, 0);
      input.set(trailing, encoded.byteLength);
      new DataView(input.buffer).setBigUint64(8, BigInt(input.byteLength), false);

      const parsed = parseClipContainer(input);
      expect(parsed.chunks.map((chunk) => chunk.type)).toEqual(["Head", "Foot"]);
      expect(parsed.externalBlocks).toEqual([]);
      expect(parsed.truncated).toBe(false);
      expect(parsed.issues).toEqual([]);
    }
  });

  it("범위를 벗어난 한도 값은 RangeError다", () => {
    const encoded = encodeClipContainer({ chunks: [head, foot] });
    for (const limits of [{ maxChunks: -1 }, { maxChunks: 1.5 }, { maxBytes: 2 ** 31 }, { maxExternalIdBytes: Number.NaN }]) {
      expect(() => parseClipContainer(encoded, { limits })).toThrow(RangeError);
    }
    expect(() => parseClipContainer(encoded, { limits: { maxChunks: -1 } })).toThrow("maxChunks must be an integer between 0 and 65536");
    expect(parseClipContainer(encoded, { limits: { maxChunks: 0 } }).chunks).toEqual([]);
  });

  it("헤더 필드 중 하나도 24가 아니거나 둘 다 24이면 unrecognized로 알리고 24부터 순회한다", () => {
    const encoded = encodeClipContainer({ chunks: [head, foot] });
    for (const [a, b] of [[100n, 200n], [24n, 24n], [0n, 0n]] as const) {
      const spoiled = Uint8Array.from(encoded);
      const view = new DataView(spoiled.buffer);
      view.setBigUint64(8, a, false);
      view.setBigUint64(16, b, false);
      const parsed = parseClipContainer(spoiled);

      expect(parsed.headerLayout).toBe("unrecognized");
      expect(parsed.declaredChunkStart).toBeNull();
      expect(parsed.declaredFileLength).toBeNull();
      expect(codes(parsed.issues)).toContain("clip-header-fields-unrecognized");
      expect(parsed.chunks.map((chunk) => chunk.type)).toEqual(["Head", "Foot"]);
    }
  });
});
