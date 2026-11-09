/* Crafting & tuning One-Punch Man style wispy silk vapor smoke */
import * as THREE from "three";

/**
 * Generates a smooth 3D curling ribbon geometry for a smoke wisp.
 */
export function createWispRibbonGeometry({
  origin = new THREE.Vector3(),
  dir = new THREE.Vector3(1, 0, 0),
  curlAxis = new THREE.Vector3(0, 1, 0),
  length = 1.4,
  maxWidth = 0.22,
  segments = 32,
  curlFrequency = 3.5,
  curlAmplitude = 0.25,
  forwardBias = 0.7,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];

  const forward = dir.clone().normalize();
  const up = curlAxis.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();

  // Generate points along the curling curve
  const curvePoints = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dist = t * length;

    // Helical curling / S-curve wave in 3D
    const wave1 = Math.sin(t * Math.PI * curlFrequency) * curlAmplitude * (0.2 + t * 0.8);
    const wave2 = Math.cos(t * Math.PI * (curlFrequency * 0.7)) * curlAmplitude * 0.6 * (0.2 + t * 0.8);

    const pt = origin.clone()
      .addScaledVector(forward, dist * forwardBias)
      .addScaledVector(right, wave1)
      .addScaledVector(up, wave2);

    curvePoints.push(pt);
  }

  // Generate ribbon vertices
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = curvePoints[i];

    // Tangent direction
    let tangent;
    if (i === 0) tangent = curvePoints[1].clone().sub(curvePoints[0]).normalize();
    else if (i === segments) tangent = curvePoints[segments].clone().sub(curvePoints[segments - 1]).normalize();
    else tangent = curvePoints[i + 1].clone().sub(curvePoints[i - 1]).normalize();

    // Normal across ribbon (oriented to face generally up/camera)
    const ribbonNormal = new THREE.Vector3().crossVectors(tangent, right).normalize();
    if (ribbonNormal.lengthSq() < 0.01) ribbonNormal.set(0, 1, 0);

    // Width envelope: gentle taper at start, wide in middle, wispy tail
    let w = 0;
    if (t < 0.2) w = (t / 0.2) * maxWidth;
    else if (t < 0.65) w = maxWidth;
    else w = Math.max(0, (1.0 - (t - 0.65) / 0.35) * maxWidth);

    // Left vertex
    const left = pt.clone().addScaledVector(ribbonNormal, w * 0.5);
    positions.push(left.x, left.y, left.z);
    uvs.push(t, 0.0);

    // Right vertex
    const rightVert = pt.clone().addScaledVector(ribbonNormal, -w * 0.5);
    positions.push(rightVert.x, rightVert.y, rightVert.z);
    uvs.push(t, 1.0);

    if (i < segments) {
      const idx = i * 2;
      indices.push(idx, idx + 1, idx + 2);
      indices.push(idx + 1, idx + 3, idx + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

