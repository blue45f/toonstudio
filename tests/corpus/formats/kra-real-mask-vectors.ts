/**
 * @file kra-real-mask-vectors.ts
 * @description 실제 Krita 5.2.2가 저장한 마스크 타일(`.pixelselection`, 픽셀 1바이트) 페이로드의 알려진 정답 벡터.
 *              `tests/corpus/formats/krita-oracle/export_mask_vectors.py`가 만든다.
 *
 * 입력은 스크립트가 그린 합성 마스크이고 사용자 콘텐츠가 아니다. 페이로드는 문서에서 타일 하나를 그대로 떼어 낸 바이트다.
 * `rawSha256`은 독립 Python LZF 해석기로 푼 4096바이트의 SHA-256이고, `probes`는 Krita가 문서를 다시 열어 읽어 준 마스크 값이다
 * (이미지 좌표 = 타일 좌표 + 마스크 오프셋 + 타일 안 좌표). 수정하지 말고 스크립트로 다시 만든다.
 */

export interface KraRealMaskVector {
  readonly id: string;
  readonly origin: string;
  readonly nodeType: string;
  /** `<mask>`의 x, y 속성. */
  readonly offset: readonly [number, number];
  /** 마스크 로컬 타일 좌표. */
  readonly tile: readonly [number, number];
  /** 페이로드 첫 바이트: 1이면 LZF 스트림, 0이면 비압축 원본. */
  readonly flag: 0 | 1;
  readonly defaultValue: number;
  readonly payloadBase64: string;
  readonly rawSha256: string;
  readonly probes: readonly { readonly x: number; readonly y: number; readonly value: number }[];
}

