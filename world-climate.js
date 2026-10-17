/* Island environment controller: one clock for the day, the weather and the wind, so every system reads the same
   state each frame.

   - Day: hour 0–24 runs on its own (DAY_SECONDS per day) and only decides light.
   - Weather: a named preset (storm, rain, overcast, fair, windy, gale, warm, heat) or a point on the 1–5 wheel
     (storm … fair … heat), which blends the two nearest wheel presets. Either one only sets a goal.
   - Channels: every number of the goal (cloud, wind, rain, fog, heat, light levels, sky and grade colours, water)
     chases it at its own pace. Clouds move first, rain only falls once the sky is heavy and stops before it clears,
     the ground stays wet after the rain and dries slowly. That ordering is what makes a change read as weather.
   - Wind: strength plus slow gusts, and a phase integrated from the strength every frame. Shaders sway on the phase,
     so speeding the wind up or down never makes the grass jump.

   sample() returns the blended env. Before unlock() the day and weather hold still and the look is faded in by
   state.dawn (the intro's night-to-day), so unlocking after the intro changes nothing on screen. */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (t) => t * t * (3 - 2 * t);
/* Frame-rate independent ease toward a target, `rate` per second */
const chase = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));

const DAY_SECONDS = 600;

/* clouds = how much of the ground sits under drifting cloud shadow, rays = god-ray amount. Both are layers: the
   weather proposes them, the tester (or set({clouds, rays})) can pin either on top of any weather. Rays below
   RAY_THRESHOLD draw nothing, so faint values in fair presets never leave a haze. */
const PRESETS = {
  storm: { name: "Storm", wind: 2.6, gust: 0.9, rain: 1, cloud: 1, fog: 0.7, heat: 0, sun: 0.12, hemi: 0.5, fill: 0.4, rim: 0.18, sky: [0.22, 0.28, 0.38], grade: [0.78, 0.84, 0.95], water: 1.35, bolt: 1, clouds: 0.9, rays: 0 },
  rain: { name: "Rain", wind: 1.25, gust: 0.4, rain: 0.62, cloud: 0.86, fog: 0.42, heat: 0, sun: 0.36, hemi: 0.66, fill: 0.52, rim: 0.3, sky: [0.4, 0.47, 0.57], grade: [0.86, 0.89, 0.96], water: 1.12, bolt: 0, clouds: 0.85, rays: 0 },
  overcast: { name: "Overcast", wind: 1.05, gust: 0.35, rain: 0, cloud: 0.7, fog: 0.22, heat: 0, sun: 0.58, hemi: 0.8, fill: 0.66, rim: 0.48, sky: [0.52, 0.6, 0.7], grade: [0.92, 0.94, 0.98], water: 1.06, bolt: 0, clouds: 0.8, rays: 0.2 },
  cloudy: { name: "Cloudy", wind: 1.2, gust: 0.45, rain: 0, cloud: 0.5, fog: 0.08, heat: 0, sun: 1.08, hemi: 0.9, fill: 0.85, rim: 1.05, sky: [0.5, 0.68, 0.88], grade: [1.02, 1, 0.97], water: 1.05, bolt: 0, clouds: 0.6, rays: 0.85 },
  fair: { name: "Fair", wind: 1, gust: 0.35, rain: 0, cloud: 0.32, fog: 0.05, heat: 0, sun: 1, hemi: 1, fill: 1, rim: 1, sky: [0.44, 0.71, 0.92], grade: [1, 1, 1], water: 1, bolt: 0, clouds: 0.25, rays: 0 },
  windy: { name: "Windy", wind: 1.8, gust: 0.65, rain: 0, cloud: 0.4, fog: 0.04, heat: 0, sun: 1, hemi: 1, fill: 0.96, rim: 1.05, sky: [0.46, 0.72, 0.93], grade: [0.98, 1, 1.02], water: 1.16, bolt: 0, clouds: 0.35, rays: 0.1 },
  gale: { name: "Strong wind", wind: 2.7, gust: 1, rain: 0, cloud: 0.62, fog: 0.12, heat: 0, sun: 0.72, hemi: 0.86, fill: 0.76, rim: 0.65, sky: [0.48, 0.58, 0.7], grade: [0.92, 0.95, 1], water: 1.3, bolt: 0, clouds: 0.55, rays: 0.1 },
  warm: { name: "Warm", wind: 0.6, gust: 0.25, rain: 0, cloud: 0.18, fog: 0.08, heat: 0.45, sun: 1.15, hemi: 0.95, fill: 0.9, rim: 1.1, sky: [0.55, 0.72, 0.88], grade: [1.08, 1.02, 0.92], water: 0.95, bolt: 0, clouds: 0.15, rays: 0.15 },
  heat: { name: "Heatwave", wind: 0.3, gust: 0.12, rain: 0, cloud: 0.04, fog: 0.15, heat: 1, sun: 1.35, hemi: 0.85, fill: 0.7, rim: 1.25, sky: [0.72, 0.82, 0.92], grade: [1.14, 1.06, 0.88], water: 0.85, bolt: 0, clouds: 0.05, rays: 0 },
};
const RAY_THRESHOLD = 0.15;
/* Cloud layer amount → shader threshold (noise above it is under cloud) and shadow darkness */
const cloudCoverFor = (amount) => mix(0.8, 0.34, clamp(amount, 0, 1));
const cloudShadeFor = (amount) => 0.8 * smooth(clamp(amount / 0.12, 0, 1));
const WHEEL = ["storm", "rain", "fair", "warm", "heat"];
const KEYS = Object.keys(PRESETS.fair).filter((key) => key !== "name");

