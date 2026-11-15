import * as THREE from "three";

/** Stick, keys, pad, and pointer move intent. */
export function createInput(ctx) {
  const {
    host,
    canvas,
    state,
    getIntroLive,
    overlayOpen,
    zoomBy,
    orbitBy,
    playLog,
    onSpeedUp,
    onTryLock,
    onPunch,
    onOnePunch,
    onInteract,
    getCursorLockPoint,
    playLogInput: playLogInputIn,
  } = ctx;

  const cursor = { x: 0.5, y: 0.5, on: false };
  let press = null;
  let orbitDrag = null;

  /* Floating stick: a touch that drags turns into a joystick where the drag began, and the base stays put there;
     a quick tap still walks there. Two fingers pinch to zoom instead. */
  const STICK = 46;
  const stick = { on: false, x: 0, y: 0, base: { x: 0, y: 0 } };
  const stickEl = document.createElement("div");
  stickEl.className = "world-stick";
  stickEl.setAttribute("aria-hidden", "true");
  const knobEl = document.createElement("span");
  knobEl.className = "world-stick-knob";
  stickEl.append(knobEl);
  host.append(stickEl);

  const placeStick = () => {
    const rect = host.getBoundingClientRect();
    stickEl.style.translate = `${(stick.base.x - rect.left).toFixed(1)}px ${(stick.base.y - rect.top).toFixed(1)}px`;
    knobEl.style.translate = `${(stick.x * STICK).toFixed(1)}px ${(stick.y * STICK).toFixed(1)}px`;
  };

  const releaseStick = () => {
    stick.on = false;
    stick.x = stick.y = 0;
    stickEl.classList.remove("is-on");
  };

  const touches = new Map();
  let pinch = null;
  const spread = () => {
    const [a, b] = touches.values();
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  };

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const rect = host.getBoundingClientRect();
    cursor.x = (event.clientX - rect.left) / Math.max(1, rect.width);
    cursor.y = (event.clientY - rect.top) / Math.max(1, rect.height);
    cursor.on = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  });
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) cursor.on = false;
  });
  window.addEventListener("blur", () => {
    cursor.on = false;
  });

  canvas.addEventListener("pointerdown", (event) => {
    const introLive = getIntroLive();
    if (event.button === 1) {
      event.preventDefault();
      if (!introLive) onTryLock?.(event.clientX, event.clientY);
      return;
    }
    if (event.button === 2) {
      if (event.pointerType === "mouse" && !introLive) {
        orbitDrag = { id: event.pointerId, x: event.clientX };
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* The pointer is already gone. The drag still tracks from the move events. */
        }
      }
      return;
    }
    if (event.pointerType !== "mouse") {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture?.(event.pointerId);
    }
    if (touches.size >= 2) {
      press = null;
      releaseStick();
      if (!pinch && !introLive) pinch = { dist: spread() };
      return;
    }
    if (press || pinch) return;
    press = document.hasFocus() ? { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType !== "mouse" } : null;
  });

  canvas.addEventListener("pointermove", (event) => {
    if (orbitDrag && event.pointerId === orbitDrag.id) {
      const dx = event.clientX - orbitDrag.x;
      orbitDrag.x = event.clientX;
      orbitBy?.(dx);
      return;
    }
    const touch = touches.get(event.pointerId);
    if (touch) {
      touch.x = event.clientX;
      touch.y = event.clientY;
    }
    if (pinch) {
      if (touches.size >= 2) {
        const dist = spread();
        zoomBy?.(dist / pinch.dist, true);
        pinch.dist = dist;
      }
      return;
    }

    if (!press?.touch || event.pointerId !== press.id || getIntroLive() || overlayOpen()) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    const len = Math.hypot(dx, dy);

    if (!stick.on) {
      if (len < 12) return;
      stick.on = true;
      stick.base.x = press.x;
      stick.base.y = press.y;
      stickEl.classList.add("is-on");
    }

    const k = len > STICK ? STICK / len : 1;
    stick.x = (dx * k) / STICK;
    stick.y = (dy * k) / STICK;
    placeStick();
  });

  /* Returns true while the touch belonged to a pinch, so lifting a finger from it neither taps nor steers */
  const lift = (event) => {
    touches.delete(event.pointerId);
    if (!pinch) return false;
    if (!touches.size) pinch = null;
    press = null;
    return true;
  };

  const dropPress = (event) => {
    if (orbitDrag && event.pointerId === orbitDrag.id) orbitDrag = null;
    if (lift(event)) return;
    if (press && event.pointerId !== press.id) return;
    press = null;
    releaseStick();
  };
  canvas.addEventListener("pointercancel", dropPress);
  canvas.addEventListener("lostpointercapture", dropPress);

  canvas.addEventListener("pointerup", (event) => {
    if (orbitDrag && event.pointerId === orbitDrag.id) {
      orbitDrag = null;
      return;
    }
    if (lift(event)) {
      return;
    }
    if (press && event.pointerId !== press.id) {
      return;
    }

    if (getIntroLive()) {
      press = null;
      onSpeedUp?.();
      return;
    }

    if (stick.on) {
      press = null;
      releaseStick();
      return;
    }

    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      press = null;
      return;
    }

    press = null;
    /* Click movement system removed: clicking on the game canvas does not move Niko */
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (getIntroLive()) return;
      const lines = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
      zoomBy?.(Math.exp(-THREE.MathUtils.clamp(event.deltaY * lines, -240, 240) * 0.0015));
    },
    { passive: false }
  );

  /* Input: keyboard and controller */

  const moveKeys = {
    w: [0, -1],
    arrowup: [0, -1],
    s: [0, 1],
    arrowdown: [0, 1],
    a: [-1, 0],
    arrowleft: [-1, 0],
    d: [1, 0],
    arrowright: [1, 0],
  };
  /* Newest opposite key wins (A+D / W+S). Summing them to 0 was cancelling input mid-sprint
     and firing STOP instead of a 180 — see log-report sprint→stop on a+d+shift. */
  const moveKeyAt = Object.create(null);
  let moveKeySeq = 0;
  for (const key of Object.keys(moveKeys)) moveKeyAt[key] = 0;

  const typing = (target) => target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]");

  const playLogInput = playLogInputIn || { x: 0, z: 0 };

  window.addEventListener("keydown", (event) => {
    if (overlayOpen() || typing(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const idle = event.target === document.body || event.target === canvas;

    /* Play-log hotkeys work even during intro. */
    if (key === "f8") {
      event.preventDefault();
      playLog?.mark();
      return;
    }
    if (key === "f9") {
      event.preventDefault();
      if (!playLog?.enabled) playLog?.enable("f9");
      playLog?.download("log-report");
      return;
    }
    if (key === "f10") {
      event.preventDefault();
      if (!playLog?.enabled) playLog?.enable("f10");
      void playLog?.copy();
      return;
    }

    if (getIntroLive()) {
      if (key !== "tab" && key !== "shift") {
        onSpeedUp?.();
      }
      return;
    }

    if (key === "f") {
      event.preventDefault();
      onPunch?.();
      playLog?.note("punch", { type: "flyingKnee" });
    } else if (key === "g") {
      event.preventDefault();
      onOnePunch?.();
      playLog?.note("punch", { type: "onePunch" });
    } else if (key === "t") {
      event.preventDefault();
      const point = getCursorLockPoint?.(cursor);
      if (point) {
        const locked = onTryLock?.(point.x, point.y);
        playLog?.note("lock", { on: Boolean(locked) });
      }
    } else if (moveKeys[key] && (idle || !key.startsWith("arrow"))) {
      event.preventDefault();
      if (!state.keys.has(key)) playLog?.input(key, true);
      state.keys.add(key);
      moveKeyAt[key] = ++moveKeySeq;
    } else if (key === "shift" || key === "shiftleft" || key === "shiftright" || event.shiftKey) {
      if (!state.keys.has("shift")) playLog?.input("shift", true);
      state.keys.add("shift");
    } else if (key === "e" || ((key === "enter" || key === " ") && idle)) {
      if (state.near) {
        event.preventDefault();
        onInteract?.();
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (state.keys.has(key)) playLog?.input(key, false);
    state.keys.delete(key);
    if (event.key === "Shift" || key === "shift" || !event.shiftKey) {
      if (state.keys.has("shift")) playLog?.input("shift", false);
      state.keys.delete("shift");
      state.keys.delete("shiftleft");
      state.keys.delete("shiftright");
    }
  });

  const clearPointer = () => {
    press = null;
    touches.clear();
    pinch = null;
    releaseStick();
  };

  const clearKeys = () => {
    state.keys.clear();
  };

  window.addEventListener("blur", () => {
    clearKeys();
    clearPointer();
  });

  let padA = false;
  const readPad = () => {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);

    if (!pad) {
      return null;
    }

    let x = pad.axes[0] || 0;
    let y = pad.axes[1] || 0;

    if (Math.hypot(x, y) < 0.25) {
      x = 0;
      y = 0;
    }

    x += (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    y += (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);

    const a = Boolean(pad.buttons[0]?.pressed);
    if (a && !padA && state.near) {
      onInteract?.();
    }
    padA = a;

    return { x, y };
  };

  const pickAxis = (negKeys, posKeys) => {
    let negT = -1;
    let posT = -1;
    for (const key of negKeys) {
      if (state.keys.has(key) && moveKeyAt[key] >= negT) negT = moveKeyAt[key];
    }
    for (const key of posKeys) {
      if (state.keys.has(key) && moveKeyAt[key] >= posT) posT = moveKeyAt[key];
    }
    if (negT < 0 && posT < 0) return 0;
    if (negT < 0) return 1;
    if (posT < 0) return -1;
    return negT >= posT ? -1 : 1;
  };

  const steer = new THREE.Vector3();

  /* Screen-space input maps onto the floor along the camera's yaw. W walks the way the camera looks. */
  const inputVector = (screenRight, screenUp) => {
    /* Last-pressed wins on each axis so A-while-D (or W-while-S) stays a real reverse, not zero. */
    let x = pickAxis(["a", "arrowleft"], ["d", "arrowright"]);
    let y = pickAxis(["w", "arrowup"], ["s", "arrowdown"]);

    const pad = readPad();
    if (pad) {
      x += pad.x;
      y += pad.y;
    }

    /* A light push walks slower; the run clip slows with it so the feet don't skate */
    const push = Math.hypot(stick.x, stick.y);
    if (stick.on && push > 0.2) {
      const pace = 0.4 + 0.6 * Math.min(1, (push - 0.2) / 0.55);
      x += (stick.x / push) * pace;
      y += (stick.y / push) * pace;
    }

    steer.set(0, 0, 0).addScaledVector(screenRight, x).addScaledVector(screenUp, -y);
    if (steer.lengthSq() > 1) {
      steer.normalize();
    }
    return steer;
  };

  const pressMove = (key) => {
    const k = String(key || "").toLowerCase();
    if (!moveKeys[k]) return false;
    state.keys.add(k);
    moveKeyAt[k] = ++moveKeySeq;
    return true;
  };

  const releaseMove = (key) => {
    const k = String(key || "").toLowerCase();
    state.keys.delete(k);
    return true;
  };

  return {
    stick,
    cursor,
    playLogInput,
    moveKeys,
    inputVector,
    releaseStick,
    clearPointer,
    clearKeys,
    getCursor: () => cursor,
    pressMove,
    releaseMove,
  };
}
