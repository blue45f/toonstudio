import { afterEach, describe, expect, it, vi } from "vitest";

import { createSecureRandomString, createSecureRandomUuid } from "./secure-random-id";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createSecureRandomUuid", () => {
  it("prefers the platform randomUUID implementation", () => {
    const randomUUID = vi.fn(() => "123e4567-e89b-42d3-a456-426614174000");
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });
    expect(createSecureRandomUuid()).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it.each(["missing", "throws"] as const)(
    "uses secure bytes when randomUUID %s",
    (mode) => {
      const random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("insecure randomness must not issue IDs");
      });
      const getRandomValues = vi.fn((bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      });
      vi.stubGlobal("crypto", {
        ...(mode === "throws"
          ? { randomUUID: () => { throw new Error("UUID unavailable"); } }
          : {}),
        getRandomValues,
      });
      expect(createSecureRandomUuid()).toBe(
        "abababab-abab-4bab-abab-abababababab",
      );
      expect(getRandomValues).toHaveBeenCalledOnce();
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("fails closed without secure entropy", () => {
    const random = vi.spyOn(Math, "random");
    vi.stubGlobal("crypto", undefined);
    expect(() => createSecureRandomUuid("secure ID unavailable")).toThrow(
      "secure ID unavailable",
    );
    expect(random).not.toHaveBeenCalled();
  });

  it("fails closed when the secure byte provider throws", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => { throw new Error("UUID unavailable"); },
      getRandomValues: () => { throw new Error("entropy unavailable"); },
    });
    expect(() => createSecureRandomUuid("secure ID unavailable")).toThrow(
      "secure ID unavailable",
    );
  });
});

describe("createSecureRandomString", () => {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  it("Web Crypto 바이트만으로 알파벳 안의 문자열을 만든다", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("insecure randomness must not issue tokens");
    });
    const getRandomValues = vi.fn(<T extends ArrayBufferView>(view: T): T => {
      new Uint32Array(view.buffer, view.byteOffset, view.byteLength / 4)
        .forEach((_, index, array) => { array[index] = index; });
      return view;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    const token = createSecureRandomString(ALPHABET, 6);
    expect(token).toBe("ABCDEF");
    expect(getRandomValues).toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it("알파벳 크기의 배수 한계를 넘는 값은 버려 모듈로 편향을 만들지 않는다", () => {
    // 알파벳 32자: 2^32 가 32 의 배수라 한계는 2^32 이고 버릴 값이 없다 → 10자 알파벳으로 확인한다.
    const digits = "0123456789";
    const limit = Math.floor(0x1_0000_0000 / digits.length) * digits.length; // 4294967290
    const queue = [0xffff_ffff, limit, limit + 3, 7, 15, 23];
    vi.stubGlobal("crypto", {
      getRandomValues: <T extends ArrayBufferView>(view: T): T => {
        const array = new Uint32Array(view.buffer, view.byteOffset, view.byteLength / 4);
        for (let index = 0; index < array.length; index += 1) array[index] = queue.shift() ?? 1;
        return view;
      },
    });
    // 앞의 세 값(>= limit)은 버려지고 7,5,3 이 차례로 쓰인다.
    expect(createSecureRandomString(digits, 3)).toBe("753");
  });

  it("길이만큼 항상 채우고 한 번의 호출 상한을 넘는 길이도 처리한다", () => {
    const real = globalThis.crypto;
    const token = createSecureRandomString(ALPHABET, 2000);
    expect(token).toHaveLength(2000);
    expect([...token].every((character) => ALPHABET.includes(character))).toBe(true);
    expect(globalThis.crypto).toBe(real);
  });

  it("길이 0 은 빈 문자열이고 잘못된 인자는 거부한다", () => {
    expect(createSecureRandomString(ALPHABET, 0)).toBe("");
    expect(() => createSecureRandomString(ALPHABET, -1)).toThrow(RangeError);
    expect(() => createSecureRandomString(ALPHABET, 1.5)).toThrow(RangeError);
    expect(() => createSecureRandomString("A", 4)).toThrow(RangeError);
    expect(() => createSecureRandomString("", 4)).toThrow(RangeError);
  });

  it("안전한 난수원이 없으면 Math.random 으로 대체하지 않고 실패한다", () => {
    const random = vi.spyOn(Math, "random");
    vi.stubGlobal("crypto", undefined);
    expect(() => createSecureRandomString(ALPHABET, 6, "secure token unavailable")).toThrow(
      "secure token unavailable",
    );
    expect(random).not.toHaveBeenCalled();
  });

  it("난수원이 예외를 던져도 같은 오류로 실패한다", () => {
    const random = vi.spyOn(Math, "random");
    vi.stubGlobal("crypto", {
      getRandomValues: () => { throw new Error("entropy unavailable"); },
    });
    expect(() => createSecureRandomString(ALPHABET, 6, "secure token unavailable")).toThrow(
      "secure token unavailable",
    );
    expect(random).not.toHaveBeenCalled();
  });
});
