/**
 * Custom Energy Flow Card for Home Assistant
 * v2.1.0 — "Inverex" dark dashboard layout + live weather sky
 *
 * Redesigned around a central inverter tile with a battery on the
 * left, a grid pylon on the right, and the house (plus optional EV)
 * at the bottom. The sun arcs across the top with a power pill that
 * tracks its current position, and sunrise/sunset times sit at the
 * arc endpoints.
 *
 * v2.1.0 adds a weather + time-of-day sky behind the scene (drifting
 * clouds, rain/snow, a night sky with moon and stars) driven by an
 * optional weather.* entity, and reads real monthly/yearly utility_meter
 * sensors when configured so totals match across every device.
 *
 * Keeps v1's auto-accumulating daily / monthly / yearly totals and
 * its entity-tracking model. All v1 config keys still work; new
 * keys are additive and all optional.
 */

import {
  LitElement,
  html,
  css,
  svg,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

let _instanceCounter = 0;

const STORAGE_KEY = "energy-flow-card.totals.v1";

/* ------------------------------------------------------------------ *
 * Resolve the URL the card's own script was loaded from, so we can   *
 * load sibling icon files (./icons/grid.png etc) regardless of where *
 * the user installed the card (HACS, /local/, custom path).          *
 * ------------------------------------------------------------------ */
function _cardBaseUrl() {
  try {
    if (typeof document !== "undefined") {
      const scripts = document.getElementsByTagName("script");
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src || "";
        if (src.indexOf("energy-flow-card.js") !== -1) {
          return src.substring(0, src.lastIndexOf("/") + 1);
        }
      }
    }
  } catch (e) { /* ignore */ }
  // Sensible default for the typical HACS install path.
  return "/hacsfiles/lovelace-energy-flow-card/";
}

const CARD_BASE_URL = _cardBaseUrl();

// Expose to the editor so it can resolve preset thumbnail icons using
// the same base path as the card itself, no matter how the user
// installed it.
try {
  if (typeof window !== "undefined") {
    window._efcCardBaseUrl = CARD_BASE_URL;
  }
} catch (e) { /* ignore */ }

/* ------------------------------------------------------------------ *
 * Inverter presets.                                                   *
 *                                                                     *
 * Each preset is a partial config that's MERGED INTO the user's       *
 * config before render -- with the user's explicit values winning.    *
 * So picking a preset gives you sensible defaults for that inverter   *
 * family, but you can still override anything by setting it yourself. *
 *                                                                     *
 * Add new presets here as a contributor PR -- the editor will pick    *
 * them up automatically from INVERTER_PRESETS keys.                    *
 * ------------------------------------------------------------------ */
const INVERTER_PRESETS = {
  // No preset: card uses its built-in defaults (text-only tile).
  default: {
    label: "Default (no preset)",
    icon: null,            // editor renders a generic placeholder
    config: {},
  },

  // Deye / Sunsynk / Inverex share the same SG04LP1 hardware family
  // and the same Modbus register sign conventions:
  //   * battery_power: NEGATIVE when charging
  //   * grid_power:    positive when importing (standard)
  // They're also the same physical unit (Deye is the OEM), so they
  // share the inverter image.
  sunsynk: {
    label: "Sunsynk (SG04LP1 family)",
    icon: "icons/inverter-sunsynk.png",
    config: {
      inverter_label: "Sunsynk",
      inverter_image: "icons/inverter-sunsynk.png",
      invert_battery_sign: true,
      invert_grid_sign: false,
    },
  },
  deye: {
    label: "Deye (SG04LP1 family)",
    icon: "icons/inverter-deye-brand.png",
    config: {
      inverter_label: "Deye",
      inverter_image: "icons/inverter-deye.png",
      invert_battery_sign: true,
      invert_grid_sign: false,
    },
  },
  inverex: {
    label: "Inverex (Deye OEM)",
    icon: "icons/inverter-deye-brand.png",
    config: {
      inverter_label: "Inverex",
      inverter_image: "icons/inverter-deye.png",
      invert_battery_sign: true,
      invert_grid_sign: false,
    },
  },

  // Solis hybrid units (RHI / S6-EH series) -- same convention as Deye.
  solis_hybrid: {
    label: "Solis Hybrid (RHI / S6-EH)",
    icon: null,  // no brand image bundled — falls back to label tile
    config: {
      inverter_label: "Solis",
      invert_battery_sign: true,
      invert_grid_sign: false,
    },
  },

  // GoodWe ET / EH hybrid: battery_power positive when charging on the
  // Modbus map most HA integrations expose, so no battery flip needed.
  goodwe_hybrid: {
    label: "GoodWe Hybrid (ET / EH)",
    icon: "icons/inverter-goodwe.png",
    config: {
      inverter_label: "GoodWe",
      inverter_image: "icons/inverter-goodwe.png",
      invert_battery_sign: false,
      invert_grid_sign: false,
    },
  },

  // Growatt SPA / SPH: battery_power is typically reported as two
  // separate charge/discharge sensors. If the integration combines
  // them into one signed sensor it's positive-for-charging.
  growatt: {
    label: "Growatt SPA / SPH",
    icon: "icons/inverter-growatt.png",
    config: {
      inverter_label: "Growatt",
      inverter_image: "icons/inverter-growatt.png",
      invert_battery_sign: false,
      invert_grid_sign: false,
    },
  },

  // Victron MultiPlus / Quattro via the venus.os integration. Victron
  // reports battery power as POSITIVE when discharging (it's "load on
  // the battery"), so flip.
  victron: {
    label: "Victron MultiPlus / Quattro",
    icon: "icons/inverter-victron.png",
    config: {
      inverter_label: "Victron",
      inverter_image: "icons/inverter-victron.png",
      invert_battery_sign: true,
      invert_grid_sign: false,
    },
  },

  // SolarEdge HD-Wave + StorEdge: battery_power positive when charging
  // on the Modbus map exposed by the SolarEdge HA integration.
  solaredge: {
    label: "SolarEdge StorEdge",
    icon: null,
    config: {
      inverter_label: "SolarEdge",
      invert_battery_sign: false,
      invert_grid_sign: false,
    },
  },

  // Fronius GEN24 Plus + BYD HVS/HVM: battery_power positive when charging.
  fronius_gen24: {
    label: "Fronius GEN24 Plus",
    icon: null,
    config: {
      inverter_label: "Fronius",
      invert_battery_sign: false,
      invert_grid_sign: false,
    },
  },
};

/** Apply the named preset's config under the user's config (user wins). */
function _applyPreset(userConfig) {
  if (!userConfig) return userConfig;
  const presetKey = userConfig.inverter_preset || "default";
  const preset = INVERTER_PRESETS[presetKey];
  if (!preset || !preset.config) return userConfig;
  // User config keys override preset defaults. Object spread does the
  // right thing here: later keys win.
  return { ...preset.config, ...userConfig };
}

// Make the preset list accessible to the editor without importing
// the whole card module. The editor reads window._efcInverterPresets.
try {
  if (typeof window !== "undefined") {
    window._efcInverterPresets = INVERTER_PRESETS;
  }
} catch (e) { /* ignore */ }

/* ------------------------------------------------------------------ *
 * Persistent daily-rollup helper (unchanged from v1).                 *
 * Stores per entity_id: lastDate, lastDaily, monthKey, monthTotal,    *
 * yearKey, yearTotal. On day rollover, locks yesterday's final daily  *
 * value into the month + year buckets (resetting them on month/year   *
 * rollover first).                                                    *
 * ------------------------------------------------------------------ */
function _readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function _writeStore(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    /* quota / private mode — ignore */
  }
}

function _todayKeys(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    date: `${y}-${m}-${day}`,
    month: `${y}-${m}`,
    year: `${y}`,
  };
}

/* ------------------------------------------------------------------ *
 * Sky colour helpers for the weather/time-of-day backdrop.            *
 * ------------------------------------------------------------------ */
