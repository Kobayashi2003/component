export const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

#define MAX_LIGHTS 5

uniform vec2 u_resolution;
uniform int u_geometry;
uniform int u_renderMode;
uniform int u_lightCount;
uniform float u_scale;
uniform vec4 u_orientation;
uniform vec2 u_lightPositions[MAX_LIGHTS];
uniform vec3 u_lightColors[MAX_LIGHTS];
uniform float u_lightIntensities[MAX_LIGHTS];
uniform float u_lightRadii[MAX_LIGHTS];
uniform float u_roughness;
uniform float u_metallic;
uniform float u_ambient;
uniform float u_exposure;

in vec2 v_uv;
out vec4 outColor;

vec3 rotateByQuaternion(vec3 point, vec4 quaternion) {
  return point + 2.0 * cross(
    quaternion.xyz,
    cross(quaternion.xyz, point) + quaternion.w * point
  );
}

float sdSphere(vec3 point) {
  return length(point) - 1.08;
}

float sdBox(vec3 point) {
  vec3 q = abs(point) - vec3(0.82);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.055;
}

float sdTorus(vec3 point) {
  vec2 q = vec2(length(point.xz) - 0.78, point.y);
  return length(q) - 0.31;
}

float sceneDistance(vec3 point) {
  float scale = max(u_scale, 0.01);
  vec3 localPoint = point / scale;
  vec4 inverseOrientation = vec4(-u_orientation.xyz, u_orientation.w);
  localPoint = rotateByQuaternion(localPoint, inverseOrientation);

  if (u_geometry == 1) return sdBox(localPoint) * scale;
  if (u_geometry == 2) return sdTorus(localPoint) * scale;
  return sdSphere(localPoint) * scale;
}

vec3 surfaceNormal(vec3 point) {
  const float epsilon = 0.0015;
  vec2 offset = vec2(epsilon, 0.0);
  return normalize(vec3(
    sceneDistance(point + offset.xyy) - sceneDistance(point - offset.xyy),
    sceneDistance(point + offset.yxy) - sceneDistance(point - offset.yxy),
    sceneDistance(point + offset.yyx) - sceneDistance(point - offset.yyx)
  ));
}

bool raymarch(vec3 origin, vec3 direction, out vec3 hitPoint) {
  float travelled = 0.0;
  for (int step = 0; step < 96; step++) {
    hitPoint = origin + direction * travelled;
    float distanceToSurface = sceneDistance(hitPoint);
    if (distanceToSurface < 0.0015) return true;
    travelled += distanceToSurface * 0.82;
    if (travelled > 8.0) break;
  }
  return false;
}

vec3 background(vec2 coordinate) {
  float vignette = 1.0 - smoothstep(0.25, 1.1, length(coordinate));
  float horizon = smoothstep(-0.9, 0.75, coordinate.y) * 0.014;
  return vec3(0.012, 0.014, 0.018) + vec3(0.020, 0.024, 0.032) * vignette + horizon;
}

void main() {
  vec2 coordinate = v_uv * 2.0 - 1.0;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  coordinate.x *= aspect;

  vec3 origin = vec3(0.0, 0.0, 3.7);
  vec3 direction = normalize(vec3(coordinate * 0.78, -2.35));
  vec3 hitPoint;

  if (!raymarch(origin, direction, hitPoint)) {
    outColor = vec4(background(coordinate), 1.0);
    return;
  }

  vec3 normal = surfaceNormal(hitPoint);
  vec3 viewDirection = normalize(origin - hitPoint);
  vec3 baseColor = vec3(0.72, 0.75, 0.78);
  vec3 diffuseColor = vec3(0.0);
  vec3 specularColor = vec3(0.0);

  for (int index = 0; index < MAX_LIGHTS; index++) {
    if (index >= u_lightCount) break;

    vec2 lightScreen = u_lightPositions[index] * 2.0 - 1.0;
    lightScreen.x *= aspect;
    vec3 lightPoint = vec3(lightScreen * 2.05, 2.25);
    vec3 toLight = lightPoint - hitPoint;
    float distanceToLight = length(toLight);
    vec3 lightDirection = toLight / max(distanceToLight, 0.001);
    float radius = 1.15 + u_lightRadii[index] * 3.85;
    float attenuation = pow(clamp(1.0 - distanceToLight / radius, 0.0, 1.0), 2.0);
    float energy = u_lightIntensities[index] * attenuation;
    float diffuse = max(dot(normal, lightDirection), 0.0);
    vec3 halfVector = normalize(lightDirection + viewDirection);
    float gloss = mix(92.0, 7.0, u_roughness);
    float specular = pow(max(dot(normal, halfVector), 0.0), gloss);

    diffuseColor += u_lightColors[index] * diffuse * energy;
    specularColor += u_lightColors[index] * specular * energy * mix(0.48, 1.35, u_metallic);
  }

  if (u_renderMode == 1) {
    outColor = vec4(normal * 0.5 + 0.5, 1.0);
    return;
  }

  vec3 diffusePass = diffuseColor * baseColor;
  vec3 specularPass = specularColor * mix(vec3(0.85), baseColor, u_metallic);

  if (u_renderMode == 2) {
    outColor = vec4(1.0 - exp(-diffusePass * u_exposure), 1.0);
    return;
  }
  if (u_renderMode == 3) {
    outColor = vec4(1.0 - exp(-specularPass * u_exposure), 1.0);
    return;
  }

  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
  vec3 ambient = baseColor * (0.035 + u_ambient * 0.42);
  vec3 finalColor = ambient + diffusePass * mix(1.0, 0.38, u_metallic) + specularPass;
  finalColor += vec3(0.08, 0.095, 0.12) * rim * (0.28 + u_metallic * 0.34);
  finalColor = 1.0 - exp(-finalColor * u_exposure);
  finalColor = pow(finalColor, vec3(0.94));

  outColor = vec4(finalColor, 1.0);
}`
