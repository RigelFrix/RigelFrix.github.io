/* Structured play-log for PortfolioWorld.
   Agent-readable timeline of inputs + locomotion decisions (not a raw console paste).
   Enable with ?log=1, or PortfolioWorld.log.enable(). Dump/download as `log-report`. */

const MAX_EVENTS = 4000;
const SAMPLE_HZ = 12;

const n = (v, d = 2) => {
  const x = Number(v);
  return Number.isFinite(x) ? +x.toFixed(d) : 0;
};
const deg = (rad) => n((rad || 0) * (180 / Math.PI), 1);
const vec = (v) => (v ? [n(v.x, 3), n(v.z, 3)] : [0, 0]);
const keysOf = (set) => (set && set.size ? [...set].sort().join("+") : "-");

const fmtFields = (fields) => {
  if (!fields) return "";
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      if (typeof v === "boolean") return `${k}=${v ? "1" : "0"}`;
      if (Array.isArray(v)) return `${k}=[${v.join(",")}]`;
      if (typeof v === "number") return `${k}=${Number.isInteger(v) ? v : n(v, 3)}`;
      return `${k}=${String(v).replace(/\s+/g, "_")}`;
    })
    .join(" ");
};

export function createPlayLog({ getMeta, getSnap, host } = {}) {
  let on = false;
  let t0 = 0;
  let now = 0;
  let sampleAcc = 0;
  let events = [];
  let badge = null;
  let lastSample = null;
  let lastMode = "idle";
  let counts = {
    inputDown: 0,
    inputUp: 0,
    samples: 0,
    turn180Start: 0,
    turn180End: 0,
    turn180Reject: 0,
    marks: 0,
    notes: 0,
  };

  const meta = () => {
    try {
      return getMeta?.() || {};
    } catch {
      return {};
    }
  };

  const snap = () => {
    try {
      return getSnap?.() || null;
    } catch {
      return null;
    }
  };

  const modeOf = (s) => {
    if (!s) return "idle";
    if (s.turning180) return "turn180";
    if (s.stopping) return "stop";
    if (s.punching) return "punch";
    if (s.speed >= 7.5 || s.sprint >= 0.55) return "sprint";
    if (s.moving || s.speed > 0.15) return "jog";
    return "idle";
  };

  const push = (kind, fields, opts = {}) => {
    if (!on && !opts.force) return;
    if (events.length >= MAX_EVENTS) events.shift();
    const row = { t: n(now, 3), kind, ...fields };
    events.push(row);
    if (badge) {
      badge.dataset.count = String(events.length);
      badge.querySelector("b").textContent = String(events.length);
      badge.querySelector("em").textContent = kind;
    }
    return row;
  };

  const ensureBadge = () => {
    if (!host || badge) return;
    badge = document.createElement("div");
    badge.className = "play-log-badge";
    badge.innerHTML = `<span>PLAY-LOG</span><b>0</b><em>ready</em><small>F8 mark · F9 dump · F10 copy</small>`;
    host.appendChild(badge);
  };

  const removeBadge = () => {
    badge?.remove();
    badge = null;
  };

  const changedEnough = (a, b) => {
    if (!a || !b) return true;
    if (a.mode !== b.mode) return true;
    if (a.keys !== b.keys) return true;
    if (Math.abs(a.speed - b.speed) > 0.35) return true;
    if (Math.abs(a.yaw - b.yaw) > 8) return true;
    if (Math.abs(a.face - b.face) > 8) return true;
    if (Math.abs(a.bank - b.bank) > 0.04) return true;
    if (Math.abs((a.twist || 0) - (b.twist || 0)) > 0.06) return true;
    if (Math.abs(a.omega - b.omega) > 0.35) return true;
    if (a.turning180 !== b.turning180) return true;
    if (a.stopping !== b.stopping) return true;
    return false;
  };

  const sampleFields = (s) => {
    if (!s) return null;
    return {
      mode: modeOf(s),
      keys: keysOf(s.keys),
      speed: n(s.speed, 2),
      sprint: n(s.sprint, 2),
      yaw: deg(s.yaw),
      face: deg(s.face),
      move: vec(s.moveDir),
      input: vec(s.input),
      bank: n(s.bank, 3),
      lead: n(s.turnLead, 3),
      twist: n(s.chestTwist, 3),
      omega: n(s.pathOmega, 2),
      travelDot: s.travelDot == null ? undefined : n(s.travelDot, 2),
      turning180: Boolean(s.turning180),
      stopping: Boolean(s.stopping),
      punch: Boolean(s.punching),
      lock: Boolean(s.lock),
      pos: s.pos ? [n(s.pos.x, 2), n(s.pos.z, 2)] : undefined,
      turnW: s.turn180Weight == null ? undefined : n(s.turn180Weight, 2),
      sprintW: s.sprintWeight == null ? undefined : n(s.sprintWeight, 2),
    };
  };

  const enable = (reason = "manual") => {
    if (on) return api;
    on = true;
    t0 = performance.now();
    now = 0;
    sampleAcc = 0;
    events = [];
    lastSample = null;
    lastMode = "idle";
    counts = {
      inputDown: 0,
      inputUp: 0,
      samples: 0,
      turn180Start: 0,
      turn180End: 0,
      turn180Reject: 0,
      marks: 0,
      notes: 0,
    };
    ensureBadge();
    const m = meta();
    push("SESSION", {
      action: "start",
      reason,
      url: m.url || location.href,
      map: m.map || "island",
      view: m.view || "world",
      bundle: m.bundle || "",
      ua: (navigator.userAgent || "").slice(0, 80),
    }, { force: true });
    console.info("[play-log] recording — F8 mark, F9 download log-report, F10 copy, PortfolioWorld.log.dump()");
    return api;
  };

  const disable = (reason = "manual") => {
    if (!on) return api;
    push("SESSION", { action: "stop", reason, events: events.length });
    on = false;
    removeBadge();
    console.info("[play-log] stopped");
    return api;
  };

  const clear = () => {
    events = [];
    lastSample = null;
    if (badge) badge.querySelector("b").textContent = "0";
    return api;
  };

  const input = (key, down) => {
    if (!on) return;
    if (down) counts.inputDown += 1;
    else counts.inputUp += 1;
    const s = sampleFields(snap());
    push("INPUT", {
      key: String(key).toLowerCase(),
      edge: down ? "down" : "up",
      keys: s?.keys,
      mode: s?.mode,
      speed: s?.speed,
    });
  };

  const note = (tag, fields) => {
    if (!on) return;
    counts.notes += 1;
    push("NOTE", { tag, ...fields });
  };

  const mark = (label = "") => {
    if (!on) enable("mark");
    counts.marks += 1;
    const s = sampleFields(snap());
    push("MARK", { label: label || `mark-${counts.marks}`, ...s });
    console.info(`[play-log] mark @ t=${n(now, 2)}s`, label || "");
    return api;
  };

  const decision = (kind, fields) => {
    if (!on) return;
    if (kind === "TURN180_START") counts.turn180Start += 1;
    if (kind === "TURN180_END") counts.turn180End += 1;
    if (kind === "TURN180_REJECT") counts.turn180Reject += 1;
    push(kind, fields);
  };

  const frame = (dt) => {
    if (!on) return;
    now = (performance.now() - t0) / 1000;
    const s = sampleFields(snap());
    if (!s) return;

    if (s.mode !== lastMode) {
      push("LOCO", { from: lastMode, to: s.mode, speed: s.speed, keys: s.keys, yaw: s.yaw, face: s.face, move: s.move });
      lastMode = s.mode;
    }

    sampleAcc += dt;
    const due = sampleAcc >= 1 / SAMPLE_HZ;
    if (due) sampleAcc = 0;
    if ((due || changedEnough(lastSample, s)) && (s.mode !== "idle" || changedEnough(lastSample, s))) {
      counts.samples += 1;
      push("SAMPLE", s);
      lastSample = s;
    }
  };

  const dump = () => {
    const m = meta();
    const duration = n(now, 2);
    const lines = [];
    lines.push("# PortfolioWorld play-log (agent-readable)");
    lines.push(`# Saved as log-report — paste this file when reporting locomotion / input bugs.`);
    lines.push(`session_end: ${new Date().toISOString()}`);
    lines.push(`duration_s: ${duration}`);
    lines.push(`url: ${m.url || location.href}`);
    lines.push(`map: ${m.map || "island"}`);
    lines.push(`bundle: ${m.bundle || ""}`);
    lines.push(`events: ${events.length}`);
    lines.push("");
    lines.push("## How to read");
    lines.push("- INPUT  = key edge (down/up). keys= currently held set.");
    lines.push("- LOCO   = mode change: idle|jog|sprint|turn180|stop|punch.");
    lines.push("- SAMPLE = periodic snapshot while active (speed, yaw/face deg, move/input xz, bank, omega).");
    lines.push("- TURN180_START/END/REJECT = 180 arm decisions with gate values.");
    lines.push("- MARK   = player bookmark (F8). Use these timestamps when describing a bug.");
    lines.push("- NOTE   = explicit instrumentation from game code.");
    lines.push("");
    lines.push("## Summary");
    lines.push(`- input_down: ${counts.inputDown}`);
    lines.push(`- input_up: ${counts.inputUp}`);
    lines.push(`- samples: ${counts.samples}`);
    lines.push(`- turn180_start: ${counts.turn180Start}`);
    lines.push(`- turn180_end: ${counts.turn180End}`);
    lines.push(`- turn180_reject: ${counts.turn180Reject}`);
    lines.push(`- marks: ${counts.marks}`);
    lines.push(`- notes: ${counts.notes}`);
    lines.push("");
    lines.push("## Timeline");
    for (const e of events) {
      const { t, kind, ...rest } = e;
      lines.push(`t=${String(t).padStart(7, " ")}  [${kind}]  ${fmtFields(rest)}`);
    }
    lines.push("");
    lines.push("## End");
    return lines.join("\n");
  };

  const download = (filename = "log-report") => {
    const text = dump();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    console.info(`[play-log] downloaded ${filename} (${events.length} events)`);
    return text;
  };

  const copy = async () => {
    const text = dump();
    try {
      await navigator.clipboard.writeText(text);
      console.info(`[play-log] copied ${events.length} events to clipboard`);
    } catch (err) {
      console.warn("[play-log] clipboard failed; use download()", err);
    }
    return text;
  };

  const api = {
    enable,
    disable,
    clear,
    input,
    note,
    mark,
    decision,
    frame,
    dump,
    download,
    copy,
    get enabled() {
      return on;
    },
    get size() {
      return events.length;
    },
    get time() {
      return n(now, 3);
    },
  };
  return api;
}