function _hexToRgb(h) {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function _lerpCh(a, b, t) { return Math.round(a + (b - a) * t); }
function _mixHex(h1, h2, t) {
  const a = _hexToRgb(h1), b = _hexToRgb(h2);
  return `rgb(${_lerpCh(a[0], b[0], t)},${_lerpCh(a[1], b[1], t)},${_lerpCh(a[2], b[2], t)})`;
}

// Keyframes across the 24h clock. Daytime is a deliberately vivid blue.
const _SKY_STOPS = [
  { h: 0,    t: "#0a1230", m: "#101d40", b: "#16264c" },
  { h: 5,    t: "#0a1230", m: "#101d40", b: "#16264c" },
  { h: 6.2,  t: "#243a6b", m: "#6a5a8c", b: "#d98a63" },  // dawn
  { h: 7.5,  t: "#356bb4", m: "#6aa6df", b: "#e9c49a" },
  { h: 10,   t: "#2b74cc", m: "#519fe6", b: "#a6d2f5" },  // full day (vivid blue)
  { h: 15,   t: "#2b74cc", m: "#519fe6", b: "#a6d2f5" },
  { h: 17.5, t: "#2c4f9a", m: "#8a6fae", b: "#f0b27a" },  // dusk
  { h: 18.8, t: "#1f2a55", m: "#7a4a72", b: "#e07a55" },
  { h: 20,   t: "#0a1230", m: "#101d40", b: "#16264c" },
  { h: 24,   t: "#0a1230", m: "#101d40", b: "#16264c" },
];

function _skyBaseColors(hr) {
  for (let i = 0; i < _SKY_STOPS.length - 1; i++) {
    const a = _SKY_STOPS[i], c = _SKY_STOPS[i + 1];
    if (hr >= a.h && hr <= c.h) {
      const t = (hr - a.h) / (c.h - a.h || 1);
      return { t: _mixHex(a.t, c.t, t), m: _mixHex(a.m, c.m, t), b: _mixHex(a.b, c.b, t) };
    }
  }
  return { t: _SKY_STOPS[0].t, m: _SKY_STOPS[0].m, b: _SKY_STOPS[0].b };
}

function _accumulate(entityId, v) {
  if (!entityId) return { today: null, month: null, year: null };

  const store = _readStore();
  const rec = store[entityId] || {};
  const k = _todayKeys();

  if (!rec.lastDate) {
    rec.lastDate = k.date;
    rec.lastDaily = isFinite(v) ? v : 0;
    rec.monthKey = k.month;
    rec.monthTotal = 0;
    rec.yearKey = k.year;
    rec.yearTotal = 0;
    store[entityId] = rec;
    _writeStore(store);
    return {
      today: isFinite(v) ? v : 0,
      month: isFinite(v) ? v : 0,
      year: isFinite(v) ? v : 0,
    };
  }

  if (rec.lastDate === k.date) {
    if (isFinite(v)) {
      rec.lastDaily = v;
      store[entityId] = rec;
      _writeStore(store);
    }
    return {
      today: isFinite(v) ? v : rec.lastDaily,
      month: (rec.monthTotal || 0) + (isFinite(v) ? v : rec.lastDaily),
      year: (rec.yearTotal || 0) + (isFinite(v) ? v : rec.lastDaily),
    };
  }

  // Day rolled.
  const closing = isFinite(rec.lastDaily) ? rec.lastDaily : 0;

  if (rec.yearKey !== k.year) {
    rec.yearKey = k.year;
    rec.yearTotal = 0;
  }
  if (rec.monthKey !== k.month) {
    rec.monthKey = k.month;
    rec.monthTotal = 0;
  }
  rec.monthTotal = (rec.monthTotal || 0) + closing;
  rec.yearTotal = (rec.yearTotal || 0) + closing;

  rec.lastDate = k.date;
  rec.lastDaily = isFinite(v) ? v : 0;

  store[entityId] = rec;
  _writeStore(store);

  return {
    today: rec.lastDaily,
    month: rec.monthTotal + rec.lastDaily,
    year: rec.yearTotal + rec.lastDaily,
  };
}

class EnergyFlowCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  constructor() {
    super();
    this._uid = `efc${++_instanceCounter}`;
  }

  static async getConfigElement() {
    await import("./energy-flow-card-editor.js");
    return document.createElement("energy-flow-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Energy Flow",
      sun_entity: "sun.sun",
      animation_speed: "normal",
      show_totals: true,
      // Default to the Inverex preset since this card was built for
      // an Inverex / Deye / Sunsynk hybrid setup. Users with a
      // different inverter can pick their preset in the editor.
      inverter_preset: "inverex",
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    // Merge: hard-coded card defaults < inverter preset < user config.
    // _applyPreset takes the user's `inverter_preset` key and folds
    // the matching preset's values UNDER the user's other settings,
    // so anything the user explicitly sets still wins.
    const merged = _applyPreset({
      title: "Energy Flow",
      sun_entity: "sun.sun",
      inverter_label: "Inverter",
      animation_speed: "normal",
      show_totals: true,
      inverter_preset: "default",
      ...config,
    });
    this._config = merged;
  }

  getCardSize() {
    return 9;
  }

  /* --------------------------------------------------------------- *
   * Entity helpers (preserved from v1).                              *
   * --------------------------------------------------------------- */
  _state(entityId) {
    if (!entityId || !this.hass || !this.hass.states[entityId]) return null;
    return this.hass.states[entityId];
  }

  _safeNum(v, fallback = 0) {
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  _num(entityId, fallback = 0) {
    const s = this._state(entityId);
    if (!s) return fallback;
    return this._safeNum(s.state, fallback);
  }

  _attr(entityId, attr, fallback = null) {
    const s = this._state(entityId);
    if (!s || !s.attributes) return fallback;
    const v = s.attributes[attr];
    return v === undefined || v === null ? fallback : v;
  }

  _hasEntity(entityId) {
    return !!(entityId && this.hass && this.hass.states[entityId]);
  }

  _formatPower(watts) {
    const w = Math.abs(this._safeNum(watts, 0));
    if (w >= 1000) return (w / 1000).toFixed(2) + " kW";
    return Math.round(w) + " W";
  }

  _formatEnergy(kwh) {
    if (kwh == null || !isFinite(kwh)) return "—";
    if (kwh >= 1000) return (kwh / 1000).toFixed(2) + " MWh";
    if (kwh >= 100) return Math.round(kwh).toLocaleString();
    return kwh.toFixed(1);
  }

  _toKW(entityId, fallback = 0) {
    const s = this._state(entityId);
    if (!s) return fallback;
    const n = this._safeNum(s.state, NaN);
    if (!isFinite(n)) return fallback;
    const unit = ((s.attributes && s.attributes.unit_of_measurement) || "").toLowerCase();
    if (unit === "w") return n / 1000;
    return n;
  }

  _toW(entityId, fallback = 0) {
    const s = this._state(entityId);
    if (!s) return fallback;
    const n = this._safeNum(s.state, NaN);
    if (!isFinite(n)) return fallback;
    const unit = ((s.attributes && s.attributes.unit_of_measurement) || "").toLowerCase();
    if (unit === "kw") return n * 1000;
    return n;
  }

  _toKWh(entityId) {
    const s = this._state(entityId);
    if (!s) return null;
    const n = this._safeNum(s.state, NaN);
    if (!isFinite(n)) return null;
    const unit = ((s.attributes && s.attributes.unit_of_measurement) || "").toLowerCase();
    if (unit === "wh") return n / 1000;
    if (unit === "mwh") return n * 1000;
    return n;
  }

  _speedMult() {
    const s = this._config.animation_speed || "normal";
    if (s === "slow") return 1.6;
    if (s === "fast") return 0.6;
    return 1;
  }

  /* Resolve today / month / year totals for one category.
   *
   * IMPORTANT (cross-device correctness): if the user has configured the
   * real monthly / yearly utility_meter sensors, we read them DIRECTLY.
   * Those live in Home Assistant's backend, so every device (phone,
   * tablet, laptop) sees identical values. We only fall back to the old
   * per-browser localStorage accumulator for whichever of month / year
   * is NOT configured -- that fallback is inherently device-local and
   * will differ between browsers, which is exactly the bug we're
   * avoiding when the proper sensors exist.
   */
  _resolveTotals(dailyEntityId, monthlyEntityId, yearlyEntityId) {
    const today = dailyEntityId ? this._toKWh(dailyEntityId) : null;

    const monthDirect = monthlyEntityId ? this._toKWh(monthlyEntityId) : null;
    const yearDirect  = yearlyEntityId  ? this._toKWh(yearlyEntityId)  : null;

    // Both authoritative sensors present -> no localStorage, fully synced.
    if (monthDirect !== null && yearDirect !== null) {
      return { today, month: monthDirect, year: yearDirect };
    }

    // Otherwise fall back to the local accumulator for the missing piece(s).
    let acc = { today: null, month: null, year: null };
    if (dailyEntityId && today !== null) {
      acc = _accumulate(dailyEntityId, today);
    }

    return {
      today: today !== null ? today : acc.today,
      month: monthDirect !== null ? monthDirect : acc.month,
      year:  yearDirect  !== null ? yearDirect  : acc.year,
    };
  }

  /* --------------------------------------------------------------- *
   * Weather sky helpers.                                             *
   *                                                                  *
   * Reads an optional `weather_entity` (a standard HA weather.*      *
   * entity) and maps its state onto a small set of render modes the  *
   * sky layer understands. If no weather entity is configured (or it *
   * isn't loaded yet) we return "clear" so the sky still tracks the  *
   * time of day from sun.sun.                                        *
   * --------------------------------------------------------------- */
  _weatherCondition() {
    const id = this._config.weather_entity;
    if (!id) return "clear";
    const s = this._state(id);
    if (!s || !s.state) return "clear";
    const c = String(s.state).toLowerCase();
    if (c === "lightning" || c === "lightning-rainy" || c === "exceptional") return "storm";
    if (c === "pouring") return "storm";
    if (c === "rainy" || c === "hail") return "rain";
    if (c === "snowy" || c === "snowy-rainy") return "snow";
    if (c === "cloudy" || c === "fog") return "overcast";
    if (c === "partlycloudy" || c === "windy" || c === "windy-variant") return "partly";
    // sunny, clear-night, clear -> clear
    return "clear";
  }

  /* How "covered" the sky is (0 clear .. 1 solid), per condition. Used
   * to blend the sky colour toward grey and to pick cloud count/shade.
   * Tuned deliberately light per the design review. */
  _cloudiness(cond) {
    return { clear: 0.04, partly: 0.16, overcast: 0.52, rain: 0.58, storm: 0.7, snow: 0.52 }[cond] || 0;
  }
  _cloudCount(cond) {
    return { clear: 0, partly: 2, overcast: 3, rain: 3, storm: 4, snow: 3 }[cond] || 0;
  }

  /* Stable random particle layout (stars / rain / snow), computed once
   * per instance so they don't jump around on every re-render (which
   * would fight the CSS animations and re-roll the twinkle pattern). */
  _initSky() {
    if (this._sky) return this._sky;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const stars = [];
    for (let i = 0; i < 46; i++) {
      stars.push({ x: rnd(8, 692), y: rnd(8, 200), r: rnd(0.6, 1.7), d: rnd(2, 5), delay: rnd(0, 4) });
    }
    const rain = [];
    for (let i = 0; i < 38; i++) {
      rain.push({ x: rnd(0, 700), len: rnd(12, 19), delay: rnd(0, 1.05).toFixed(2) });
    }
    const snow = [];
    for (let i = 0; i < 32; i++) {
      snow.push({ x: rnd(0, 700), r: rnd(1.3, 2.6), d: rnd(4.5, 7.5).toFixed(1), delay: rnd(0, 6).toFixed(1) });
    }
    const clouds = [];
    for (let i = 0; i < 4; i++) {
      const dur = rnd(55, 85);
      clouds.push({ cy: rnd(28, 150), sc: rnd(0.7, 1.2), dur: dur.toFixed(0), delay: (-(i / 4) * dur - rnd(0, 8)).toFixed(1) });
    }
    this._sky = { stars, rain, snow, clouds };
    return this._sky;
  }

  /* Moon position along the same top arc the sun uses, derived from the
   * local clock (the moon doesn't come from sun.sun). Maps 18:00 -> left,
   * 06:00 -> right, peaking around midnight. */
  _moonPos(archLeft, archRight, baseY, apexY) {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    let mh = h < 6 ? h + 24 : h;            // 18..30 window
    const t = Math.max(0, Math.min(1, (mh - 18) / 12));
    const x = archLeft + (archRight - archLeft) * t;
    const y = baseY - Math.sin(Math.PI * t) * (baseY - apexY);
    return { x, y };
  }

  /* --------------------------------------------------------------- *
   * Weather + time-of-day sky backdrop. Rendered BEHIND the sun arc  *
   * and the rest of the scene. The bottom of the sky melts into the  *
   * dark dashboard background so there's no hard seam.               *
   * --------------------------------------------------------------- */
  _renderSky(uid, sun, cond, speed) {
    const sky = this._initSky();
    const elevation = this._safeNum(this._attr(this._config.sun_entity || "sun.sun", "elevation", 10), 10);
    const isNight = !sun.visible || elevation < -2;

    const now = new Date();
    const hr = now.getHours() + now.getMinutes() / 60;
    const base = _skyBaseColors(hr);

    // Blend toward grey by how cloudy it is (kept light per design review).
    const cl = this._cloudiness(cond) * 0.65;
    const gT = isNight ? "#252c38" : "#9aa6b2";
    const gM = isNight ? "#2e3744" : "#aab4be";
    const topC = _mixHex(base.t, gT, cl);
    const midC = _mixHex(base.m, gM, cl);
    // Bottom always melts into the card's dark dashboard bg (#0E1521).
    const botC = "#0E1521";

    const cloudCount = this._cloudCount(cond);
    const cloudFill = isNight
      ? ({ partly: "#3a4250", overcast: "#323b4b", rain: "#29303d", storm: "#202632", snow: "#363e4c" }[cond] || "#3a4250")
      : ({ partly: "#f6f9fc", overcast: "#c2cbd4", rain: "#8b95a0", storm: "#646c77", snow: "#b6bfc9" }[cond] || "#ffffff");

    const isRain = cond === "rain" || cond === "storm";
    const isSnow = cond === "snow";
    const isStorm = cond === "storm";

    const cloud = (c) => svg`
      <g class="efc-cloud" opacity="${isNight ? 0.85 : 0.9}"
         style="animation-duration:${c.dur}s;animation-delay:${c.delay}s">
        <ellipse cx="2"  cy="${c.cy + 12}" rx="${(46 * c.sc).toFixed(0)}" ry="${(15 * c.sc).toFixed(0)}" fill="${cloudFill}" />
        <circle  cx="0"  cy="${c.cy}"      r="${(26 * c.sc).toFixed(0)}" fill="${cloudFill}" />
        <circle  cx="${(28 * c.sc).toFixed(0)}"  cy="${c.cy + 5}"  r="${(21 * c.sc).toFixed(0)}" fill="${cloudFill}" />
        <circle  cx="${(-27 * c.sc).toFixed(0)}" cy="${c.cy + 7}"  r="${(19 * c.sc).toFixed(0)}" fill="${cloudFill}" />
        <circle  cx="${(9 * c.sc).toFixed(0)}"   cy="${c.cy - 13}" r="${(19 * c.sc).toFixed(0)}" fill="${cloudFill}" />
      </g>`;

    return svg`
      <!-- Sky gradient (melts to dashboard navy at the bottom) -->
      <linearGradient id="${uid}-skyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="${topC}" />
        <stop offset="45%" stop-color="${midC}" />
        <stop offset="100%" stop-color="${botC}" />
      </linearGradient>
      <radialGradient id="${uid}-moonGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e8ecf2" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#e8ecf2" stop-opacity="0" />
      </radialGradient>
      <rect x="0" y="0" width="700" height="360" fill="url(#${uid}-skyGrad)" />

      ${isNight ? svg`
        <g class="efc-stars">
          ${sky.stars.map((s) => svg`
            <circle class="efc-star" cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}"
                    fill="#FDFDFF"
                    style="animation-duration:${(s.d * speed).toFixed(1)}s;animation-delay:${s.delay.toFixed(1)}s" />`)}
        </g>
        ${(() => {
          const mp = this._moonPos(80, 620, sun.archBaseY, sun.archApexY);
          const md = (cond === "clear" || cond === "partly") ? 1 : 0.6;
          return svg`
            <circle cx="${mp.x}" cy="${mp.y}" r="34" fill="url(#${uid}-moonGlow)" opacity="${md}" />
            <circle cx="${mp.x}" cy="${mp.y}" r="16" fill="#E9EDF3" opacity="${md}" />`;
        })()}
      ` : ""}

      ${cloudCount > 0 ? svg`<g class="efc-clouds">${sky.clouds.slice(0, cloudCount).map(cloud)}</g>` : ""}

      ${isRain ? svg`
        <g class="efc-rain ${isStorm ? "efc-rain-storm" : ""}">
          ${sky.rain.map((d) => svg`
            <line class="efc-rdrop" x1="${d.x.toFixed(1)}" y1="0" x2="${(d.x - 3).toFixed(1)}" y2="${d.len.toFixed(1)}"
                  style="animation-delay:-${d.delay}s" />`)}
        </g>
      ` : ""}

      ${isSnow ? svg`
        <g class="efc-snow">
          ${sky.snow.map((s) => svg`
            <circle class="efc-sflake" cx="${s.x.toFixed(1)}" cy="0" r="${s.r.toFixed(1)}" fill="#EEF3F8"
                    style="animation-duration:${s.d}s;animation-delay:-${s.delay}s" />`)}
        </g>
      ` : ""}

      ${isStorm ? svg`<rect class="efc-flash" x="0" y="0" width="700" height="360" fill="#EAF2FF" />` : ""}
    `;
  }

  /* --------------------------------------------------------------- *
   * Sun arc position. Returns a normalized t in [0..1] across the    *
   * day plus a corresponding (x,y) along the visible arc in the     *
   * SVG viewBox used by the new layout.                              *
   * --------------------------------------------------------------- */
  _sunArcPosition(viewWidth, archTop, archLeft, archRight) {
    const sunId = this._config.sun_entity || "sun.sun";
    const state = this._state(sunId);
    const elevation = this._safeNum(this._attr(sunId, "elevation", 45), 45);

    let t = null;
    let sunriseStr = "--:--";
    let sunsetStr = "--:--";

    try {
      const nextRising = this._attr(sunId, "next_rising");
      const nextSetting = this._attr(sunId, "next_setting");
      if (nextRising && nextSetting) {
        const now = Date.now();
        const nrTs = Date.parse(nextRising);
        const nsTs = Date.parse(nextSetting);
        if (isFinite(nrTs) && isFinite(nsTs)) {
          // Today's sunrise = next_rising minus 1 day if it's already past sunrise.
          const sunsetTs = nsTs;
          const sunriseTs = (nrTs > nsTs) ? (nrTs - 24 * 60 * 60 * 1000) : nrTs;
          if (sunsetTs > sunriseTs) {
            t = (now - sunriseTs) / (sunsetTs - sunriseTs);
          }
          sunriseStr = this._fmtTime(new Date(sunriseTs));
          sunsetStr = this._fmtTime(new Date(sunsetTs));
        }
      }
    } catch (e) { /* fallback below */ }

    if (t === null || !isFinite(t)) {
      const hr = new Date().getHours() + new Date().getMinutes() / 60;
      t = (hr - 6) / 12;
    }
    const clampedT = Math.max(0, Math.min(1, t));
    const visible = elevation > 0 && t >= 0 && t <= 1;

    // Quadratic Bezier arc from (archLeft, archBaseY) through
    // (archCenter, archTop - 40) to (archRight, archBaseY). Apex
    // sits well above the endpoints to give a strong arc shape.
    const archBaseY = archTop + 130;         // endpoints sit lower than apex
    const archApexY = archTop - 40;          // apex sits above archTop
    const archCenter = (archLeft + archRight) / 2;
    const u = clampedT;
    const x = Math.pow(1 - u, 2) * archLeft +
              2 * (1 - u) * u * archCenter +
              Math.pow(u, 2) * archRight;
    const y = Math.pow(1 - u, 2) * archBaseY +
              2 * (1 - u) * u * archApexY +
              Math.pow(u, 2) * archBaseY;

    return { x, y, visible, elevation, sunriseStr, sunsetStr, t: clampedT,
             archBaseY, archApexY };
  }

  _fmtTime(d) {
    try {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    } catch (e) {
      return "--:--";
    }
  }

  /* --------------------------------------------------------------- *
   * Reusable: an "L-shaped" dashed flow connector between a node     *
   * and the central inverter tile. Returns the SVG group.            *
   *                                                                  *
   * `from`     = { x, y }    (start point of the path)               *
   * `to`       = { x, y }    (end point of the path)                 *
   * `color`    = flow color                                          *
   * `active`   = whether to animate dashes                           *
   * `speed`    = animation speed multiplier                          *
   * `label`    = optional power text                                 *
   * `labelPos` = { x, y, anchor }                                    *
   * `direction`= 'forward' (default) -> dashes from `from` to `to`   *
   *              'reverse'           -> dashes from `to` to `from`   *
   *                                                                  *
   * Pick `from` to be the SOURCE and `to` to be the SINK; then       *
   * leave `direction` at 'forward'. For bidirectional flows like     *
   * battery/grid, pass 'reverse' when energy is flowing the          *
   * other way.                                                       *
   * --------------------------------------------------------------- */
  _renderFlowL(from, to, color, active, speed, label, labelPos, direction = "forward") {
    // L-shape with a vertical kink in the middle.
    const midX = (from.x + to.x) / 2;
    const d = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
    // stroke-dashoffset: negative shifts dashes ALONG the path direction
    // (from → to). Positive shifts AGAINST it (to → from). So we just
    // flip the sign based on the requested direction.
    const offsetTo = direction === "reverse" ? 32 : -32;
    const dashAnim = active
      ? svg`<animate attributeName="stroke-dashoffset" from="0" to="${offsetTo}" dur="${0.8 * speed}s" repeatCount="indefinite" />`
      : "";
    return svg`
      <g class="flow-line ${active ? 'flow-active' : 'flow-idle'}">
        <path d="${d}" fill="none" stroke="${color}" stroke-width="3"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="8 8" opacity="${active ? 0.95 : 0.55}">
          ${dashAnim}
        </path>
        ${label ? svg`
          <text x="${labelPos.x}" y="${labelPos.y}"
                fill="${active ? '#FFFFFF' : '#9CA3AF'}"
                font-size="14" font-weight="600"
                text-anchor="${labelPos.anchor || 'middle'}">
            ${label}
          </text>
        ` : ""}
      </g>
    `;
  }

  _renderVerticalFlow(x, y1, y2, color, active, speed) {
    const dashAnim = active
      ? svg`<animate attributeName="stroke-dashoffset" from="0" to="-32" dur="${0.8 * speed}s" repeatCount="indefinite" />`
      : "";
    return svg`
      <path d="M ${x} ${y1} L ${x} ${y2}" fill="none" stroke="${color}"
            stroke-width="3" stroke-linecap="round"
            stroke-dasharray="8 8" opacity="${active ? 0.95 : 0.55}">
        ${dashAnim}
      </path>
    `;
  }

  render() {
    if (!this._config || !this.hass) {
      return html`<ha-card><div style="padding:1rem;">Loading…</div></ha-card>`;
    }

    const cfg = this._config;
    const speed = this._speedMult();
    const uid = this._uid;
    const cond = this._weatherCondition();

    /* ---------- Read live values ---------- */
    const solarW = this._toW(cfg.solar_power);
    const solarKW = solarW / 1000;

    // Some inverters report battery / grid power with the opposite sign
    // convention. We assume by default:
    //   - grid_power: positive = importing, negative = exporting
    //   - battery_power: positive = charging, negative = discharging
    // If a user's sensor uses the opposite, they can set
    // `invert_grid_sign` and/or `invert_battery_sign` to true.
    const gridSign = cfg.invert_grid_sign ? -1 : 1;
    const batSign  = cfg.invert_battery_sign ? -1 : 1;

    const gridW = this._toW(cfg.grid_power) * gridSign;          // + import / - export
    const batteryW = this._toW(cfg.battery_power) * batSign;     // + charge / - discharge
    const batterySoC = Math.max(0, Math.min(100, Math.round(this._num(cfg.battery_soc, 0))));
    const homeW = this._toW(cfg.home_power);
    const homeKW = homeW / 1000;

    // Optional second-string PV values (PV1 / PV2 in the reference).
    const pv1KW = this._hasEntity(cfg.pv1_power) ? this._toKW(cfg.pv1_power) : null;
    const pv2KW = this._hasEntity(cfg.pv2_power) ? this._toKW(cfg.pv2_power) : null;

    // Optional battery telemetry.
    const battVoltage = this._hasEntity(cfg.battery_voltage) ? this._num(cfg.battery_voltage) : null;
    const battCurrent = this._hasEntity(cfg.battery_current) ? this._num(cfg.battery_current) : null;

    // Optional inverter telemetry.
    const invTemp = this._hasEntity(cfg.inverter_temp) ? this._num(cfg.inverter_temp) : null;
    // Two ways to express inverter load:
    //   inverter_load_power  -> W or kW (preferred; shown as primary readout)
    //   inverter_load_pct    -> 0..100 (legacy; shown only when no power
    //                                   sensor is configured)
    // If both are configured the W/kW wins and the % is dropped, because
    // users asked for the W/kW reading rather than the percentage.
    const invLoadW = this._hasEntity(cfg.inverter_load_power)
      ? this._toW(cfg.inverter_load_power) : null;
    const invLoadPct = this._hasEntity(cfg.inverter_load_pct)
      ? this._num(cfg.inverter_load_pct) : null;

    // Optional EV / car charger.
    const evW = this._hasEntity(cfg.ev_power) ? this._toW(cfg.ev_power) : null;
    const evKW = evW != null ? evW / 1000 : null;
    const evCurrent = this._hasEntity(cfg.ev_current) ? this._num(cfg.ev_current) : null;

    const gridIn = gridW > 5 ? gridW : 0;     // importing (>5W to suppress jitter)
    const gridOut = gridW < -5 ? Math.abs(gridW) : 0;
    const batCharging = batteryW > 5;
    const batDischarging = batteryW < -5;

    /* ---------- SVG layout coordinates ----------
     *
     * The diagram lives in a 700 × 900 viewBox. Origin top-left.
     * Layout:
     *   - Sun arc occupies y ≈ 30–245 (wide arc with sunrise/sunset labels)
     *   - SOLAR PANELS at (95, 460) — left middle, where the sun ray hits
     *   - Inverter tile centered at (355, 465), 220×170
     *   - Grid pylon node at (610, 460) — right middle
     *   - BATTERY at (140, 760) — bottom-left, next to the house
     *   - House at (340, 745) — bottom center
     *   - EV at (635, 770) — bottom right
     */
    const ARCH_TOP = 70;
    const ARCH_LEFT = 80;
    const ARCH_RIGHT = 620;
    const sun = this._sunArcPosition(700, ARCH_TOP, ARCH_LEFT, ARCH_RIGHT);

    const INV = { cx: 355, cy: 465, w: 220, h: 170 };
    const invLeft  = INV.cx - INV.w / 2;
    const invRight = INV.cx + INV.w / 2;
    const invTop   = INV.cy - INV.h / 2;
    const invBot   = INV.cy + INV.h / 2;

    const SOLAR = { cx: 95,  cy: 460 };  // panels go where battery used to be
    const BAT   = { cx: 140, cy: 760 };  // battery moved down next to house
    const GRID  = { cx: 610, cy: 460 };

    /* ---------- Totals (auto-accumulated) ---------- */
    const tSolar   = this._resolveTotals(cfg.solar_daily,        cfg.solar_monthly,        cfg.solar_yearly);
    const tGridIn  = this._resolveTotals(cfg.grid_import_daily,  cfg.grid_import_monthly,  cfg.grid_import_yearly);
    const tGridOut = this._resolveTotals(cfg.grid_export_daily,  cfg.grid_export_monthly,  cfg.grid_export_yearly);
    const tHome    = this._resolveTotals(cfg.home_daily,         cfg.home_monthly,         cfg.home_yearly);

    const totals = {
      solar:   [tSolar.today,   tSolar.month,   tSolar.year],
      gridIn:  [tGridIn.today,  tGridIn.month,  tGridIn.year],
      gridOut: [tGridOut.today, tGridOut.month, tGridOut.year],
      home:    [tHome.today,    tHome.month,    tHome.year],
    };

    // Status badge top-right: CHG when battery is charging, DIS when discharging.
    const battBadge = batCharging ? "CHG" : (batDischarging ? "DIS" : "IDLE");
    const battBadgeColor = batCharging ? "#5DBFEB" : (batDischarging ? "#FFB347" : "#6B7280");

    // PV "history" bar at bottom of scene. We use a simple visualization
    // of the current production fraction against an assumed peak.
    const pvPeak = Math.max(this._safeNum(cfg.pv_peak_kw, 6), 0.1);
    const pvFrac = Math.max(0, Math.min(1, solarKW / pvPeak));

    // Power bar uses current home load against an assumed peak.
    const pwrPeak = Math.max(this._safeNum(cfg.pwr_peak_kw, 8), 0.1);
    const pwrFrac = Math.max(0, Math.min(1, homeKW / pwrPeak));

    // Icon URLs (loaded from sibling ./icons/ folder).
    const gridIconUrl  = `${CARD_BASE_URL}icons/grid.png`;
    const homeIconUrl  = `${CARD_BASE_URL}icons/home.png`;
    const solarIconUrl = `${CARD_BASE_URL}icons/solar.png`;

    // Optional inverter image. Three accepted forms:
    //   1. Relative path like "icons/inverter-deye.png" -> resolved
    //      against the card's script URL (the usual case for built-in
    //      images supplied by presets).
    //   2. Absolute URL ("https://..." or "/local/...") -> used as-is.
    //   3. unset/empty -> falls back to the orange text tile.
    let inverterImageUrl = null;
    if (cfg.inverter_image) {
      const v = String(cfg.inverter_image).trim();
      if (v) {
        if (/^https?:\/\//i.test(v) || v.startsWith("/")) {
          inverterImageUrl = v;
        } else {
          inverterImageUrl = `${CARD_BASE_URL}${v.replace(/^\.?\//, "")}`;
        }
      }
    }

    return html`
      <ha-card>
        <div class="card-content">

          <!-- ====================== HEADER ====================== -->
          <div class="header">
            <div class="header-left">
              <span class="header-bolt">⚡</span>
              <span class="header-title">${cfg.title || "ENERGY FLOW"}</span>
              <span class="header-badge" style="color:${battBadgeColor};border-color:${battBadgeColor}">
                ${battBadge}
              </span>
            </div>
          </div>

          <!-- ====================== MAIN SCENE ====================== -->
          <div class="scene">
            <svg viewBox="0 0 700 900" xmlns="http://www.w3.org/2000/svg"
                 role="img" aria-label="Energy flow scene">
              <defs>
                <!-- Inverter tile orange glow -->
                <filter id="${uid}-invGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <radialGradient id="${uid}-sunGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFE89A" stop-opacity="0.8" />
                  <stop offset="100%" stop-color="#FFB347" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="${uid}-sunCore" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFD562" />
                  <stop offset="100%" stop-color="#EF9F27" />
                </radialGradient>
                <linearGradient id="${uid}-batFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#7FE7FF" />
                  <stop offset="100%" stop-color="#1FA8E0" />
                </linearGradient>
                <radialGradient id="${uid}-houseGlow" cx="50%" cy="60%" r="50%">
                  <stop offset="0%" stop-color="#FFB347" stop-opacity="0.4" />
                  <stop offset="100%" stop-color="#FFB347" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="${uid}-gridGlow" cx="50%" cy="60%" r="50%">
                  <stop offset="0%" stop-color="#3FD698" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="#3FD698" stop-opacity="0" />
                </radialGradient>
                <!-- Soft blue floor glow under the solar panels -->
                <radialGradient id="${uid}-solarGlow" cx="50%" cy="60%" r="50%">
                  <stop offset="0%" stop-color="#5DBFEB" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="#5DBFEB" stop-opacity="0" />
                </radialGradient>
                <!-- Sun ray gradient: bright at the sun, fades into the panel -->
                <linearGradient id="${uid}-rayGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#FFE89A" stop-opacity="0.85" />
                  <stop offset="100%" stop-color="#FFB347" stop-opacity="0.1" />
                </linearGradient>
                <clipPath id="${uid}-batClip">
                  <rect x="-31" y="-62" width="62" height="124" rx="5" />
                </clipPath>
              </defs>

              <!-- ===== WEATHER + TIME-OF-DAY SKY (behind everything) ===== -->
              ${this._renderSky(uid, sun, cond, speed)}

              <!-- ===== SUN ARC ===== -->
              <!-- Full faint arc -->
              <path d="M ${ARCH_LEFT} ${sun.archBaseY}
                       Q 350 ${sun.archApexY}
                         ${ARCH_RIGHT} ${sun.archBaseY}"
                    fill="none" stroke="#3A4B5C"
                    stroke-width="1.5" stroke-opacity="0.6" />
              <!-- Active arc (portion traversed so far) -->
              ${sun.visible ? svg`
                <path d="M ${ARCH_LEFT} ${sun.archBaseY}
                         Q 350 ${sun.archApexY}
                           ${ARCH_RIGHT} ${sun.archBaseY}"
                      fill="none" stroke="#EF9F27"
                      stroke-width="2.5" stroke-opacity="0.95"
                      stroke-dasharray="${700 * sun.t} 700"
                      pathLength="700" />
              ` : ""}
              <!-- Dotted ground reference -->
              <line x1="${ARCH_LEFT}" y1="${sun.archBaseY + 20}"
                    x2="${ARCH_RIGHT}" y2="${sun.archBaseY + 20}"
                    stroke="#3A4B5C" stroke-width="1"
                    stroke-dasharray="2 6" opacity="0.6" />
              <!-- Sunrise dot + time -->
              <circle cx="${ARCH_LEFT}" cy="${sun.archBaseY}"
                      r="5" fill="#D4994B" />
              <text x="${ARCH_LEFT}" y="${sun.archBaseY + 45}"
                    fill="#9CA3AF" font-size="14" text-anchor="middle"
                    font-weight="500">${sun.sunriseStr}</text>
              <!-- Sunset dot + time -->
              <circle cx="${ARCH_RIGHT}" cy="${sun.archBaseY}"
                      r="5" fill="${sun.visible ? '#9C5A2C' : '#D4994B'}" />
              <text x="${ARCH_RIGHT}" y="${sun.archBaseY + 45}"
                    fill="#9CA3AF" font-size="14" text-anchor="middle"
                    font-weight="500">${sun.sunsetStr}</text>
              <!-- Noon marker -->
              <text x="350" y="${sun.archBaseY + 45}"
                    fill="#6B7280" font-size="13" text-anchor="middle"
                    font-weight="500">12:00</text>

              <!-- Sun glyph + power pill -->
              ${sun.visible ? svg`
                <g class="sun-group" transform="translate(${sun.x}, ${sun.y})">
                  <circle r="28" fill="url(#${uid}-sunGlow)" />
                  <circle r="12" fill="url(#${uid}-sunCore)" />
                  <circle r="3" fill="#FFFBE6" />
                </g>
                <!-- Power pill -- positioned near the sun, clamped to viewBox -->
                <g transform="translate(${Math.max(120, Math.min(sun.x - 65, 580))}, ${Math.max(20, sun.y - 35)})">
                  <rect x="-65" y="-22" width="130" height="38" rx="19"
                        fill="rgba(20,28,40,0.9)" stroke="#EF9F27"
                        stroke-width="1.8" />
                  <text x="-15" y="6" fill="#EF9F27" font-size="19"
                        font-weight="700" text-anchor="middle">
                    ${solarKW.toFixed(2)} kW
                  </text>
                  <text x="42" y="6" fill="#EF9F27" font-size="17"
                        text-anchor="middle">⚡</text>
                </g>
                <!-- Sun rays: 3 diagonal beams fanning down from the sun
                     onto the solar panel surface. Each beam uses the rayGrad
                     so they appear brightest at the sun and fade into the
                     panel. When solar generation is active, dashes animate
                     to suggest flowing photons; when inactive the rays dim. -->
                <g class="sun-rays">
                  <!-- Beam 1: left edge of panel -->
                  <line x1="${sun.x - 2}" y1="${sun.y + 10}"
                        x2="${SOLAR.cx - 45}" y2="${SOLAR.cy - 40}"
                        stroke="url(#${uid}-rayGrad)" stroke-width="6"
                        stroke-linecap="round"
                        opacity="${solarKW > 0.05 ? 0.55 : 0.2}" />
                  <!-- Beam 2: center of panel (brightest) -->
                  <line x1="${sun.x + 2}" y1="${sun.y + 10}"
                        x2="${SOLAR.cx}" y2="${SOLAR.cy - 65}"
                        stroke="url(#${uid}-rayGrad)" stroke-width="6"
                        stroke-linecap="round"
                        opacity="${solarKW > 0.05 ? 0.75 : 0.25}" />
                  <!-- Beam 3: right edge of panel -->
                  <line x1="${sun.x + 5}" y1="${sun.y + 12}"
                        x2="${SOLAR.cx + 55}" y2="${SOLAR.cy - 30}"
                        stroke="url(#${uid}-rayGrad)" stroke-width="6"
                        stroke-linecap="round"
                        opacity="${solarKW > 0.05 ? 0.5 : 0.18}" />
                  ${solarKW > 0.05 ? svg`
                    <!-- Sparkle dots along the beams, scattered -->
                    <circle cx="${sun.x - 80}" cy="${sun.y + 150}"
                            r="2.5" fill="#FFE89A" opacity="0.9">
                      <animate attributeName="opacity"
                               values="0.3;1;0.3" dur="${1.6 * speed}s"
                               repeatCount="indefinite" />
                    </circle>
                    <circle cx="${sun.x - 150}" cy="${sun.y + 220}"
                            r="2" fill="#FFD562" opacity="0.85">
                      <animate attributeName="opacity"
                               values="1;0.3;1" dur="${1.6 * speed}s"
                               repeatCount="indefinite" />
                    </circle>
                    <circle cx="${sun.x - 50}" cy="${sun.y + 90}"
                            r="2" fill="#FFE89A" opacity="0.8">
                      <animate attributeName="opacity"
                               values="0.5;1;0.5" dur="${1.2 * speed}s"
                               repeatCount="indefinite" />
                    </circle>
                  ` : ""}
                </g>
              ` : svg`
                <text x="350" y="${sun.archApexY + 50}" fill="#6B7280"
                      font-size="14" text-anchor="middle"
                      letter-spacing="0.1em">SUN BELOW HORIZON</text>
              `}

              <!-- ===== SOLAR PANELS (left, where battery used to be) ===== -->
              <ellipse cx="${SOLAR.cx}" cy="${SOLAR.cy + 60}"
                       rx="80" ry="14"
                       fill="url(#${uid}-solarGlow)" />
              <image href="${solarIconUrl}"
                     x="${SOLAR.cx - 80}" y="${SOLAR.cy - 60}"
                     width="160" height="130"
                     preserveAspectRatio="xMidYMid meet" />
              <!-- Total solar power label below the panels -->
              <text x="${SOLAR.cx}" y="${SOLAR.cy + 90}"
                    fill="#EF9F27" font-size="20" font-weight="700"
                    text-anchor="middle">
                ${solarKW.toFixed(2)} kW
              </text>
              <!-- PV1 / PV2 split labels just under the total -->
              ${pv1KW != null ? svg`
                <text x="${SOLAR.cx - 35}" y="${SOLAR.cy + 112}"
                      fill="#9CA3AF" font-size="11" font-weight="500"
                      text-anchor="middle">PV1</text>
                <text x="${SOLAR.cx - 35}" y="${SOLAR.cy + 128}"
                      fill="#EF9F27" font-size="14" font-weight="700"
                      text-anchor="middle">${pv1KW.toFixed(2)}</text>
              ` : ""}
              ${pv2KW != null ? svg`
                <text x="${SOLAR.cx + 35}" y="${SOLAR.cy + 112}"
                      fill="#9CA3AF" font-size="11" font-weight="500"
                      text-anchor="middle">PV2</text>
                <text x="${SOLAR.cx + 35}" y="${SOLAR.cy + 128}"
                      fill="#EF9F27" font-size="14" font-weight="700"
                      text-anchor="middle">${pv2KW.toFixed(2)}</text>
              ` : ""}

              <!-- ===== GRID PYLON (right, larger) ===== -->
              <ellipse cx="${GRID.cx}" cy="${GRID.cy + 50}"
                       rx="80" ry="14"
                       fill="url(#${uid}-gridGlow)" />
              <image href="${gridIconUrl}"
                     x="${GRID.cx - 100}" y="${GRID.cy - 90}"
                     width="200" height="160"
                     preserveAspectRatio="xMidYMid meet" />
              <!-- Grid power label below -->
              ${(gridIn > 5 || gridOut > 5) ? svg`
                <text x="${GRID.cx}" y="${GRID.cy + 95}"
                      fill="${gridOut > 5 ? '#3FD698' : '#5DBFEB'}"
                      font-size="20" font-weight="700"
                      text-anchor="middle">
                  ${gridOut > 5 ? '▲' : '▼'} ${this._formatPower(Math.abs(gridW))}
                </text>
              ` : svg`
                <text x="${GRID.cx}" y="${GRID.cy + 95}"
                      fill="#6B7280" font-size="16" font-weight="600"
                      text-anchor="middle">— idle —</text>
              `}

              <!-- ===== INVERTER TILE / IMAGE (centered) =====
                   If 'inverter_image' is configured, we render the photo
                   instead of the orange text tile, preserving the same
                   bounding box so the connected flow lines stay aligned.
                   Telemetry chips (temperature, load%) sit just under
                   the image. Otherwise we draw the original glowing
                   text tile. -->
              ${inverterImageUrl ? svg`
                <!-- Subtle orange-tinted backplate so the image still
                     reads as the "central" element of the diagram and
                     blends with the dark card background. -->
                <rect x="-${INV.w / 2}" y="-${INV.h / 2}"
                      transform="translate(${INV.cx}, ${INV.cy})"
                      width="${INV.w}" height="${INV.h}" rx="16"
                      fill="rgba(15,22,32,0.5)"
                      stroke="#EF9F27" stroke-width="2"
                      stroke-opacity="0.7" />
                <image href="${inverterImageUrl}"
                       x="${INV.cx - INV.w / 2 + 18}"
                       y="${INV.cy - INV.h / 2 + 8}"
                       width="${INV.w - 36}"
                       height="${INV.h - 50}"
                       preserveAspectRatio="xMidYMid meet" />
                <!-- Bottom strip with label + telemetry -->
                <text x="${INV.cx}" y="${INV.cy + INV.h / 2 - 22}"
                      fill="#EF9F27" font-size="15" font-weight="700"
                      text-anchor="middle" letter-spacing="0.05em">
                  ${cfg.inverter_label || "Inverter"}
                </text>
                <!-- Bottom strip with label + telemetry. Power wins
                     over percent when both are configured (users
                     asked to see actual W/kW load). -->
                ${(() => {
                  const items = [];
                  if (invTemp != null)
                    items.push({ color: "#EF9F27", text: `${invTemp.toFixed(1)}°C` });
                  if (invLoadW != null)
                    items.push({ color: "#3FD698", text: this._formatPower(invLoadW) });
                  else if (invLoadPct != null)
                    items.push({ color: "#3FD698", text: `${Math.round(invLoadPct)}%` });
                  if (items.length === 0) return "";
                  return svg`
                    <text x="${INV.cx}" y="${INV.cy + INV.h / 2 - 6}"
                          font-size="13" font-weight="600"
                          text-anchor="middle">
                      ${items.map((it, i) => svg`
                        ${i > 0 ? svg`<tspan fill="#6B7280"> · </tspan>` : ""}
                        <tspan fill="${it.color}">${it.text}</tspan>
                      `)}
                    </text>
                  `;
                })()}
              ` : svg`
                <!-- Text-tile fallback (original look) -->
                <g transform="translate(${INV.cx}, ${INV.cy})"
                   filter="url(#${uid}-invGlow)">
                  <rect x="-${INV.w / 2}" y="-${INV.h / 2}"
                        width="${INV.w}" height="${INV.h}" rx="16"
                        fill="rgba(15,22,32,0.7)"
                        stroke="#EF9F27" stroke-width="3.5" />
                </g>
                <g transform="translate(${INV.cx}, ${INV.cy})">
                  <text x="0" y="-35" fill="#EF9F27" font-size="28"
                        font-weight="700" text-anchor="middle">
                    ${cfg.inverter_label || "Inverter"}
                  </text>
                  ${invTemp != null ? svg`
                    <text x="0" y="0" fill="#EF9F27" font-size="22"
                          font-weight="600" text-anchor="middle">
                      ${invTemp.toFixed(1)} °C
                    </text>
                  ` : ""}
                  ${invLoadW != null ? svg`
                    <text x="0" y="35" fill="#3FD698" font-size="22"
                          font-weight="600" text-anchor="middle">
                      ${this._formatPower(invLoadW)}
                    </text>
                  ` : (invLoadPct != null ? svg`
                    <text x="0" y="35" fill="#3FD698" font-size="22"
                          font-weight="600" text-anchor="middle">
                      ${Math.round(invLoadPct)}%
                    </text>
                  ` : "")}
                </g>
              `}

              <!-- ===== FLOW: SOLAR PANELS -> INVERTER (left, orange when generating) ===== -->
              ${(() => {
                const active = solarKW > 0.05;
                const color = active ? "#EF9F27" : "#3FD698";
                return this._renderFlowL(
                  { x: SOLAR.cx + 80, y: SOLAR.cy - 20 },
                  { x: invLeft,       y: SOLAR.cy - 20 },
                  color, active, speed,
                  active ? `${solarKW.toFixed(2)} kW` : null,
                  { x: (SOLAR.cx + 80 + invLeft) / 2, y: SOLAR.cy - 40, anchor: "middle" }
                );
              })()}

              <!-- ===== FLOW: GRID <-> INVERTER (right, horizontal) =====
                   Path runs inverter -> grid. Default dash animation flows
                   in that direction, which is correct for EXPORT.
                   When importing, reverse the animation so dashes flow
                   grid -> inverter. -->
              ${(() => {
                const active = gridIn > 5 || gridOut > 5;
                const importing = gridIn > 5;
                const color = gridOut > 5 ? "#3FD698" : (importing ? "#5DBFEB" : "#3FD698");
                return this._renderFlowL(
                  { x: invRight,     y: GRID.cy - 20 },
                  { x: GRID.cx - 70, y: GRID.cy - 20 },
                  color, active, speed,
                  active ? `${(Math.abs(gridW) / 1000).toFixed(2)} kWh` : "0.00 kWh",
                  { x: (invRight + GRID.cx - 70) / 2, y: GRID.cy - 40, anchor: "middle" },
                  importing ? "reverse" : "forward"
                );
              })()}

              <!-- ===== FLOW: INVERTER -> HOUSE (vertical, yellow) ===== -->
              ${this._renderVerticalFlow(
                INV.cx, invBot, 660, "#EF9F27",
                homeW > 5, speed
              )}

              <!-- ===== FLOW: INVERTER <-> BATTERY (stepped, bottom-left) =====
                   Battery is bottom-left of the house. Path is drawn FROM
                   the inverter bottom-left corner, down, across, and into
                   the top of the battery. So the natural drawing direction
                   is inverter -> battery.

                   * When CHARGING (energy flows into battery), dashes
                     should animate inverter -> battery, i.e. ALONG the
                     path direction => negative stroke-dashoffset.
                   * When DISCHARGING (energy flows out of battery into
                     the inverter), dashes should animate battery ->
                     inverter, i.e. AGAINST the drawn path => positive
                     stroke-dashoffset.

                   Colors: cyan while charging, amber while discharging. -->
              ${(() => {
                const active = batCharging || batDischarging;
                const color = batCharging ? "#5DBFEB"
                            : batDischarging ? "#EF9F27"
                            : "#3FD698";
                const fromX = invLeft + 30;
                const fromY = invBot;
                const midY  = fromY + 60;          // first elbow
                const toX   = BAT.cx;
                const toY   = BAT.cy - 75;         // top of battery
                const path = `M ${fromX} ${fromY}
                              L ${fromX} ${midY}
                              L ${toX} ${midY}
                              L ${toX} ${toY}`;
                // Negative offset = dashes move in path-direction
                // (inverter -> battery) = CHARGING.
                // Positive offset = dashes move opposite to path
                // (battery -> inverter) = DISCHARGING.
                const offsetTo = batCharging ? -40 : 40;
                return svg`
                  <path d="${path}"
                        fill="none" stroke="${color}"
                        stroke-width="3" stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-dasharray="10 10"
                        opacity="${active ? 0.95 : 0.55}">
                    ${active ? svg`
                      <animate attributeName="stroke-dashoffset"
                               from="0" to="${offsetTo}"
                               dur="${0.8 * speed}s" repeatCount="indefinite" />
                    ` : ""}
                  </path>
                  ${active ? svg`
                    <text x="${(fromX + toX) / 2}"
                          y="${midY - 8}"
                          fill="#FFFFFF" font-size="14" font-weight="600"
                          text-anchor="middle">
                      ${this._formatPower(Math.abs(batteryW))}
                    </text>
                  ` : ""}
                `;
              })()}

              <!-- ===== HOUSE ===== -->
              <ellipse cx="370" cy="800" rx="110" ry="20"
                       fill="url(#${uid}-houseGlow)" />
              <image href="${homeIconUrl}"
                     x="260" y="665"
                     width="220" height="170"
                     preserveAspectRatio="xMidYMid meet" />
              <!-- Live house consumption readout. Sits on the floor
                   glow, color-matched to other house-side accents.
                   Hidden if home_power isn't configured or reads zero
                   (the threshold > 5W matches the rest of the card). -->
              ${Math.abs(homeW) > 5 ? svg`
                <text x="370" y="847" fill="#EF9F27"
                      font-size="20" font-weight="700"
                      text-anchor="middle">
                  ${this._formatPower(homeW)}
                </text>
              ` : svg`
                <text x="370" y="847" fill="#6B7280"
                      font-size="16" font-weight="600"
                      text-anchor="middle">— idle —</text>
              `}

              <!-- ===== BATTERY (bottom-left, next to the house) ===== -->
              <g transform="translate(${BAT.cx}, ${BAT.cy})">
                <!-- Outer body -->
                <rect x="-36" y="-70" width="72" height="140" rx="9"
                      fill="#0F1620" stroke="#2A3848" stroke-width="2" />
                <!-- Top cap -->
                <rect x="-17" y="-78" width="34" height="8" rx="3"
                      fill="#2A3848" />
                <!-- Inner glass -->
                <rect x="-31" y="-62" width="62" height="124" rx="5"
                      fill="#0A1018" />
                <!-- Battery fill (96% of 124px ≈ 119px) -->
                <g clip-path="url(#${uid}-batClip)">
                  <rect x="-31"
                        y="${62 - (batterySoC / 100) * 124}"
                        width="62"
                        height="${(batterySoC / 100) * 124}"
                        fill="url(#${uid}-batFill)" />
                </g>
                <!-- Lightning bolt overlay -->
                <path d="M -5 -24 L -12 0 L -2 0 L -7 24 L 12 -5 L 2 -5 L 7 -24 Z"
                      fill="#FFFFFF" opacity="0.95" />
                <!-- SoC % -->
                <text x="0" y="8" fill="#FFFFFF" font-size="24"
                      font-weight="700" text-anchor="middle"
                      style="paint-order:stroke;stroke:#0A1018;stroke-width:4px">
                  ${batterySoC}%
                </text>
                <!-- Voltage below -->
                ${battVoltage != null ? svg`
                  <text x="0" y="88" fill="#FFFFFF" font-size="14"
                        font-weight="600" text-anchor="middle">
                    ${battVoltage.toFixed(1)} V
                  </text>
                ` : ""}
                <!-- Current readout (replaces the old middle-of-flow label) -->
                ${battCurrent != null ? svg`
                  <text x="0" y="105" fill="#9CA3AF" font-size="12"
                        font-weight="500" text-anchor="middle">
                    ${battCurrent.toFixed(1)} A
                  </text>
                ` : ""}
              </g>

              <!-- ===== EV / CAR (optional, right side) ===== -->
              ${evKW != null ? svg`
                <!-- Power label between house and car -->
                <text x="510" y="740" fill="#FFFFFF" font-size="22"
                      font-weight="700" text-anchor="middle">
                  ${evKW.toFixed(2)} kW
                </text>
                <!-- Dashed flow line -->
                <path d="M 435 760 L 585 760" fill="none"
                      stroke="#5DBFEB" stroke-width="3.5"
                      stroke-linecap="round" stroke-dasharray="10 10"
                      opacity="${evKW > 0.05 ? 0.95 : 0.45}">
                  ${evKW > 0.05 ? svg`
                    <animate attributeName="stroke-dashoffset"
                             from="0" to="-40" dur="${0.8 * speed}s"
                             repeatCount="indefinite" />
                  ` : ""}
                </path>
                <!-- Tesla supercharger + red car -->
                <g transform="translate(635, 770)">
                  <!-- Charger column -->
                  <rect x="-50" y="-40" width="18" height="64" rx="3"
                        fill="#1F2937" stroke="#374151" stroke-width="1.2" />
                  <rect x="-47" y="-35" width="12" height="26" rx="1.5"
                        fill="#0F1620" />
                  <text x="-41" y="-17" fill="#D32F2F" font-size="6"
                        font-weight="700" text-anchor="middle">TESLA</text>
                  <!-- Car body -->
                  <path d="M -28 10 Q -23 -10 -8 -13 L 15 -13 Q 28 -10 33 4 L 33 15 Q 33 19 28 19 L -23 19 Q -28 19 -28 15 Z"
                        fill="#D32F2F" stroke="#7A1A1A" stroke-width="1" />
                  <!-- Windshield -->
                  <path d="M -10 -11 L 11 -11 L 18 2 L -16 2 Z"
                        fill="#1A2638" opacity="0.75" />
                  <!-- Wheels -->
                  <circle cx="-18" cy="22" r="5" fill="#0F1620"
                          stroke="#2A3848" stroke-width="1.2" />
                  <circle cx="20"  cy="22" r="5" fill="#0F1620"
                          stroke="#2A3848" stroke-width="1.2" />
                </g>
                <!-- Power / current readout under car -->
                ${evCurrent != null ? svg`
                  <text x="635" y="828" fill="#5DBFEB"
                        font-size="16" font-weight="700"
                        text-anchor="middle">
                    ${this._formatPower(evW)}
                  </text>
                  <text x="635" y="850" fill="#9CA3AF"
                        font-size="13" text-anchor="middle">
                    ${evCurrent.toFixed(1)} A
                  </text>
                ` : svg`
                  <text x="635" y="828" fill="#5DBFEB"
                        font-size="16" font-weight="700"
                        text-anchor="middle">
                    ${this._formatPower(evW)}
                  </text>
                `}
              ` : ""}

            </svg>
          </div>

          <!-- ====================== BAR ROW ====================== -->
          <div class="bars">
            <div class="bar-group">
              <span class="bar-label">PV</span>
              <div class="bar-cells">
                ${this._renderBarCells(pvFrac, 16)}
              </div>
            </div>
            <div class="bar-group">
              <span class="bar-label">PWR</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:${pwrFrac * 100}%"></div>
              </div>
            </div>
          </div>

          <!-- ====================== STATS GRID ====================== -->
          ${this._renderStatsGrid(cfg)}

          <!-- ====================== INVERTER FOOTER ====================== -->
          <div class="footer-header">
            <span class="footer-icon">☀</span>
            <span class="footer-title">INVERTER</span>
          </div>
          <div class="footer-cards">
            ${this._renderFooterCard("☀", "TODAY PV",   "#EF9F27", tSolar.today)}
            ${this._renderFooterCard("🔋", "BATT CHG",   "#3FD698", this._toKWh(cfg.battery_charge_daily))}
            ${this._renderFooterCard("⚡", "REMAINING",  "#3FD698",
              this._hasEntity(cfg.battery_remaining_ah) ? this._num(cfg.battery_remaining_ah) : null,
              "Ah")}
            ${this._renderFooterCard("🏠", "TODAY LOAD", "#EF9F27", tHome.today)}
          </div>

          <!-- ====================== OPTIONAL TOTALS TABLE ====================== -->
          ${cfg.show_totals ? html`
            <div class="totals">
              ${this._totalsRow("Solar",    "#EF9F27", totals.solar)}
              ${this._totalsRow("Grid in",  "#5DBFEB", totals.gridIn)}
              ${this._totalsRow("Grid out", "#3FD698", totals.gridOut)}
              ${this._totalsRow("Home",     "#B8A5F0", totals.home)}
            </div>
          ` : ""}

        </div>
      </ha-card>
    `;
  }

  _renderBarCells(frac, count) {
    const filled = Math.round(frac * count);
    const cells = [];
    for (let i = 0; i < count; i++) {
      const isOn = i < filled;
      // Cells fade in from short to tall to mimic the reference's
      // "history" visualization.
      const heightClass = i < count * 0.25 ? "bar-cell-sm" :
                          i < count * 0.6  ? "bar-cell-md" :
                                              "bar-cell-lg";
      cells.push(html`
        <span class="bar-cell ${heightClass} ${isOn ? 'bar-cell-on' : ''}"></span>
      `);
    }
    return cells;
  }

  _renderStatsGrid(cfg) {
    const stats = [];
    // Top row
    if (this._hasEntity(cfg.battery_temp_a) || this._hasEntity(cfg.battery_temp_b)) {
      const a = this._hasEntity(cfg.battery_temp_a) ? this._num(cfg.battery_temp_a) : null;
      const b = this._hasEntity(cfg.battery_temp_b) ? this._num(cfg.battery_temp_b) : null;
      let val;
      if (a != null && b != null) val = `${a.toFixed(1)} / ${b.toFixed(1)} °C`;
      else if (a != null)         val = `${a.toFixed(1)} °C`;
      else                        val = `${b.toFixed(1)} °C`;
      stats.push({ label: "TEMP", value: val, color: "#FFFFFF" });
    }
    if (this._hasEntity(cfg.bms_temp)) {
      stats.push({
        label: "BMS TEMP",
        value: `${this._num(cfg.bms_temp).toFixed(1)} °C`,
        color: "#FFFFFF",
      });
    }
    if (this._hasEntity(cfg.endurance_eta)) {
      stats.push({
        label: "ENDURANCE",
        value: this._state(cfg.endurance_eta).state,
        color: "#5DBFEB",
      });
    }
    if (this._hasEntity(cfg.min_cell_voltage)) {
      stats.push({
        label: "MIN CELL",
        value: `${this._num(cfg.min_cell_voltage).toFixed(3)} V`,
        color: "#FFFFFF",
      });
    }
    if (this._hasEntity(cfg.max_cell_voltage)) {
      stats.push({
        label: "MAX CELL",
        value: `${this._num(cfg.max_cell_voltage).toFixed(3)} V`,
        color: "#FFFFFF",
      });
    }
    if (this._hasEntity(cfg.battery_discharged_daily)) {
      const v = this._toKWh(cfg.battery_discharged_daily);
      stats.push({
        label: "BATT DIS.",
        value: v != null ? `${this._formatEnergy(v)} kWh` : "—",
        color: "#FFFFFF",
      });
    }

    if (stats.length === 0) return "";

    return html`
      <div class="stats-grid">
        ${stats.map(s => html`
          <div class="stat-cell">
            <div class="stat-label">${s.label}</div>
            <div class="stat-value" style="color:${s.color}">${s.value}</div>
          </div>
        `)}
      </div>
    `;
  }

  _renderFooterCard(icon, label, color, value, unit) {
    const display = value == null ? "—" :
                    (typeof value === "string") ? value :
                    `${this._formatEnergy(value)} ${unit || "kWh"}`;
    return html`
      <div class="footer-card">
        <div class="footer-card-icon" style="color:${color}">${icon}</div>
        <div class="footer-card-label">${label}</div>
        <div class="footer-card-value" style="color:${color}">${display}</div>
      </div>
    `;
  }

  _totalsRow(label, color, [today, month, year]) {
    return html`
      <div class="totals-row">
        <div class="totals-label-cell">
          <span class="dot" style="background:${color}"></span>
          <span>${label}</span>
        </div>
        <div class="cell">
          <span class="cell-label">Today</span>
          <span class="cell-value">${this._formatEnergy(today)}<span class="cell-unit"> kWh</span></span>
        </div>
        <div class="cell">
          <span class="cell-label">Month</span>
          <span class="cell-value">${this._formatEnergy(month)}<span class="cell-unit"> kWh</span></span>
        </div>
        <div class="cell">
          <span class="cell-label">Year</span>
          <span class="cell-value">${this._formatEnergy(year)}<span class="cell-unit"> kWh</span></span>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      ha-card {
        padding: 0;
        overflow: hidden;
        background: linear-gradient(180deg, #0E1521 0%, #0A0F18 100%);
        color: #FFFFFF;
        border: 1px solid #1F2A3A;
      }
      .card-content {
        padding: 16px 18px 18px;
      }

      /* ---------- Header ---------- */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
        border-bottom: 1px solid #1F2A3A;
        padding-bottom: 10px;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .header-bolt {
        color: #EF9F27;
        font-size: 18px;
      }
      .header-title {
        color: #9CA3AF;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.15em;
        text-transform: uppercase;
      }
      .header-badge {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        padding: 3px 10px;
        border-radius: 12px;
        border: 1px solid;
        background: rgba(20, 28, 40, 0.6);
      }

      /* ---------- Scene ---------- */
      .scene {
        position: relative;
        margin: 0 -6px;
      }
      .scene svg {
        width: 100%;
        height: auto;
        display: block;
      }

      /* ---------- Weather sky animations ---------- */
      .efc-cloud { animation: efc-drift linear infinite; }
      .efc-rdrop {
        stroke: rgba(190, 215, 240, 0.42);
        stroke-width: 1.3;
        stroke-linecap: round;
        transform: translateY(-30px);
        animation: efc-fall 1.05s linear infinite;
      }
      .efc-rain-storm .efc-rdrop {
        stroke: rgba(200, 222, 244, 0.55);
        animation-duration: 0.65s;
      }
      .efc-sflake {
        transform: translateY(-20px);
        animation: efc-snowfall 6.5s linear infinite;
      }
      .efc-star { animation: efc-twinkle 3s ease-in-out infinite; }
      .efc-flash { opacity: 0; animation: efc-flash 9s linear infinite; }
      @keyframes efc-drift { from { transform: translateX(-230px); } to { transform: translateX(740px); } }
      @keyframes efc-fall { to { transform: translateY(360px); } }
      @keyframes efc-snowfall { to { transform: translate(10px, 360px); } }
      @keyframes efc-twinkle { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
      @keyframes efc-flash {
        0%, 3%, 7%, 100% { opacity: 0; }
        1.5% { opacity: 0.4; }
        5% { opacity: 0.2; }
      }
      @media (prefers-reduced-motion: reduce) {
        .efc-cloud, .efc-rdrop, .efc-sflake, .efc-star, .efc-flash { animation: none; }
      }

      /* ---------- Bars ---------- */
      .bars {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin: 6px 0 14px;
        padding: 0 4px;
        align-items: center;
      }
      .bar-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .bar-label {
        color: #9CA3AF;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.1em;
        min-width: 28px;
      }
      .bar-cells {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        flex: 1;
        height: 18px;
      }
      .bar-cell {
        flex: 1;
        background: #2A3848;
        border-radius: 1.5px;
        transition: background 0.4s, height 0.4s;
      }
      .bar-cell-sm { height: 6px; }
      .bar-cell-md { height: 12px; }
      .bar-cell-lg { height: 18px; }
      .bar-cell-on { background: #9CA3AF; }
      .bar-track {
        flex: 1;
        height: 8px;
        background: #1F2A3A;
        border-radius: 4px;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #5DBFEB, #1FA8E0);
        border-radius: 4px;
        transition: width 0.6s;
      }

      /* ---------- Stats grid ---------- */
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 16px;
      }
      .stat-cell {
        background: rgba(20, 28, 40, 0.6);
        border: 1px solid #1F2A3A;
        border-radius: 10px;
        padding: 12px 14px;
      }
      .stat-label {
        font-size: 11px;
        color: #9CA3AF;
        letter-spacing: 0.1em;
        font-weight: 500;
        margin-bottom: 6px;
      }
      .stat-value {
        font-size: 17px;
        font-weight: 700;
        white-space: nowrap;
      }

      /* ---------- Footer (INVERTER section) ---------- */
      .footer-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid #1F2A3A;
        margin-bottom: 10px;
      }
      .footer-icon {
        color: #EF9F27;
        font-size: 16px;
      }
      .footer-title {
        color: #9CA3AF;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.15em;
      }
      .footer-cards {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }
      .footer-card {
        background: rgba(20, 28, 40, 0.6);
        border: 1px solid #1F2A3A;
        border-radius: 10px;
        padding: 12px 8px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .footer-card-icon {
        font-size: 22px;
      }
      .footer-card-label {
        font-size: 10px;
        color: #9CA3AF;
        letter-spacing: 0.1em;
        font-weight: 600;
      }
      .footer-card-value {
        font-size: 18px;
        font-weight: 700;
      }

      /* ---------- Totals table (optional) ---------- */
      .totals {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid #1F2A3A;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .totals-row {
        display: grid;
        grid-template-columns: 80px repeat(3, minmax(0, 1fr));
        gap: 6px;
        align-items: center;
      }
      .totals-label-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 500;
        color: #FFFFFF;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex: none;
      }
      .cell {
        display: flex;
        flex-direction: column;
        padding: 4px 8px;
        background: rgba(20, 28, 40, 0.6);
        border-radius: 6px;
      }
      .cell-label {
        font-size: 9px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #9CA3AF;
        margin-bottom: 1px;
      }
      .cell-value {
        font-size: 14px;
        font-weight: 500;
        color: #FFFFFF;
      }
      .cell-unit {
        font-size: 10px;
        font-weight: 400;
        color: #9CA3AF;
      }

      /* ---------- Mobile ---------- */
      @media (max-width: 480px) {
        .stats-grid { grid-template-columns: repeat(3, 1fr); }
        .footer-cards { grid-template-columns: repeat(2, 1fr); }
        .footer-card-value { font-size: 16px; }
        .stat-value { font-size: 16px; }
      }
    `;
  }
}

customElements.define("energy-flow-card", EnergyFlowCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-flow-card",
  name: "Energy Flow Card",
  description: "Dark dashboard-style live energy flow with battery, grid, inverter, house & optional EV",
  preview: true,
});

console.info(
  "%c ENERGY-FLOW-CARD %c v2.0.3 ",
  "color: white; background: #EF9F27; font-weight: 700;",
  "color: white; background: #1FA8E0; font-weight: 700;"
);
