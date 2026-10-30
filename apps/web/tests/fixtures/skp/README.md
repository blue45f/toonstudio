# 자체 제작 SKP 카메라 회귀 입력

`native-camera-golden.skp`는 2026-10-29에 ToonStudio 개발용으로 직접 만든 장기 테스트 입력이다. 공식 SketchUp C API 15.0의 `SUModelCreate`로 빈 모델부터 생성했고, 저장한 파일을 SDK로 다시 열어 카메라 값을 확인했다. 외부 원본 template의 도형·카메라를 복사하지 않았다. SDK·앱·원본 template 바이너리는 이 corpus에 포함하지 않는다. 테스트 실행에는 SDK나 개인 `/private/tmp` 실험 폴더가 필요하지 않다.

- 파일: 5,377 bytes, SHA-256 `dd4fdf607bc04de725b98b8c5c40daf7d37cea4232986870b6f3c5541a8f737e`
- 도형: 원점에서 X/Y 방향으로 각각 100 inch인 삼각형 한 면. 변환 후 각 직각변은 2.54 m다.
- Scene: 세로 FOV 35°·가로 FOV 35°·평행 높이 144 inch, 각 aspect 1.5. eye는 `[0,0,500]`, target은 `[10,20,30]` inch다. 입력 up `[0,0,1]`은 SDK가 정규화한 실제 getter 값도 함께 기록했다.

`native-camera-golden.expected.json`은 입력 해시·제작 출처·SDK 저장/재읽기로 확인한 활성 투영 필드의 정답과 파서의 지원 한계를 구분한다. 원근의 `FOVIsHeight`는 서로 다르게 보존됐고 aspect 1.5도 SDK로 확인했지만, OpenSKP 1.3.0은 두 필드를 노출하지 않는다. 따라서 manifest의 `fovBasis: not-exposed`와 관련 진단을 검증하며 원근 FOV를 임의로 세로 기준으로 해석하지 않는다. 비활성 투영 getter의 `SU_ERROR_NO_DATA(9)` 값은 정답으로 인증하지 않는다.

이 입력은 파일 형식·좌표·metadata 전달 회귀용이며 SketchUp UI의 렌더 이미지 동등성이나 meter-display 옵션을 보증하지 않는다. 입력을 바꿀 때는 새 파일을 직접 제작하고 SDK 저장/재읽기 결과·해시·expected를 함께 갱신한다. 기존 실험의 loader timeout/저장 실패와 이번 성공은 별도 결과다.
