// 패스 셰이더 공용: 8비트 출력을 안전하게 보존하는 오프셋 코딩.
// 실측(diag-encode): GL Compatibility 의 3D 출력은 8비트 값이 약 64 이상이면 그대로 읽히지만 그 아래는 눌린다
// (SwiftShader 소프트웨어 GL 기준: 16 -> 12, 8 -> 1, 6 이하 -> 0). 그래서 모든 패스 값을 [64, 255] 구간의 191 단계로 코딩한다.
const float CODE_BASE = 64.0;
const float CODE_STEPS = 191.0;

// u in [0,1] -> 8비트 코드의 [0,1] 표현(= 바이트 / 255)
vec3 encode_unit(vec3 u) {
	return (vec3(CODE_BASE) + floor(clamp(u, 0.0, 1.0) * CODE_STEPS + 0.5)) / 255.0;
}

// 정수 자릿수(0..191) -> 바이트/255
float encode_digit(float digit) {
	return (CODE_BASE + digit) / 255.0;
}
