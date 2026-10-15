shader_type spatial;
// 진단용: 균일한 값을 8비트로 그대로 내보낸다('diag-encode' 가 3D 출력의 전달 함수를 실측하는 데 쓴다).
render_mode unshaded, cull_back, depth_draw_opaque;

uniform float level = 0.5;

void fragment() {
	ALBEDO = vec3(level);
}
