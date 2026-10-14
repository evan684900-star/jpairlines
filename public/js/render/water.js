// Eau : reflets du ciel, vagues, transparence.
import * as THREE from 'three';

// ================= Eau =================
export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 },
      tNormal: { value: null },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(1, 1, 1) },
      skyZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
      skyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
      deepColor: { value: new THREE.Color(0.012, 0.06, 0.09) },
      shallowColor: { value: new THREE.Color(0.03, 0.2, 0.22) },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float time;
      uniform sampler2D tNormal;
      uniform vec3 sunDir, sunColor, skyZenith, skyHorizon, deepColor, shallowColor;
      varying vec3 vWPos;
      vec3 sampleN(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
      void main() {
        vec2 p = vWPos.xz;
        float dist = length(cameraPosition - vWPos);
        vec3 n1 = sampleN(p / 38.0 + time * vec2(0.012, 0.008));
        vec3 n2 = sampleN(p / 17.0 + time * vec2(-0.01, 0.015));
        vec3 n3 = sampleN(p / 260.0 + time * vec2(0.003, -0.002));
        vec2 slope = (n1.xy + n2.xy * 0.6) * (1.0 - smoothstep(800.0, 6000.0, dist)) + n3.xy * 0.8;
        vec3 n = normalize(vec3(slope.x * 0.35, 1.0, slope.y * 0.35));
        vec3 v = normalize(cameraPosition - vWPos);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 sky = mix(skyHorizon, skyZenith, pow(clamp(r.y, 0.0, 1.0), 0.45));
        float sun = pow(max(dot(r, sunDir), 0.0), 900.0) * 60.0 + pow(max(dot(r, sunDir), 0.0), 60.0) * 0.4;
        vec3 body = mix(shallowColor, deepColor, clamp(dist / 4000.0 + 0.4, 0.0, 1.0)) * (0.4 + 0.6 * max(sunDir.y, 0.1));
        vec3 col = mix(body, sky, fres) + sunColor * sun;
        float alpha = mix(0.82, 1.0, clamp(fres * 2.5 + dist / 3000.0, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
