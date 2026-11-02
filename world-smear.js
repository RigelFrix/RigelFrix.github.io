/* Mesh-Smearing Handler (world-smear.js)
   Implements the Godot "Mesh smearing" technique by celyk:
   https://godotshaders.com/shader/mesh-smearing/#main
     lag_transform = lag_transform.interpolate_with(global_transform, weight * delta)
     float t = pow(texture(noise, UV * 5.0).x, 6.5) * 2.0;
     MODELVIEW_MATRIX = MODEL_MATRIX + (lag_transform - MODEL_MATRIX) * t;
   Adapted for Three.js SkinnedMesh (`assets/models/boss.glb`):
   - Maintains lagging bone transforms (`uLagBoneTexture`) and mid-arc bone transforms (`uMidBoneTexture`)
     that smoothly slerp toward the current skeleton pose (`lagQuat.slerp(currQuat, 1 - exp(-weight * dt))`).
   - Evaluates continuous 3D gradient noise on the vertex's bind-pose position (`restPos`) so the smear
     is 100% seam-free and watertight across UV islands.
   - Interpolates each vertex along the curved Quadratic Bezier swing arc `(posCurr -> posMid -> posLag)`
     by `t = pow(noise, power) * stretch`, so the smear forms cleanly out of the right claw/arm mesh during
     the swing and settles smoothly back into the mesh as `lag_transform` catches up. */

import * as THREE from "three";

const SMEAR_SKINNING_PARS_GLSL = /* glsl */ `
#ifdef USE_SKINNING
  uniform highp sampler2D uMidBoneTexture;
  uniform highp sampler2D uLagBoneTexture;
  uniform float uSmearNoiseScale;
  uniform float uSmearNoisePower;
  uniform float uSmearStretch;
  uniform float uSmearArmSide;

  mat4 getSmearBoneMatrix( highp sampler2D tex, const in float i ) {
    int size = textureSize( tex, 0 ).x;
    int j = int( i ) * 4;
    int x = j % size;
    int y = j / size;
    vec4 v1 = texelFetch( tex, ivec2( x, y ), 0 );
    vec4 v2 = texelFetch( tex, ivec2( x + 1, y ), 0 );
    vec4 v3 = texelFetch( tex, ivec2( x + 2, y ), 0 );
    vec4 v4 = texelFetch( tex, ivec2( x + 3, y ), 0 );
    return mat4( v1, v2, v3, v4 );
  }

  /* Bone indices in assets/models/boss.glb:
     10 = RightShoulder, 11 = RightArm, 12 = RightForeArm, 13 = RightHand */
  float getArmBoneMask( const in float idx ) {
    int b = int( idx + 0.5 );
    if ( uSmearArmSide > 0.5 ) {
      if ( b == 13 ) return 1.0;
      if ( b == 12 ) return 0.86;
      if ( b == 11 ) return 0.44;
      if ( b == 10 ) return 0.12;
      return 0.0;
    } else if ( uSmearArmSide < -0.5 ) {
      if ( b == 9 ) return 1.0;
      if ( b == 8 ) return 0.86;
      if ( b == 7 ) return 0.44;
      if ( b == 6 ) return 0.12;
      return 0.0;
    }
    if ( b == 9 || b == 13 ) return 1.0;
    if ( b == 8 || b == 12 ) return 0.86;
    if ( b == 7 || b == 11 ) return 0.44;
    if ( b == 6 || b == 10 ) return 0.12;
    return 0.0;
  }

  vec3 smearHash3( vec3 p ) {
    p = vec3(
      dot( p, vec3( 127.1, 311.7, 74.7 ) ),
      dot( p, vec3( 269.5, 183.3, 246.1 ) ),
      dot( p, vec3( 113.5, 271.9, 124.6 ) )
    );
    return -1.0 + 2.0 * fract( sin( p ) * 43758.5453123 );
  }

  float smearGradNoise3D( vec3 p ) {
    vec3 i = floor( p );
    vec3 f = fract( p );
    vec3 u = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix(
        mix( dot( smearHash3( i + vec3( 0.0, 0.0, 0.0 ) ), f - vec3( 0.0, 0.0, 0.0 ) ),
             dot( smearHash3( i + vec3( 1.0, 0.0, 0.0 ) ), f - vec3( 1.0, 0.0, 0.0 ) ), u.x ),
        mix( dot( smearHash3( i + vec3( 0.0, 1.0, 0.0 ) ), f - vec3( 0.0, 1.0, 0.0 ) ),
             dot( smearHash3( i + vec3( 1.0, 1.0, 0.0 ) ), f - vec3( 1.0, 1.0, 0.0 ) ), u.x ),
        u.y
      ),
      mix(
        mix( dot( smearHash3( i + vec3( 0.0, 0.0, 1.0 ) ), f - vec3( 0.0, 0.0, 1.0 ) ),
             dot( smearHash3( i + vec3( 1.0, 0.0, 1.0 ) ), f - vec3( 1.0, 0.0, 1.0 ) ), u.x ),
        mix( dot( smearHash3( i + vec3( 0.0, 1.0, 1.0 ) ), f - vec3( 0.0, 1.0, 1.0 ) ),
             dot( smearHash3( i + vec3( 1.0, 1.0, 1.0 ) ), f - vec3( 1.0, 1.0, 1.0 ) ), u.x ),
        u.y
      ),
      u.z
    );
  }

  float smearFbm( vec3 p ) {
    float v = 0.5 + 0.5 * smearGradNoise3D( p );
    v = 0.68 * v + 0.32 * ( 0.5 + 0.5 * smearGradNoise3D( p * 2.07 + vec3( 13.7, 29.3, 7.1 ) ) );
    /* Normalize noise range so valleys sit at 0.0 and ridges reach 1.0 before pow(n, power) */
    return smoothstep( 0.22, 0.76, v );
  }
#endif
`;

