import * as THREE from "three";

/** Boot starfield canvas. */
export function createBootField({ boot, root, calm }) {
  const field = (() => {
    const el = boot?.querySelector(".world-starfield");
    const g = el?.getContext("2d");
    const api = { warp: 0, spread: 0, pulse() {} };
    if (!g) return api;

    const tints = ["#ffffff", "#ffffff", "#d8e6ff", "#a9c6ff", "#7fa8ff", "#ffe8c4", "#ffc2a6"];
    let stars = [];
    let w = 0;
    let h = 0;
    let reach = 1;
    let dpr = 1;
    let last = performance.now();

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      reach = Math.hypot(w, h) / 2;
      stars = Array.from({ length: Math.min(260, Math.round((w * h) / 3600)) }, () => {
        const dx = (Math.random() - 0.5) * w;
        const dy = (Math.random() - 0.5) * h;
        const r = Math.max(Math.hypot(dx, dy), 1);
        const big = Math.random() < 0.05;
        return {
          r,
          ux: dx / r,
          uy: dy / r,
          near: 1 - Math.min(r / reach, 1) * 0.6,
          depth: 0.3 + Math.random() * 0.7,
          size: big ? 1.4 + Math.random() * 1 : 0.35 + Math.random() * 0.9,
          big,
          color: tints[Math.floor(Math.random() * tints.length)],
          alpha: 0.35 + Math.random() * 0.65,
          phase: Math.random() * Math.PI * 2,
          rate: 1 + Math.random() * 3,
          push: 0,
          vel: 0,
        };
      });
    };

    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      stars.forEach((s) => {
        if (!calm) {
          s.vel += (-38 * s.push - 7 * s.vel) * dt;
          s.push += s.vel * dt;
        }
        const rad = (s.r + s.push + api.spread * 26 * s.depth) * (1 + api.warp * (0.12 + s.depth * 0.28));
        const x = w / 2 + s.ux * rad;
        const y = h / 2 + s.uy * rad;
        const glint = calm ? 1 : 0.65 + 0.35 * Math.sin(now / 1000 * s.rate + s.phase);
        g.globalAlpha = s.alpha * glint * (1 - api.warp * 0.55);
        g.fillStyle = g.strokeStyle = s.color;

        if (s.size < 1) {
          g.fillRect(x - s.size, y - s.size, s.size * 2, s.size * 2);
          return;
        }
        g.beginPath();
        g.arc(x, y, s.size, 0, Math.PI * 2);
        g.fill();
        if (s.big) {
          g.globalAlpha *= 0.5;
          g.lineWidth = 0.6;
          g.beginPath();
          g.moveTo(x - s.size * 4, y);
          g.lineTo(x + s.size * 4, y);
          g.moveTo(x, y - s.size * 4);
          g.lineTo(x, y + s.size * 4);
          g.stroke();
        }
      });

      const hidden = !root.classList.contains("world-intro") || boot.style.visibility === "hidden";
      if (!hidden) window.requestAnimationFrame(draw);
    };

    api.pulse = (strength = 1) => {
      if (calm) return;
      stars.forEach((s) => (s.vel = Math.max(-700, Math.min(900, s.vel + strength * 420 * s.depth * s.near))));
    };

    build();
    window.addEventListener("resize", build);
    window.requestAnimationFrame(draw);
    return api;
  })();
  return field;
}