/* Fractional wheel position → blended goal between the two nearest wheel presets */
const wheelGoal = (w) => {
  const x = clamp(w, 1, 5);
  const lo = Math.floor(x);
  const hi = Math.min(5, lo + 1);
  const t = smooth(x - lo);
  const a = PRESETS[WHEEL[lo - 1]];
  const b = PRESETS[WHEEL[hi - 1]];
  const out = { name: t < 0.5 ? a.name : b.name };
  for (const key of KEYS) out[key] = Array.isArray(a[key]) ? mix3(a[key], b[key], t) : mix(a[key], b[key], t);
  return out;
};
const copyGoal = (preset) => {
  const out = { name: preset.name };
  for (const key of KEYS) out[key] = Array.isArray(preset[key]) ? [...preset[key]] : preset[key];
  return out;
};

/* How fast each value follows the goal, per second. Clouds lead, light and colour follow, heat lags. */
const RATES = { cloud: 0.32, wind: 0.26, gust: 0.4, heat: 0.18, sky: 0.24, grade: 0.24, sun: 0.26, hemi: 0.26, fill: 0.26, rim: 0.26, water: 0.2, bolt: 0.5, clouds: 0.2, rays: 0.25 };

/* Day curve: 0 night … 1 noon. Matches the intro's --dawn feel at morning. */
const dayFactor = (hour) => {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 0.02;
  if (h < 7) return smooth((h - 5) / 2) * 0.7;
  if (h < 9) return 0.7 + smooth((h - 7) / 2) * 0.3;
  if (h < 16) return 1;
  if (h < 18) return 1 - smooth((h - 16) / 2) * 0.22;
  if (h < 20) return 0.78 - smooth((h - 18) / 2) * 0.73;
  return 0.05;
};

const golden = (hour) => {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 16 && h < 18.5) return smooth(1 - Math.abs(h - 17.2) / 1.3);
  if (h >= 5.5 && h < 7) return smooth(1 - Math.abs(h - 6.2) / 0.8) * 0.55;
  return 0;
};

/* Auto weather walks between neighbours, so it builds up (fair → overcast → rain → storm) instead of jumping */
const NEXT = {
  fair: [["fair", 0.24], ["windy", 0.18], ["cloudy", 0.24], ["overcast", 0.12], ["warm", 0.22]],
  cloudy: [["fair", 0.4], ["overcast", 0.35], ["windy", 0.25]],
  windy: [["fair", 0.4], ["gale", 0.3], ["cloudy", 0.15], ["overcast", 0.15]],
  gale: [["windy", 0.55], ["storm", 0.25], ["overcast", 0.2]],
  overcast: [["rain", 0.4], ["cloudy", 0.3], ["fair", 0.15], ["windy", 0.15]],
  rain: [["overcast", 0.5], ["storm", 0.3], ["rain", 0.2]],
  storm: [["rain", 0.7], ["gale", 0.3]],
  warm: [["fair", 0.5], ["heat", 0.3], ["warm", 0.2]],
  heat: [["warm", 0.75], ["fair", 0.25]],
};
const pickNext = (current) => {
  const options = NEXT[current] || NEXT.fair;
  let roll = Math.random();
  for (const [name, weight] of options) if ((roll -= weight) <= 0) return name;
  return "fair";
};

