shader_type spatial;
// 툰 셰이더: 램프(명암 단계) 라이팅 + 림. 사용자 정의 light() 라서 DirectionalLight3D 하나가 기준이다.
// 공식: docs.godotengine.org/en/4.4/tutorials/shaders/shader_reference/spatial_shader.html (light 함수)
render_mode cull_back, depth_draw_opaque;

uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_tex = false;

// 명암 단계 수(2~6)와 경계 부드러움. softness 0 이면 하드 컷이다.
uniform int bands : hint_range(2, 6) = 3;
uniform float softness : hint_range(0.0, 0.2) = 0.02;
uniform vec3 shade_tint : source_color = vec3(0.62, 0.58, 0.78);
uniform float rim_strength : hint_range(0.0, 1.0) = 0.25;
uniform float rim_power : hint_range(0.5, 8.0) = 3.0;

float ramp(float x) {
	float n = float(bands);
	float v = 0.0;
	for (int i = 1; i < 6; i++) {
		if (i >= bands) {
			break;
		}
		float edge = float(i) / n;
		v += smoothstep(edge - softness, edge + softness, x);
	}
	return v / (n - 1.0);
}

void fragment() {
	vec4 base = albedo;
	if (use_tex) {
		base *= texture(albedo_tex, UV);
	}
	ALBEDO = base.rgb;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}

void light() {
	float ndl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION;
	float v = ramp(ndl);
	vec3 tone = mix(shade_tint, vec3(1.0), v);
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), rim_power) * rim_strength * v;
	DIFFUSE_LIGHT += LIGHT_COLOR * (tone + vec3(rim)) / PI;
}
