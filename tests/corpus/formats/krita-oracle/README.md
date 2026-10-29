# Krita 오라클: `.kra` 읽기 코덱을 Krita가 읽어 준 정답과 대조하는 도구

`packages/studio-format-gateway/src/kra-*.ts`가 실제 Krita 5.2.x가 저장한 문서를 제대로 읽는지, **Krita 자신이 읽어 준
값**과 맞춰 보는 도구다. 정답은 이 도구가 만든 값이 아니라 Krita가 저장 직전에 돌려준 값(`Node.pixelData`, 원본 PNG 등)이다.
근거와 검증 결과는 [`docs/design/krita-kra-reader-observed-2026-10-29.md`](../../../../docs/design/krita-kra-reader-observed-2026-10-29.md)에 있다.

Krita는 GPL 응용 프로그램이다. 이 도구는 Krita를 **블랙박스로 실행**해 합성 문서를 만들고 저장 결과만 관찰한다. Krita 소스는 읽지
않았고 실행 파일에서 코드를 꺼내지 않았다. 생성한 `.kra`에는 Krita가 넣은 ICC 프로파일과 썸네일이 들어 있으므로 **저장소에
커밋하지 않는다**(`tests/corpus/formats/local-samples/`는 Git이 무시한다).

## 구성

| 파일 | 역할 |
| --- | --- |
| `gen_corpus.py` | `d01`~`d07`: 기본 문서, 타일, 그룹, 블렌드 모드 후보, 색 공간 15종, 마스크·복제·필터·벡터·파일 레이어, `.krz`. 문서마다 `*.truth.json`을 함께 쓴다 |
| `gen_corpus2.py` | `d08` 잡음(비압축 타일), `d09` 블렌드 id 후보 87종, `d10` 원본 PNG(`in/`)를 가져와 색 공간을 바꿔 저장 |
| `gen_corpus3.py` | `d11` 모든 지원 색 공간의 비압축 타일, `d12` 옮긴 레이어(오프셋·음수 좌표·캔버스 밖), `d13` 8비트 정수 문서 + 선형(`g10`) 프로파일(정답은 같은 내용을 Krita가 `srgbtrc`로 변환한 값) |
| `gen_corpus4.py` | `d14` 실수형(F16·F32) RGBA·GRAYA 문서 10개: 선형(`g10`)·sRGB 감마(`srgbtrc`) 프로파일, 알파가 변하는 문서(`-alpha`). 레이어 하나(`P`)의 합성 결과가 곧 그 레이어가 되게 만들어서 Krita가 저장한 `mergedimage.png`를 정답 렌더로 쓴다. Krita가 한 프로세스에서 여러 문서를 만들면 비정상 종료한 적이 있어 문서마다 따로 실행한다(`KRA_ONLY=문서 이름`) |
| `gen_names.py` | `n00`~`n06` 특이한 이미지 이름(한글, 공백, `..`, 탭, 큰따옴표, 앞뒤 공백, 300자). `..`·탭(`n02`, `n03`)만 안전하지 않아 거부되고 나머지는 읽힌다 |
| `in/*.png` | 합성 입력 이미지(사용자 콘텐츠 아님) |
| `kra_ref.py` | 표준 라이브러리만 쓰는 독립 타일 해석기(LZF 포함). 구현과 코드를 공유하지 않는다 |
| `png_dec.py` | 표준 라이브러리만 쓰는 8비트 PNG 해석기(원본 PNG 정답용) |
| `dump-importer.mts` | 코퍼스를 `importKra`로 읽어 JSON으로 덤프한다 |
| `compare_importer.py` | 덤프를 정답(`*.truth.json`)과 대조한다. 16비트 정수·16/32비트 실수 → 8비트 환원식과 프로파일 선형 판정은 이 파일이 따로 다시 쓴다. `d13`은 Krita의 색 변환(lcms)과 최대 1단계 차이(알파는 정확히 일치)를 허용한다. `d14`는 (1) Krita가 읽어 준 네이티브 바이트에 환원식을 적용한 값과 정확히 같고 (2) Krita가 저장한 합성 이미지와 1단계 이내로 같아야 한다 |
| `export_vectors.py` | 코퍼스에서 타일 페이로드 몇 개를 뽑아 `tests/corpus/formats/kra-real-tile-vectors.ts`(알려진 정답 벡터)를 만든다 |

## 실행

필요한 것: Krita 5.2.x(`kritarunner` 포함), `xvfb-run`, Python 3, 이 저장소의 `pnpm`. Krita 명령줄은 오프스크린 플랫폼을 무시하므로
가상 X 서버(Xvfb)가 필요하다.

