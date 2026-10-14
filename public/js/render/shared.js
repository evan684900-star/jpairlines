// Uniforms partagés par tous les matériaux du monde, et extensions globales des shaders de three.js :
// - brume atmosphérique : brouillard de fond + couche de brume dense près du sol (intégrée le long du rayon),
//   plus claire et plus chaude en direction du soleil (diffusion) ;
// - ombres des nuages sur tout ce qui reçoit la lumière du soleil (terrain, arbres, bâtiments, avions).
import * as THREE from 'three';

export const U = {
  jpTime: { value: 0 },
  jpSunDir: { value: new THREE.Vector3(0, 1, 0) },
  jpFogSun: { value: new THREE.Color(0, 0, 0) }, // lumière ajoutée à la brume face au soleil
  jpFogHeight: { value: 450 },
  jpFogHeightDensity: { value: 0 },
  jpNight: { value: 0 }, // 0 = plein jour, 1 = nuit noire
  jpWet: { value: 0 }, // sol mouillé (pluie)
  jpCloudMap: { value: null },
  jpCloudMapSize: { value: 96000 },
  jpCloudOffset: { value: new THREE.Vector2() },
  jpCloudCover: { value: 0.5 },
  jpCloudAlt: { value: 2200 },
  jpCloudShadow: { value: 0.75 },
};

// Ajoute les uniforms partagés à un shader (à appeler dans un onBeforeCompile personnalisé)
export function injectShared(shader) {
  Object.assign(shader.uniforms, U);
}

let installed = false;
export function installShaderExtensions() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;

  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = cameraPosition + ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif
`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec3 jpSunDir;
  uniform vec3 jpFogSun;
  uniform float jpFogHeight;
  uniform float jpFogHeightDensity;
  uniform sampler2D jpCloudMap;
  uniform float jpCloudMapSize;
  uniform vec2 jpCloudOffset;
  uniform float jpCloudCover;
  uniform float jpCloudAlt;
  uniform float jpCloudShadow;
  // ombre des nuages : on remonte vers le soleil jusqu'à l'altitude des nuages
  float jpCloudShadowAt( vec3 wp ) {
    if ( jpSunDir.y < 0.02 || wp.y > jpCloudAlt ) return 1.0;
    vec2 p = wp.xz + jpSunDir.xz / jpSunDir.y * ( jpCloudAlt - wp.y );
    vec3 c = texture2D( jpCloudMap, ( p - jpCloudOffset ) / jpCloudMapSize + 0.5 ).rgb;
    float d = jpCloudCover < 0.35 ? c.r * jpCloudCover / 0.35
      : jpCloudCover < 0.65 ? mix( c.r, c.g, ( jpCloudCover - 0.35 ) / 0.3 )
      : mix( c.g, c.b, ( jpCloudCover - 0.65 ) / 0.35 );
    return 1.0 - jpCloudShadow * smoothstep( 0.05, 0.6, d );
  }
#endif
`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    vec3 jpRay = vFogWorld - cameraPosition;
    float jpDist = length( jpRay );
    float jpK = 1.0 / jpFogHeight;
    float jpDy = jpRay.y * jpK;
    float jpCam = exp( - max( cameraPosition.y, -50.0 ) * jpK );
    float jpLayer = abs( jpDy ) > 1e-3 ? jpCam * ( 1.0 - exp( - jpDy ) ) / jpDy : jpCam;
    float jpOptical = fogDensity * fogDensity * jpDist * jpDist + jpFogHeightDensity * jpDist * jpLayer;
    float fogFactor = 1.0 - exp( - jpOptical );
    float jpSunAmt = pow( max( dot( jpRay / max( jpDist, 1.0 ), jpSunDir ), 0.0 ), 6.0 );
    vec3 jpFogCol = fogColor + jpFogSun * jpSunAmt;
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    vec3 jpFogCol = fogColor;
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, jpFogCol, fogFactor );
#endif
`;
  const sunLine = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (!C.lights_fragment_begin.includes(sunLine)) console.warn('three.js : impossible d\'ajouter les ombres des nuages');
  C.lights_fragment_begin = C.lights_fragment_begin.replace(sunLine, `${sunLine}
		#ifdef USE_FOG
		directLight.color *= jpCloudShadowAt( vFogWorld );
		#endif`);

  // Les uniforms partagés sont ajoutés à tous les matériaux (ceux qui n'ont pas leur propre onBeforeCompile)
  THREE.Material.prototype.onBeforeCompile = function onBeforeCompile(shader) { injectShared(shader); };
}