const SMEAR_SKINNING_VERTEX_GLSL = /* glsl */ `
  float smearTVal = 0.0;
#ifdef USE_SKINNING
  vec3 restPos = transformed;
  vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
  mat4 currSkinMat =
    boneMatX * skinWeight.x +
    boneMatY * skinWeight.y +
    boneMatZ * skinWeight.z +
    boneMatW * skinWeight.w;
  vec4 skinned = currSkinMat * skinVertex;

  /* Smooth right-arm & claw mask from skin weights (bones 10..13) + bind-pose distal gradient */
  float boneArmMask =
    getArmBoneMask( skinIndex.x ) * skinWeight.x +
    getArmBoneMask( skinIndex.y ) * skinWeight.y +
    getArmBoneMask( skinIndex.z ) * skinWeight.z +
    getArmBoneMask( skinIndex.w ) * skinWeight.w;
  float distalBoost = 0.60 + 0.40 * ( 1.0 - smoothstep( 0.22, 0.66, restPos.y ) );
  float handMask = clamp( boneArmMask * distalBoost, 0.0, 1.0 );
  if ( ( uSmearArmSide > 0.5 && restPos.x > 0.05 ) || ( uSmearArmSide < -0.5 && restPos.x < -0.05 ) ) handMask = 0.0;

  if ( uSmearStretch > 0.001 && handMask > 0.001 ) {
    mat4 midMatX = getSmearBoneMatrix( uMidBoneTexture, skinIndex.x );
    mat4 midMatY = getSmearBoneMatrix( uMidBoneTexture, skinIndex.y );
    mat4 midMatZ = getSmearBoneMatrix( uMidBoneTexture, skinIndex.z );
    mat4 midMatW = getSmearBoneMatrix( uMidBoneTexture, skinIndex.w );
    vec4 skinnedMid = (
      midMatX * skinWeight.x +
      midMatY * skinWeight.y +
      midMatZ * skinWeight.z +
      midMatW * skinWeight.w
    ) * skinVertex;

    mat4 lagMatX = getSmearBoneMatrix( uLagBoneTexture, skinIndex.x );
    mat4 lagMatY = getSmearBoneMatrix( uLagBoneTexture, skinIndex.y );
    mat4 lagMatZ = getSmearBoneMatrix( uLagBoneTexture, skinIndex.z );
    mat4 lagMatW = getSmearBoneMatrix( uLagBoneTexture, skinIndex.w );
    vec4 skinnedLag = (
      lagMatX * skinWeight.x +
      lagMatY * skinWeight.y +
      lagMatZ * skinWeight.z +
      lagMatW * skinWeight.w
    ) * skinVertex;

    vec3 wakeVec = skinnedLag.xyz - skinned.xyz;
    float wakeLen = length( wakeVec );
    if ( wakeLen > 0.0005 ) {
      vec3 wakeDir = wakeVec / wakeLen;
      /* Cross-sectional outward normal around the A-pose right arm/claw centerline,
         rotated by currSkinMat so the trailing half of the claw/forearm stretches back
         along the swing arc while the leading front face stays crisp and intact. */
      float yFrac = clamp( ( restPos.y - 0.20 ) / 0.52, 0.0, 1.0 );
      float armSign = restPos.x >= 0.0 ? 1.0 : -1.0;
      float armCenterX = armSign * mix( 0.382, 0.24, yFrac );
      float armCenterZ = mix( 0.072, -0.03, clamp( ( restPos.y - 0.28 ) / 0.28, 0.0, 1.0 ) );
      vec3 cylNormalBind = normalize( vec3( ( restPos.x - armCenterX ) * 0.65, 0.0, restPos.z - armCenterZ ) );
      vec3 cylNormalWS = normalize( mat3( currSkinMat ) * cylNormalBind );
      float trailAlign = smoothstep( -0.38, 0.35, dot( cylNormalWS, wakeDir ) );

      /* Godot mesh-smearing formula:
         float t = pow(texture(noise, UV * 5.0).x, 6.5) * 2.0;
         Evaluated on 3D bind-pose restPos with a cohesive trailing base plus fine longitudinal streaks
         so the smear forms a smooth, unified arc on the claw/forearm and settles cleanly onto the mesh. */
      vec3 noisePos = vec3(
        restPos.x * uSmearNoiseScale * 1.35,
        restPos.y * uSmearNoiseScale * 0.55,
        restPos.z * uSmearNoiseScale * 1.35
      );
      float n = smearFbm( noisePos );
      float streakProfile = 0.24 + 0.86 * pow( n, uSmearNoisePower );
      float t = streakProfile * uSmearStretch * handMask * trailAlign;
      t = clamp( t, 0.0, 1.32 );

      /* Quadratic Bezier interpolation through skinned (t=0), skinnedMid (t=0.5), skinnedLag (t=1.0)
         so the smear curves smoothly along the circular swing arc of the arm and claw! */
      vec3 ctrl = 2.0 * skinnedMid.xyz - 0.5 * ( skinned.xyz + skinnedLag.xyz );
      float u = 1.0 - t;
      vec3 arcWS = u * u * skinned.xyz + 2.0 * u * t * ctrl + t * t * skinnedLag.xyz;
      skinned.xyz = arcWS;
      smearTVal = clamp( t * clamp( wakeLen * 4.5, 0.0, 1.0 ), 0.0, 1.0 );
    }
  }
  transformed = ( bindMatrixInverse * skinned ).xyz;
#endif
`;

