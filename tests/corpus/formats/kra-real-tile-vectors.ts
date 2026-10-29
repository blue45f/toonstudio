/**
 * @file kra-real-tile-vectors.ts
 * @description 실제 Krita 5.2.2가 저장한 타일 페이로드(LZF) 알려진 정답 벡터. `tests/corpus/formats/krita-oracle/export_vectors.py`가 만든다.
 *
 * 입력은 이 저장소의 합성 이미지(`krita-oracle/in/*.png`)와 스크립트가 그린 도형이고 사용자 콘텐츠가 아니다. 페이로드는 문서에서
 * 타일 하나를 그대로 떼어 낸 바이트이며 ICC 프로파일·썸네일 등 문서의 다른 부분은 담지 않는다. `planarSha256`은 독립 Python
 * LZF 해석기로 계산했다. 수정하지 말고 스크립트로 다시 만든다.
 */

export interface KraRealTileVector {
  readonly id: string;
  readonly origin: string;
  readonly colorSpace: string;
  readonly profile: string | null;
  readonly pixelBytes: number;
  /** 페이로드 첫 바이트: 1이면 LZF 스트림(바이트 평면), 0이면 비압축 원본(픽셀을 이어 붙인 배치). */
  readonly flag: 0 | 1;
  readonly tile: readonly [number, number];
  readonly canvas: readonly [number, number];
  readonly defaultPixelHex: string;
  readonly payloadBase64: string;
  readonly planarSha256: string;
  readonly probes: readonly { readonly x: number; readonly y: number; readonly rgba: readonly [number, number, number, number] }[];
}