```bash
export KRA_WORK=/tmp/kra-oracle
export KRA_OUT="$KRA_WORK/corpus" KRA_IN="$PWD/tests/corpus/formats/krita-oracle/in" PYTHONPATH="$PWD/tests/corpus/formats/krita-oracle"
mkdir -p "$KRA_OUT"
```

코퍼스 생성. `gen_corpus.py`의 `d06_filllayer`(채우기 레이어)는 Krita 5.2.2를 비정상 종료시켜 제외했고, 그 밖에도 한 프로세스에서 모든 함수를
돌리면 마스크·벡터 레이어 생성 중 종료된 적이 있어 함수를 하나씩 실행한다(`KRA_ONLY=함수이름`).

```bash
for fn in d01_basic d02_tiles d03_groups d04_blendmodes d05_colorspaces d06_transparencymask d06_filtermask d06_selectionmask \
  d06_colorizemask d06_transformmask d06_vectorlayer d06_clonelayer d06_filterlayer d06_filelayer d07_krz_and_misc; do
  KRA_ONLY=$fn xvfb-run -a -s "-screen 0 1280x1024x24" kritarunner -s gen_corpus
done
for fn in d08_noise d09_blend2 d10_from_png; do
  KRA_ONLY=$fn xvfb-run -a -s "-screen 0 1280x1024x24" kritarunner -s gen_corpus2
done
xvfb-run -a -s "-screen 0 1280x1024x24" kritarunner -s gen_corpus3
for n in d14-float-rgba16-g10 d14-float-rgba32-g10 d14-float-gray16 d14-float-gray32 d14-float-rgba16-srgbtrc d14-float-rgba32-srgbtrc \
  d14-float-rgba16-alpha d14-float-rgba32-alpha d14-float-gray16-alpha d14-float-gray32-alpha; do
  KRA_ONLY=$n xvfb-run -a -s "-screen 0 1280x1024x24" kritarunner -s gen_corpus4
done
xvfb-run -a -s "-screen 0 1280x1024x24" kritarunner -s gen_names
```

읽기와 대조:

```bash
pnpm exec tsx tests/corpus/formats/krita-oracle/dump-importer.mts "$KRA_OUT" "$KRA_WORK/dump"
python3 -I tests/corpus/formats/krita-oracle/compare_importer.py "$KRA_OUT" "$KRA_WORK/dump"
```

기대 출력은 `ALL MATCH`다. 불일치가 있으면 `PROBLEM` 줄로 레이어와 항목을 알려 주고 종료 코드 1로 끝난다.
`n02`(`..` 구간)·`n03`(탭)은 안전하지 않은 이미지 이름이라 `unsafe-archive-path`로 가져오기가 실패하는 것이 정상이다. 큰따옴표(`n04`)와
앞뒤 공백(`n05`) 이름은 메모리에서 이름으로만 찾는 `memory` 경로 정책에서 읽힌다. 대조 도구는 트리 정답이 없는 `n` 문서들을 검사하지 않는다
(Python `zipfile`은 Krita의 UTF-8 플래그 없는 한글 이름을 읽지 못한다). 이름 정책은 단위 테스트(`kra-document.test.ts`)가 같은 종류의 이름을
합성 문서로 검사한다.

알려진 정답 벡터를 다시 만들려면(Krita가 다른 타일을 쓰는 버전에서 검증을 갱신할 때):

```bash
python3 -I tests/corpus/formats/krita-oracle/export_vectors.py "$KRA_OUT" tests/corpus/formats/kra-real-tile-vectors.ts
```

## 한계

- 5.2.2 한 버전만 관찰했다. 다른 버전의 차이는 모른다.
- CMYK, Lab, XYZ, YCbCr 문서는 코퍼스에 있지만 코덱이 픽셀을 환원하지 않으므로(ICC 색 변환이 필요하다) 대조는 "건너뜀 + `unsupported` 진단 확인"까지만 한다.
- 실수형은 Krita가 한 가지 값(`pixelData`)만 읽어 줄 뿐 8비트 변환을 직접 해 주지 않아서(색 공간 변환 API가 이 환경에서 비정상 종료했다), 8비트 정답은 합성 이미지(`mergedimage.png`)에서 얻고 그 비교는 1단계 이내로 한다.
- 합성 문서만 쓴다. 사용자의 실제 `.kra`는 `tests/corpus/formats/local-samples/`에 두고 `tests/format-gateway/local-samples-corpus.test.ts`로 구조만 검사한다.
