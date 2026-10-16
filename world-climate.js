/* Island climate: two independent drivers.
   - day: hour 0–24 (night → dawn → day → golden → dusk → night)
   - weather: float 1–5 (1 storm … 3 fair … 5 heat)
   sample() returns one blended look each frame. Intro owns the first dawn; call unlock() after. */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (t) => t * t * (3 - 2 * t);

/* Full in-game day length in real seconds (visitors can catch golden hour). */
const DAY_SECONDS = 600;

/* Weather stages keyed at 1..5. In-between values lerp. */
const STAGES = {
  1: {
    name: "Stormbound",
    wind: 3.2,
    rain: 1,
    heat: 0,
    cloud: 1,
    sun: 0.12,
    hemi: 0.5,
    fill: 0.4,
    rim: 0.18,
    sky: [0.22, 0.28, 0.38],
    grade: [0.78, 0.84, 0.95],
    water: 1.35,
  },
  2: {
    name: "Greyfront",
    wind: 2.05,
    rain: 0.55,
    heat: 0,
    cloud: 0.7,
    sun: 0.45,
    hemi: 0.7,
    fill: 0.55,
    rim: 0.35,
    sky: [0.45, 0.52, 0.62],
    grade: [0.88, 0.9, 0.96],
    water: 1.15,
  },
  3: {
    name: "Fair Isle",
    wind: 1,
    rain: 0,
    heat: 0,
    cloud: 0.35,
    sun: 1,
    hemi: 1,
    fill: 1,
    rim: 1,
    sky: [0.44, 0.71, 0.92],
    grade: [1, 1, 1],
    water: 1,
  },
  4: {
    name: "Warmth",
    wind: 0.65,
    rain: 0,
    heat: 0.45,
    cloud: 0.2,
    sun: 1.15,
    hemi: 0.95,
    fill: 0.9,
    rim: 1.1,
    sky: [0.55, 0.72, 0.88],
    grade: [1.08, 1.02, 0.92],
    water: 0.95,
  },
  5: {
    name: "High Sun",
    wind: 0.25,
    rain: 0,
    heat: 1,
    cloud: 0.05,
    sun: 1.35,
    hemi: 0.85,
    fill: 0.7,
    rim: 1.25,
    sky: [0.72, 0.82, 0.92],
    grade: [1.14, 1.06, 0.88],
    water: 0.85,
  },
};

const stageAt = (w) => {
  const lo = Math.floor(clamp(w, 1, 5));
  const hi = Math.min(5, lo + 1);
  const t = smooth(clamp(w - lo, 0, 1));
  const a = STAGES[lo];
  const b = STAGES[hi];
  const out = { name: t < 0.5 ? a.name : b.name };
  for (const key of Object.keys(a)) {
    if (key === "name") continue;
    if (Array.isArray(a[key])) out[key] = mix3(a[key], b[key], t);
    else out[key] = mix(a[key], b[key], t);
  }
  return out;
};

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

