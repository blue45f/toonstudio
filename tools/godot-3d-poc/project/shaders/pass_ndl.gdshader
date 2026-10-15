shader_type spatial;
// 톤 패스의 원천: 뷰 공간 법선과 주광 방향의 내적(0..1)을 191 단계 코드의 회색으로 기록한다. 스크린톤 점은 2D 후처리가 만든다.
render_mode unshaded, cull_back, depth_draw_opaque;
#include "res://shaders/pass_common.gdshaderinc"

uniform vec3 to_light_view = vec3(0.0, 0.0, 1.0);

void fragment() {
	float ndl = clamp(dot(normalize(NORMAL), normalize(to_light_view)), 0.0, 1.0);
	ALBEDO = encode_unit(vec3(ndl));
}
