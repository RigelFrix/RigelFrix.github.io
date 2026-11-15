import * as THREE from "three";

/** Camera yaw/pitch/zoom goals, screen axes, and follow framing. */
export function createCamera(ctx) {
  const {
    camera,
    renderer,
    host,
    hudEl = document.querySelector(".hud"),
    getIntroLive,
  } = ctx;

  /* The old island view: offset (40, 58, 40), looking straight at Niko, about 45.7° down.
     Yaw still orbits. The pitch is a live modifier (debug.angle, or ?angle= in degrees) and the
     camera stays on that same sphere so he remains in the middle of the screen. */
  const CAM_REACH = Math.hypot(40, 58, 40);
  const angleQuery = new URLSearchParams(location.search).get("angle");
  const angleNumber = angleQuery == null || angleQuery === "" ? NaN : Number(angleQuery);
  let camPitch = Number.isFinite(angleNumber) ? THREE.MathUtils.degToRad(angleNumber) : Math.atan2(58, Math.hypot(40, 40));
  camPitch = THREE.MathUtils.clamp(camPitch, 0.18, 1.4);
  let camYaw = Math.PI / 4;
  let camYawGoal = camYaw;
  const camOffset = new THREE.Vector3();
  const camLook = new THREE.Vector3(0, 0, 0);
  let viewHeight = 16;

  /* Zoom: the wheel and pinches move a goal that the camera eases toward; the intro tweens the camera itself.
     Play stays inside 0.7–1.7. A debug zoom can pull further back (down to 0.25) and the wheel keeps that wider range until it is released. */
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.7;
  const DEBUG_ZOOM_MIN = 0.25;
  const DEBUG_ZOOM_MAX = 8;
  let zoomGoal = null;
  let zoomHold = false;

  const screenUp = new THREE.Vector3();
  const screenRight = new THREE.Vector3();
  const offTarget = new THREE.Vector3();
  const screenShift = new THREE.Vector3();
  const screenShiftGoal = new THREE.Vector3();
  const viewAnchor = new THREE.Vector3();
  const faceViewAt = new THREE.Vector3();
  const savedCamPos = new THREE.Vector3();
  const savedCamQuat = new THREE.Quaternion();
  const trialAnchor = new THREE.Vector3();
  const playerChest = new THREE.Vector3();

  const dampAngle = (current, target, lambda, dt) => {
    const t = 1 - Math.exp(-Math.max(0.01, lambda) * dt);
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + delta * t;
  };

  const applyCamAxes = () => {
    const back = Math.cos(camPitch) * CAM_REACH;
    const height = Math.sin(camPitch) * CAM_REACH;
    camOffset.set(Math.sin(camYaw) * back, height, Math.cos(camYaw) * back);
    screenUp.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    screenRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  };
  applyCamAxes();

  const zoomBy = (factor, now = false) => {
    const min = zoomHold ? DEBUG_ZOOM_MIN : ZOOM_MIN;
    const max = zoomHold ? DEBUG_ZOOM_MAX : ZOOM_MAX;
    zoomGoal = THREE.MathUtils.clamp((zoomGoal ?? camera.zoom) * factor, min, max);
    if (now) {
      camera.zoom = zoomGoal;
      camera.updateProjectionMatrix();
    }
  };

  const easeZoom = (dt) => {
    if (zoomGoal == null || getIntroLive()) return;
    camera.zoom = THREE.MathUtils.damp(camera.zoom, zoomGoal, 14, dt);
    if (Math.abs(camera.zoom - zoomGoal) < 0.0005) {
      camera.zoom = zoomGoal;
      zoomGoal = null;
    }
    camera.updateProjectionMatrix();
  };

  const tiltOf = () => Math.sin(camPitch);

  /* The camera prefers to show the floor, but never lets the robot drift out of the middle of
     the screen. Narrow phone views need this most. */
  const keepInFrame = (target, robot) => {
    const reachX = ((camera.right - camera.left) / 2 / camera.zoom) * 0.35;
    const reachY = (viewHeight / 2 / camera.zoom) * 0.35;

    const tilt = tiltOf();
    offTarget.subVectors(robot.position, target);
    const across = offTarget.dot(screenRight);
    const up = offTarget.dot(screenUp) * tilt;

    if (Math.abs(across) > reachX) {
      target.addScaledVector(screenRight, across - Math.sign(across) * reachX);
    }
    if (Math.abs(up) > reachY) {
      target.addScaledVector(screenUp, (up - Math.sign(up) * reachY) / tilt);
    }
  };

  const dampCamYaw = (dt, lockOn) => {
    if (getIntroLive()) return;
    camYaw = dampAngle(camYaw, camYawGoal, lockOn ? 10 : 14, dt);
  };

  const orbitBy = (dx) => {
    camYawGoal -= dx * 0.12 * (Math.PI / 180);
  };

  /** Place the orthographic camera for this frame (follow + cursor shift + optional faceView). */
  const follow = (dt, opts) => {
    const {
      robot,
      lookTarget,
      lockTarget,
      targetFocus,
      cursor,
      calm,
      started,
      faceView,
      bot,
      inCamera,
      travelled,
    } = opts;
    const introLive = getIntroLive();
    const speed = dt > 0 ? travelled.length() / dt : 0;
    const followRate = THREE.MathUtils.lerp(6, 18, THREE.MathUtils.clamp(speed / 8, 0, 1));
    if (calm || !started) {
      camLook.copy(lookTarget);
      screenShift.set(0, 0, 0);
    } else {
      camLook.x = THREE.MathUtils.damp(camLook.x, lookTarget.x, followRate, dt);
      camLook.y = THREE.MathUtils.damp(camLook.y, lookTarget.y, followRate, dt);
      camLook.z = THREE.MathUtils.damp(camLook.z, lookTarget.z, followRate, dt);
      screenShiftGoal.set(0, 0, 0);
      if (cursor.on && !introLive && faceView == null) {
        const halfW = (camera.right - camera.left) / 2 / Math.max(0.001, camera.zoom);
        const halfH = viewHeight / 2 / Math.max(0.001, camera.zoom);
        const biasX = THREE.MathUtils.clamp((cursor.x - 0.5) * 2, -1, 1);
        const biasY = THREE.MathUtils.clamp((0.5 - cursor.y) * 2, -1, 1);
        const lookStrength = lockTarget ? 0.35 : 1;
        screenShiftGoal.addScaledVector(screenRight, biasX * 0.7 * halfW * lookStrength);
        screenShiftGoal.addScaledVector(screenUp, biasY * 1.1 * halfH * lookStrength);
        /* Lock-on look cannot shove Niko or the dummy past the padded screen edge. */
        if (lockTarget && screenShiftGoal.lengthSq() > 0.0001) {
          const fits = (scale) => {
            savedCamPos.copy(camera.position);
            savedCamQuat.copy(camera.quaternion);
            trialAnchor.copy(lookTarget).addScaledVector(screenShiftGoal, scale);
            camera.position.copy(trialAnchor).add(camOffset);
            camera.lookAt(trialAnchor);
            camera.updateMatrixWorld();
            playerChest.set(robot.position.x, robot.position.y + 1.2, robot.position.z);
            const safe = inCamera(playerChest) && inCamera(targetFocus);
            camera.position.copy(savedCamPos);
            camera.quaternion.copy(savedCamQuat);
            camera.updateMatrixWorld();
            return safe;
          };
          if (!fits(1)) {
            let low = 0;
            let high = 1;
            for (let i = 0; i < 6; i += 1) {
              const mid = (low + high) / 2;
              if (fits(mid)) low = mid;
              else high = mid;
            }
            screenShiftGoal.multiplyScalar(low);
          }
        }
      }
      screenShift.x = THREE.MathUtils.damp(screenShift.x, screenShiftGoal.x, 15, dt);
      screenShift.y = THREE.MathUtils.damp(screenShift.y, screenShiftGoal.y, 15, dt);
      screenShift.z = THREE.MathUtils.damp(screenShift.z, screenShiftGoal.z, 15, dt);
    }
    viewAnchor.copy(camLook).add(screenShift);
    camera.position.copy(viewAnchor).add(camOffset);
    camera.lookAt(viewAnchor);
    if (faceView != null && bot.head) {
      /* Review only: a level camera on his face, faceView radians around from the front (0 = like the reference render) */
      const around = robot.rotation.y + faceView;
      bot.head.getWorldPosition(faceViewAt);
      faceViewAt.y += 0.1;
      camera.position.set(faceViewAt.x + Math.sin(around) * 4, faceViewAt.y, faceViewAt.z + Math.cos(around) * 4);
      camera.lookAt(faceViewAt);
      /* The game frustum is off-centre; slide the camera so the face lands mid-screen */
      camera.updateMatrixWorld();
      const ndc = faceViewAt.clone().project(camera);
      camera.translateX((ndc.x * (camera.right - camera.left)) / 2 / camera.zoom);
      camera.translateY((ndc.y * (camera.top - camera.bottom)) / 2 / camera.zoom);
    }
  };

  const debugZoom = (z) => {
    if (z === undefined) return +camera.zoom.toFixed(3);
    if (z === null) {
      zoomHold = false;
      zoomGoal = THREE.MathUtils.clamp(camera.zoom, ZOOM_MIN, ZOOM_MAX);
      return +zoomGoal.toFixed(3);
    }
    zoomHold = z < ZOOM_MIN || z > ZOOM_MAX;
    zoomGoal = null;
    camera.zoom = z;
    camera.updateProjectionMatrix();
    return +camera.zoom.toFixed(3);
  };

  const debugAngle = (degrees) => {
    if (degrees == null) return +THREE.MathUtils.radToDeg(camPitch).toFixed(2);
    camPitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(degrees), 0.18, 1.4);
    applyCamAxes();
    return +THREE.MathUtils.radToDeg(camPitch).toFixed(2);
  };

  const debugYaw = (angle) => {
    if (angle == null) return camYaw;
    camYaw = camYawGoal = angle;
    applyCamAxes();
    return camYaw;
  };

  const LOCK_PAD = 0.08;
  const viewPoint = new THREE.Vector3();
  /* 0–1 across the screen. The padded edge is the Pixel Pass safe viewport. */
  const inCamera = (world) => {
    viewPoint.copy(world).project(camera);
    if (!Number.isFinite(viewPoint.z) || viewPoint.z < -1 || viewPoint.z > 1) return false;
    const x = (viewPoint.x + 1) / 2;
    const y = (viewPoint.y + 1) / 2;
    return x >= LOCK_PAD && x <= 1 - LOCK_PAD && y >= LOCK_PAD && y <= 1 - LOCK_PAD;
  };

  /* The canvas runs under the header, but the floor is framed in the area below it */
  let hudBottom = 0;
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;

    if (!width || !height) {
      return;
    }

    renderer.setSize(width, height, false);
    const hud = Math.min(hudEl?.offsetHeight || 0, height * 0.3);
    hudBottom = hud;
    const usable = height - hud;
    const aspect = width / usable;
    viewHeight = aspect < 1 ? Math.max(19, 13.5 / aspect) : Math.max(15.5, 22 / aspect);
    const unit = viewHeight / usable;
    camera.left = (-width * unit) / 2;
    camera.right = (width * unit) / 2;
    camera.top = viewHeight / 2 + hud * unit;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  };

  if (host) {
    new ResizeObserver(resize).observe(host);
    resize();
  }

  return {
    CAM_REACH,
    ZOOM_MIN,
    ZOOM_MAX,
    DEBUG_ZOOM_MIN,
    DEBUG_ZOOM_MAX,
    camOffset,
    camLook,
    screenUp,
    screenRight,
    screenShift,
    viewAnchor,
    applyCamAxes,
    dampAngle,
    dampCamYaw,
    easeZoom,
    zoomBy,
    orbitBy,
    keepInFrame,
    follow,
    inCamera,
    resize,
    getHudBottom: () => hudBottom,
    debugZoom,
    debugAngle,
    debugYaw,
    getCamYaw: () => camYaw,
    setCamYaw: (v) => {
      camYaw = v;
    },
    getCamYawGoal: () => camYawGoal,
    setCamYawGoal: (v) => {
      camYawGoal = v;
    },
    getCamPitch: () => camPitch,
    setCamPitch: (v) => {
      camPitch = v;
    },
    getViewHeight: () => viewHeight,
    setViewHeight: (v) => {
      viewHeight = v;
    },
    getZoomGoal: () => zoomGoal,
    setZoomGoal: (v) => {
      zoomGoal = v;
    },
    getZoomHold: () => zoomHold,
    setZoomHold: (v) => {
      zoomHold = v;
    },
  };
}
