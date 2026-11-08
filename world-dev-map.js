/* Prototype Developer Gym Map (Unreal Engine graybox testing environment)
   Accessible via URL: ?map=dev or ?dev=1
   Features:
   - 180m x 180m expansive dev testing floor
   - Unreal Engine prototype grid texture (1m minor tiles, 5m medium, 10m major grid borders)
   - Vertical pillar obstacle cluster with varying heights and faceted spiral column
   - Elevated terrace platform (+2.6m) with smooth slope access ramp and stepped blocks
   - Orientation blue test beacon cube (#0070f3)
   - Divided wall barriers with central doorway opening
   - Navmesh & collision resolution for all obstacles and elevation tiers
   - Spawns for Niko (center), Training Dummy, and Sekiro Colossus Boss
*/

import * as THREE from "./vendor/three/three.module.min.js";

export function createDevGridTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Base Unreal Engine light-gray prototype surface
  ctx.fillStyle = "#b8b8be";
  ctx.fillRect(0, 0, size, size);

  // 10 subdivisions = 1 meter per sub-cell in world space when repeat is 18 (180m / 18 = 10m tile)
  const cell = size / 10;

  // Subtle alternating checker tone for each 1m tile
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? "#bcbcc2" : "#b5b5ba";
      ctx.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2);
    }
  }

  // 1-meter minor grid lines
  ctx.strokeStyle = "#94949e";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const p = Math.round(i * cell);
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // 5-meter medium grid lines
  ctx.strokeStyle = "#62626e";
  ctx.lineWidth = 2.5;
  for (let i = 0; i <= 10; i += 5) {
    const p = Math.round(i * cell);
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // 10-meter major grid border
  ctx.strokeStyle = "#303038";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function buildDevMap({ scene, withRim, ramp, colliders }) {
  const devColliders = colliders || [];
  const root = new THREE.Group();
  root.name = "DevMapRoot";
  scene.add(root);

  const ARENA_SIZE = 180.0;
  const gridTexture = createDevGridTexture();
  gridTexture.repeat.set(18, 18); // 18 x 10m = 180m -> 1m per sub-tile!

  const platformGridTexture = createDevGridTexture();
  platformGridTexture.repeat.set(3.2, 3.6);

  // Materials
  const floorMat = new THREE.MeshStandardMaterial({
    map: gridTexture,
    roughness: 0.72,
    metalness: 0.05,
    color: "#ffffff",
  });

  const platformFloorMat = new THREE.MeshStandardMaterial({
    map: platformGridTexture,
    roughness: 0.72,
    metalness: 0.05,
    color: "#ffffff",
  });

  const grayboxMat = new THREE.MeshStandardMaterial({
    color: "#9e9ea6",
    roughness: 0.65,
    metalness: 0.08,
  });

  const wallMat = new THREE.MeshStandardMaterial({
    color: "#8a8a92",
    roughness: 0.70,
    metalness: 0.05,
  });

  const blueCubeMat = new THREE.MeshStandardMaterial({
    color: "#0070f3",
    roughness: 0.35,
    metalness: 0.15,
  });

  // 1. Massive Main Floor (180m x 180m)
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
  floorGeo.rotateX(-Math.PI / 2);
  const terrain = new THREE.Mesh(floorGeo, floorMat);
  terrain.name = "DevArenaFloor";
  terrain.receiveShadow = true;
  root.add(terrain);

  const pickables = [terrain];

  // 2. Elevated Terrace Platform (+2.6m elevation)
  // X: -44 to -12 (width 32), Z: -36 to 0 (depth 36)
  const PLAT_W = 32.0;
  const PLAT_D = 36.0;
  const PLAT_H = 2.6;
  const PLAT_CX = -28.0;
  const PLAT_CZ = -18.0;

  const platformGroup = new THREE.Group();
  platformGroup.position.set(PLAT_CX, 0, PLAT_CZ);

  const platformBaseGeo = new THREE.BoxGeometry(PLAT_W, PLAT_H, PLAT_D);
  const platformBase = new THREE.Mesh(platformBaseGeo, grayboxMat);
  platformBase.position.y = PLAT_H / 2;
  platformBase.castShadow = true;
  platformBase.receiveShadow = true;
  platformGroup.add(platformBase);
  pickables.push(platformBase);

  // Platform top surface with grid texture
  const platTopGeo = new THREE.PlaneGeometry(PLAT_W, PLAT_D);
  platTopGeo.rotateX(-Math.PI / 2);
  const platTop = new THREE.Mesh(platTopGeo, platformFloorMat);
  platTop.position.y = PLAT_H + 0.01;
  platTop.receiveShadow = true;
  platformGroup.add(platTop);
  pickables.push(platTop);

  // Beveled corner block on top-north-west corner (matching screenshot)
  const cornerGeo = new THREE.CylinderGeometry(2.4, 2.4, PLAT_H + 0.8, 16);
  const cornerMesh = new THREE.Mesh(cornerGeo, grayboxMat);
  cornerMesh.position.set(-PLAT_W / 2 + 1.2, (PLAT_H + 0.8) / 2, -PLAT_D / 2 + 1.2);
  cornerMesh.castShadow = true;
  cornerMesh.receiveShadow = true;
  platformGroup.add(cornerMesh);
  pickables.push(cornerMesh);

  root.add(platformGroup);

  // 3. Smooth Access Ramp (South edge of platform, connecting ground 0 to 2.6m)
  // X: -26 to -18 (width 8m), Z: 0 to 10 (length 10m)
  const RAMP_W = 8.0;
  const RAMP_L = 10.0;
  const rampAngle = Math.atan2(PLAT_H, RAMP_L);
  const rampHyp = Math.hypot(PLAT_H, RAMP_L);
  const rampGeo = new THREE.PlaneGeometry(RAMP_W, rampHyp);
  rampGeo.rotateX(Math.PI / 2 - rampAngle);
  const rampMesh = new THREE.Mesh(rampGeo, floorMat);
  rampMesh.position.set(-22.0, PLAT_H / 2, 5.0);
  rampMesh.castShadow = true;
  rampMesh.receiveShadow = true;
  root.add(rampMesh);
  pickables.push(rampMesh);

  // Ramp wedge side walls
  const rampWedgeGeo = new THREE.BufferGeometry();
  const hw = RAMP_W / 2;
  const wedgeVertices = new Float32Array([
    // Left side wedge
    -22 - hw, 0, 10,
    -22 - hw, PLAT_H, 0,
    -22 - hw, 0, 0,
    // Right side wedge
    -22 + hw, 0, 0,
    -22 + hw, PLAT_H, 0,
    -22 + hw, 0, 10,
  ]);
  rampWedgeGeo.setAttribute("position", new THREE.BufferAttribute(wedgeVertices, 3));
  rampWedgeGeo.computeVertexNormals();
  const rampWedges = new THREE.Mesh(rampWedgeGeo, wallMat);
  rampWedges.castShadow = true;
  rampWedges.receiveShadow = true;
  root.add(rampWedges);

  // 4. Stepped Blocks / Stairs (East side of platform, testing elevation steps)
  // X: -12 to -7, Z: -18 to -8
  const stepHeights = [0.85, 1.70, 2.55];
  stepHeights.forEach((h, i) => {
    const stepGeo = new THREE.BoxGeometry(4.0, h, 3.2);
    const stepMesh = new THREE.Mesh(stepGeo, grayboxMat);
    stepMesh.position.set(-9.5, h / 2, -16.5 + i * 3.4);
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    root.add(stepMesh);
    pickables.push(stepMesh);
  });

  // 5. Cylindrical Pillar Obstacle Cluster (North-East Area, matching screenshot)
  const pillarDefs = [
    { x: 14, z: -16, r: 0.85, h: 5.5 },
    { x: 21, z: -22, r: 0.90, h: 7.2 },
    { x: 28, z: -28, r: 0.95, h: 8.0 },
    { x: 18, z: -10, r: 0.70, h: 4.2 },
    { x: 24, z: -14, r: 0.80, h: 5.2 },
    { x: 11, z: -12, r: 0.65, h: 3.0 },
    { x: 31, z: -18, r: 0.75, h: 6.2 },
  ];

  pillarDefs.forEach((p, idx) => {
    const cylGeo = new THREE.CylinderGeometry(p.r, p.r, p.h, 32);
    const cyl = new THREE.Mesh(cylGeo, grayboxMat);
    cyl.position.set(p.x, p.h / 2, p.z);
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    cyl.name = `DevPillar_${idx}`;
    root.add(cyl);
    pickables.push(cyl);
    devColliders.push({ x: p.x, z: p.z, r: p.r + 0.15 });
  });

  // 6. Distinctive Faceted / Spiral Notched Pillar (from screenshot)
  const spiralPillar = new THREE.Group();
  spiralPillar.position.set(15, 0, -26);
  const spiralR = 0.88;
  const spiralH = 5.2;
  const discCount = 14;
  const discH = spiralH / discCount;
  for (let i = 0; i < discCount; i++) {
    const rTop = spiralR * (i % 2 === 0 ? 1.0 : 0.88);
    const rBot = spiralR * (i % 2 === 0 ? 0.88 : 1.0);
    const dGeo = new THREE.CylinderGeometry(rTop, rBot, discH, 8);
    dGeo.rotateY((i * Math.PI) / 8);
    const dMesh = new THREE.Mesh(dGeo, grayboxMat);
    dMesh.position.y = (i + 0.5) * discH;
    dMesh.castShadow = true;
    dMesh.receiveShadow = true;
    spiralPillar.add(dMesh);
  }
  root.add(spiralPillar);
  pickables.push(spiralPillar);
  devColliders.push({ x: 15, z: -26, r: spiralR + 0.15 });

  // 7. Bright Blue Orientation / Scale Reference Cube (#0070f3, matching screenshot)
  const blueCubeGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const blueCube = new THREE.Mesh(blueCubeGeo, blueCubeMat);
  blueCube.position.set(-13.0, PLAT_H + 0.6, -34.0);
  blueCube.castShadow = true;
  blueCube.receiveShadow = true;
  blueCube.name = "DevBlueCube";
  root.add(blueCube);
  pickables.push(blueCube);
  devColliders.push({ x: -13.0, z: -34.0, r: 0.95 });

  // 8. Low Wall Barriers with Central Opening (South Area, matching screenshot)
  const wallH = 1.4;
  const wallD = 1.2;
  // Left wall: x from -22 to -3 at z = 22
  const leftWallW = 19.0;
  const leftWallGeo = new THREE.BoxGeometry(leftWallW, wallH, wallD);
  const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
  leftWall.position.set(-12.5, wallH / 2, 22.0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  root.add(leftWall);
  pickables.push(leftWall);

  // Right wall: x from 3 to 22 at z = 22
  const rightWallW = 19.0;
  const rightWallGeo = new THREE.BoxGeometry(rightWallW, wallH, wallD);
  const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
  rightWall.position.set(12.5, wallH / 2, 22.0);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  root.add(rightWall);
  pickables.push(rightWall);

  // Register wall colliders
  if (colliders) {
    for (let x = -21; x <= -4; x += 1.8) {
      colliders.push({ x, z: 22.0, r: 0.9 });
    }
    for (let x = 4; x <= 21; x += 1.8) {
      colliders.push({ x, z: 22.0, r: 0.9 });
    }
    // Platform outer perimeter colliders (for when on ground level)
    // North edge:
    for (let x = -43; x <= -13; x += 2.0) {
      colliders.push({ x, z: -35.5, r: 1.1, platformWall: true });
    }
    // West edge:
    for (let z = -35; z <= -1; z += 2.0) {
      colliders.push({ x: -43.5, z, r: 1.1, platformWall: true });
    }
    // East edge:
    for (let z = -35; z <= -19; z += 2.0) {
      colliders.push({ x: -12.5, z, r: 1.1, platformWall: true });
    }
  }

  // Ground height calculation function
  const groundAt = (x, z) => {
    // 1. On Ramp
    if (x >= -26.0 && x <= -18.0 && z >= 0.0 && z <= 10.0) {
      return PLAT_H * (1.0 - z / 10.0);
    }
    // 2. On Platform
    if (x >= -44.0 && x <= -12.0 && z >= -36.0 && z <= 0.0) {
      return PLAT_H;
    }
    // 3. On Stepped Blocks
    if (x >= -11.5 && x <= -7.5) {
      if (z >= -18.5 && z < -15.0) return 2.55;
      if (z >= -15.0 && z < -11.5) return 1.70;
      if (z >= -11.5 && z <= -8.0) return 0.85;
    }
    return 0.0;
  };

  // Navmesh implementation
  const nav = {
    walkable(x, z) {
      if (Math.abs(x) > 88 || Math.abs(z) > 88) return false;
      // Impassable pillars
      for (const p of pillarDefs) {
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz < (p.r + 0.3) * (p.r + 0.3)) return false;
      }
      // Spiral pillar
      const sDx = x - 15;
      const sDz = z - (-26);
      if (sDx * sDx + sDz * sDz < (spiralR + 0.3) * (spiralR + 0.3)) return false;
      // Low wall barriers
      if (Math.abs(z - 22.0) < 0.9 && (x < -2.5 || x > 2.5) && Math.abs(x) < 22.5) {
        return false;
      }
      return true;
    },
    nearest(x, z) {
      return new THREE.Vector3(
        THREE.MathUtils.clamp(x, -85, 85),
        groundAt(x, z),
        THREE.MathUtils.clamp(z, -85, 85)
      );
    },
    path(from, to) {
      return [to];
    },
    build() {},
  };

  return {
    root,
    terrain,
    pick: pickables,
    colliders: devColliders,
    beam: new THREE.Group(),
    beamMat: { uniforms: { strength: { value: 0 } } },
    shrine: new THREE.Vector3(0, 0, -60),
    lanterns: [],
    halos: { visible: false },
    groundAt,
    nav,
    blockers: [],
    spot: (name) => {
      if (name === "landing") return new THREE.Vector3(0, 0, 5);
      if (name === "cove") return new THREE.Vector3(0, 0, -28);
      if (name === "dummy") return new THREE.Vector3(1.8, 0, 0.8);
      if (name === "platform") return new THREE.Vector3(-28, PLAT_H, -18);
      return new THREE.Vector3(0, 0, 0);
    },
    fromUV: (u, v) => new THREE.Vector3(u, groundAt(u, v), v),
    update: () => {},
    motion: { pinned: null },
    isDev: true,
  };
}
