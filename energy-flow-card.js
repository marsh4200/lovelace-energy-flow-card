/**
 * Custom Energy Flow Card for Home Assistant
 * v1.1.0 — sun-tracking + auto-totals release
 *
 * Changes from v1.0.1:
 *  - Sun now follows real time-of-day across the sky in any hemisphere,
 *    using sun.sun's next_rising / next_setting timestamps.
 *  - Monthly and yearly totals are now derived automatically from the
 *    daily entity per category (persisted in localStorage). Removed the
 *    monthly / yearly entity config keys entirely.
 *  - Editor re-edit fixed (see editor changelog).
 */

import {
  LitElement,
  html,
  css,
  svg,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

let _instanceCounter = 0;

const STORAGE_KEY = "energy-flow-card.totals.v1";

/* -----------------------------------------------------------------
 * Persistent totals helper.
 *
 * Stores, per entity_id:
 *   lastDate          — ISO YYYY-MM-DD we last saw a value on
 *   lastDaily         — last value seen for that day (kWh)
 *   monthTotal        — sum of completed days in monthKey
 *   monthKey          — YYYY-MM
 *   yearTotal         — sum of completed days in yearKey
 *   yearKey           — YYYY
 *
 * On each tick:
 *   1. If today === lastDate → update lastDaily.
 *   2. If date rolled → lock lastDaily into month/year totals, reset
 *      month/year buckets if their key changed, then start fresh today.
 * ----------------------------------------------------------------- */
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

/**
 * Update the persisted totals for `entityId` given the current daily
 * value `v` (kWh, finite number). Returns { today, month, year }.
 */
function _accumulate(entityId, v) {
  if (!entityId) return { today: null, month: null, year: null };

  const store = _readStore();
  const rec = store[entityId] || {};
  const k = _todayKeys();

  // Initialise if first sighting of this entity
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

  // Day did not change → just refresh last-seen daily value
  if (rec.lastDate === k.date) {
    if (isFinite(v)) {
      // Daily sensors are monotonic until they reset at midnight.
      // If we see a smaller value mid-day (rare), trust the new one.
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

  // Day changed → lock yesterday's last value into month/year buckets,
  // then reset for today (and roll month/year if needed).
  const closing = isFinite(rec.lastDaily) ? rec.lastDaily : 0;

  // Roll year if year key changed
  if (rec.yearKey !== k.year) {
    rec.yearKey = k.year;
    rec.yearTotal = 0;
  }
  // Roll month if month key changed
  if (rec.monthKey !== k.month) {
    rec.monthKey = k.month;
    rec.monthTotal = 0;
  }

  // Add yesterday's close into the relevant buckets. We assume the
  // previous lastDate falls into the bucket that was current before
  // this roll — which is usually true (one-day rollover). If HA was
  // offline for many days, we still only credit one day, which is the
  // safest assumption without history access.
  rec.monthTotal = (rec.monthTotal || 0) + closing;
  rec.yearTotal = (rec.yearTotal || 0) + closing;

  // Start today fresh with whatever the sensor currently reads.
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
      title: "Home grid",
      sun_entity: "sun.sun",
      show_sun_arc: true,
      animation_speed: "normal",
      particle_density: "medium",
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = {
      title: "Home grid",
      sun_entity: "sun.sun",
      show_sun_arc: true,
      animation_speed: "normal",
      particle_density: "medium",
      ...config,
    };
  }

  getCardSize() {
    return 8;
  }

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

  _formatPower(watts) {
    const w = Math.abs(this._safeNum(watts, 0));
    if (w >= 1000) return (w / 1000).toFixed(1) + " kW";
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

  _particleCount() {
    const d = this._config.particle_density || "medium";
    if (d === "low") return 2;
    if (d === "high") return 5;
    return 3;
  }

  _speedMult() {
    const s = this._config.animation_speed || "normal";
    if (s === "slow") return 1.6;
    if (s === "fast") return 0.6;
    return 1;
  }

  /**
   * Compute the sun's position along the sunrise→noon→sunset arc for
   * the current moment. Uses sun.sun's next_rising / next_setting
   * timestamps — this is the only hemisphere-correct approach (azimuth
   * math fails in the southern hemisphere because the sun crosses the
   * northern sky).
   */
  _sunPosition() {
    const sunId = this._config.sun_entity || "sun.sun";
    const state = this._state(sunId);
    const elevation = this._safeNum(this._attr(sunId, "elevation", 45), 45);
    const azimuth = this._safeNum(this._attr(sunId, "azimuth", 180), 180);

    // Below the horizon → hide the sun.
    if (elevation < 0 || (state && state.state === "below_horizon")) {
      return { x: 350, y: -100, visible: false, elevation, azimuth };
    }

    // Time-based fraction of daylight elapsed.
    // Strategy:
    //   - If we have a `next_setting` in the future and elevation > 0,
    //     we're between sunrise and sunset. Sunrise was sometime in the
    //     past; sun.sun gives us next_setting directly. To get sunrise
    //     we use next_rising MINUS one day (since it's in tomorrow).
    //   - Fraction t = (now - sunrise) / (sunset - sunrise), clamped 0..1.
    let t = null;
    try {
      const nextRising = this._attr(sunId, "next_rising");
      const nextSetting = this._attr(sunId, "next_setting");
      if (nextRising && nextSetting) {
        const now = Date.now();
        const nrTs = Date.parse(nextRising);
        const nsTs = Date.parse(nextSetting);
        if (isFinite(nrTs) && isFinite(nsTs)) {
          // We're above horizon, so sunset is in the future and sunrise
          // was in the past. next_rising is tomorrow's; subtract ~24h.
          const sunsetTs = nsTs;
          const sunriseTs = nrTs - 24 * 60 * 60 * 1000;
          if (sunsetTs > sunriseTs) {
            t = (now - sunriseTs) / (sunsetTs - sunriseTs);
          }
        }
      }
    } catch (e) {
      /* fall through to azimuth fallback */
    }

    // Fallback: derive t from elevation (peaks at noon) — works in any
    // hemisphere but doesn't tell you east-vs-west on its own. Combine
    // with a simple AM/PM check via the hour of day.
    if (t === null || !isFinite(t)) {
      const hr = new Date().getHours() + new Date().getMinutes() / 60;
      // Approximate: assume daylight roughly 6:00 → 18:00 if no other info.
      t = (hr - 6) / 12;
    }

    t = Math.max(0, Math.min(1, t));

    // Quadratic Bezier across the sky.
    const p0 = { x: 60, y: 240 };  // sunrise (left)
    const p1 = { x: 350, y: -30 }; // solar noon (top)
    const p2 = { x: 640, y: 240 }; // sunset (right)
    const x =
      Math.pow(1 - t, 2) * p0.x +
      2 * (1 - t) * t * p1.x +
      Math.pow(t, 2) * p2.x;
    const y =
      Math.pow(1 - t, 2) * p0.y +
      2 * (1 - t) * t * p1.y +
      Math.pow(t, 2) * p2.y;

    return { x, y, visible: true, elevation, azimuth };
  }

  _renderParticles(pathId, color, radius, dur, count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const begin = (dur / count) * i;
      items.push(svg`
        <circle r=${radius} fill=${color}>
          <animateMotion
            dur="${dur}s"
            begin="${begin}s"
            repeatCount="indefinite"
          >
            <mpath href="#${pathId}" />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.1;0.85;1"
            dur="${dur}s"
            begin="${begin}s"
            repeatCount="indefinite"
          />
        </circle>
      `);
    }
    return items;
  }

  /**
   * Resolve totals for one category. If the daily entity is configured,
   * accumulate; otherwise return nulls so the cell shows "—".
   */
  _resolveTotals(dailyEntityId) {
    if (!dailyEntityId) return { today: null, month: null, year: null };
    const v = this._toKWh(dailyEntityId);
    if (v === null) return { today: null, month: null, year: null };
    return _accumulate(dailyEntityId, v);
  }

  render() {
    if (!this._config || !this.hass) {
      return html`<ha-card><div style="padding:1rem;">Loading…</div></ha-card>`;
    }

    const cfg = this._config;
    const speed = this._speedMult();
    const pCount = this._particleCount();
    const uid = this._uid;

    const ids = {
      sky: `${uid}_sky`,
      ground: `${uid}_ground`,
      sunCorona: `${uid}_sunCorona`,
      sunCore: `${uid}_sunCore`,
      invBody: `${uid}_invBody`,
      invScreen: `${uid}_invScreen`,
      batBody: `${uid}_batBody`,
      batCharge: `${uid}_batCharge`,
      houseRoof: `${uid}_houseRoof`,
      houseWall: `${uid}_houseWall`,
      pylonMetal: `${uid}_pylonMetal`,
      sunRays: `${uid}_sunRays`,
      batClip: `${uid}_batClip`,
      pSunPanel: `${uid}_pSunPanel`,
      pSolarInv: `${uid}_pSolarInv`,
      pGridInv: `${uid}_pGridInv`,
      pInvGrid: `${uid}_pInvGrid`,
      pInvBat: `${uid}_pInvBat`,
      pBatInv: `${uid}_pBatInv`,
      pInvHome: `${uid}_pInvHome`,
    };

    const solarKW = this._toKW(cfg.solar_power);
    const gridKW = this._toKW(cfg.grid_power);
    const batteryKW = this._toKW(cfg.battery_power);
    const batterySoC = Math.max(0, Math.min(100, Math.round(this._num(cfg.battery_soc, 0))));
    const homeKW = this._toKW(cfg.home_power);
    const efficiency = this._num(cfg.inverter_efficiency, 98);

    const gridIn = gridKW > 0 ? gridKW : 0;
    const gridOut = gridKW < 0 ? Math.abs(gridKW) : 0;
    const batCharging = batteryKW > 0;
    const batDischarging = batteryKW < 0;

    const sun = this._sunPosition();

    const fillH = (batterySoC / 100) * 56;
    const fillY = 34 - fillH;

    // Auto-accumulated totals from the daily entity per category.
    const tSolar = this._resolveTotals(cfg.solar_daily);
    const tGridIn = this._resolveTotals(cfg.grid_import_daily);
    const tGridOut = this._resolveTotals(cfg.grid_export_daily);
    const tHome = this._resolveTotals(cfg.home_daily);

    const totals = {
      solar: [tSolar.today, tSolar.month, tSolar.year],
      gridIn: [tGridIn.today, tGridIn.month, tGridIn.year],
      gridOut: [tGridOut.today, tGridOut.month, tGridOut.year],
      home: [tHome.today, tHome.month, tHome.year],
    };

    return html`
      <ha-card>
        <div class="card-content">
          <div class="header">
            <div>
              <p class="header-eyebrow">Live energy flow</p>
              <p class="header-title">${cfg.title || "Home grid"}</p>
            </div>
            <div class="header-right">
              <div class="live-indicator">
                <span class="pulse-dot"></span>
                <span class="live-text">Live</span>
              </div>
              <span class="sun-status">SUN · ${Math.round(sun.elevation)}° · AZ ${Math.round(sun.azimuth)}°</span>
            </div>
          </div>

          <div class="scene">
            <svg viewBox="0 0 700 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Energy flow scene">
              <defs>
                <linearGradient id=${ids.sky} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#7BB6E8" />
                  <stop offset="60%" stop-color="#C8DDF0" />
                  <stop offset="100%" stop-color="#F4E4D0" />
                </linearGradient>
                <linearGradient id=${ids.ground} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#9BAE7A" />
                  <stop offset="100%" stop-color="#5F6E48" />
                </linearGradient>
                <radialGradient id=${ids.sunCorona} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFF5C8" stop-opacity="1" />
                  <stop offset="35%" stop-color="#FFD96B" stop-opacity="0.85" />
                  <stop offset="70%" stop-color="#FF9A2E" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#FF7A1F" stop-opacity="0" />
                </radialGradient>
                <radialGradient id=${ids.sunCore} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFFBE6" />
                  <stop offset="60%" stop-color="#FFD562" />
                  <stop offset="100%" stop-color="#F59B1F" />
                </radialGradient>
                <linearGradient id=${ids.invBody} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#3A3D42" />
                  <stop offset="50%" stop-color="#5A5E64" />
                  <stop offset="100%" stop-color="#2A2C30" />
                </linearGradient>
                <linearGradient id=${ids.invScreen} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#0A2540" />
                  <stop offset="100%" stop-color="#163E66" />
                </linearGradient>
                <linearGradient id=${ids.batBody} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#E8ECEF" />
                  <stop offset="50%" stop-color="#FAFBFC" />
                  <stop offset="100%" stop-color="#C9D0D6" />
                </linearGradient>
                <linearGradient id=${ids.batCharge} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#34D08C" />
                  <stop offset="100%" stop-color="#0E8C5A" />
                </linearGradient>
                <linearGradient id=${ids.houseRoof} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#8A4A3C" />
                  <stop offset="100%" stop-color="#5C2E26" />
                </linearGradient>
                <linearGradient id=${ids.houseWall} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#F5EAD7" />
                  <stop offset="100%" stop-color="#D8C5A8" />
                </linearGradient>
                <linearGradient id=${ids.pylonMetal} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#9AA3AB" />
                  <stop offset="100%" stop-color="#5F676E" />
                </linearGradient>
                <g id=${ids.sunRays}>
                  <g stroke="#FFD562" stroke-width="2" stroke-linecap="round" opacity="0.7">
                    <line x1="0" y1="-26" x2="0" y2="-34" />
                    <line x1="0" y1="26" x2="0" y2="34" />
                    <line x1="-26" y1="0" x2="-34" y2="0" />
                    <line x1="26" y1="0" x2="34" y2="0" />
                    <line x1="-19" y1="-19" x2="-25" y2="-25" />
                    <line x1="19" y1="-19" x2="25" y2="-25" />
                    <line x1="-19" y1="19" x2="-25" y2="25" />
                    <line x1="19" y1="19" x2="25" y2="25" />
                  </g>
                </g>
                <clipPath id=${ids.batClip}>
                  <rect x="-24" y="-22" width="48" height="56" rx="3" />
                </clipPath>
              </defs>

              <rect x="0" y="0" width="700" height="280" fill="url(#${ids.sky})" />
              <ellipse cx="120" cy="55" rx="70" ry="9" fill="#FFFFFF" opacity="0.3" />
              <ellipse cx="540" cy="40" rx="60" ry="8" fill="#FFFFFF" opacity="0.28" />

              ${cfg.show_sun_arc !== false
                ? svg`
                    <path d="M 60 240 Q 350 -30 640 240" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.45" stroke-dasharray="2 5" />
                    <circle cx="60" cy="240" r="3" fill="#FFB347" opacity="0.6" />
                    <circle cx="640" cy="240" r="3" fill="#FF6B3D" opacity="0.6" />
                    <text x="60" y="258" text-anchor="middle" font-size="9" fill="#5F676E" font-weight="500">SUNRISE</text>
                    <text x="640" y="258" text-anchor="middle" font-size="9" fill="#5F676E" font-weight="500">SUNSET</text>
                  `
                : ""}

              ${sun.visible
                ? svg`
                    <g transform="translate(${sun.x.toFixed(1)}, ${sun.y.toFixed(1)})">
                      <circle r="58" fill="url(#${ids.sunCorona})">
                        <animate attributeName="r" values="54;62;54" dur="4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0.95;0.7" dur="4s" repeatCount="indefinite" />
                      </circle>
                      <circle r="38" fill="url(#${ids.sunCorona})" opacity="0.7" />
                      <g>
                        <use href="#${ids.sunRays}" />
                        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="60s" repeatCount="indefinite" />
                      </g>
                      <g opacity="0.5">
                        <use href="#${ids.sunRays}" />
                        <animateTransform attributeName="transform" type="rotate" from="22.5" to="-337.5" dur="90s" repeatCount="indefinite" />
                      </g>
                      <circle r="20" fill="url(#${ids.sunCore})" />
                    </g>
                  `
                : svg`<text x="350" y="100" text-anchor="middle" font-size="11" fill="#5F676E" letter-spacing="0.06em">SUN BELOW HORIZON</text>`}

              <path id=${ids.pSunPanel} d="M 180 80 Q 145 180 110 250" fill="none" stroke="#FFD562" stroke-width="1" stroke-opacity=${sun.visible && solarKW > 0.05 ? 0.4 : 0} stroke-dasharray="2 3" />
              ${sun.visible && solarKW > 0.05 ? this._renderParticles(ids.pSunPanel, "#FFEB8A", 2, 1.6 * speed, 4) : ""}

              <rect x="0" y="280" width="700" height="140" fill="url(#${ids.ground})" />

              <g transform="translate(110, 290)">
                <rect x="-26" y="22" width="3" height="32" fill="#3A3D42" />
                <rect x="23" y="22" width="3" height="32" fill="#3A3D42" />
                <g transform="skewY(-14)">
                  <rect x="-50" y="-8" width="100" height="42" fill="#0F2A4A" stroke="#0A1A30" stroke-width="1" />
                  <g stroke="#1A4A8A" stroke-width="0.6" opacity="0.7">
                    <line x1="-50" y1="6" x2="50" y2="6" />
                    <line x1="-50" y1="20" x2="50" y2="20" />
                    <line x1="-25" y1="-8" x2="-25" y2="34" />
                    <line x1="0" y1="-8" x2="0" y2="34" />
                    <line x1="25" y1="-8" x2="25" y2="34" />
                  </g>
                  <rect x="-50" y="-8" width="22" height="42" fill="#5A9CD8" opacity="0.22" />
                </g>
                <text x="0" y="76" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">SOLAR · ${this._formatPower(solarKW * 1000)}</text>
              </g>

              <g transform="translate(290, 270)">
                <path d="M -16 80 L 16 80 L 10 4 L -10 4 Z" fill="url(#${ids.pylonMetal})" stroke="#3A3D42" stroke-width="0.8" />
                <rect x="-26" y="8" width="52" height="3" fill="#5F676E" />
                <rect x="-22" y="24" width="44" height="3" fill="#5F676E" />
                <rect x="-18" y="40" width="36" height="3" fill="#5F676E" />
                <circle cx="-26" cy="8" r="2" fill="#2A2C30" />
                <circle cx="26" cy="8" r="2" fill="#2A2C30" />
                <circle cx="-22" cy="24" r="2" fill="#2A2C30" />
                <circle cx="22" cy="24" r="2" fill="#2A2C30" />
                <circle cx="-18" cy="40" r="2" fill="#2A2C30" />
                <circle cx="18" cy="40" r="2" fill="#2A2C30" />
                <path d="M -14 80 L 8 4 M 14 80 L -8 4 M -12 60 L 9 4 M 12 60 L -9 4" stroke="#5F676E" stroke-width="0.6" fill="none" opacity="0.7" />
                <path d="M -2 4 L 0 -6 L 2 4 Z" fill="#3A3D42" />
                <text x="0" y="98" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">GRID · ${this._formatPower(Math.abs(gridKW) * 1000)} ${gridOut > 0.05 ? "↑" : gridIn > 0.05 ? "↓" : ""}</text>
              </g>

              <g transform="translate(450, 320)">
                <rect x="-46" y="-46" width="92" height="92" rx="3" fill="#1F2125" />
                <rect x="-44" y="-44" width="88" height="88" rx="4" fill="url(#${ids.invBody})" />
                <g stroke="#1A1C20" stroke-width="0.6" opacity="0.85">
                  <line x1="-32" y1="-36" x2="32" y2="-36" />
                  <line x1="-32" y1="-32" x2="32" y2="-32" />
                  <line x1="-32" y1="-28" x2="32" y2="-28" />
                </g>
                <rect x="-30" y="-22" width="60" height="2" fill="#7A8088" opacity="0.5" />
                <rect x="-32" y="-16" width="64" height="24" rx="2" fill="url(#${ids.invScreen})" stroke="#0A1820" stroke-width="0.5" />
                <text x="0" y="-5" text-anchor="middle" font-size="7" fill="#5DD0FF" font-family="monospace" letter-spacing="0.1em">DC → AC</text>
                <text x="0" y="5" text-anchor="middle" font-size="9" fill="#7DFAB8" font-family="monospace" font-weight="500">
                  ${this._formatPower((solarKW + gridIn) * 1000)}
                  <animate attributeName="opacity" values="1;0.7;1" dur="1.5s" repeatCount="indefinite" />
                </text>
                <circle cx="-22" cy="22" r="2.2" fill="#34D08C">
                  <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
                </circle>
                <circle cx="-12" cy="22" r="2.2" fill="#34D08C" opacity="0.85" />
                <circle cx="-2" cy="22" r="2.2" fill="#FFB347" opacity="0.6" />
                <text x="20" y="25" font-size="6" fill="#9AA3AB" font-family="monospace">${efficiency.toFixed(1)}% η</text>
                <g stroke="#1A1C20" stroke-width="0.6" opacity="0.85">
                  <line x1="-32" y1="34" x2="32" y2="34" />
                  <line x1="-32" y1="38" x2="32" y2="38" />
                </g>
                <rect x="-44" y="-44" width="2" height="88" fill="#7A8088" opacity="0.3" />
                <text x="0" y="62" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">INVERTER</text>
              </g>

              <g transform="translate(610, 318)">
                <ellipse cx="0" cy="46" rx="34" ry="3" fill="#000" opacity="0.15" />
                <rect x="-30" y="-44" width="60" height="86" rx="6" fill="url(#${ids.batBody})" stroke="#9AA3AB" stroke-width="0.8" />
                <rect x="-28" y="-42" width="56" height="6" rx="2" fill="#5F676E" opacity="0.85" />
                <rect x="-12" y="-32" width="24" height="5" rx="1" fill="#2C2C2A" opacity="0.7" />
                <rect x="-24" y="-22" width="48" height="56" rx="3" fill="#E8ECEF" stroke="#9AA3AB" stroke-width="0.5" />
                <g clip-path="url(#${ids.batClip})">
                  <rect x="-24" y=${fillY.toFixed(2)} width="48" height=${fillH.toFixed(2)} fill="url(#${ids.batCharge})" />
                  ${batCharging
                    ? svg`
                        <circle cx="-12" cy="20" r="1.5" fill="#FFFFFF" opacity="0.6">
                          <animate attributeName="cy" values="32;-8" dur="3s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0;0.7;0" dur="3s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="6" cy="20" r="1.2" fill="#FFFFFF" opacity="0.5">
                          <animate attributeName="cy" values="32;-8" dur="3.5s" begin="0.7s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0;0.6;0" dur="3.5s" begin="0.7s" repeatCount="indefinite" />
                        </circle>
                      `
                    : ""}
                </g>
                <text x="0" y="6" text-anchor="middle" font-size="13" fill="#FFFFFF" font-weight="500">${batterySoC}%</text>
                <rect x="-24" y="40" width="6" height="4" fill="#5F676E" />
                <rect x="18" y="40" width="6" height="4" fill="#5F676E" />
                <text x="0" y="60" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">BATTERY · ${batCharging ? "+" : batDischarging ? "-" : ""}${this._formatPower(Math.abs(batteryKW) * 1000)}</text>
              </g>

              <g transform="translate(610, 380)">
                <ellipse cx="0" cy="20" rx="42" ry="3" fill="#000" opacity="0.18" />
                <rect x="-32" y="-12" width="64" height="28" fill="url(#${ids.houseWall})" stroke="#A89674" stroke-width="0.5" />
                <path d="M -38 -12 L 0 -38 L 38 -12 Z" fill="url(#${ids.houseRoof})" stroke="#3A1E18" stroke-width="0.6" />
                <g stroke="#3A1E18" stroke-width="0.4" opacity="0.5">
                  <line x1="-26" y1="-19" x2="26" y2="-19" />
                  <line x1="-32" y1="-13" x2="32" y2="-13" />
                </g>
                <rect x="14" y="-30" width="7" height="13" fill="#5C2E26" stroke="#3A1E18" stroke-width="0.4" />
                <rect x="-5" y="2" width="10" height="14" fill="#5C3A24" stroke="#3A1E18" stroke-width="0.4" />
                <rect x="-26" y="-6" width="12" height="10" fill="#FFD562" stroke="#A89674" stroke-width="0.5">
                  <animate attributeName="fill" values="#FFD562;#FFE89A;#FFD562" dur="4s" repeatCount="indefinite" />
                </rect>
                <line x1="-20" y1="-6" x2="-20" y2="4" stroke="#A89674" stroke-width="0.4" />
                <line x1="-26" y1="-1" x2="-14" y2="-1" stroke="#A89674" stroke-width="0.4" />
                <rect x="14" y="-6" width="12" height="10" fill="#FFD562" stroke="#A89674" stroke-width="0.5">
                  <animate attributeName="fill" values="#FFD562;#FFE89A;#FFD562" dur="4s" begin="1.2s" repeatCount="indefinite" />
                </rect>
                <line x1="20" y1="-6" x2="20" y2="4" stroke="#A89674" stroke-width="0.4" />
                <line x1="14" y1="-1" x2="26" y2="-1" stroke="#A89674" stroke-width="0.4" />
                <text x="0" y="32" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">HOME · ${this._formatPower(homeKW * 1000)}</text>
              </g>

              <path id=${ids.pSolarInv} d="M 140 320 Q 280 340 404 320" fill="none" stroke="#FFB347" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />
              <path id=${ids.pGridInv} d="M 318 305 Q 380 305 404 315" fill="none" stroke="#5DBFEB" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />
              <path id=${ids.pInvBat} d="M 496 305 Q 555 305 580 315" fill="none" stroke="#34D08C" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />
              <path id=${ids.pInvHome} d="M 496 330 Q 555 360 580 380" fill="none" stroke="#B8A5F0" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />
              <path id=${ids.pInvGrid} d="M 404 315 Q 380 305 318 305" fill="none" stroke="transparent" />
              <path id=${ids.pBatInv} d="M 580 315 Q 555 305 496 305" fill="none" stroke="transparent" />

              ${solarKW > 0.05 ? this._renderParticles(ids.pSolarInv, "#FFD562", 3, 2.4 * speed, pCount) : ""}
              ${gridIn > 0.05 ? this._renderParticles(ids.pGridInv, "#5DBFEB", 2.5, 2.6 * speed, pCount) : ""}
              ${gridOut > 0.05 ? this._renderParticles(ids.pInvGrid, "#97C459", 2.5, 2.6 * speed, pCount) : ""}
              ${batCharging ? this._renderParticles(ids.pInvBat, "#34D08C", 2.5, 2.4 * speed, pCount) : ""}
              ${batDischarging ? this._renderParticles(ids.pBatInv, "#FFB347", 2.5, 2.4 * speed, pCount) : ""}
              ${homeKW > 0.05 ? this._renderParticles(ids.pInvHome, "#B8A5F0", 3, 2.6 * speed, pCount) : ""}
            </svg>
          </div>

          <div class="totals">
            <p class="totals-label">Cumulative totals · auto-tracked</p>
            ${this._totalsRow("Solar", "#EF9F27", "#FAEEDA", "#854F0B", "#633806", totals.solar)}
            ${this._totalsRow("Grid in", "#378ADD", "#E6F1FB", "#0C447C", "#042C53", totals.gridIn)}
            ${this._totalsRow("Grid out", "#97C459", "#EAF3DE", "#3B6D11", "#173404", totals.gridOut)}
            ${this._totalsRow("Home", "#7F77DD", "#EEEDFE", "#3C3489", "#26215C", totals.home)}
          </div>
        </div>
      </ha-card>
    `;
  }

  _totalsRow(label, dotColor, bg, labelColor, valueColor, [today, month, year]) {
    return html`
      <div class="totals-row">
        <div class="totals-label-cell">
          <span class="dot" style="background:${dotColor}"></span>
          <span style="color:${labelColor}">${label}</span>
        </div>
        <div class="cell" style="background:${bg};border-left-color:${dotColor}">
          <span class="cell-label" style="color:${labelColor}">Today</span>
          <span class="cell-value" style="color:${valueColor}">${this._formatEnergy(today)} <span class="cell-unit">kWh</span></span>
        </div>
        <div class="cell" style="background:${bg};border-left-color:${dotColor}">
          <span class="cell-label" style="color:${labelColor}">This month</span>
          <span class="cell-value" style="color:${valueColor}">${this._formatEnergy(month)} <span class="cell-unit">kWh</span></span>
        </div>
        <div class="cell" style="background:${bg};border-left-color:${dotColor}">
          <span class="cell-label" style="color:${labelColor}">This year</span>
          <span class="cell-value" style="color:${valueColor}">${this._formatEnergy(year)} <span class="cell-unit">kWh</span></span>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      ha-card { padding: 0; overflow: hidden; }
      .card-content { padding: 1.5rem; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
      .header-eyebrow { font-size: 13px; color: var(--secondary-text-color); margin: 0 0 4px; letter-spacing: 0.04em; text-transform: uppercase; }
      .header-title { font-size: 22px; font-weight: 500; margin: 0; color: var(--primary-text-color); }
      .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
      .live-indicator { display: flex; gap: 6px; align-items: center; }
      .live-text { font-size: 12px; color: var(--secondary-text-color); }
      .sun-status { font-size: 11px; color: var(--disabled-text-color, #9b9b9b); letter-spacing: 0.04em; }
      .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #1d9e75; box-shadow: 0 0 0 0 rgba(29, 158, 117, 0.7); animation: pulse-ring 2s infinite; }
      @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(29, 158, 117, 0.7); } 70% { box-shadow: 0 0 0 8px rgba(29, 158, 117, 0); } 100% { box-shadow: 0 0 0 0 rgba(29, 158, 117, 0); } }
      .scene { position: relative; height: 420px; margin: 0 -0.5rem; border-radius: 12px; overflow: hidden; }
      .scene svg { width: 100%; height: 100%; display: block; }
      .totals { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 0.5px solid var(--divider-color); }
      .totals-label { font-size: 11px; color: var(--secondary-text-color); margin: 0 0 12px; letter-spacing: 0.06em; text-transform: uppercase; }
      .totals-row { display: grid; grid-template-columns: 90px repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
      .totals-row:last-child { margin-bottom: 0; }
      .totals-label-cell { display: flex; align-items: center; gap: 8px; padding-left: 4px; font-size: 13px; font-weight: 500; }
      .dot { width: 8px; height: 8px; border-radius: 50%; }
      .cell { padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; border-radius: 8px; border-left: 2px solid; }
      .cell-label { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 2px; opacity: 0.85; }
      .cell-value { font-size: 15px; font-weight: 500; }
      .cell-unit { font-size: 11px; font-weight: 400; opacity: 0.7; }
    `;
  }
}

customElements.define("energy-flow-card", EnergyFlowCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-flow-card",
  name: "Energy Flow Card",
  description: "Live cinematic energy flow with sun-tracking, inverter and auto-accumulating totals",
  preview: true,
});

console.info(
  "%c ENERGY-FLOW-CARD %c v1.1.0 ",
  "color: white; background: #EF9F27; font-weight: 700;",
  "color: white; background: #1D9E75; font-weight: 700;"
);
