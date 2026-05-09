/**
 * Custom Energy Flow Card for Home Assistant
 * v1.2.0 — cleaner scene + sun-following rays
 *
 * Changes from v1.1.0:
 *  - Light rays now ORIGINATE FROM THE SUN'S ACTUAL POSITION and land
 *    on the solar panel. Three thin beams fan out from the sun and
 *    move with it across the sky.
 *  - Scene de-cluttered: simpler sun (no double rotating ray-set, no
 *    corona pulse), simpler inverter (no LEDs / status text),
 *    simpler house (no windows / door fuss), simpler pylon, dropped
 *    sunrise/sunset labels and dotted arc by default, calmer particles.
 *  - Auto-accumulating monthly/yearly totals retained from v1.1.0.
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
 * Persistent daily-rollup helper.                                     *
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
      title: "Home grid",
      sun_entity: "sun.sun",
      show_sun_arc: false,
      animation_speed: "normal",
      particle_density: "low",
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = {
      title: "Home grid",
      sun_entity: "sun.sun",
      show_sun_arc: false,
      animation_speed: "normal",
      particle_density: "low",
      ...config,
    };
  }

  getCardSize() {
    return 7;
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
    const d = this._config.particle_density || "low";
    if (d === "low") return 2;
    if (d === "high") return 4;
    return 3;
  }

  _speedMult() {
    const s = this._config.animation_speed || "normal";
    if (s === "slow") return 1.6;
    if (s === "fast") return 0.6;
    return 1;
  }

  /**
   * Sun position along the sunrise→noon→sunset Bezier arc, computed
   * from sun.sun's next_rising / next_setting timestamps so it works
   * in any hemisphere.
   */
  _sunPosition() {
    const sunId = this._config.sun_entity || "sun.sun";
    const state = this._state(sunId);
    const elevation = this._safeNum(this._attr(sunId, "elevation", 45), 45);
    const azimuth = this._safeNum(this._attr(sunId, "azimuth", 180), 180);

    if (elevation < 0 || (state && state.state === "below_horizon")) {
      return { x: 350, y: -100, visible: false, elevation, azimuth };
    }

    let t = null;
    try {
      const nextRising = this._attr(sunId, "next_rising");
      const nextSetting = this._attr(sunId, "next_setting");
      if (nextRising && nextSetting) {
        const now = Date.now();
        const nrTs = Date.parse(nextRising);
        const nsTs = Date.parse(nextSetting);
        if (isFinite(nrTs) && isFinite(nsTs)) {
          const sunsetTs = nsTs;
          const sunriseTs = nrTs - 24 * 60 * 60 * 1000;
          if (sunsetTs > sunriseTs) {
            t = (now - sunriseTs) / (sunsetTs - sunriseTs);
          }
        }
      }
    } catch (e) { /* fallback below */ }

    if (t === null || !isFinite(t)) {
      const hr = new Date().getHours() + new Date().getMinutes() / 60;
      t = (hr - 6) / 12;
    }
    t = Math.max(0, Math.min(1, t));

    const p0 = { x: 80,  y: 230 };
    const p1 = { x: 350, y: -10 };
    const p2 = { x: 620, y: 230 };
    const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
    const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;

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

  _resolveTotals(dailyEntityId) {
    if (!dailyEntityId) return { today: null, month: null, year: null };
    const v = this._toKWh(dailyEntityId);
    if (v === null) return { today: null, month: null, year: null };
    return _accumulate(dailyEntityId, v);
  }

  /**
   * Build a curved path from (sx, sy) to (tx, ty) with a control point
   * offset perpendicular to the line. Used for the sun→panel rays.
   */
  _curvePath(sx, sy, tx, ty, offset) {
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    // Perpendicular offset for control point
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const cx = mx + px * offset;
    const cy = my + py * offset;
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
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
      sky:         `${uid}_sky`,
      ground:      `${uid}_ground`,
      sunCore:     `${uid}_sunCore`,
      sunGlow:     `${uid}_sunGlow`,
      panelGlass:  `${uid}_panelGlass`,
      invBody:     `${uid}_invBody`,
      batBody:     `${uid}_batBody`,
      batCharge:   `${uid}_batCharge`,
      houseRoof:   `${uid}_houseRoof`,
      houseWall:   `${uid}_houseWall`,
      pylonMetal:  `${uid}_pylonMetal`,
      batClip:     `${uid}_batClip`,
      ray1:        `${uid}_ray1`,
      ray2:        `${uid}_ray2`,
      ray3:        `${uid}_ray3`,
      pSolarInv:   `${uid}_pSolarInv`,
      pGridInv:    `${uid}_pGridInv`,
      pInvGrid:    `${uid}_pInvGrid`,
      pInvBat:     `${uid}_pInvBat`,
      pBatInv:     `${uid}_pBatInv`,
      pInvHome:    `${uid}_pInvHome`,
    };

    const solarKW = this._toKW(cfg.solar_power);
    const gridKW = this._toKW(cfg.grid_power);
    const batteryKW = this._toKW(cfg.battery_power);
    const batterySoC = Math.max(0, Math.min(100, Math.round(this._num(cfg.battery_soc, 0))));
    const homeKW = this._toKW(cfg.home_power);

    const gridIn = gridKW > 0 ? gridKW : 0;
    const gridOut = gridKW < 0 ? Math.abs(gridKW) : 0;
    const batCharging = batteryKW > 0;
    const batDischarging = batteryKW < 0;

    const sun = this._sunPosition();

    // Battery fill geometry (matches inner glass rect: x=-20, y=-18, w=40, h=44)
    const fillH = (batterySoC / 100) * 44;
    const fillY = 26 - fillH;

    // Top-of-panel target for sun rays (panel sits at PANEL_X, PANEL_Y).
    const panelX = 90;
    const panelY = 300;

    // Build the three sun→panel ray paths (only used when sun is up
    // and there's actual production).
    const showRays = sun.visible && solarKW > 0.05;
    const rayPath1 = showRays ? this._curvePath(sun.x, sun.y, panelX - 14, panelY,  18) : "";
    const rayPath2 = showRays ? this._curvePath(sun.x, sun.y, panelX,      panelY,   0) : "";
    const rayPath3 = showRays ? this._curvePath(sun.x, sun.y, panelX + 14, panelY, -18) : "";

    const tSolar   = this._resolveTotals(cfg.solar_daily);
    const tGridIn  = this._resolveTotals(cfg.grid_import_daily);
    const tGridOut = this._resolveTotals(cfg.grid_export_daily);
    const tHome    = this._resolveTotals(cfg.home_daily);

    const totals = {
      solar:   [tSolar.today,   tSolar.month,   tSolar.year],
      gridIn:  [tGridIn.today,  tGridIn.month,  tGridIn.year],
      gridOut: [tGridOut.today, tGridOut.month, tGridOut.year],
      home:    [tHome.today,    tHome.month,    tHome.year],
    };

    return html`
      <ha-card>
        <div class="card-content">
          <div class="header">
            <div>
              <p class="header-eyebrow">Live energy</p>
              <p class="header-title">${cfg.title || "Home grid"}</p>
            </div>
            <div class="header-right">
              <div class="live-indicator">
                <span class="pulse-dot"></span>
                <span class="live-text">Live</span>
              </div>
              <span class="sun-status">${sun.visible ? `SUN · ${Math.round(sun.elevation)}°` : "SUN DOWN"}</span>
            </div>
          </div>

          <div class="scene">
            <svg viewBox="0 0 700 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Energy flow scene">
              <defs>
                <linearGradient id=${ids.sky} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#86BBE8" />
                  <stop offset="100%" stop-color="#D8E4EE" />
                </linearGradient>
                <linearGradient id=${ids.ground} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#A2B484" />
                  <stop offset="100%" stop-color="#6B7A52" />
                </linearGradient>
                <radialGradient id=${ids.sunGlow} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFE89A" stop-opacity="0.9" />
                  <stop offset="100%" stop-color="#FFB347" stop-opacity="0" />
                </radialGradient>
                <radialGradient id=${ids.sunCore} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFFBE6" />
                  <stop offset="100%" stop-color="#F5B142" />
                </radialGradient>
                <linearGradient id=${ids.panelGlass} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#1B3A66" />
                  <stop offset="100%" stop-color="#0E2440" />
                </linearGradient>
                <linearGradient id=${ids.invBody} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#4A4E54" />
                  <stop offset="100%" stop-color="#2C2E32" />
                </linearGradient>
                <linearGradient id=${ids.batBody} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#EEF1F4" />
                  <stop offset="100%" stop-color="#C8CFD5" />
                </linearGradient>
                <linearGradient id=${ids.batCharge} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#3FD698" />
                  <stop offset="100%" stop-color="#0E8C5A" />
                </linearGradient>
                <linearGradient id=${ids.houseRoof} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#7E4034" />
                  <stop offset="100%" stop-color="#542923" />
                </linearGradient>
                <linearGradient id=${ids.houseWall} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#F2E5CE" />
                  <stop offset="100%" stop-color="#D4C0A0" />
                </linearGradient>
                <linearGradient id=${ids.pylonMetal} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#9AA3AB" />
                  <stop offset="100%" stop-color="#5F676E" />
                </linearGradient>
                <clipPath id=${ids.batClip}>
                  <rect x="-20" y="-18" width="40" height="44" rx="3" />
                </clipPath>
              </defs>

              <!-- Sky -->
              <rect x="0" y="0" width="700" height="270" fill="url(#${ids.sky})" />

              <!-- Optional faint sun arc -->
              ${cfg.show_sun_arc
                ? svg`<path d="M 80 230 Q 350 -10 620 230" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="2 6" />`
                : ""}

              <!-- SUN→PANEL RAYS: dynamic curved paths from current sun position -->
              ${showRays
                ? svg`
                    <path id=${ids.ray1} d=${rayPath1} fill="none" stroke="#FFE89A" stroke-width="1.5" stroke-opacity="0.55" stroke-linecap="round" />
                    <path id=${ids.ray2} d=${rayPath2} fill="none" stroke="#FFD562" stroke-width="2"   stroke-opacity="0.7"  stroke-linecap="round" />
                    <path id=${ids.ray3} d=${rayPath3} fill="none" stroke="#FFE89A" stroke-width="1.5" stroke-opacity="0.55" stroke-linecap="round" />
                    ${this._renderParticles(ids.ray2, "#FFEB8A", 1.8, 1.4 * speed, 3)}
                  `
                : ""}

              <!-- SUN -->
              ${sun.visible
                ? svg`
                    <g transform="translate(${sun.x.toFixed(1)}, ${sun.y.toFixed(1)})">
                      <circle r="44" fill="url(#${ids.sunGlow})" />
                      <circle r="20" fill="url(#${ids.sunCore})" />
                      <g stroke="#FFD562" stroke-width="1.8" stroke-linecap="round" opacity="0.75">
                        <line x1="0" y1="-26" x2="0" y2="-34" />
                        <line x1="0" y1="26"  x2="0" y2="34" />
                        <line x1="-26" y1="0" x2="-34" y2="0" />
                        <line x1="26"  y1="0" x2="34"  y2="0" />
                        <line x1="-19" y1="-19" x2="-24" y2="-24" />
                        <line x1="19"  y1="-19" x2="24"  y2="-24" />
                        <line x1="-19" y1="19"  x2="-24" y2="24" />
                        <line x1="19"  y1="19"  x2="24"  y2="24" />
                      </g>
                    </g>
                  `
                : svg`<text x="350" y="135" text-anchor="middle" font-size="11" fill="#5F676E" letter-spacing="0.06em">SUN BELOW HORIZON</text>`}

              <!-- Ground -->
              <rect x="0" y="270" width="700" height="90" fill="url(#${ids.ground})" />
              <line x1="0" y1="270" x2="700" y2="270" stroke="#5F6E48" stroke-width="0.8" opacity="0.5" />

              <!-- SOLAR PANEL @ (90, 300) -->
              <g transform="translate(${panelX}, ${panelY})">
                <rect x="-22" y="22" width="3" height="22" fill="#3A3D42" />
                <rect x="19"  y="22" width="3" height="22" fill="#3A3D42" />
                <g transform="skewY(-12)">
                  <rect x="-40" y="-6" width="80" height="32" fill="url(#${ids.panelGlass})" stroke="#0A1A30" stroke-width="0.7" />
                  <g stroke="#2D5C8E" stroke-width="0.5" opacity="0.7">
                    <line x1="-40" y1="6"  x2="40" y2="6" />
                    <line x1="-40" y1="16" x2="40" y2="16" />
                    <line x1="-20" y1="-6" x2="-20" y2="26" />
                    <line x1="0"   y1="-6" x2="0"   y2="26" />
                    <line x1="20"  y1="-6" x2="20"  y2="26" />
                  </g>
                </g>
                <text x="0" y="58" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">SOLAR · ${this._formatPower(solarKW * 1000)}</text>
              </g>

              <!-- GRID PYLON @ (220, 280) -->
              <g transform="translate(220, 280)">
                <path d="M -12 56 L 12 56 L 7 4 L -7 4 Z" fill="url(#${ids.pylonMetal})" stroke="#3A3D42" stroke-width="0.5" />
                <rect x="-19" y="14" width="38" height="2.2" fill="#5F676E" />
                <rect x="-15" y="28" width="30" height="2.2" fill="#5F676E" />
                <path d="M -2 4 L 0 -8 L 2 4 Z" fill="#3A3D42" />
                <text x="0" y="74" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">
                  GRID · ${this._formatPower(Math.abs(gridKW) * 1000)} ${gridOut > 0.05 ? "↑" : gridIn > 0.05 ? "↓" : ""}
                </text>
              </g>

              <!-- INVERTER @ (380, 305) -->
              <g transform="translate(380, 305)">
                <rect x="-32" y="-32" width="64" height="64" rx="4" fill="url(#${ids.invBody})" stroke="#1F2125" stroke-width="0.7" />
                <rect x="-24" y="-20" width="48" height="18" rx="2" fill="#0E1E2C" stroke="#0A1820" stroke-width="0.4" />
                <text x="0" y="-7" text-anchor="middle" font-size="9" fill="#7DFAB8" font-family="monospace" font-weight="500">
                  ${this._formatPower((solarKW + gridIn) * 1000)}
                </text>
                <circle cx="-18" cy="18" r="2" fill="#3FD698">
                  <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
                </circle>
                <text x="0" y="48" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">INVERTER</text>
              </g>

              <!-- BATTERY @ (510, 305) -->
              <g transform="translate(510, 305)">
                <rect x="-24" y="-34" width="48" height="64" rx="4" fill="url(#${ids.batBody})" stroke="#9AA3AB" stroke-width="0.6" />
                <rect x="-22" y="-32" width="44" height="4" rx="2" fill="#5F676E" opacity="0.85" />
                <rect x="-20" y="-18" width="40" height="44" rx="3" fill="#E8ECEF" stroke="#9AA3AB" stroke-width="0.4" />
                <g clip-path="url(#${ids.batClip})">
                  <rect x="-20" y=${fillY.toFixed(2)} width="40" height=${fillH.toFixed(2)} fill="url(#${ids.batCharge})" />
                </g>
                <text x="0" y="6" text-anchor="middle" font-size="12" fill="#FFFFFF" font-weight="500">${batterySoC}%</text>
                <text x="0" y="48" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">
                  BATTERY · ${batCharging ? "+" : batDischarging ? "−" : ""}${this._formatPower(Math.abs(batteryKW) * 1000)}
                </text>
              </g>

              <!-- HOUSE @ (620, 305) -->
              <g transform="translate(620, 305)">
                <rect x="-26" y="-8" width="52" height="22" fill="url(#${ids.houseWall})" stroke="#A89674" stroke-width="0.5" />
                <path d="M -32 -8 L 0 -32 L 32 -8 Z" fill="url(#${ids.houseRoof})" stroke="#3A1E18" stroke-width="0.5" />
                <rect x="-5" y="0" width="10" height="14" fill="#5C3A24" stroke="#3A1E18" stroke-width="0.4" />
                <text x="0" y="32" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">HOME · ${this._formatPower(homeKW * 1000)}</text>
              </g>

              <!-- FLOW PATHS (left → right) -->
              <path id=${ids.pSolarInv} d="M 120 305 Q 250 320 348 305" fill="none" stroke="#FFB347" stroke-width="1.2" stroke-opacity="0.45" stroke-dasharray="2 4" />
              <path id=${ids.pGridInv}  d="M 233 310 Q 310 310 348 305" fill="none" stroke="#5DBFEB" stroke-width="1.2" stroke-opacity="0.45" stroke-dasharray="2 4" />
              <path id=${ids.pInvBat}   d="M 412 305 Q 460 305 486 305" fill="none" stroke="#3FD698" stroke-width="1.2" stroke-opacity="0.45" stroke-dasharray="2 4" />
              <path id=${ids.pInvHome}  d="M 534 305 Q 575 310 594 300" fill="none" stroke="#B8A5F0" stroke-width="1.2" stroke-opacity="0.45" stroke-dasharray="2 4" />
              <path id=${ids.pInvGrid}  d="M 348 305 Q 310 310 233 310" fill="none" stroke="transparent" />
              <path id=${ids.pBatInv}   d="M 486 305 Q 460 305 412 305" fill="none" stroke="transparent" />

              ${solarKW > 0.05 ? this._renderParticles(ids.pSolarInv, "#FFD562", 2.2, 2.4 * speed, pCount) : ""}
              ${gridIn  > 0.05 ? this._renderParticles(ids.pGridInv,  "#5DBFEB", 2,   2.6 * speed, pCount) : ""}
              ${gridOut > 0.05 ? this._renderParticles(ids.pInvGrid,  "#97C459", 2,   2.6 * speed, pCount) : ""}
              ${batCharging      ? this._renderParticles(ids.pInvBat, "#3FD698", 2,   2.4 * speed, pCount) : ""}
              ${batDischarging   ? this._renderParticles(ids.pBatInv, "#FFB347", 2,   2.4 * speed, pCount) : ""}
              ${homeKW  > 0.05 ? this._renderParticles(ids.pInvHome,  "#B8A5F0", 2.2, 2.4 * speed, pCount) : ""}
            </svg>
          </div>

          <div class="totals">
            ${this._totalsRow("Solar",    "#EF9F27", totals.solar)}
            ${this._totalsRow("Grid in",  "#378ADD", totals.gridIn)}
            ${this._totalsRow("Grid out", "#97C459", totals.gridOut)}
            ${this._totalsRow("Home",     "#7F77DD", totals.home)}
          </div>
        </div>
      </ha-card>
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
      ha-card { padding: 0; overflow: hidden; }
      .card-content { padding: 1.25rem; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
      }
      .header-eyebrow {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin: 0 0 2px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .header-title {
        font-size: 20px;
        font-weight: 500;
        margin: 0;
        color: var(--primary-text-color);
      }
      .header-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }
      .live-indicator { display: flex; gap: 6px; align-items: center; }
      .live-text { font-size: 11px; color: var(--secondary-text-color); }
      .sun-status {
        font-size: 10px;
        color: var(--disabled-text-color, #9b9b9b);
        letter-spacing: 0.04em;
      }
      .pulse-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #1d9e75;
        box-shadow: 0 0 0 0 rgba(29, 158, 117, 0.7);
        animation: pulse-ring 2s infinite;
      }
      @keyframes pulse-ring {
        0%   { box-shadow: 0 0 0 0 rgba(29, 158, 117, 0.7); }
        70%  { box-shadow: 0 0 0 7px rgba(29, 158, 117, 0); }
        100% { box-shadow: 0 0 0 0 rgba(29, 158, 117, 0); }
      }
      .scene {
        position: relative;
        margin: 0 -0.25rem;
        border-radius: 10px;
        overflow: hidden;
      }
      .scene svg { width: 100%; height: auto; display: block; }
      .totals {
        margin-top: 1rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--divider-color);
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
        color: var(--primary-text-color);
      }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .cell {
        display: flex;
        flex-direction: column;
        padding: 4px 8px;
        background: var(--secondary-background-color, rgba(0,0,0,0.04));
        border-radius: 6px;
      }
      .cell-label {
        font-size: 9px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        margin-bottom: 1px;
      }
      .cell-value {
        font-size: 14px;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .cell-unit {
        font-size: 10px;
        font-weight: 400;
        color: var(--secondary-text-color);
      }
    `;
  }
}

customElements.define("energy-flow-card", EnergyFlowCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-flow-card",
  name: "Energy Flow Card",
  description: "Cinematic live energy flow with sun-tracking and auto totals",
  preview: true,
});

console.info(
  "%c ENERGY-FLOW-CARD %c v1.2.0 ",
  "color: white; background: #EF9F27; font-weight: 700;",
  "color: white; background: #1D9E75; font-weight: 700;"
);