export function createSmearHandler(options = {}) {
  const config = {
    weight: options.weight ?? 8.0, /* Godot lag_transform interpolation weight */
    noiseScale: options.noiseScale ?? 34.0,
    noisePower: options.noisePower ?? 2.4,
    stretch: options.stretch ?? 1.45,
  };

  /* Fallback 16x16 DataTextures until the skeleton is bound */
  const makeBoneTex = (size) => {
    const data = new Float32Array(size * size * 4);
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    return { data, tex };
  };
  let midBuf = makeBoneTex(16);
  let lagBuf = makeBoneTex(16);

  const uniforms = {
    uMidBoneTexture: { value: midBuf.tex },
    uLagBoneTexture: { value: lagBuf.tex },
    uSmearNoiseScale: { value: config.noiseScale },
    uSmearNoisePower: { value: config.noisePower },
    uSmearStretch: { value: 0 },
    uSmearArmSide: { value: 0.0 }, /* 1.0 = right arm only, -1.0 = left arm only, 0.0 = both */
  };

  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depthMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <skinning_pars_vertex>", `#include <skinning_pars_vertex>\n${SMEAR_SKINNING_PARS_GLSL}`)
      .replace("#include <skinning_vertex>", SMEAR_SKINNING_VERTEX_GLSL);
  };
  depthMaterial.customProgramCacheKey = () => "godot-mesh-smear-depth";

  const enhanceMaterial = (material) => {
    const prev = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey?.() || "soft-toon";
    material.onBeforeCompile = (shader, renderer) => {
      prev?.(shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <skinning_pars_vertex>",
          `#include <skinning_pars_vertex>\n${SMEAR_SKINNING_PARS_GLSL}\nvarying float vSmearT;`,
        )
        .replace(
          "#include <skinning_vertex>",
          `${SMEAR_SKINNING_VERTEX_GLSL}\nvSmearT = smearTVal;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vSmearT;")
        .replace(
          "#include <opaque_fragment>",
          [
            "if (vSmearT > 0.01) {",
            "  /* Subtle ember ridge highlight so the volcanic claw's mesh-smear spikes read clearly */",
            "  float ridge = smoothstep(0.08, 0.78, vSmearT);",
            "  outgoingLight = mix(outgoingLight, outgoingLight * 1.14 + vec3(0.28, 0.09, 0.02), ridge * 0.68);",
            "}",
            "#include <opaque_fragment>",
          ].join("\n"),
        );
    };
    material.customProgramCacheKey = () => `${baseKey}-godot-mesh-smear`;
    return material;
  };

  let boundSkeleton = null;
  let boundRoot = null;
  let boneWeights = [];
  let currPos = [];
  let currQuat = [];
  let currScale = [];
  let lagPos = [];
  let lagQuat = [];
  let lagScale = [];
  let initialized = false;
  let handBoneIdx = -1;
  let lastLagDistance = 0;
  const tmpOffsetMat = new THREE.Matrix4();
  const tmpCurrHandWS = new THREE.Vector3();
  const tmpLagHandWS = new THREE.Vector3();

  const bindSkeleton = (skeleton, rootGroup) => {
    boundSkeleton = skeleton;
    boundRoot = rootGroup;
    skeleton.computeBoneTexture();
    const size = skeleton.boneTexture.image.width;
    midBuf = makeBoneTex(size);
    lagBuf = makeBoneTex(size);
    uniforms.uMidBoneTexture.value = midBuf.tex;
    uniforms.uLagBoneTexture.value = lagBuf.tex;

    const count = skeleton.bones.length;
    boneWeights = new Array(count).fill(100);
    currPos = new Array(count);
    currQuat = new Array(count);
    currScale = new Array(count);
    lagPos = new Array(count);
    lagQuat = new Array(count);
    lagScale = new Array(count);
    handBoneIdx = -1;

    for (let i = 0; i < count; i += 1) {
      const b = skeleton.bones[i];
      const name = b.name.replace(/^mixamorig\d*:?/, "");
      currPos[i] = b.position.clone();
      currQuat[i] = b.quaternion.clone();
      currScale[i] = b.scale.clone();
      lagPos[i] = b.position.clone();
      lagQuat[i] = b.quaternion.clone();
      lagScale[i] = b.scale.clone();
      if (name === "RightHand") handBoneIdx = i;

      /* Only the right arm chain + upper spine twist lag behind; legs/hips/left arm stay at 0 */
      if (/^(Right|Left)(Shoulder|Arm|ForeArm|Hand)/.test(name)) {
        boneWeights[i] = 1.0; /* uses config.weight directly */
      } else if (name === "Spine1" || name === "Spine2") {
        boneWeights[i] = 1.85; /* subtle upper-torso arc follow */
      } else {
        boneWeights[i] = 0; /* 0 means snap immediately to current pose */
      }
    }
    initialized = false;
  };

  const writeBoneMatricesTo = (targetArray) => {
    const bones = boundSkeleton.bones;
    const inverses = boundSkeleton.boneInverses;
    for (let i = 0; i < bones.length; i += 1) {
      tmpOffsetMat.multiplyMatrices(bones[i].matrixWorld, inverses[i]);
      tmpOffsetMat.toArray(targetArray, i * 16);
    }
  };

  const reset = () => {
    if (!boundSkeleton) return;
    const bones = boundSkeleton.bones;
    for (let i = 0; i < bones.length; i += 1) {
      currPos[i].copy(bones[i].position);
      currQuat[i].copy(bones[i].quaternion);
      currScale[i].copy(bones[i].scale);
      lagPos[i].copy(bones[i].position);
      lagQuat[i].copy(bones[i].quaternion);
      lagScale[i].copy(bones[i].scale);
    }
    boundRoot?.updateMatrixWorld(true);
    writeBoneMatricesTo(midBuf.data);
    writeBoneMatricesTo(lagBuf.data);
    midBuf.tex.needsUpdate = true;
    lagBuf.tex.needsUpdate = true;
    uniforms.uSmearStretch.value = 0;
    lastLagDistance = 0;
    initialized = true;
  };

  /* Advance lag_transform = lag_transform.interpolate_with(global_transform, weight * dt)
     and populate uMidBoneTexture (slerp 0.5) and uLagBoneTexture (slerp 1.0). */
  const stepLag = (dt, weightOverride = null, stretchScale = 1.0, armSide = 0.0) => {
    if (!boundSkeleton || !boundRoot) return;
    if (stretchScale <= 0.001) {
      reset();
      return;
    }
    const bones = boundSkeleton.bones;
    if (!initialized) {
      reset();
    }
    uniforms.uSmearStretch.value = config.stretch * stretchScale;
    uniforms.uSmearArmSide.value = armSide;
    const baseWeight = weightOverride ?? config.weight;
    for (let i = 0; i < bones.length; i += 1) {
      currPos[i].copy(bones[i].position);
      currQuat[i].copy(bones[i].quaternion);
      currScale[i].copy(bones[i].scale);
      const mult = boneWeights[i];
      const isRightArmBone = i >= 10 && i <= 13;
      const isLeftArmBone = i >= 6 && i <= 9;
      const isIgnoredArm = (armSide > 0.5 && isLeftArmBone) || (armSide < -0.5 && isRightArmBone);
      if (mult <= 0 || dt <= 0 || isIgnoredArm) {
        lagPos[i].copy(currPos[i]);
        lagQuat[i].copy(currQuat[i]);
        lagScale[i].copy(currScale[i]);
      } else {
        const alpha = 1 - Math.exp(-(baseWeight * mult) * dt);
        lagPos[i].lerp(currPos[i], alpha);
        lagQuat[i].slerp(currQuat[i], alpha);
        lagScale[i].lerp(currScale[i], alpha);
      }
    }

    if (handBoneIdx >= 0) {
      bones[handBoneIdx].getWorldPosition(tmpCurrHandWS);
    }

    /* 1. Compute uLagBoneTexture at lagQuat */
    for (let i = 0; i < bones.length; i += 1) {
      bones[i].position.copy(lagPos[i]);
      bones[i].quaternion.copy(lagQuat[i]);
      bones[i].scale.copy(lagScale[i]);
    }
    boundRoot.updateMatrixWorld(true);
    writeBoneMatricesTo(lagBuf.data);
    lagBuf.tex.needsUpdate = true;
    if (handBoneIdx >= 0) {
      bones[handBoneIdx].getWorldPosition(tmpLagHandWS);
      lastLagDistance = tmpCurrHandWS.distanceTo(tmpLagHandWS);
    }

    /* 2. Compute uMidBoneTexture halfway along the rotational arc (slerp 0.5) */
    for (let i = 0; i < bones.length; i += 1) {
      bones[i].position.copy(lagPos[i]).lerp(currPos[i], 0.5);
      bones[i].quaternion.copy(lagQuat[i]).slerp(currQuat[i], 0.5);
      bones[i].scale.copy(lagScale[i]).lerp(currScale[i], 0.5);
    }
    boundRoot.updateMatrixWorld(true);
    writeBoneMatricesTo(midBuf.data);
    midBuf.tex.needsUpdate = true;

    /* 3. Restore current skeleton pose */
    for (let i = 0; i < bones.length; i += 1) {
      bones[i].position.copy(currPos[i]);
      bones[i].quaternion.copy(currQuat[i]);
      bones[i].scale.copy(currScale[i]);
    }
    boundRoot.updateMatrixWorld(true);
  };

  return {
    uniforms,
    depthMaterial,
    enhanceMaterial,
    bindSkeleton,
    reset,
    stepLag,
    getLagDistance: () => +lastLagDistance.toFixed(3),
  };
}
