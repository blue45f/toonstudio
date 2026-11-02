# 플라스티신 원본 비교 준비 기록 — 2026-11-02

상태: **원본 파일 지문·헤더 확인과 비교 도구 준비까지 완료. 실제 픽셀 비교·신규 재질 등록은 미실행.**

이 PR은 준비된 작업을 검토 가능한 형태로 보존한다. 기존 재질 카탈로그·런타임·원본 PNG·배포 설정의 변경은 포함하지 않는다.

## 확인한 원본

구매 재질은 11종·변형 19개·고유 PNG 59개다. 무료 팩 `cbv1-072-free-plasticine-pbr-material`의 세 파일은 현재 59개의 파일 SHA와 일치하지 않았다.

| 무료 원본 | 바이트 | SHA-256 |
| --- | ---: | --- |
| `Plasticine_08_8K_BaseColor.png` | 24,318,276 | `cda3c194b5a6a5e880a32671d7f890b628af04aae8aa6bae302fd5bdb9db4d65` |
| `Plasticine_08_8K_Normal.png` | 146,561,439 | `a146a29d251d5e002d29ad045bb5b84eb6afd8d8e304586c38b8be084f144887` |
| `Plasticine_08_8K_Roughness.png` | 6,749,307 | `0d6cf32ea8d7c4567736711c2e6cb30b37968819d8b28bd68ffb49899069d64d` |

세 파일은 헤더 기준 8192×8192·8비트·비인터레이스이며 IHDR CRC가 일치했다. BaseColor·Normal은 RGB, Roughness는 grayscale이다. 지문은 1MiB 스트리밍으로 확인했고 검사 전후 파일 정보가 일치했다. 파일 차이를 픽셀·외관 차이로 확대하지 않는다.

## 비교 도구

`scripts/compare-studio-plasticine-source-pixels.py`는 로컬 계획의 여섯 원본을 한 장씩 처리하는 준비 도구다. macOS/Linux의 Python과 Pillow가 필요하다. 준비 환경의 Pillow는 13.0.0이며 이 PR에서 실제 원본 디코딩을 완료하지 않았다.

- 원본 SHA와 검사 전후 파일 정보를 대조하고 Pillow `verify()`·디코딩을 수행한다.
- 원본 모드와 8192×8192를 유지하며 64행 타일로 전체 픽셀의 지문을 계산한다. 리사이즈·이미지 저장은 하지 않는다.
- RGB와 roughness의 G 채널을 비교하고 ICC·gamma·sRGB 메타데이터는 별도로 기록한다.
- 내부 55초 alarm을 사용한다. RSS 768MiB 판정은 이미지 처리 후 고수위 관측이며 하드 메모리 제한이 아니다. 공유 호스트의 기존 외부 자원 감시는 유지해야 한다.
- `status: passed`는 비교 절차 완료다. 이미지가 달라도 절차는 통과할 수 있다. 중복 여부는 채널별 `sameDecodedRaw`, `sameChannelSamples`, `sameColorMetadata`를 읽는다.
- `renderEquivalentProven`은 항상 `false`이며 픽셀 일치를 렌더 동등성으로 집계하지 않는다.

## 로컬 입력과 실행

사용자 절대 경로·파일 정보가 포함된 입력 계획과 결과는 Git에 넣지 않는다. 로컬 `.qa/` 같은 제외 경로에서 관리한다. 이 초안에는 계획 생성 자동화를 포함하지 않는다.

계획의 필수 필드는 다음과 같다.

| 필드 | 값 |
| --- | --- |
| `catalogPath`, `catalogSha256` | 비교 시 사용할 생성 카탈로그의 경로와 원문 지문 |
| `observedRssCeilingBytes` | `805306368` |
| `inputs` | free·paid 각각 baseColor·normal·roughness, 총 6개 |
| 각 입력 | `family`, `channel`, `path`, `sha256`, `metadata` |
| `metadata` | 실제 lstat의 `bytes`, `mode`, `mtimeNs`, `inode`, `device`, `nlink` |

`--execute`가 없으면 준비 상태만 출력한다. 실제 비교는 자원 사용 순서를 맞춘 뒤 명시적으로 실행하며 기존 결과를 덮어쓰지 않는다.

```sh
python3 scripts/compare-studio-plasticine-source-pixels.py --plan .qa/plasticine-compare/plan.json --output .qa/plasticine-compare/result.json
python3 scripts/compare-studio-plasticine-source-pixels.py --plan .qa/plasticine-compare/plan.json --output .qa/plasticine-compare/result.json --execute
```

## 미완료 범위

- 실제 여섯 원본의 디코딩·픽셀 비교와 브라우저 외관 비교
- 무료 팩의 별도 출처·권리 근거를 보존한 서비스 재질 등록
- 노멀맵 채널 규약 확인, 생성기·선택기·런타임 변경과 회귀 검증

현재 생성기는 구매 65개 논리 맵과 native-8k·godot-2k 두 변형에 고정돼 있다. 선택기는 native 외의 변형을 Godot 2K로 표시하며 런타임은 normal을 GL로 연결한다. 무료 원본을 단순 추가하거나 기존 구매 출처를 재사용한 것으로 처리하지 않는다.

Unity 공식 문서는 Y+ 노멀맵과 다른 규약에 대한 green 채널 반전을 설명한다. 일반 규약만으로 특정 원본의 방향을 확정하지 않는다. [Unity 노멀맵 문서](https://docs.unity3d.com/6000.1/Documentation/Manual/StandardShaderMaterialParameterNormalMap.html).

이 PR은 미실행 검증을 남긴 초안이다. 기존 완료 검증에 새 필수조건을 추가하지 않으며 운영 배포는 수행하지 않는다.