export const KRA_REAL_TILE_VECTORS: readonly KraRealTileVector[] = [
  {
    "id": "d04-blendmodes-m05",
    "origin": "블렌드 모드 문서의 한 레이어(정답 = Krita가 읽어 준 Node.pixelData)",
    "colorSpace": "RGBA",
    "profile": "sRGB-elle-V2-srgbtrc.icc",
    "pixelBytes": 4,
    "tile": [
      0,
      0
    ],
    "canvas": [
      16,
      12
    ],
    "defaultPixelHex": "00000000",
    "payloadBase64": "AQRmi7DVAOAyAANxlrvg4DI+BAB8ocbr4DM/4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4BkAA5vC6RDgGSXgEQADqdD3HuARHeAZAAO33gUs4Bkl4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4DMAA9D5IkvgMz8D4QozXOAzPwPyG0Rt4DM/4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4BkAA/4BgP/gGSXgEQAAfyBA4BEd4BoAIEDgGiXg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QAgACAAIAAgACAAIAAgACAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAA==",
    "planarSha256": "7b2ec418c159a5124471372361b6cc1fc22119f6e0056ce39a25f9141b8e2a22",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          208,
          155,
          102,
          254
        ]
      },
      {
        "x": 4,
        "y": 4,
        "rgba": [
          0,
          0,
          0,
          0
        ]
      },
      {
        "x": 10,
        "y": 10,
        "rgba": [
          0,
          0,
          0,
          0
        ]
      },
      {
        "x": 20,
        "y": 20,
        "rgba": [
          0,
          0,
          0,
          0
        ]
      },
      {
        "x": 31,
        "y": 31,
        "rgba": [
          0,
          0,
          0,
          0
        ]
      },
      {
        "x": 40,
        "y": 40,
        "rgba": [
          0,
          0,
          0,
          0
        ]
      },
      {
        "x": 63,
        "y": 47,
        "rgba": [
          0,
          0,
          0,
          0
        ]
      }
    ],
    "flag": 1
  },
  {
    "id": "d10-rgba8",
    "origin": "원본 PNG oracle-rgba.png를 가져와 색 공간을 바꿔 저장한 문서(정답 = 원본 PNG의 RGBA8)",
    "colorSpace": "RGBA",
    "profile": "sRGB-elle-V2-srgbtrc.icc",
    "pixelBytes": 4,
    "tile": [
      0,
      0
    ],
    "canvas": [
      40,
      30
    ],
    "defaultPixelHex": "00000000",
    "payloadBase64": "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",
    "planarSha256": "f4f2a3f39870eab329e54bac5c27a5378e662b02df64410a4724c897c87d5cc2",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          0,
          40,
          255,
          255
        ]
      },
      {
        "x": 5,
        "y": 3,
        "rgba": [
          39,
          74,
          224,
          200
        ]
      },
      {
        "x": 20,
        "y": 15,
        "rgba": [
          165,
          200,
          125,
          254
        ]
      },
      {
        "x": 39,
        "y": 29,
        "rgba": [
          65,
          94,
          2,
          255
        ]
      },
      {
        "x": 10,
        "y": 25,
        "rgba": [
          135,
          4,
          155,
          128
        ]
      },
      {
        "x": 33,
        "y": 7,
        "rgba": [
          219,
          162,
          76,
          255
        ]
      }
    ],
    "flag": 1
  },
  {
    "id": "d10-gray8",
    "origin": "원본 PNG oracle-gray.png를 가져와 색 공간을 바꿔 저장한 문서(정답 = 원본 PNG의 RGBA8)",
    "colorSpace": "GRAYA",
    "profile": "Gray-D50-elle-V2-srgbtrc.icc",
    "pixelBytes": 2,
    "tile": [
      0,
      0
    ],
    "canvas": [
      40,
      30
    ],
    "defaultPixelHex": "0000",
    "payloadBase64": "AR8ABgwSGB4kKjA2PEJITlRaYGZscnh+hIqQlpyiqK60ugjAxszS2N7k6gDgDgAfBQsRFx0jKS81O0FHTVNZX2VrcXd9g4mPlZuhp62zub8HxcvR193j6e/gDj4fAAoQFhwiKC40OkBGTFJYXmRqcHZ8goiOlJqgpqyyuL4IxMrQ1tzi6O704A8/Hw8VGyEnLTM5P0VLUVddY2lvdXuBh42TmZ+lq7G3vcPJB8/V2+Hn7fP54A8/HxQaICYsMjg+REpQVlxiaG50eoCGjJKYnqSqsLa8wsjOB9Ta4Obs8vj+4A8/HxkfJSsxNz1DSU9VW2FnbXN5f4WLkZedo6mvtbvBx83TB9nf5evx9/0D4A8/4Rp6BPD2/AII4A8/4Rp6BPX7AQcN4A8/4Rp6APpCI+APP+EaegD/QiPgDz/hGnoABEIj4A8/4Rp6AAlCI+APP+IV9WF6AA5CI+APP+IV9WF6ABNCI+APP+IV9WF6Y57gDz/iFfVhemOe4A8/4hX1YXpjnuAPP+IV9WF6Y57gDz/kEHDhAXpjnuAPP+QQcOEBemOe4A8/5BBw4QF6ZRngDz/kEHDhAXplGeAPP+QQcOEBemUZ4A8/5BBw4QF6ZRngDz/lC+vhBnplGeAPP+UL6+EGemUZ4A8/5Qvr4QZ6ZpTgDz/lC+vhBnpmlOAPP+UL6+EGemaU4A8/5Qvr4QZ6ZpTgDz/g+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QDgZwAH///+yIBAAf/gFwfgD5fgHT0A/+AQP+Abe0Cb4A9/4Bm5QD0BgEDgDz+AHeAZReAPP+D5/+EdweEPP+AdPQD+4fn/4A4A4hm5guHgDj7i+f8iW+Ibg+EPPwD+4Bw95Pn/4Q8/4Rt7QaPgDz/it//g+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA",
    "planarSha256": "45519fbcedebbac2046d976049981ed7d3e7e947e9e476e502014f82ca17c665",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          0,
          0,
          0,
          255
        ]
      },
      {
        "x": 5,
        "y": 3,
        "rgba": [
          45,
          45,
          45,
          200
        ]
      },
      {
        "x": 20,
        "y": 15,
        "rgba": [
          195,
          195,
          195,
          254
        ]
      },
      {
        "x": 39,
        "y": 29,
        "rgba": [
          123,
          123,
          123,
          255
        ]
      },
      {
        "x": 10,
        "y": 25,
        "rgba": [
          185,
          185,
          185,
          128
        ]
      },
      {
        "x": 33,
        "y": 7,
        "rgba": [
          233,
          233,
          233,
          255
        ]
      }
    ],
    "flag": 1
  },
  {
    "id": "d10-rgba16-srgbtrc",
    "origin": "원본 PNG oracle-rgba.png를 가져와 색 공간을 바꿔 저장한 문서(정답 = 원본 PNG의 RGBA8)",
    "colorSpace": "RGBA16",
    "profile": "sRGB-elle-V2-srgbtrc.icc",
    "pixelBytes": 8,
    "tile": [
      0,
      0
    ],
    "canvas": [
      40,
      30
    ],
    "defaultPixelHex": "0000000000000000",
    "payloadBase64": "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",
    "planarSha256": "ff09bec72014df3cf54b6f9d159d0502dfe1ef42be0e9307684029b4ae30f75e",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          0,
          40,
          255,
          255
        ]
      },
      {
        "x": 5,
        "y": 3,
        "rgba": [
          39,
          74,
          224,
          200
        ]
      },
      {
        "x": 20,
        "y": 15,
        "rgba": [
          165,
          200,
          125,
          254
        ]
      },
      {
        "x": 39,
        "y": 29,
        "rgba": [
          65,
          94,
          2,
          255
        ]
      },
      {
        "x": 10,
        "y": 25,
        "rgba": [
          135,
          4,
          155,
          128
        ]
      },
      {
        "x": 33,
        "y": 7,
        "rgba": [
          219,
          162,
          76,
          255
        ]
      }
    ],
    "flag": 1
  },
  {
    "id": "d10-rgba16-g10",
    "origin": "원본 PNG oracle-rgba.png를 가져와 색 공간을 바꿔 저장한 문서(정답 = 원본 PNG의 RGBA8)",
    "colorSpace": "RGBA16",
    "profile": "sRGB-elle-V2-g10.icc",
    "pixelBytes": 8,
    "tile": [
      0,
      0
    ],
    "canvas": [
      40,
      30
    ],
    "defaultPixelHex": "0000000000000000",
    "payloadBase64": "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",
    "planarSha256": "0cd8a94a94723e33f8e67df8ac92df01134e9ec8895dec22771e70389ac9c530",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          0,
          40,
          255,
          255
        ]
      },
      {
        "x": 5,
        "y": 3,
        "rgba": [
          39,
          74,
          224,
          200
        ]
      },
      {
        "x": 20,
        "y": 15,
        "rgba": [
          165,
          200,
          125,
          254
        ]
      },
      {
        "x": 39,
        "y": 29,
        "rgba": [
          65,
          94,
          2,
          255
        ]
      },
      {
        "x": 10,
        "y": 25,
        "rgba": [
          135,
          4,
          155,
          128
        ]
      },
      {
        "x": 33,
        "y": 7,
        "rgba": [
          219,
          162,
          76,
          255
        ]
      }
    ],
    "flag": 1
  },
  {
    "id": "d10-gray16",
    "origin": "원본 PNG oracle-gray.png를 가져와 색 공간을 바꿔 저장한 문서(정답 = 원본 PNG의 RGBA8)",
    "colorSpace": "GRAYAU16",
    "profile": "Gray-D50-elle-V2-g10.icc",
    "pixelBytes": 4,
    "tile": [
      0,
      0
    ],
    "canvas": [
      40,
      30
    ],
    "defaultPixelHex": "00000000",
    "payloadBase64": "AR8Ad/GMV1OE7ZFykfKXgbIt8QRjExVpERBlFBt/PlvXswjwkJT8yv+coQDgDgAfY9tvMiVNrUceMogh/yWTS1CkRjqAGgpR8Ok87PpmMmAH7+E59hmlmffgDj4fAMdUDvkYbv/K1SCugJr8p6Dme2CZJQc/0Ln+npz4tNEIUDJ5JDexlOCX4A8/HznrzuUyuHp5uTwDEGYG8SqxibQzBjCxjMFSQI05RrSFB7tWV8CRzHGC4A8/H8qls/ZyKyBVzIiJ02ZEcOu20kIHI5ZhiAnoJMC8G9wAB4t70pK7Tk244A8/H32CvS/dx/NfDgRByJq5JuPzVQsYfDlQwpK+SjeENEnCB6HnlawuG3Q74A8/4Rp6BBHsMyif4A8/4Rp6BMD1FIsI4A8/4Rp6ALpCI+APP+EaegD/QiPgDz/hGnoAT0Ij4A8/4Rp6ALNCI+APP+IV9WF6ACBCI+APP+IV9WF6AKtCI+APP+IV9WF6Y57gDz/iFfVhegAlQiPgDz/iFfVhemOe4A8/4hX1YXpjnuAPP+QQcOEBemOe4A8/5BBw4QF6Y57gDz8AoOQPcOEBemUZ4A8/5BBw4QF6ZRngDz/kEHDhAXplGeAPP+QQcOEBemUZ4A8/5Qvr4QZ6ZRngDz/lC+vhBnplGeAPP+UL6+EGemaU4A8/5Qvr4QZ6ZpTgDz/lC+vhBnpmlOAPP+UL6+EGemaU4A8/4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4GoAHwECAwQFBwkLDRATFhodIiYrMDU7QUdOVVxkbHR9hpCaBKSvusbS4BGX4AE+GxIWGR0hJSovNDpARkxTW2Jqc3yFjpijrbnE0NzgED8fAQICBAUGCAoNDxIVGBwgJCkuMzk/RUtSWWFpcXqDjZcGoay3ws7a5+APPwABIH5APgEMD0A+GR8kKC0yOD5ESlFYYGhweYKLlZ+qtcDM2OXy4BA/IPwgfR8MDhEUFxsfIycsMTc9Q0lQV19mb3eAipOeqLO+ytbj8AD94A8/QD4CBwkLQD4bGh4iJyswNjxCSE9WXWVtdn+IkpymsbzI1OHu++APPgAA4Rp6Ad/r7hD9AQAAobnhE3oA6S68AAEgKuAMAEE74RZ6APQgOOAQP0E74RZ6Af8AIeQgQ+AMAAAI4Rt6IiPgDDwgAOEbekIjICrgDADiFfVhekA+AATgDDwgAAAN4Rl6YmIgKuAMAGE74hD1YXoiYgEFB+AMPCAA4hX1YXpiYiAq4AwAABTiFvUhemOe4Aw8IADiFvVA/EJiAAwgKuAMAOQQcOEBekJi7xC/5BBwYvVBO4Oe4Ax8IADhGnplGSAq4AwA5BBw4QF6ImIBEhbgDDwgAOQScMF6Y54gKuAMAOQRcED8YXoAD0Ij4Aw8IAAAMOUK6+EGemUZICrgDADlC+vhBnoAFEIj4Aw8IADlC+viAfVBO4aUICrgDADlC+vhBnpmlOAMPCAA5Q3r4QR6ABxCIyAq4AwAAkhPVuUJ6+EFemaU4Aw84PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4GoAB////siAQAH/4BcH4A+a4B09AP/gED/gG3tAm+APf+AZuUA9AYBA4A8/gB3gGUXgDz/g+f/hHcHhDz/gHT0A/uH5/+AOAOIZuYLh4A4+4vn/IlviG4PhDz8A/uAcPeT5/+EPP+Ebe0Gj4A8/4rf/4PkA4PkA4PkA4PkA4PkA4PkA4PkA4PkA4GcASVvpG4PgD5fq+f/hGz3r+f/iDz/hHT0A/uvQ/+D5/+0dweIPP+AdPfP5/+EPP+X5/wD+Ih3iGUXhDz/gHT3lEf/g+QDg+QDg+QDg+QDg+QDg+QDg+QDg+QAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA",
    "planarSha256": "42cb79ca2109c121786c66103817b8dbcd46bda796bf8fd56c2a083c047ad9d4",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          0,
          0,
          0,
          255
        ]
      },
      {
        "x": 5,
        "y": 3,
        "rgba": [
          45,
          45,
          45,
          200
        ]
      },
      {
        "x": 20,
        "y": 15,
        "rgba": [
          195,
          195,
          195,
          254
        ]
      },
      {
        "x": 39,
        "y": 29,
        "rgba": [
          123,
          123,
          123,
          255
        ]
      },
      {
        "x": 10,
        "y": 25,
        "rgba": [
          185,
          185,
          185,
          128
        ]
      },
      {
        "x": 33,
        "y": 7,
        "rgba": [
          233,
          233,
          233,
          255
        ]
      }
    ],
    "flag": 1
  },
  {
    "id": "d11-noise-gray8-noise-raw",
    "origin": "잡음 레이어의 비압축(플래그 0) 타일(정답 = Krita가 읽어 준 Node.pixelData)",
    "colorSpace": "GRAYA",
    "profile": "Gray-D50-elle-V2-srgbtrc.icc",
    "pixelBytes": 2,
    "tile": [
      0,
      0
    ],
    "canvas": [
      200,
      150
    ],
    "defaultPixelHex": "0000",
    "payloadBase64": "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",
    "planarSha256": "cea872e4ecf1caec85d929e4b3e8d5fe5fc3f62ebcb61ed5d4739eb2cd50af08",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          227,
          227,
          227,
          114
        ]
      },
      {
        "x": 1,
        "y": 0,
        "rgba": [
          118,
          118,
          118,
          150
        ]
      },
      {
        "x": 63,
        "y": 0,
        "rgba": [
          111,
          111,
          111,
          250
        ]
      },
      {
        "x": 0,
        "y": 63,
        "rgba": [
          210,
          210,
          210,
          214
        ]
      },
      {
        "x": 63,
        "y": 63,
        "rgba": [
          33,
          33,
          33,
          103
        ]
      },
      {
        "x": 17,
        "y": 40,
        "rgba": [
          46,
          46,
          46,
          199
        ]
      }
    ],
    "flag": 0
  },
  {
    "id": "d11-noise-rgba8-noise-raw",
    "origin": "잡음 레이어의 비압축(플래그 0) 타일(정답 = Krita가 읽어 준 Node.pixelData)",
    "colorSpace": "RGBA",
    "profile": "sRGB-elle-V2-srgbtrc.icc",
    "pixelBytes": 4,
    "tile": [
      0,
      0
    ],
    "canvas": [
      200,
      150
    ],
    "defaultPixelHex": "00000000",
    "payloadBase64": "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",
    "planarSha256": "744e9d428a600e4309c15f43ba61f63601e461e30b091ce0393e464ec23cc178",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          192,
          141,
          99,
          118
        ]
      },
      {
        "x": 1,
        "y": 0,
        "rgba": [
          26,
          83,
          167,
          96
        ]
      },
      {
        "x": 63,
        "y": 0,
        "rgba": [
          209,
          199,
          113,
          130
        ]
      },
      {
        "x": 0,
        "y": 63,
        "rgba": [
          85,
          248,
          85,
          158
        ]
      },
      {
        "x": 63,
        "y": 63,
        "rgba": [
          52,
          28,
          28,
          2
        ]
      },
      {
        "x": 17,
        "y": 40,
        "rgba": [
          102,
          219,
          130,
          221
        ]
      }
    ],
    "flag": 0
  },
  {
    "id": "d11-noise-gray16-noise-raw",
    "origin": "잡음 레이어의 비압축(플래그 0) 타일(정답 = Krita가 읽어 준 Node.pixelData)",
    "colorSpace": "GRAYAU16",
    "profile": "Gray-D50-elle-V2-g10.icc",
    "pixelBytes": 4,
    "tile": [
      0,
      0
    ],
    "canvas": [
      200,
      150
    ],
    "defaultPixelHex": "00000000",
    "payloadBase64": "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",
    "planarSha256": "f500193be4102c328ca784a1ee48b02191a3dcc67abdbabc3428c018c2c7f66d",
    "probes": [
      {
        "x": 0,
        "y": 0,
        "rgba": [
          170,
          170,
          170,
          110
        ]
      },
      {
        "x": 1,
        "y": 0,
        "rgba": [
          233,
          233,
          233,
          35
        ]
      },
      {
        "x": 63,
        "y": 0,
        "rgba": [
          251,
          251,
          251,
          67
        ]
      },
      {
        "x": 0,
        "y": 63,
        "rgba": [
          146,
          146,
          146,
          116
        ]
      },
      {
        "x": 63,
        "y": 63,
        "rgba": [
          252,
          252,
          252,
          178
        ]
      },
      {
        "x": 17,
        "y": 40,
        "rgba": [
          197,
          197,
          197,
          246
        ]
      }
    ],
    "flag": 0
  }
];
