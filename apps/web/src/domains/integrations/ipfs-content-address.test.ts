import { describe, expect, it, vi } from "vitest";

import {
  computeContentCid,
  extractCidText,
  fetchVerifiedContent,
  parseContentCid,
  toIpfsGatewayUrl,
  toIpfsUri,
  verifyContentBytes,
} from "./ipfs-content-address";

// multiformats 공개 테스트 벡터와 같은 값이다 — 빈 바이트와 "hello world"의 raw CID.
const EMPTY_RAW_CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const HELLO_WORLD_RAW_CID = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e";
// IPFS 공식 문서 예시에 쓰이는 dag-pb 파일 CID.
const DAG_PB_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

const encoder = new TextEncoder();

describe("computeContentCid", () => {
  it("빈 바이트는 알려진 raw CID와 일치한다", async () => {
    await expect(computeContentCid(new Uint8Array())).resolves.toBe(EMPTY_RAW_CID);
  });

  it("같은 바이트는 항상 같은 CID, 다른 바이트는 다른 CID", async () => {
    const a = await computeContentCid(encoder.encode("hello world"));
    const b = await computeContentCid(encoder.encode("hello world"));
    const c = await computeContentCid(encoder.encode("hello world!"));
    expect(a).toBe(HELLO_WORLD_RAW_CID);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });
});

describe("parseContentCid / extractCidText", () => {
  it("raw CID를 파싱해 코덱·해시를 알려준다", () => {
    const parsed = parseContentCid(HELLO_WORLD_RAW_CID);
    expect(parsed).toMatchObject({
      cid: HELLO_WORLD_RAW_CID,
      version: 1,
      codecName: "raw",
      hashName: "sha2-256",
    });
  });

  it("dag-pb CID도 코덱을 구분해 파싱한다", () => {
    const parsed = parseContentCid(DAG_PB_CID);
    expect(parsed?.codecName).toBe("dag-pb");
    expect(parsed?.codecCode).toBe(0x70);
  });

  it("ipfs:// URI와 게이트웨이 URL에서도 CID를 뽑는다", () => {
    expect(extractCidText(`ipfs://${HELLO_WORLD_RAW_CID}`)).toBe(HELLO_WORLD_RAW_CID);
    expect(extractCidText(`https://ipfs.io/ipfs/${HELLO_WORLD_RAW_CID}`)).toBe(HELLO_WORLD_RAW_CID);
    expect(parseContentCid(`ipfs://${HELLO_WORLD_RAW_CID}`)?.cid).toBe(HELLO_WORLD_RAW_CID);
  });

  it("깨진 입력은 null이다", () => {
    expect(parseContentCid("not-a-cid")).toBeNull();
    expect(parseContentCid("")).toBeNull();
    expect(extractCidText("   ")).toBeNull();
  });
});

describe("verifyContentBytes", () => {
  it("내용이 같으면 match", async () => {
    await expect(verifyContentBytes(encoder.encode("hello world"), HELLO_WORLD_RAW_CID))
      .resolves.toBe("match");
  });

  it("내용이 다르면 mismatch", async () => {
    await expect(verifyContentBytes(encoder.encode("goodbye"), HELLO_WORLD_RAW_CID))
      .resolves.toBe("mismatch");
  });

  it("dag-pb는 파일 바이트로 직접 검증할 수 없다고 구분한다", async () => {
    await expect(verifyContentBytes(encoder.encode("hello world"), DAG_PB_CID))
      .resolves.toBe("unsupported-codec");
  });

  it("깨진 CID는 invalid-cid", async () => {
    await expect(verifyContentBytes(new Uint8Array(), "???")).resolves.toBe("invalid-cid");
  });
});

describe("링크 생성", () => {
  it("ipfs URI와 게이트웨이 URL을 만든다", () => {
    expect(toIpfsUri(HELLO_WORLD_RAW_CID)).toBe(`ipfs://${HELLO_WORLD_RAW_CID}`);
    expect(toIpfsGatewayUrl(HELLO_WORLD_RAW_CID)).toBe(
      `https://ipfs.io/ipfs/${HELLO_WORLD_RAW_CID}`,
    );
    expect(toIpfsGatewayUrl(HELLO_WORLD_RAW_CID, "https://dweb.link/")).toBe(
      `https://dweb.link/ipfs/${HELLO_WORLD_RAW_CID}`,
    );
    expect(toIpfsGatewayUrl("junk")).toBeNull();
  });
});

describe("fetchVerifiedContent", () => {
  it("주입된 fetcher에 정규화된 ipfs:// URI로 요청한다", async () => {
    const fetcher = vi.fn(async () => new Response("hello world"));
    const response = await fetchVerifiedContent(`https://ipfs.io/ipfs/${HELLO_WORLD_RAW_CID}`, fetcher);
    expect(fetcher).toHaveBeenCalledWith(`ipfs://${HELLO_WORLD_RAW_CID}`);
    await expect(response.text()).resolves.toBe("hello world");
  });

  it("깨진 CID는 fetcher를 부르기 전에 던진다", async () => {
    const fetcher = vi.fn(async () => new Response(""));
    await expect(fetchVerifiedContent("junk", fetcher)).rejects.toThrow("CID 형식");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