/* Sun and moon: one shadow-casting light that crosses the sky from screen left (rise) to screen right (set), always a
   little behind the island so shadows fall toward the viewer (a light behind the camera hides every shadow). The sun
   owns RISE..SET, the moon the rest of the night; each fades out at its horizon, so the hand-over is invisible.
   Height is floored so low light still throws readable, not endless, shadows. Camera looks down (-1, -1.45, -1). */
const RISE = 5.5;
const SET = 19.5;
const SCREEN_RIGHT = [Math.SQRT1_2, 0, -Math.SQRT1_2];
const SCREEN_AWAY = [-Math.SQRT1_2, 0, -Math.SQRT1_2];
const arc = (t) => {
  const a = t * Math.PI;
  const side = -Math.cos(a) * 1.2;
  const up = Math.max(0.3, 0.1 + Math.sin(a) * 0.78);
  const v = [SCREEN_RIGHT[0] * side + SCREEN_AWAY[0] * 0.3, up, SCREEN_RIGHT[2] * side + SCREEN_AWAY[2] * 0.3];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
};
const celestial = (hour) => {
  const h = ((hour % 24) + 24) % 24;
  const isSun = h >= RISE && h < SET;
  const t = isSun ? (h - RISE) / (SET - RISE) : ((h >= SET ? h - SET : h + 24 - SET) / (24 - SET + RISE));
  return { dir: arc(t), moon: isSun ? 0 : 1, fade: smooth(clamp(Math.sin(t * Math.PI) / 0.22, 0, 1)) };
};

/* Light colours (sRGB) by day and by night: moonlit blue sky and shade, a cool silver rim */
const TINT = {
  hemiSky: [[0.81, 0.89, 1], [0.36, 0.46, 0.8]],
  hemiGround: [[0.6, 0.54, 0.41], [0.15, 0.16, 0.26]],
  fill: [[0.56, 0.74, 1], [0.42, 0.52, 0.95]],
  rim: [[1, 0.78, 0.6], [0.62, 0.72, 1]],
};
const MOON = [0.6, 0.7, 1];