export const createClimate = ({ host, lights, lightsOn, lite = false, params = new URLSearchParams() } = {}) => {
  const forcedHour = params.has("hour") ? +params.get("hour") : null;
  const forcedWeather = params.has("weather") ? +params.get("weather") : null;
  const debugUi = params.get("climate") === "1";

  /* Always boot into Fair Isle at late morning so the post-intro handoff never snaps to a random mood. */
  const START_HOUR = 10;
  const START_WEATHER = 3;
  /* Hold fair weather this long after unlock before slow auto-drift begins. */
  const WEATHER_SETTLE = 90;

  const state = {
    hour: forcedHour != null && Number.isFinite(forcedHour) ? forcedHour : START_HOUR,
    weather: forcedWeather != null && Number.isFinite(forcedWeather) ? clamp(forcedWeather, 1, 5) : START_WEATHER,
    unlocked: false,
    autoDay: forcedHour == null,
    autoWeather: forcedWeather == null,
    lightning: 0,
    drift: 0,
    settle: WEATHER_SETTLE,
  };

  let panel = null;
  const ensurePanel = () => {
    if (!debugUi || panel || !host) return;
    panel = document.createElement("div");
    panel.className = "world-climate";
    panel.innerHTML = [
      '<label>Hour <input type="range" min="0" max="24" step="0.05" data-k="hour" /><b data-v="hour"></b></label>',
      '<label>Weather <input type="range" min="1" max="5" step="0.05" data-k="weather" /><b data-v="weather"></b></label>',
      '<span data-name></span>',
    ].join("");
    host.appendChild(panel);
    panel.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.k;
        state[key] = +input.value;
        if (key === "hour") state.autoDay = false;
        if (key === "weather") state.autoWeather = false;
      });
    });
  };

  const paintPanel = (sample) => {
    if (!panel) return;
    panel.querySelector('[data-k="hour"]').value = String(state.hour);
    panel.querySelector('[data-k="weather"]').value = String(state.weather);
    panel.querySelector('[data-v="hour"]').textContent = state.hour.toFixed(1);
    panel.querySelector('[data-v="weather"]').textContent = state.weather.toFixed(2);
    panel.querySelector("[data-name]").textContent = sample.stage;
  };

  const sample = () => {
    const day = dayFactor(state.hour);
    const gold = golden(state.hour);
    const wx = stageAt(state.weather);
    const night = 1 - day;
    const storm = clamp((3 - state.weather) / 2, 0, 1);
    const heat = clamp((state.weather - 3) / 2, 0, 1);

    /* Lights: weather scales the day baseline; night floors hemi/fill and kills sun. */
    const sunMul = wx.sun * day * (1 - storm * 0.55);
    const hemiMul = mix(0.38, wx.hemi, day) * mix(1, 0.75, heat);
    const fillMul = mix(0.4, wx.fill, day);
    const rimMul = mix(0.28, wx.rim, day) * mix(1, 1.15, gold);

    return {
      hour: state.hour,
      weather: state.weather,
      stage: wx.name,
      day,
      night,
      gold,
      storm,
      heat,
      windMul: wx.wind * mix(0.75, 1, day),
      rain: lite ? 0 : wx.rain * mix(0.55, 1, day * 0.4 + 0.6),
      cloud: wx.cloud * mix(0.4, 1, day) + night * 0.15,
      water: wx.water,
      lightning: state.lightning,
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

  const apply = (s) => {
    if (!host) return;
    host.style.setProperty("--day", s.day.toFixed(3));
    host.style.setProperty("--dawn", s.day.toFixed(3));
    host.style.setProperty("--storm", s.storm.toFixed(3));
    host.style.setProperty("--heat", s.heat.toFixed(3));
    host.style.setProperty("--gold", s.gold.toFixed(3));
    host.style.setProperty("--rain", s.rain.toFixed(3));
    host.style.setProperty("--wind", s.windMul.toFixed(3));
    if (lights) {
      if (lights.sun) lights.sun.intensity = s.lights.sun * (1 + s.lightning * 2.5);
      if (lights.hemi) lights.hemi.intensity = s.lights.hemi * (1 + s.lightning * 1.2);
      if (lights.fill) lights.fill.intensity = s.lights.fill;
      if (lights.rim) lights.rim.intensity = s.lights.rim;
      if (lights.sun?.color) {
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

  const unlock = () => {
    if (state.unlocked) return;
    state.unlocked = true;
    ensurePanel();
    /* Snap-free handoff: always enter the playable world on Fair Isle mid-morning. */
    if (forcedHour == null) state.hour = START_HOUR;
    if (forcedWeather == null) state.weather = START_WEATHER;
    state.drift = 0;
    state.settle = WEATHER_SETTLE;
    state.lightning = 0;
    const s = sample();
    apply(s);
    paintPanel(s);
  };

  const set = (partial = {}) => {
    if (partial.hour != null) {
      state.hour = ((+partial.hour % 24) + 24) % 24;
      state.autoDay = false;
    }
    if (partial.weather != null) {
      state.weather = clamp(+partial.weather, 1, 5);
      state.autoWeather = false;
    }
    if (partial.autoDay != null) state.autoDay = Boolean(partial.autoDay);
    if (partial.autoWeather != null) state.autoWeather = Boolean(partial.autoWeather);
    const s = sample();
    apply(s);
    paintPanel(s);
    return s;
  };

  const update = (dt) => {
    if (!state.unlocked) return sample();

    const step = Math.min(Math.max(dt, 0), 0.05);

    if (state.autoDay) state.hour = (state.hour + (step * 24) / DAY_SECONDS) % 24;

    if (state.autoWeather) {
      state.settle = Math.max(0, state.settle - step);
      if (state.settle <= 0) {
        state.drift += step * 0.045;
        /* Slow wander biased hard to Fair Isle; extremes are rare and brief. */
        const wander = Math.sin(state.drift) * 0.4 + Math.sin(state.drift * 0.31 + 1.7) * 0.25;
        const target = clamp(3 + wander * 1.15, 1.2, 4.7);
        state.weather += (target - state.weather) * Math.min(1, step * 0.06);
      } else {
        state.weather += (START_WEATHER - state.weather) * Math.min(1, step * 0.8);
      }
    }

    /* Lightning while stormy. */
    if (!lite && state.weather < 2.15 && Math.random() < step * 0.12 * (2.15 - state.weather)) {
      state.lightning = 1;
    }
    state.lightning = Math.max(0, state.lightning - step * 4.5);

    const s = sample();
    apply(s);
    paintPanel(s);
    return s;
  };

  return {
    state,
    sample,
    apply,
    update,
    unlock,
    set,
    DAY_SECONDS,
    STAGES,
  };
};