export const KRA_REAL_MASK_VECTORS: readonly KraRealMaskVector[] = [
  {
    "id": "d15-tm-basic-corner",
    "origin": "대각 그라데이션 마스크의 왼쪽 위 타일(사각형 가장자리가 타일 안을 지난다) (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)",
    "nodeType": "transparencymask",
    "offset": [0, 0],
    "tile": [0, 0],
    "flag": 1,
    "defaultValue": 0,
    "payloadBase64": "AQAA4PkA4PkA4PkA4PkA4PgAH0pRWF9mbXR7gomQl56lrLO6wcjP1t3k6/L5AAcOFRwjFSoxOD9GTVRbYmlwd36FjJOaoaivtr3hATYfV15lbHN6gYiPlp2kq7K5wMfO1dzj6vH4/wYNFBsiKTAVNz5FTFNaYWhvdn2Ei5KZoKeutbzDyuABPx9ka3J5gIeOlZyjqrG4v8bN1Nvi6fD3/gUMExohKC82PRVES1JZYGdudXyDipGYn6attLvCydDX4AE/HnF4f4aNlJuiqbC3vsXM09rh6O/2/QQLEhkgJy41PEPgDt7gAT/gAdMUxMvS2eDn7vX8AwoRGB8mLTQ7QklQ4A7e4AE/4AHTFNHY3+bt9PsCCRAXHiUsMzpBSE9WXeAO3uABPwCY4ADTFN7l7PP6AQgPFh0kKzI5QEdOVVxjauAO3uABP+EgsuAE3uABP+EgsuAE3uABP+EgsuAE3uABP+EgsuIEkeABP+EgsuIEkeABP+EgsuIEkeABP+EgsuIEkeABP+MTZeEEsuIEkeABP+MTZeEEsuIEkeABP+MTZeEEsuIEkeABP+MTZeEEsuQEROABP+MTZeEEsuQEROABP+MTZeEEsuQEROABP+MTZeEEsuUEI+ABP+UGGOERsuUEI+ABP+UGGOERsuUEI+ABP+UGGOERsuUEI+ABP+Ul98De4AE/5SX3wN7gAT/lJffA3uABP+Ul98KR4AE/ALbgANPlG/fCkeABPwDD4ADT5Rv3wpHgAT8A0OAA0+Ub98KR4AE/5xiqwbLgBN7gAT/nGKrBsuAE3uABP+cYqsGy4ATe4AE/5xiqwbLoBIngAT/nGKrBsugEieABP+cYqsGy6ASJ4AE/5xiqwbLoBIngAT/pC13hDLLoBIngAT/pC10hsibWKIkoiSX3KIkoiSiJKWgpaCloALggPyAAIAABAFIlGCldKV0oiSldKV0hsiiJKIkhsiDeKIkoiSiJKWgkRCNwAb7FIDkgACAAAAAqPCo8KjwqPCo8KjwikSo8Kjwhsio8JfclIyo8KjwqPCo8IN4gOSAAIAAAACo8KjwqPCo8KjwqPCKRKjwqPCGyKjwl9yUjKjwAkio8KjwjcAHY3yA5IAAgAAAAINMg0yDTKjwqPCo8H/f+BQwTGiEoLzY9REtSWWBnbnV8g4qRmJ+mrbS7wsnQA9fe5ew=",
    "rawSha256": "a3e9a997b44b3098b5a28496a18b6c9d6cff3a911fb6b65432c3dd859cdfe340",
    "probes": [
      { "x": 0, "y": 0, "value": 0 },
      { "x": 1, "y": 0, "value": 0 },
      { "x": 63, "y": 0, "value": 0 },
      { "x": 0, "y": 63, "value": 0 },
      { "x": 63, "y": 63, "value": 236 },
      { "x": 10, "y": 20, "value": 74 },
      { "x": 32, "y": 32, "value": 128 },
      { "x": 47, "y": 13, "value": 0 },
      { "x": 5, "y": 60, "value": 0 },
      { "x": 20, "y": 40, "value": 148 },
    ],
  },
  {
    "id": "d15-tm-basic-edge",
    "origin": "같은 마스크의 오른쪽 아래 타일(가장자리만 걸친다) (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)",
    "nodeType": "transparencymask",
    "offset": [0, 0],
    "tile": [128, 64],
    "flag": 1,
    "defaultValue": 0,
    "payloadBase64": "AQLAxwDgNAABzdTgND4CANrh4DU/Aefu4DU/AfT74DU/AQEI4DU/AQ4V4DU/ARsi4DU/ASgv4DU/ATU84DU/AUJJ4DU/AU9W4DU/AVxj4DU/AWlw4DU/AXZ94DU/AYOK4DU/4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAA=",
    "rawSha256": "ed57320da94c0ae12438c5b8560c9860ad85428bd397ef7c803b3aae3733e21e",
    "probes": [
      { "x": 0, "y": 0, "value": 192 },
      { "x": 1, "y": 0, "value": 199 },
      { "x": 63, "y": 0, "value": 0 },
      { "x": 0, "y": 63, "value": 0 },
      { "x": 63, "y": 63, "value": 0 },
      { "x": 10, "y": 20, "value": 0 },
      { "x": 32, "y": 32, "value": 0 },
      { "x": 47, "y": 13, "value": 0 },
      { "x": 5, "y": 60, "value": 0 },
      { "x": 20, "y": 40, "value": 0 },
    ],
  },
  {
    "id": "d15-tm-inverted-corner",
    "origin": "선택을 뒤집은 마스크의 왼쪽 위 타일(기본값 255) (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)",
    "nodeType": "transparencymask",
    "offset": [0, 0],
    "tile": [0, 0],
    "flag": 1,
    "defaultValue": 255,
    "payloadBase64": "AQD/4PkA4PkA4PkA4PkA4PgAH7Wup6CZkouEfXZvaGFaU0xFPjcwKSIbFA0G//jx6uPcFdXOx8C5squknZaPiIF6c2xlXldQSULhATYfqKGak4yFfndwaWJbVE1GPzgxKiMcFQ4HAPny6+Td1s8VyMG6s6ylnpeQiYJ7dG1mX1hRSkM8NeABPx+blI2Gf3hxamNcVU5HQDkyKyQdFg8IAfrz7OXe19DJwhW7tK2mn5iRioN8dW5nYFlSS0Q9Ni8o4AE/Ho6HgHlya2RdVk9IQTozLCUeFxAJAvv07ebf2NHKw7zgDt7gAT/gAdMUOzQtJh8YEQoD/PXu5+DZ0svEvbav4A7e4AE/4AHTFC4nIBkSCwT99u/o4drTzMW+t7CpouAO3uABPwBn4ADTFCEaEwwF/vfw6eLb1M3Gv7ixqqOcleAO3uABP+EgsuAE3uABP+EgsuAE3uABP+EgsuAE3uABP+EgsuIEkeABP+EgsuIEkeABP+EgsuIEkeABP+EgsuIEkeABP+MTZeEEsuIEkeABP+MTZeEEsuIEkeABP+MTZeEEsuIEkeABP+MTZeEEsuQEROABP+MTZeEEsuQEROABP+MTZeEEsuQEROABP+MTZeEEsuUEI+ABP+UGGOERsuUEI+ABP+UGGOERsuUEI+ABP+UGGOERsuUEI+ABP+Ul98De4AE/5SX3wN7gAT/lJffA3uABP+Ul98KR4AE/AEngANPlG/fCkeABPwA84ADT5Rv3wpHgAT8AL+AA0+Ub98KR4AE/5xiqwbLgBN7gAT/nGKrBsuAE3uABP+cYqsGy4ATe4AE/5xiqwbLoBIngAT/nGKrBsugEieABP+cYqsGy6ASJ4AE/5xiqwbLoBIngAT/pC13hDLLoBIngAT/pC10hsibWKIkoiSX3KIkoiSiJKWgpaCloAEcgPyAAIAAB/60lGCldKV0oiSldKV0hsiiJKIkhsiDeKIkoiSiJKWgkRCNwAUE6IDkgACAAAP8qPCo8KjwqPCo8KjwikSo8Kjwhsio8JfclIyo8KjwqPCo8IN4gOSAAIAAA/yo8KjwqPCo8KjwqPCKRKjwqPCGyKjwl9yUjKjwAbSo8KjwjcAEnICA5IAAgAAD/INMg0yDTKjwqPCo8HwgB+vPs5d7X0MnCu7Stpp+YkYqDfHVuZ2BZUktEPTYvAyghGhM=",
    "rawSha256": "ca835af27b186940b5b8478bcf12b378855c17369d4e4d21a4afce9e4851a805",
    "probes": [
      { "x": 0, "y": 0, "value": 255 },
      { "x": 1, "y": 0, "value": 255 },
      { "x": 63, "y": 0, "value": 255 },
      { "x": 0, "y": 63, "value": 255 },
      { "x": 63, "y": 63, "value": 19 },
      { "x": 10, "y": 20, "value": 181 },
      { "x": 32, "y": 32, "value": 127 },
      { "x": 47, "y": 13, "value": 255 },
      { "x": 5, "y": 60, "value": 255 },
      { "x": 20, "y": 40, "value": 107 },
    ],
  },
  {
    "id": "d15-grid8-rows",
    "origin": "행마다 값이 같은 마스크 타일(참조가 많은 LZF) (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)",
    "nodeType": "transparencymask",
    "offset": [0, 0],
    "tile": [64, 128],
    "flag": 1,
    "defaultValue": 0,
    "payloadBase64": "AQCA4DYAAIHgNgAAguA2AACD4DYAAITgNgAAheA2AACG4DYAAIfgNgAAiOA2AACJ4DYAAIrgNgAAi+A2AACM4DYAAI3gNgAAjuA2AACP4DYAAJDgNgAAkeA2AACS4DYAAJPgNgAAlOA2AACV4DYAAJbgNgAAl+A2AACY4DYAAJngNgAAmuA2AACb4DYAAJzgNgAAneA2AACe4DYAAJ/gNgAAoOA2AACh4DYAAKLgNgAAo+A2AACk4DYAAKXgNgAApuA2AACn4DYAAKjgNgAAqeA2AACq4DYAAKvgNgAArOA2AACt4DYAAK7gNgAAr+A2AACw4DYAALHgNgAAsuA2AACz4DYAALTgNgAAteA2AAC24DYAALfgNgAAuOA2AAC54DYAALrgNgAAu+A2AAC8IAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAL0gACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAAviAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAAC/IAAgACAAIAAgACAAIAAgACAAH7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/A7+/v78=",
    "rawSha256": "e972e98ea3dc83bca1a87420e94ee7479a8a07af496a7da2c7b8321636660f71",
    "probes": [
      { "x": 0, "y": 0, "value": 128 },
      { "x": 1, "y": 0, "value": 128 },
      { "x": 63, "y": 0, "value": 128 },
      { "x": 0, "y": 63, "value": 191 },
      { "x": 63, "y": 63, "value": 191 },
      { "x": 10, "y": 20, "value": 148 },
      { "x": 32, "y": 32, "value": 160 },
      { "x": 47, "y": 13, "value": 141 },
      { "x": 5, "y": 60, "value": 188 },
      { "x": 20, "y": 40, "value": 168 },
    ],
  },
  {
    "id": "d15-tm-maskmove-offset",
    "origin": "마스크 노드를 (10, 7)만큼 옮긴 문서의 타일(타일 좌표는 마스크 로컬) (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)",
    "nodeType": "transparencymask",
    "offset": [10, 7],
    "tile": [64, 0],
    "flag": 1,
    "defaultValue": 0,
    "payloadBase64": "AQAA4PkA4PkA4PkA4PkA4O4AH8TL0tng5+71/AMKERgfJi00O0JJUFdeZWxzeoGIj5adDaSrsrnAx87V3OPq8fj/4QkkH9HY3+bt9PsCCRAXHiUsMzpBSE9WXWRrcnmAh46VnKOqDbG4v8bN1Nvi6fD3/gUM4Ak/H97l7PP6AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3Db7FzNPa4ejv9v0ECxIZ4Ak/Huvy+QAHDhUcIyoxOD9GTVRbYmlwd36FjJOaoaivtr3gBt7gCT8e+P8GDRQbIikwNz5FTFNaYWhvdn2Ei5KZoKeutbzDyuAG3uAJPx4FDBMaISgvNj1ES1JZYGdudXyDipGYn6attLvCydDX4Abe4Ak/HhIZICcuNTxDSlFYX2ZtdHuCiZCXnqWss7rByM/W3eTgBt7gCT/hGLLgBN7gCT/hGLLgBN7gCT/hGLLgBN7gCT/hGLLiBJHgCT/hGLLiBJHgCT/hGLLiBJHgCT/hGLLiBJHgCT/jC2XhBLLiBJHgCT/jC2XhBLLiBJHgCT/jC2XhBLLiBJHgCT/jC2XhBLLkBETgCT/jC2XhBLLkBETgCT/jC2XhBLLkBETgCT/jC2XhBLIAr+QDROAJP6UY4RGy5ARE4Ak/pRjhEbLkBETgCT+lGOERsuQEROAJP+Ud98De4Ak/5R33wN7gCT/lHffA3uAJP+Ud98KR4Ak/5R33wpHgCT/lHffCkeAJP+Ud98KR4Ak/5xCqwbLmBNbgCT/nEKrBsuYE1uAJP+cQqsGy5gTW4Ak/5xCqwbLoBIngCT/nEKrBsugEieAJP+cQqsGy6ASJ4Ak/5xCqwbLoBIngCT/pA13hDLLoBIngCT/pA13hDLIoiSUjKIkpaAD6ID8gACAAIAAgACAAKV0pXQD2KV0oiSiJKIkhsiiJJfcoiSDeKIkkRCiJKWggMCAAIAAgACAAIAAqPCo8KjwqPCGyKjwikSo8JfcqPCo8KjwlIyo8IN4AFCAwIAAgACAAIAAgACo8KjwqPCo8IbIqPCKRKjwl9yo8KjwqPCUjKjwg3gAhIDAgACAAIAAgACAAKjwqPCo8Kjwhsio8IpEqPCX3KjwfxczT2uHo7/b9BAsSGSAnLgAAAAAAAAAAAAAAAAAAAAABAAA=",
    "rawSha256": "e2461b348f6e6b088fb39b2ab6325195a1a87d368980e7ca3fa1a62a90a9b24a",
    "probes": [
      { "x": 0, "y": 0, "value": 0 },
      { "x": 1, "y": 0, "value": 0 },
      { "x": 63, "y": 0, "value": 0 },
      { "x": 0, "y": 63, "value": 243 },
      { "x": 63, "y": 63, "value": 0 },
      { "x": 10, "y": 20, "value": 10 },
      { "x": 32, "y": 32, "value": 64 },
      { "x": 47, "y": 13, "value": 0 },
      { "x": 5, "y": 60, "value": 239 },
      { "x": 20, "y": 40, "value": 84 },
    ],
  },
  {
    "id": "d15-tm-two-lower",
    "origin": "마스크가 둘인 레이어에서 아래 마스크의 타일 (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)",
    "nodeType": "transparencymask",
    "offset": [0, 0],
    "tile": [64, 64],
    "flag": 1,
    "defaultValue": 0,
    "payloadBase64": "AR8ABw4VHCMqMTg/Rk1UW2JpcHd+hYyTmqGor7a9xMvS2Q7g5+71/AMKERgfJi00OwDgCAAfDRQbIikwNz5FTFNaYWhvdn2Ei5KZoKeutbzDytHY3+YN7fT7AgkQFx4lLDM6QUjgCD4fABohKC82PURLUllgZ251fIOKkZifpq20u8LJ0Nfe5ewO8/oBCA8WHSQrMjlAR05V4Ak/HicuNTxDSlFYX2ZtdHuCiZCXnqWss7rByM/W3eTr8vngBt7gCT8eNDtCSVBXXmVsc3qBiI+WnaSrsrnAx87V3OPq8fj/BuAG3uAJPx5BSE9WXWRrcnmAh46VnKOqsbi/xs3U2+Lp8Pf+BQwT4Abe4Ak/Hk5VXGNqcXh/ho2Um6KpsLe+xczT2uHo7/b9BAsSGSDgBt7gCT/hGLLgBN7gCT/hGLLgBN7gCT/hGLLgBN7gCT/hGLLiBJHgCT/hGLLiBJHgCT/hGLLiBJHgCT/hGLLiBJHgCT/jC2XhBLLiBJHgCT/jC2XhBLLiBJHgCT/g+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAA==",
    "rawSha256": "061ce56656eb08b9007bd07adfb7cfc74a09c7772b6f3443213f2dff7029736d",
    "probes": [
      { "x": 0, "y": 0, "value": 0 },
      { "x": 1, "y": 0, "value": 7 },
      { "x": 63, "y": 0, "value": 0 },
      { "x": 0, "y": 63, "value": 0 },
      { "x": 63, "y": 63, "value": 0 },
      { "x": 10, "y": 20, "value": 0 },
      { "x": 32, "y": 32, "value": 0 },
      { "x": 47, "y": 13, "value": 0 },
      { "x": 5, "y": 60, "value": 0 },
      { "x": 20, "y": 40, "value": 0 },
    ],
  },
  {
    "id": "d15-tm-noise",
    "origin": "잡음 마스크: 압축이 안 돼 비압축(플래그 0) 타일로 저장된다 (정답 = Krita가 문서를 다시 열어 읽어 준 마스크 값)",
    "nodeType": "transparencymask",
    "offset": [0, 0],
    "tile": [0, 0],
    "flag": 0,
    "defaultValue": 0,
    "payloadBase64": "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",
    "rawSha256": "9a54a3002237623bd50e4d15cdaebbe324505c78975401ed944cbdfb79bfa9a7",
    "probes": [
      { "x": 0, "y": 0, "value": 220 },
      { "x": 1, "y": 0, "value": 4 },
      { "x": 63, "y": 0, "value": 253 },
      { "x": 0, "y": 63, "value": 116 },
      { "x": 63, "y": 63, "value": 203 },
      { "x": 10, "y": 20, "value": 72 },
      { "x": 32, "y": 32, "value": 228 },
      { "x": 47, "y": 13, "value": 64 },
      { "x": 5, "y": 60, "value": 220 },
      { "x": 20, "y": 40, "value": 51 },
    ],
  },
];