/* The tester panel is only for testing: ?climate=1 */
export const createClimate = ({ host, lights, lightsOn, lite = false, calm = false, params = new URLSearchParams() } = {}) => {
  const forcedHour = params.has("hour") ? +params.get("hour") : null;
  const forcedWeather = params.get("weather");
  const debugUi = params.get("climate") === "1";

  const START_HOUR = 10;
  /* Fair weather holds this long after unlock before auto weather starts picking */
  const SETTLE = 90;

  const goalFrom = (weather) => {
    if (weather == null || weather === "") return null;
    if (PRESETS[weather]) return { goal: copyGoal(PRESETS[weather]), preset: weather, wheel: WHEEL.indexOf(weather) + 1 || null };
    const n = +weather;
    if (!Number.isFinite(n)) return null;
    const w = clamp(n, 1, 5);
    const near = WHEEL[Math.round(w) - 1];
    return { goal: wheelGoal(w), preset: Math.abs(w - Math.round(w)) < 0.01 ? near : null, wheel: w };
  };

  const start = goalFrom(forcedWeather) || goalFrom("fair");
  const state = {
    hour: forcedHour != null && Number.isFinite(forcedHour) ? forcedHour : START_HOUR,
    goal: start.goal,
    preset: start.preset,
    wheel: start.wheel,
    cur: copyGoal(start.goal),
    override: { wind: null, rain: null },
    /* Pinned layers survive weather changes; null = follow the weather */
    layers: { clouds: null, rays: null },
    unlocked: false,
    /* The intro's dawn (0 night … 1 day): until unlock the climate's own look is faded in by it */
    dawn: 1,
    autoDay: forcedHour == null,
    autoWeather: !goalFrom(forcedWeather),
    hold: SETTLE,
    wet: start.goal.rain,
    gust: 0,
    gustGoal: 0,
    gustTimer: 0,
    windPhase: 0,
    cloudPhase: 0,
    lightning: 0,
  };

  /* The goal with tester overrides on top: forcing rain also forces the heavy sky rain needs */
  const effectiveGoal = () => {
    const g = state.goal;
    const wind = state.override.wind ?? g.wind;
    const rain = state.override.rain ?? g.rain;
    const cloud = state.override.rain != null ? Math.max(g.cloud, 0.6 + rain * 0.4) : g.cloud;
    return { ...g, wind, rain, cloud, clouds: state.layers.clouds ?? g.clouds, rays: state.layers.rays ?? g.rays };
  };

  let panel = null;
  const ensurePanel = () => {
    if (!debugUi || panel || !host) return;
    panel = document.createElement("div");
    panel.className = "world-climate";
    const buttons = Object.entries(PRESETS)
      .map(([key, p]) => `<button type="button" data-preset="${key}">${p.name}</button>`)
      .join("");
    panel.innerHTML = [
      '<div class="world-climate-head"><strong>Weather tester</strong><button type="button" data-fold aria-expanded="true">–</button></div>',
      '<div class="world-climate-body">',
      `<div class="world-climate-presets">${buttons}</div>`,
      '<label>Wheel <small>storm · rain · fair · warm · heat</small><input type="range" min="1" max="5" step="0.05" data-k="wheel" /><b data-v="wheel"></b></label>',
      '<label>Wind <input type="range" min="0" max="3.5" step="0.05" data-k="wind" /><b data-v="wind"></b></label>',
      '<label>Rain <input type="range" min="0" max="1" step="0.02" data-k="rain" /><b data-v="rain"></b></label>',
      '<p class="world-climate-sub">Layers <small>stack on any weather · tap the value to hand it back</small></p>',
      '<label>Clouds <input type="range" min="0" max="1" step="0.02" data-k="clouds" /><button type="button" data-auto="clouds"></button></label>',
      '<label>Sun rays <input type="range" min="0" max="1" step="0.02" data-k="rays" /><button type="button" data-auto="rays"></button></label>',
      '<label>Hour <input type="range" min="0" max="24" step="0.05" data-k="hour" /><b data-v="hour"></b></label>',
      '<div class="world-climate-flags">',
      '<label><input type="checkbox" data-flag="instant" /> Instant</label>',
      '<label><input type="checkbox" data-flag="autoWeather" /> Auto weather</label>',
      '<label><input type="checkbox" data-flag="autoDay" /> Auto day</label>',
      "</div>",
      '<p class="world-climate-read" data-read></p>',
      "</div>",
    ].join("");
    host.appendChild(panel);
    /* Keep tester input away from the world: no click-to-walk, no WASD while a slider has focus */
    ["pointerdown", "pointerup", "click", "wheel", "touchstart", "keydown", "keyup"].forEach((type) =>
      panel.addEventListener(type, (event) => event.stopPropagation())
    );
    const instant = () => panel.querySelector('[data-flag="instant"]').checked;
    panel.querySelectorAll("[data-preset]").forEach((button) =>
      button.addEventListener("click", () => set({ weather: button.dataset.preset, instant: instant() }))
    );
    panel.querySelectorAll("[data-auto]").forEach((button) =>
      button.addEventListener("click", () => set({ [button.dataset.auto]: null, instant: instant() }))
    );
    panel.querySelector("[data-fold]").addEventListener("click", (event) => {
      const folded = panel.classList.toggle("is-folded");
      event.currentTarget.textContent = folded ? "+" : "–";
      event.currentTarget.setAttribute("aria-expanded", String(!folded));
    });
    panel.querySelectorAll("input[type=range]").forEach((input) => {
      input.addEventListener("input", () => {
        const k = input.dataset.k;
        const v = +input.value;
        if (k === "hour") set({ hour: v });
        else if (k === "wheel") set({ weather: v, instant: instant() });
        else set({ [k]: v, instant: instant() });
      });
    });
    panel.querySelectorAll("[data-flag]").forEach((input) => {
      const flag = input.dataset.flag;
      if (flag === "instant") return;
      input.addEventListener("change", () => set({ [flag]: input.checked }));
    });
  };

  const paintPanel = (s) => {
    if (!panel) return;
    const put = (k, value, text) => {
      const input = panel.querySelector(`[data-k="${k}"]`);
      if (document.activeElement !== input) input.value = String(value);
      const label = panel.querySelector(`[data-v="${k}"]`);
      if (label) label.textContent = text;
    };
    for (const k of ["clouds", "rays"]) {
      const pinned = state.layers[k];
      put(k, pinned ?? state.goal[k], "");
      const button = panel.querySelector(`[data-auto="${k}"]`);
      button.textContent = pinned == null ? "auto" : pinned.toFixed(2);
      button.classList.toggle("is-on", pinned != null);
    }
    put("wheel", state.wheel ?? 3, state.wheel != null ? state.wheel.toFixed(2) : "–");
    put("wind", state.override.wind ?? state.goal.wind, (state.override.wind ?? state.goal.wind).toFixed(2));
    put("rain", state.override.rain ?? state.goal.rain, (state.override.rain ?? state.goal.rain).toFixed(2));
    put("hour", state.hour, state.hour.toFixed(1));
    panel.querySelectorAll("[data-preset]").forEach((button) =>
      button.classList.toggle("is-on", button.dataset.preset === state.preset && state.override.wind == null && state.override.rain == null)
    );
    panel.querySelector('[data-flag="autoWeather"]').checked = state.autoWeather;
    panel.querySelector('[data-flag="autoDay"]').checked = state.autoDay;
    panel.querySelector("[data-read]").textContent =
      `${s.stage} · wind ${s.wind.toFixed(2)} · gust ${s.gust.toFixed(2)} · cloud ${s.cloud.toFixed(2)} · rain ${s.rain.toFixed(2)} · wet ${s.wet.toFixed(2)} · fog ${s.fog.toFixed(2)} · shadows ${s.clouds.toFixed(2)} · rays ${s.rays.toFixed(2)}`;
  };

  const sample = () => {
    const wx = state.cur;
    const day = dayFactor(state.hour);
    const gold = golden(state.hour);
    const night = 1 - day;
    /* Storm and heat come from the smoothed channels, so the grade follows the sky rather than the slider */
    const storm = clamp((wx.cloud - 0.32) / 0.68, 0, 1);
    const heat = wx.heat;
    const wind = wx.wind * (1 + state.gust * 0.55);

    const sky = celestial(state.hour);
    const sunMul = sky.moon
      ? 0.24 * sky.fade * night * (1 - storm * 0.75)
      : wx.sun * day * sky.fade * (1 - storm * 0.55);
    const hemiMul = mix(0.62, wx.hemi, day) * mix(1, 0.75, heat);
    const fillMul = mix(0.5, wx.fill, day);
    const rimMul = mix(0.45, wx.rim, day) * mix(1, 1.15, gold);
    const rain = lite ? 0 : wx.rain;
    /* How far the scene light has dropped: drives the night tints, lamp gain and Niko's own light */
    const dark = clamp(Math.max(night, storm * 0.7), 0, 1);

    return {
      hour: state.hour,
      weather: state.wheel ?? 3,
      target: state.wheel ?? 3,
      preset: state.preset,
      stage: state.goal.name,
      day,
      night,
      gold,
      storm,
      heat,
      cloud: wx.cloud,
      wind,
      windMul: wind,
      gust: state.gust,
      windPhase: state.windPhase,
      cloudPhase: state.cloudPhase,
      clouds: wx.clouds,
      cover: cloudCoverFor(wx.clouds),
      shade: cloudShadeFor(wx.clouds),
      /* Shafts need the sun up; rain and heavy sky only thin them, so a pinned layer still blends into any weather */
      rays:
        smooth(clamp((wx.rays - RAY_THRESHOLD) / (1 - RAY_THRESHOLD), 0, 1)) *
        (sky.moon ? 0 : sky.fade * day) *
        (1 - storm * 0.55) *
        (1 - clamp(wx.rain, 0, 1) * 0.6) *
        (lite ? 0.7 : 1),
      rain,
      wet: state.wet,
      fog: wx.fog,
      water: wx.water,
      lightning: state.lightning,
      dark,
      sunDir: sky.dir,
      moon: sky.moon,
      lampGain: 1 + night * 1.4 + storm * 0.4,
      sky: wx.sky,
      grade: mix3(wx.grade, [1.12, 0.95, 0.78], gold * day),
      lights: {
        sun: (lightsOn?.sun ?? 3.35) * sunMul,
        hemi: (lightsOn?.hemi ?? 0.85) * hemiMul,
        fill: (lightsOn?.fill ?? 0.55) * fillMul,
        rim: (lightsOn?.rim ?? 0.4) * rimMul,
      },
    };
  };

  /* During the intro the night-to-day fade is folded in here, so the hand-over at unlock changes nothing on screen */
  const NIGHT_LIGHTS = { sun: 0, hemi: 0.32, fill: 0.35, rim: 0.25 };
  const apply = (s) => {
    if (!host) return;
    const dawn = state.unlocked ? 1 : clamp(state.dawn, 0, 1);
    host.style.setProperty("--day", s.day.toFixed(3));
    host.style.setProperty("--dawn", (s.day * dawn).toFixed(3));
    host.style.setProperty("--storm", s.storm.toFixed(3));
    host.style.setProperty("--heat", s.heat.toFixed(3));
    host.style.setProperty("--gold", s.gold.toFixed(3));
    host.style.setProperty("--rain", s.rain.toFixed(3));
    host.style.setProperty("--wind", s.wind.toFixed(3));
    host.style.setProperty("--fog", s.fog.toFixed(3));
    const side = s.sunDir[0] * SCREEN_RIGHT[0] + s.sunDir[2] * SCREEN_RIGHT[2];
    host.style.setProperty("--sun-x", `${clamp(50 + side * 60, 2, 98).toFixed(1)}%`);
    if (lights) {
      const fade = (key, value, t = dawn) => mix(NIGHT_LIGHTS[key], value, t);
      if (lights.sun) lights.sun.intensity = fade("sun", s.lights.sun * (1 + s.lightning * 2.5), dawn * dawn);
      if (lights.hemi) lights.hemi.intensity = fade("hemi", s.lights.hemi * (1 + s.lightning * 1.2));
      if (lights.fill) lights.fill.intensity = fade("fill", s.lights.fill);
      if (lights.rim) lights.rim.intensity = fade("rim", s.lights.rim);
      const n = mix(1, s.night, dawn);
      const tint = (light, key, prop = "color") => light?.[prop]?.setRGB(...mix3(TINT[key][0], TINT[key][1], n), "srgb");
      tint(lights.hemi, "hemiSky");
      tint(lights.hemi, "hemiGround", "groundColor");
      tint(lights.fill, "fill");
      tint(lights.rim, "rim");
      if (s.moon) lights.sun?.color?.setRGB(...MOON, "srgb");
      else if (lights.sun?.color) {
        const g = s.grade;
        const warm = s.gold * 0.35 + s.heat * 0.2;
        lights.sun.color.setRGB(
          clamp(mix(1, g[0], 0.5) + warm * 0.08, 0.5, 1.4),
          clamp(mix(0.96, g[1], 0.5) - s.storm * 0.05, 0.5, 1.3),
          clamp(mix(0.88, g[2], 0.5) - warm * 0.12 - s.storm * 0.08, 0.4, 1.2)
        );
      }
    }
    document.documentElement.classList.toggle("world-climate-flash", s.lightning > 0.35);
  };

  /* Move every value one step toward the goal */
  const settle = (step) => {
    const goal = effectiveGoal();
    const cur = state.cur;
    for (const key of Object.keys(RATES)) {
      cur[key] = Array.isArray(cur[key])
        ? cur[key].map((v, i) => chase(v, goal[key][i], RATES[key], step))
        : chase(cur[key], goal[key], RATES[key], step);
    }
    /* Rain needs a heavy sky: it starts after the clouds roll in and stops before they clear */
    const heavy = smooth(clamp((cur.cloud - 0.55) / 0.35, 0, 1));
    const rainGoal = goal.rain * heavy;
    cur.rain = chase(cur.rain, rainGoal, cur.rain < rainGoal ? 0.4 : 0.7, step);
    cur.fog = chase(cur.fog, Math.max(goal.fog, cur.rain * 0.6), 0.25, step);
    /* Wet ground soaks up quickly in rain and dries slowly, faster in heat and wind */
    if (cur.rain > state.wet) state.wet = chase(state.wet, cur.rain, 0.6, step);
    else state.wet = Math.max(0, state.wet - step * (0.012 + cur.heat * 0.05 + (1 - cur.cloud) * 0.01 + cur.wind * 0.004));

    /* Gusts: a new goal every few seconds, bigger in rough weather */
    state.gustTimer -= step;
    if (state.gustTimer <= 0) {
      state.gustGoal = Math.random() < 0.55 ? Math.random() * cur.gust : 0;
      state.gustTimer = 1.6 + Math.random() * 3.4;
    }
    state.gust = chase(state.gust, state.gustGoal, 1.1, step);

    advanceWind(step);

    if (!lite && !calm && cur.bolt > 0.05 && cur.rain > 0.6 && Math.random() < step * 0.14 * cur.bolt) state.lightning = 1;
    state.lightning = Math.max(0, state.lightning - step * 4.5);
  };

  const advanceWind = (step) => {
    const wind = state.cur.wind * (1 + state.gust * 0.55);
    state.windPhase += step * (0.75 + wind * 0.45) * (calm ? 0.4 : 1);
    /* Cloud shadows drift with the wind too, integrated so a change of weather never makes them jump */
    state.cloudPhase += step * (0.5 + state.cur.wind * 0.5) * (calm ? 0.3 : 1);
  };

  const snapChannels = () => {
    state.cur = copyGoal(effectiveGoal());
    state.cur.fog = Math.max(state.cur.fog, state.cur.rain * 0.6);
    state.wet = state.cur.rain;
  };

  const refresh = () => {
    const s = sample();
    apply(s);
    paintPanel(s);
    return s;
  };

  const unlock = () => {
    if (state.unlocked) return;
    state.unlocked = true;
    ensurePanel();
    if (forcedHour == null) state.hour = START_HOUR;
    if (!goalFrom(forcedWeather)) Object.assign(state, goalFrom("fair"));
    snapChannels();
    state.hold = SETTLE;
    state.lightning = 0;
    refresh();
  };

  /* hour snaps; weather (preset name or 1–5 wheel) sets the goal and rolls in, unless `instant`. wind / rain pin a
     channel on top of the weather until the next weather pick; clouds / rays (0–1, null = follow the weather) pin a
     layer until handed back. */
  const set = (partial = {}) => {
    if (partial.hour != null) {
      state.hour = ((+partial.hour % 24) + 24) % 24;
      state.autoDay = false;
    }
    if (partial.weather != null) {
      const next = goalFrom(partial.weather);
      if (next) {
        Object.assign(state, next);
        state.override = { wind: null, rain: null };
        state.autoWeather = false;
      }
    }
    if (partial.wind != null) {
      state.override.wind = clamp(+partial.wind, 0, 3.5);
      state.autoWeather = false;
    }
    if (partial.rain != null) {
      state.override.rain = clamp(+partial.rain, 0, 1);
      state.autoWeather = false;
    }
    for (const k of ["clouds", "rays"]) {
      if (partial[k] !== undefined) state.layers[k] = partial[k] == null ? null : clamp(+partial[k], 0, 1);
    }
    const changed = ["weather", "wind", "rain", "clouds", "rays"].some((k) => partial[k] !== undefined);
    if (partial.instant && changed) snapChannels();
    if (partial.autoDay != null) state.autoDay = Boolean(partial.autoDay);
    if (partial.autoWeather != null) {
      state.autoWeather = Boolean(partial.autoWeather);
      if (state.autoWeather) state.hold = Math.min(state.hold, 20);
    }
    return refresh();
  };

  const update = (dt) => {
    const step = Math.min(Math.max(dt, 0), 0.05);
    /* The wind keeps blowing during the intro; only the day and weather wait for unlock */
    if (!state.unlocked) {
      advanceWind(step);
      const s = sample();
      apply(s);
      return s;
    }

    if (state.autoDay) state.hour = (state.hour + (step * 24) / DAY_SECONDS) % 24;

    if (state.autoWeather) {
      state.hold -= step;
      if (state.hold <= 0) {
        const next = goalFrom(pickNext(state.preset || "fair"));
        Object.assign(state, next);
        state.override = { wind: null, rain: null };
        state.hold = 70 + Math.random() * 80;
      }
    }

    settle(step);
    return refresh();
  };

  return { state, sample, apply, update, unlock, set, DAY_SECONDS, PRESETS };
};