/** Boot loading, Rigel intro FX, shader prewarm & GSAP landing sequence. Keep GSAP on wrappers only. */
export function createIntro(ctx) {
  const {
    scene,
    renderer,
    camera,
    post,
    gsap,
    root,
    boot,
    flash,
    field,
    PAL,
    ISLE,
    calm,
    isDevMap,
    playsIntro,
    island,
    landing,
    sky,
    setDawn,
    climate,
    getClimateSample,
    setClimateSample,
    applyEnv,
    soft,
    flat,
    bakeShadows,
    pose,
    bot,
    robot,
    nikoReady,
    manager,
    fromDisk,
    cameraApi,
    lookTarget,
    getState,
    getClock,
  } = ctx;

  const { camOffset, camLook, screenRight, getViewHeight } = cameraApi;
  const getScreenRight = () => screenRight;

  /* Same Rigel as the loading screen: white-hot core, blue glow, faint halo ring and thin diffraction spikes */
  const flareTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const context = c.getContext("2d");
    context.translate(128, 128);
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, 128);
    glow.addColorStop(0, "rgba(255, 255, 255, 1)");
    glow.addColorStop(0.08, "rgba(232, 242, 255, 1)");
    glow.addColorStop(0.2, "rgba(140, 190, 255, 0.65)");
    glow.addColorStop(0.45, "rgba(70, 130, 255, 0.18)");
    glow.addColorStop(1, "rgba(60, 110, 255, 0)");
    context.fillStyle = glow;
    context.fillRect(-128, -128, 256, 256);
    context.strokeStyle = "rgba(170, 205, 255, 0.3)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 66, 0, Math.PI * 2);
    context.stroke();
    const spike = (len, width, angle, alpha) => {
      context.save();
      context.rotate(angle);
      const line = context.createLinearGradient(-len, 0, len, 0);
      line.addColorStop(0, "rgba(160, 200, 255, 0)");
      line.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
      line.addColorStop(1, "rgba(160, 200, 255, 0)");
      context.fillStyle = line;
      context.fillRect(-len, -width / 2, len * 2, width);
      context.restore();
    };
    spike(128, 3, 0, 1);
    spike(128, 3, Math.PI / 2, 1);
    spike(64, 2, Math.PI / 4, 0.5);
    spike(64, 2, -Math.PI / 4, 0.5);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  const flareMat = (opacity) =>
    new THREE.SpriteMaterial({ map: flareTexture, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  const star = new THREE.Sprite(flareMat(1));
  star.scale.setScalar(3.6);
  star.renderOrder = 3;
  star.visible = false;
  scene.add(star);

  const ghosts = [0.42, 0.26, 0.15, 0.08].map((opacity, i) => {
    const ghost = new THREE.Sprite(flareMat(0));
    ghost.userData.opacity = opacity;
    ghost.scale.setScalar(3.6 * (0.85 - i * 0.14));
    ghost.renderOrder = 2;
    scene.add(ghost);
    return ghost;
  });

  const shockwaves = [PAL.yellow, PAL.cream].map((color) => {
    const wave = flat(
      scene,
      new THREE.RingGeometry(0.9, 1.08, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      0,
      0.04,
      0
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.copy(landing).y += 0.05;
    return wave;
  });

  const impactLight = new THREE.PointLight(PAL.yellow, 0, 16, 1.4);
  impactLight.position.copy(landing).y += 1.4;
  scene.add(impactLight);

  /* Once Niko is out, a small Rigel keeps hovering over the shrine in its beam of light */
  const shrineStar = new THREE.Sprite(flareMat(0.95));
  shrineStar.scale.setScalar(2.4);
  shrineStar.position.copy(island.shrine).y += 4.6;
  shrineStar.renderOrder = 3;
  shrineStar.visible = !playsIntro;
  scene.add(shrineStar);
  island.beamMat.uniforms.strength.value = playsIntro ? 0 : 0.85;

  const debrisGeo = new THREE.BoxGeometry(0.17, 0.17, 0.17);
  const debris = Array.from({ length: 22 }, (_, i) => {
    const mesh = new THREE.Mesh(debrisGeo, soft([ISLE.star, ISLE.ruin, PAL.cream][i % 3]));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, size: 1 };
  });

  const fx = [];
  let shake = 0;
  let intro = null;
  let introLive = playsIntro;
  const setIntro = (timeline) => {
    intro = timeline;
    return intro;
  };
  const setIntroLive = (value) => {
    introLive = value;
  };

  if (playsIntro) robot.visible = false;

  const seenIntro = (() => {
    try {
      return window.sessionStorage.getItem("fy-intro") === "1";
    } catch {
      return false;
    }
  })();

  const endIntro = () => {
    introLive = false;
    intro = null;
    root.classList.remove("world-intro");
    climate.unlock();
    const cs = climate.update(0);
    setClimateSample(cs);
    applyEnv(cs);
    sky.dawn = 1;
    robot.visible = true;
    if (isDevMap) {
      robot.position.copy(landing);
      robot.position.y = island.groundAt(landing.x, landing.z);
      camLook.copy(robot.position);
      lookTarget.copy(robot.position);
      camera.zoom = 0.95;
      camera.updateProjectionMatrix();
    }
    shrineStar.visible = !isDevMap;
    shrineStar.material.opacity = 0.95;
    island.beamMat.uniforms.strength.value = 0.85;

    try {
      window.sessionStorage.setItem("fy-intro", "1");
    } catch {}
  };

  const fallFrom = new THREE.Vector3();
  const fallTo = landing.clone().add(new THREE.Vector3(0, 0.45, 0));
  const fall = { p: 0, spin: 0 };

  const placeStar = () => {
    star.position.lerpVectors(fallFrom, fallTo, fall.p);
    ghosts.forEach((ghost, i) => {
      ghost.position.lerpVectors(fallFrom, fallTo, Math.max(0, fall.p - (i + 1) * 0.07));
    });
  };

  const impact = () => {
    star.visible = false;
    ghosts.forEach((ghost) => (ghost.material.opacity = 0));

    robot.visible = true;
    const state = getState();
    state.yaw = Math.atan2(camOffset.x, camOffset.z);
    robot.rotation.y = state.yaw;
    bot.eyes.forEach((eye) => (eye.scale.y = 0.15));
    state.blinkAt = getClock() + 0.9;

    gsap.fromTo(impactLight, { intensity: 35 }, { intensity: 0, duration: 0.8, ease: "power2.out" });
    gsap.fromTo(camera, { zoom: 1.06 }, { zoom: 1, duration: 0.6, ease: "expo.out", onUpdate: () => camera.updateProjectionMatrix() });
    gsap.fromTo(flash, { opacity: 0.45 }, { opacity: 0, duration: 0.35, ease: "power2.out" });
    shake = 0.55;

    shockwaves.forEach((wave, i) => {
      gsap.fromTo(wave.scale, { x: 0.6, y: 0.6 }, { x: i ? 3.6 : 5.6, y: i ? 3.6 : 5.6, duration: 0.7, delay: i * 0.1, ease: "expo.out" });
      gsap.fromTo(wave.material, { opacity: 1 }, { opacity: 0, duration: 0.7, delay: i * 0.1, ease: "power2.in" });
    });

    debris.forEach((bit, i) => {
      const angle = (i / debris.length) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2.6 + Math.random() * 3.6;
      bit.v.set(Math.cos(angle) * speed, 4 + Math.random() * 4.5, Math.sin(angle) * speed);
      bit.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      bit.mesh.position.set(landing.x + Math.cos(angle) * 0.45, landing.y + 0.35, landing.z + Math.sin(angle) * 0.45);
      bit.size = 0.6 + Math.random() * 0.8;
      bit.life = 1.2 + Math.random() * 0.5;
      bit.mesh.visible = true;
    });

    fx.push((dt) => {
      let alive = false;
      debris.forEach((bit) => {
        if (bit.life <= 0) {
          bit.mesh.visible = false;
          return;
        }
        alive = true;
        bit.life -= dt;
        bit.v.y -= 22 * dt;
        bit.mesh.position.addScaledVector(bit.v, dt);
        const rest = island.groundAt(bit.mesh.position.x, bit.mesh.position.z) + 0.09;
        if (bit.mesh.position.y < rest) {
          bit.mesh.position.y = rest;
          bit.v.y *= -0.36;
          bit.v.x *= 0.55;
          bit.v.z *= 0.55;
          bit.spin.multiplyScalar(0.5);
        }
        bit.mesh.rotation.x += bit.spin.x * dt;
        bit.mesh.rotation.y += bit.spin.y * dt;
        bit.mesh.rotation.z += bit.spin.z * dt;
        bit.mesh.scale.setScalar(bit.size * THREE.MathUtils.clamp(bit.life / 0.35, 0, 1));
      });
      return alive;
    });
  };

function playIntro() {
  root.classList.add("world-ready");

  if (!playsIntro) {
    root.classList.add("world-ready");
    endIntro();
    return;
  }

  const starEl = boot.querySelector(".world-star");
  const tail = boot.querySelector(".world-tail");
  const lift = Math.max(window.innerHeight, 600) * 0.8;
  const lean = Math.tan(THREE.MathUtils.degToRad(8));

  const hud = boot.querySelector(".world-boot-hud");
  const aura = boot.querySelector(".world-aura");
  const halo = boot.querySelector(".world-halo");
  const ping = boot.querySelector(".world-ping");
  const sparkBox = boot.querySelector(".world-sparks");
  const spark = () => sparkBox.appendChild(document.createElement("i"));
  const burst = Array.from({ length: 16 }, spark);
  const trail = Array.from({ length: 16 }, spark);
  const echoes = Array.from({ length: 8 }, () => sparkBox.appendChild(document.createElement("b")));

  gsap.set([...burst, ...trail, ...echoes], { autoAlpha: 0 });

  const crowns = boot.querySelectorAll(".world-corona-2, .world-corona-3");
  const zoomTo = () => camera.updateProjectionMatrix();
  /* The boot sequence runs until W; everything on the island is timed from there */
  const W = 1.65;
  const land = W + 4.0;

  /* Start the fall just above the top edge, so the whole drop is on screen */
  const drop = (getViewHeight() / 2 / 0.8 + 1.5) / 0.8;
  fallFrom.copy(fallTo).add(new THREE.Vector3(0, drop, 0)).addScaledVector(getScreenRight(), drop * 0.8 * lean);

  intro = setIntro(gsap.timeline({ onComplete: endIntro, defaults: { ease: "power2.out" } }));
  intro.timeScale(seenIntro ? 1.6 : 1);

  /* A ring completes: a radial wave rolls out from it, the starfield is shoved back and Rigel throbs */
  const wave = (at, from, k) =>
    intro
      .call(() => field.pulse(1 + k * 0.4), null, at)
      .to(field, { spread: (k + 1) * 0.6, duration: 0.6 }, at)
      .fromTo(ping, { scale: from, autoAlpha: 0.9 }, { scale: from * 2.2, autoAlpha: 0, duration: 0.8, immediateRender: false }, at)
      .to(starEl, { scale: 1.15 + k * 0.08, duration: 0.12 }, at)
      .to(starEl, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" }, at + 0.12);

  /* Rigel turns slowly at first and winds up faster with every ring */
  intro.to(starEl, { rotation: 360, duration: 2.2, ease: "power2.in" }, 0);
  wave(0.15, 1.15, 0);
  /* Each crown blooms out of the one inside it, turning as it settles */
  const bloomCrown = (el, at, alpha) =>
    intro.fromTo(el, { scale: 0.55, rotation: -40, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: alpha, duration: 0.7, ease: "back.out(1.4)" }, at);
  bloomCrown(crowns[0], 0.35, 1);
  wave(0.95, 1.7, 1);
  bloomCrown(crowns[1], 1.05, 0.65);
  wave(1.7, 2.24, 2);

  intro
    /* The rings fold into Rigel as it swells and draws the stars back in, then it flashes and launches */
    .to(hud, { autoAlpha: 0, y: 8, duration: 0.4 }, 1.9)
    .call(() => field.pulse(-1.3), null, 1.9)
    .to(halo, { scale: 0.5, duration: 0.3, ease: "power2.in" }, 1.9)
    .to(aura, { scale: 1.4, duration: 0.3, ease: "power2.in" }, 1.9)
    .to(starEl, { scale: 1.35, duration: 0.3, ease: "power2.in" }, 1.9)
    .call(() => field.pulse(3), null, 2.2)
    .to(halo, { scale: 2.2, autoAlpha: 0, duration: 0.6 }, 2.2)
    .to(aura, { scale: 2.4, autoAlpha: 0, duration: 0.7 }, 2.2)
    .fromTo(ping, { scale: 0.5, autoAlpha: 1 }, { scale: 5, autoAlpha: 0, duration: 0.8, ease: "expo.out", immediateRender: false }, 2.2)
    .to(starEl, { y: -lift, x: lift * lean, scaleX: 0.8, scaleY: 1.6, duration: 0.6, ease: "power2.in" }, 2.3)
    .to(field, { warp: 1, duration: 1.4, ease: "power2.out" }, 2.2)
    .fromTo(tail, { scaleY: 0, autoAlpha: 0 }, { scaleY: 1, autoAlpha: 1, duration: 0.35 }, 2.3);

  burst.forEach((el, i) => {
    const angle = (i / burst.length) * Math.PI * 2 + Math.random() * 0.4;
    const reach = 60 + Math.random() * 90;
    intro.fromTo(
      el,
      { x: 0, y: 0, scale: 1.4, rotation: 0, autoAlpha: 1 },
      { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach + 20, scale: 0, rotation: 180, duration: 0.7 + Math.random() * 0.4, ease: "power2.out", immediateRender: false },
      2.2
    );
  });

  /* Sparks shed along the flight path: power2.in puts the star at lift * p² */
  trail.forEach((el, i) => {
    const at = 2.34 + i * 0.03;
    const climb = lift * Math.pow((at - 2.3) / 0.6, 2);
    intro.fromTo(
      el,
      { x: climb * lean + (Math.random() - 0.5) * 24, y: -climb, scale: 0.6 + Math.random() * 0.7, autoAlpha: 1 },
      { x: `+=${(Math.random() - 0.5) * 60}`, y: `+=${20 + Math.random() * 40}`, scale: 0, duration: 1 + Math.random() * 0.5, ease: "sine.out", immediateRender: false },
      at
    );
  });

  /* Afterglows: dropped where Rigel just was, so they spread further apart as it speeds up */
  echoes.forEach((el, i) => {
    const at = 2.36 + i * 0.05;
    const climb = lift * Math.pow((at - 2.3) / 0.6, 2);
    intro.fromTo(
      el,
      { x: climb * lean, y: -climb, scale: 1.1 - i * 0.05, autoAlpha: 0.75 },
      { scale: 0.35, autoAlpha: 0, duration: 0.8, ease: "power1.out", immediateRender: false },
      at
    );
  });

  intro

    /* The cover lifts onto the island at night, then dusk rolls in over sky and floor */
    .to(boot, { autoAlpha: 0, duration: 1.0, ease: "power1.inOut" }, W + 1.15)
    .fromTo(camera, { zoom: 0.8 }, { zoom: 1, duration: 2.6, ease: "power2.inOut", onUpdate: zoomTo }, W + 1.0)
    .to(sky, { dawn: 1, duration: 2.0, ease: "sine.inOut", onUpdate: setDawn }, W + 1.3)

    /* It falls back in along the same line and hits the spawn ring */
    .call(() => {
      star.visible = true;
      ghosts.forEach((ghost) => (ghost.material.opacity = ghost.userData.opacity));
    }, null, W + 3.0)
    .fromTo(fall, { p: 0 }, { p: 1, duration: 1.0, ease: "power1.in", onUpdate: placeStar }, W + 3.0)
    .call(impact, null, land)

    /* Niko bursts out of the crater, front-flips, lands, then waves and lifts the lantern */
    .set(pose, { crouch: 1, lift: 0, spin: 0, flip: 0, raise: 0, tilt: 0 }, land)
    .set(bot.buddy.scale, { x: 0.01, y: 0.01, z: 0.01 }, land)
    .fromTo(robot.scale, { x: 1.45, y: 0.42, z: 1.45 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: "back.out(3)", immediateRender: false }, land)
    .to(pose, { crouch: 0, lift: 1.1, duration: 0.5, ease: "power2.out" }, land + 0.35)
    .to(pose, { flip: Math.PI * 2, duration: 0.72, ease: "power1.inOut" }, land + 0.4)
    .fromTo(robot.scale, { x: 0.82, y: 1.22, z: 0.82 }, { x: 1, y: 1, z: 1, duration: 0.45, immediateRender: false }, land + 0.35)
    .to(pose, { lift: 0, duration: 0.3, ease: "power2.in" }, land + 0.85)
    .set(pose, { flip: 0 }, land + 1.15)
    .to(pose, { crouch: 0.5, duration: 0.1, ease: "power1.out" }, land + 1.15)
    .fromTo(
      robot.scale,
      { x: 1.22, y: 0.8, z: 1.22 },
      { x: 1, y: 1, z: 1, duration: 0.6, ease: "elastic.out(1, 0.45)", immediateRender: false },
      land + 1.15
    )
    .fromTo(shockwaves[1].scale, { x: 0.4, y: 0.4 }, { x: 2.2, y: 2.2, duration: 0.5, immediateRender: false }, land + 1.15)
    .fromTo(shockwaves[1].material, { opacity: 0.8 }, { opacity: 0, duration: 0.5, ease: "power1.in", immediateRender: false }, land + 1.15)
    .to(pose, { crouch: 0, raise: 1, tilt: 1, duration: 0.5, ease: "back.out(2)" }, land + 1.25)
    .fromTo(bot.buddy.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: "back.out(3)", immediateRender: false }, land + 1.35)
    .fromTo(bot.bulbGlow.scale, { x: 2.4, y: 2.4 }, { x: 0.7, y: 0.7, duration: 0.7, immediateRender: false }, land + 1.3)

    /* The shrine wakes: its beam rises and a small Rigel settles into it */
    .set(shrineStar, { visible: true }, land + 1.5)
    .fromTo(shrineStar.material, { opacity: 0 }, { opacity: 0.95, duration: 0.9, immediateRender: false }, land + 1.5)
    .fromTo(shrineStar.scale, { x: 0.4, y: 0.4 }, { x: 2.4, y: 2.4, duration: 0.9, ease: "back.out(2)", immediateRender: false }, land + 1.5)
    .to(island.beamMat.uniforms.strength, { value: 0.85, duration: 1.4, ease: "sine.inOut" }, land + 1.4)

    /* The header, name plates and control card arrive once the robot is standing; controls unlock */
    .call(
      () => {
        setIntroLive(false);
        root.classList.remove("world-intro");
      },
      null,
      land + 0.7
    )
    .to(pose, { raise: 0, tilt: 0, duration: 0.7, ease: "power2.inOut" }, land + 2.6);

  setIntroLive(true);
}


  const speedUp = () => intro?.timeScale(Math.max(intro.timeScale(), 3.5));
  const finishIntro = () => intro?.progress(1);

  /* Loading, shader warm-up & boot star reveal */
  let loaded = false;
  let revealed = false;
  let frames = 0;

  const loadPct = boot?.querySelector(".world-boot-pct");
  let loadShown = 0;
  const setLoad = (fraction) => {
    if (fraction > loadShown) field.pulse(0.5 + (fraction - loadShown) * 1.5);
    loadShown = Math.max(loadShown, fraction);
    boot?.style.setProperty("--load", fraction.toFixed(3));
    if (loadPct) loadPct.textContent = `${Math.round(fraction * 100)}%`;
  };

  /* The star twinkles for at least this long after navigation, so it reads as a moment, not a flicker. */
  const holdUntil = seenIntro ? 500 : 1500;

  function reveal() {
    if (revealed || !loaded || frames < 2) {
      return;
    }

    revealed = true;
    setLoad(1);
    if (isDevMap) {
      root.classList.add("world-ready");
      endIntro();
      boot?.remove();
      return;
    }
    window.setTimeout(playIntro, Math.max(350, holdUntil - performance.now()));
  }

  /* The loading screen covers every asset (textures, Niko's model) and the first-draw costs: shaders are compiled,
     textures uploaded and the shadow map baked behind the cover, so nothing pops in or hitches once the island shows. */
  const loading = { done: 0, total: 0, textures: fromDisk, niko: false, warm: false };
  const showProgress = () => setLoad(Math.min(0.96, (loading.done + (loading.niko ? 1 : 0)) / (loading.total + 1)));
  manager.onProgress = (_url, done, total) => {
    Object.assign(loading, { done, total });
    showProgress();
  };

  const prewarm = async () => {
    const shown = [];
    scene.traverse((node) => {
      if (!node.visible) {
        node.visible = true;
        shown.push(node);
      }
    });
    post.bind();
    try {
      await renderer.compileAsync(scene, camera);
      /* Programs differ per output; if adaptive quality later drops bloom, the screen versions are ready too */
      if (renderer.getRenderTarget()) {
        renderer.setRenderTarget(null);
        await renderer.compileAsync(scene, camera);
        post.bind();
      }
    } catch (error) {
      console.warn("Shader warm-up failed", error);
    }
    scene.traverse((node) => {
      [node.material].flat().forEach((material) => {
        ["map", "emissiveMap", "alphaMap", "gradientMap"].forEach((key) => material?.[key]?.isTexture && renderer.initTexture(material[key]));
      });
    });
    bakeShadows();
    post.render();
    shown.forEach((node) => (node.visible = false));
  };

  const finishLoading = async () => {
    if (!loading.textures || !loading.niko || loading.warm) return;
    loading.warm = true;
    await prewarm();
    loaded = true;
    reveal();
  };

  manager.onLoad = () => {
    loading.textures = true;
    finishLoading();
  };
  if (isDevMap) {
    loading.textures = true;
  }
  nikoReady.then(() => {
    loading.niko = true;
    showProgress();
    finishLoading();
  });

  /* Fallbacks for a stalled network: stop waiting on textures, then on Niko, but still warm up before revealing */
  window.setTimeout(() => {
    loading.textures = true;
    finishLoading();
  }, 15000);
  window.setTimeout(() => {
    loading.textures = true;
    loading.niko = true;
    finishLoading();
  }, 25000);
  window.setTimeout(() => {
    loaded = true;
    bakeShadows();
    reveal();
  }, 40000);

  const updateIntroFx = (dt, time) => {
    for (let i = fx.length - 1; i >= 0; i -= 1) {
      if (!fx[i](dt)) {
        fx.splice(i, 1);
      }
    }

    if (shrineStar.visible) {
      shrineStar.position.y = island.shrine.y + 4.6 + (calm ? 0 : Math.sin(time * 1.4) * 0.18);
      shrineStar.material.rotation = calm ? 0 : Math.sin(time * 0.5) * 0.15;
      if (climate.state.unlocked) {
        const cs = getClimateSample();
        shrineStar.material.opacity = 0.95 + cs.night * 0.2 + cs.storm * 0.1;
      }
    }
  };

  const applyShake = (dt) => {
    if (shake > 0) {
      camera.translateX((Math.random() - 0.5) * shake);
      camera.translateY((Math.random() - 0.5) * shake);
      shake = Math.max(0, shake - dt * 1.8);
    }
  };

  const stepFrame = () => {
    frames += 1;
    if (frames === 2) {
      reveal();
    }
  };

  return {
    playIntro,
    speedUp,
    finishIntro,
    updateIntroFx,
    applyShake,
    stepFrame,
    getFrames: () => frames,
    addShake: (amt) => {
      shake = Math.max(shake, amt);
    },
    isIntroLive: () => introLive,
    hasIntro: () => Boolean(intro),
    isCovered: () => Boolean(boot && root.classList.contains("world-intro") && boot.style.visibility !== "hidden" && (boot.style.opacity === "" || boot.style.opacity === "1")),
    shrineStar,
  };
}
