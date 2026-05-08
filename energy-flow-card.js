/**
 * Custom Energy Flow Card for Home Assistant
 * Displays a live scene with sun-tracking, solar panels, grid, inverter,
 * battery and home — plus rolling day/month/year totals.
 *
 * Resource type: JavaScript Module
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class EnergyFlowCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  // ---------- editor registration ----------
  static async getConfigElement() {
    await import("./energy-flow-card-editor.js");
    return document.createElement("energy-flow-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Home grid",
      solar_power: "",
      grid_power: "",
      battery_power: "",
      battery_soc: "",
      home_power: "",
      sun_entity: "sun.sun",
      solar_daily: "",
      solar_monthly: "",
      solar_yearly: "",
      grid_import_daily: "",
      grid_import_monthly: "",
      grid_import_yearly: "",
      grid_export_daily: "",
      grid_export_monthly: "",
      grid_export_yearly: "",
      home_daily: "",
      home_monthly: "",
      home_yearly: "",
      inverter_efficiency: "",
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

  // ---------- helpers ----------
  _state(entityId) {
    if (!entityId || !this.hass || !this.hass.states[entityId]) return null;
    return this.hass.states[entityId];
  }

  _num(entityId, fallback = 0) {
    const s = this._state(entityId);
    if (!s) return fallback;
    const n = parseFloat(s.state);
    return isNaN(n) ? fallback : n;
  }

  _attr(entityId, attr, fallback = null) {
    const s = this._state(entityId);
    if (!s || !s.attributes) return fallback;
    return s.attributes[attr] !== undefined ? s.attributes[attr] : fallback;
  }

  _formatPower(watts) {
    const w = Math.abs(watts);
    if (w >= 1000) return (w / 1000).toFixed(1) + " kW";
    return Math.round(w) + " W";
  }

  _formatEnergy(kwh) {
    if (kwh == null || isNaN(kwh)) return "—";
    if (kwh >= 1000) return (kwh / 1000).toFixed(2) + " MWh";
    if (kwh >= 100) return Math.round(kwh).toLocaleString();
    return kwh.toFixed(1);
  }

  // Convert state to kW. Auto-detects units (W vs kW).
  _toKW(entityId, fallback = 0) {
    const s = this._state(entityId);
    if (!s) return fallback;
    const n = parseFloat(s.state);
    if (isNaN(n)) return fallback;
    const unit = (s.attributes && s.attributes.unit_of_measurement) || "";
    if (unit.toLowerCase() === "w") return n / 1000;
    return n;
  }

  // Convert state to kWh.
  _toKWh(entityId, fallback = null) {
    const s = this._state(entityId);
    if (!s) return fallback;
    const n = parseFloat(s.state);
    if (isNaN(n)) return fallback;
    const unit = (s.attributes && s.attributes.unit_of_measurement) || "";
    if (unit.toLowerCase() === "wh") return n / 1000;
    if (unit.toLowerCase() === "mwh") return n * 1000;
    return n;
  }

  // Particle count from density setting
  _particleCount() {
    const d = this._config.particle_density || "medium";
    if (d === "low") return 2;
    if (d === "high") return 5;
    return 3;
  }

  // Animation duration multiplier from speed setting
  _speedMult() {
    const s = this._config.animation_speed || "normal";
    if (s === "slow") return 1.6;
    if (s === "fast") return 0.6;
    return 1;
  }

  // Compute sun position along the arc based on sun.sun azimuth/elevation
  _sunPosition() {
    const sunId = this._config.sun_entity || "sun.sun";
    const elevation = this._attr(sunId, "elevation", 45);
    const azimuth = this._attr(sunId, "azimuth", 180);

    // Below horizon: hide
    if (elevation < 0) {
      return { x: 350, y: -100, visible: false, elevation, azimuth };
    }

    // Map azimuth (90° east → 270° west) to t=0..1 along the arc
    let t = (azimuth - 90) / 180;
    t = Math.max(0, Math.min(1, t));

    // Arc: M 60 240 Q 350 -30 640 240 — quadratic bezier
    // B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    const p0 = { x: 60, y: 240 };
    const p1 = { x: 350, y: -30 };
    const p2 = { x: 640, y: 240 };
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

  // ---------- render ----------
  render() {
    if (!this._config || !this.hass) {
      return html`<ha-card><div style="padding:1rem">Loading…</div></ha-card>`;
    }

    const cfg = this._config;
    const speed = this._speedMult();
    const particleCount = this._particleCount();

    // Live values
    const solarKW = this._toKW(cfg.solar_power);
    const gridKW = this._toKW(cfg.grid_power);
    const batteryKW = this._toKW(cfg.battery_power);
    const batterySoC = Math.round(this._num(cfg.battery_soc, 0));
    const homeKW = this._toKW(cfg.home_power);
    const efficiency = this._num(cfg.inverter_efficiency, 98);

    // Grid is positive = importing, negative = exporting
    const gridIn = gridKW > 0 ? gridKW : 0;
    const gridOut = gridKW < 0 ? Math.abs(gridKW) : 0;

    // Battery: positive = charging, negative = discharging
    const batCharging = batteryKW > 0;

    // Sun position
    const sun = this._sunPosition();

    // Totals
    const solarToday = this._toKWh(cfg.solar_daily);
    const solarMonth = this._toKWh(cfg.solar_monthly);
    const solarYear = this._toKWh(cfg.solar_yearly);
    const gridInToday = this._toKWh(cfg.grid_import_daily);
    const gridInMonth = this._toKWh(cfg.grid_import_monthly);
    const gridInYear = this._toKWh(cfg.grid_import_yearly);
    const gridOutToday = this._toKWh(cfg.grid_export_daily);
    const gridOutMonth = this._toKWh(cfg.grid_export_monthly);
    const gridOutYear = this._toKWh(cfg.grid_export_yearly);
    const homeToday = this._toKWh(cfg.home_daily);
    const homeMonth = this._toKWh(cfg.home_monthly);
    const homeYear = this._toKWh(cfg.home_yearly);

    // Particle generators
    const photonParticles = this._photons(speed);
    const solarParticles =
      solarKW > 0.05
        ? this._particles("p4-solar-inv", "#FFD562", 3, 2.4 * speed, particleCount)
        : "";
    const gridInParticles =
      gridIn > 0.05
        ? this._particles("p4-grid-inv", "#5DBFEB", 2.5, 2.6 * speed, particleCount)
        : "";
    const gridOutParticles =
      gridOut > 0.05
        ? this._particles(
            "p4-grid-inv",
            "#97C459",
            2.5,
            2.6 * speed,
            particleCount,
            true
          )
        : "";
    const batParticles =
      Math.abs(batteryKW) > 0.05
        ? this._particles(
            "p4-inv-bat",
            batCharging ? "#34D08C" : "#FFB347",
            2.5,
            2.4 * speed,
            particleCount,
            !batCharging
          )
        : "";
    const homeParticles =
      homeKW > 0.05
        ? this._particles("p4-inv-home", "#B8A5F0", 3, 2.6 * speed, particleCount)
        : "";

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
              <span class="sun-status">
                SUN · ${Math.round(sun.elevation)}° ·
                AZ ${Math.round(sun.azimuth)}°
              </span>
            </div>
          </div>

          <div class="scene">
            <svg
              viewBox="0 0 700 420"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="Energy flow scene"
            >
              <defs>
                <linearGradient id="sky4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#7BB6E8" />
                  <stop offset="60%" stop-color="#C8DDF0" />
                  <stop offset="100%" stop-color="#F4E4D0" />
                </linearGradient>
                <linearGradient id="ground4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#9BAE7A" />
                  <stop offset="100%" stop-color="#5F6E48" />
                </linearGradient>
                <radialGradient id="sunCorona4" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFF5C8" stop-opacity="1" />
                  <stop offset="35%" stop-color="#FFD96B" stop-opacity="0.85" />
                  <stop offset="70%" stop-color="#FF9A2E" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#FF7A1F" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="sunCore4" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#FFFBE6" />
                  <stop offset="60%" stop-color="#FFD562" />
                  <stop offset="100%" stop-color="#F59B1F" />
                </radialGradient>
                <linearGradient id="invBody4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#3A3D42" />
                  <stop offset="50%" stop-color="#5A5E64" />
                  <stop offset="100%" stop-color="#2A2C30" />
                </linearGradient>
                <linearGradient id="invScreen4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#0A2540" />
                  <stop offset="100%" stop-color="#163E66" />
                </linearGradient>
                <linearGradient id="batBody4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#E8ECEF" />
                  <stop offset="50%" stop-color="#FAFBFC" />
                  <stop offset="100%" stop-color="#C9D0D6" />
                </linearGradient>
                <linearGradient id="batCharge4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#34D08C" />
                  <stop offset="100%" stop-color="#0E8C5A" />
                </linearGradient>
                <linearGradient id="houseRoof4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#8A4A3C" />
                  <stop offset="100%" stop-color="#5C2E26" />
                </linearGradient>
                <linearGradient id="houseWall4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#F5EAD7" />
                  <stop offset="100%" stop-color="#D8C5A8" />
                </linearGradient>
                <linearGradient id="pylonMetal4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#9AA3AB" />
                  <stop offset="100%" stop-color="#5F676E" />
                </linearGradient>
                <g id="sunRays4">
                  <g
                    stroke="#FFD562"
                    stroke-width="2"
                    stroke-linecap="round"
                    opacity="0.7"
                  >
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
              </defs>

              <!-- Sky -->
              <rect x="0" y="0" width="700" height="280" fill="url(#sky4)" />
              <ellipse cx="120" cy="55" rx="70" ry="9" fill="#FFFFFF" opacity="0.3" />
              <ellipse cx="540" cy="40" rx="60" ry="8" fill="#FFFFFF" opacity="0.28" />

              ${cfg.show_sun_arc
                ? html`
                    <path
                      d="M 60 240 Q 350 -30 640 240"
                      fill="none"
                      stroke="#FFFFFF"
                      stroke-width="1"
                      stroke-opacity="0.45"
                      stroke-dasharray="2 5"
                    />
                    <circle cx="60" cy="240" r="3" fill="#FFB347" opacity="0.6" />
                    <circle cx="640" cy="240" r="3" fill="#FF6B3D" opacity="0.6" />
                    <text
                      x="60"
                      y="258"
                      text-anchor="middle"
                      font-size="9"
                      fill="#5F676E"
                      font-weight="500"
                    >
                      SUNRISE
                    </text>
                    <text
                      x="640"
                      y="258"
                      text-anchor="middle"
                      font-size="9"
                      fill="#5F676E"
                      font-weight="500"
                    >
                      SUNSET
                    </text>
                  `
                : ""}

              <!-- Sun (position-tracked) -->
              ${sun.visible
                ? html`
                    <g transform="translate(${sun.x}, ${sun.y})">
                      <circle r="58" fill="url(#sunCorona4)">
                        <animate
                          attributeName="r"
                          values="54;62;54"
                          dur="4s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.7;0.95;0.7"
                          dur="4s"
                          repeatCount="indefinite"
                        />
                      </circle>
                      <circle r="38" fill="url(#sunCorona4)" opacity="0.7" />
                      <g>
                        <use href="#sunRays4" />
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from="0"
                          to="360"
                          dur="60s"
                          repeatCount="indefinite"
                        />
                      </g>
                      <g opacity="0.5">
                        <use href="#sunRays4" />
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from="22.5"
                          to="-337.5"
                          dur="90s"
                          repeatCount="indefinite"
                        />
                      </g>
                      <circle r="20" fill="url(#sunCore4)" />
                    </g>
                  `
                : html`
                    <text
                      x="350"
                      y="100"
                      text-anchor="middle"
                      font-size="11"
                      fill="#5F676E"
                      letter-spacing="0.06em"
                    >
                      SUN BELOW HORIZON
                    </text>
                  `}

              <!-- Photons sun → panel (only when sun up & solar producing) -->
              ${sun.visible && solarKW > 0.05 ? photonParticles : ""}

              <!-- Ground -->
              <rect x="0" y="280" width="700" height="140" fill="url(#ground4)" />

              <!-- Solar panel -->
              <g transform="translate(110, 290)">
                <rect x="-26" y="22" width="3" height="32" fill="#3A3D42" />
                <rect x="23" y="22" width="3" height="32" fill="#3A3D42" />
                <g transform="skewY(-14)">
                  <rect
                    x="-50"
                    y="-8"
                    width="100"
                    height="42"
                    fill="#0F2A4A"
                    stroke="#0A1A30"
                    stroke-width="1"
                  />
                  <g stroke="#1A4A8A" stroke-width="0.6" opacity="0.7">
                    <line x1="-50" y1="6" x2="50" y2="6" />
                    <line x1="-50" y1="20" x2="50" y2="20" />
                    <line x1="-25" y1="-8" x2="-25" y2="34" />
                    <line x1="0" y1="-8" x2="0" y2="34" />
                    <line x1="25" y1="-8" x2="25" y2="34" />
                  </g>
                  <rect
                    x="-50"
                    y="-8"
                    width="22"
                    height="42"
                    fill="#5A9CD8"
                    opacity="0.22"
                  />
                </g>
                <text
                  x="0"
                  y="76"
                  text-anchor="middle"
                  font-size="10"
                  fill="#2C2C2A"
                  font-weight="500"
                >
                  SOLAR · ${this._formatPower(solarKW * 1000)}
                </text>
              </g>

              <!-- Grid pylon -->
              <g transform="translate(290, 270)">
                <path
                  d="M -16 80 L 16 80 L 10 4 L -10 4 Z"
                  fill="url(#pylonMetal4)"
                  stroke="#3A3D42"
                  stroke-width="0.8"
                />
                <rect x="-26" y="8" width="52" height="3" fill="#5F676E" />
                <rect x="-22" y="24" width="44" height="3" fill="#5F676E" />
                <rect x="-18" y="40" width="36" height="3" fill="#5F676E" />
                <circle cx="-26" cy="8" r="2" fill="#2A2C30" />
                <circle cx="26" cy="8" r="2" fill="#2A2C30" />
                <circle cx="-22" cy="24" r="2" fill="#2A2C30" />
                <circle cx="22" cy="24" r="2" fill="#2A2C30" />
                <circle cx="-18" cy="40" r="2" fill="#2A2C30" />
                <circle cx="18" cy="40" r="2" fill="#2A2C30" />
                <path
                  d="M -14 80 L 8 4 M 14 80 L -8 4 M -12 60 L 9 4 M 12 60 L -9 4"
                  stroke="#5F676E"
                  stroke-width="0.6"
                  fill="none"
                  opacity="0.7"
                />
                <path d="M -2 4 L 0 -6 L 2 4 Z" fill="#3A3D42" />
                <text
                  x="0"
                  y="98"
                  text-anchor="middle"
                  font-size="10"
                  fill="#2C2C2A"
                  font-weight="500"
                >
                  GRID · ${this._formatPower(Math.abs(gridKW) * 1000)}
                  ${gridOut > 0.05 ? "↑" : gridIn > 0.05 ? "↓" : ""}
                </text>
              </g>

              <!-- Inverter -->
              <g transform="translate(450, 320)">
                <rect x="-46" y="-46" width="92" height="92" rx="3" fill="#1F2125" />
                <rect
                  x="-44"
                  y="-44"
                  width="88"
                  height="88"
                  rx="4"
                  fill="url(#invBody4)"
                />
                <g stroke="#1A1C20" stroke-width="0.6" opacity="0.85">
                  <line x1="-32" y1="-36" x2="32" y2="-36" />
                  <line x1="-32" y1="-32" x2="32" y2="-32" />
                  <line x1="-32" y1="-28" x2="32" y2="-28" />
                </g>
                <rect x="-30" y="-22" width="60" height="2" fill="#7A8088" opacity="0.5" />
                <rect
                  x="-32"
                  y="-16"
                  width="64"
                  height="24"
                  rx="2"
                  fill="url(#invScreen4)"
                  stroke="#0A1820"
                  stroke-width="0.5"
                />
                <text
                  x="0"
                  y="-5"
                  text-anchor="middle"
                  font-size="7"
                  fill="#5DD0FF"
                  font-family="monospace"
                  letter-spacing="0.1em"
                >
                  DC → AC
                </text>
                <text
                  x="0"
                  y="5"
                  text-anchor="middle"
                  font-size="9"
                  fill="#7DFAB8"
                  font-family="monospace"
                  font-weight="500"
                >
                  ${this._formatPower((solarKW + gridIn) * 1000)}
                  <animate
                    attributeName="opacity"
                    values="1;0.7;1"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </text>
                <circle cx="-22" cy="22" r="2.2" fill="#34D08C">
                  <animate
                    attributeName="opacity"
                    values="1;0.4;1"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx="-12" cy="22" r="2.2" fill="#34D08C" opacity="0.85" />
                <circle cx="-2" cy="22" r="2.2" fill="#FFB347" opacity="0.6" />
                <text
                  x="20"
                  y="25"
                  font-size="6"
                  fill="#9AA3AB"
                  font-family="monospace"
                >
                  ${efficiency.toFixed(1)}% η
                </text>
                <g stroke="#1A1C20" stroke-width="0.6" opacity="0.85">
                  <line x1="-32" y1="34" x2="32" y2="34" />
                  <line x1="-32" y1="38" x2="32" y2="38" />
                </g>
                <rect x="-44" y="-44" width="2" height="88" fill="#7A8088" opacity="0.3" />
                <text
                  x="0"
                  y="62"
                  text-anchor="middle"
                  font-size="10"
                  fill="#2C2C2A"
                  font-weight="500"
                >
                  INVERTER
                </text>
              </g>

              <!-- Battery -->
              <g transform="translate(610, 318)">
                <ellipse cx="0" cy="46" rx="34" ry="3" fill="#000" opacity="0.15" />
                <rect
                  x="-30"
                  y="-44"
                  width="60"
                  height="86"
                  rx="6"
                  fill="url(#batBody4)"
                  stroke="#9AA3AB"
                  stroke-width="0.8"
                />
                <rect x="-28" y="-42" width="56" height="6" rx="2" fill="#5F676E" opacity="0.85" />
                <rect x="-12" y="-32" width="24" height="5" rx="1" fill="#2C2C2A" opacity="0.7" />
                <clipPath id="batClip4">
                  <rect x="-24" y="-22" width="48" height="56" rx="3" />
                </clipPath>
                <rect
                  x="-24"
                  y="-22"
                  width="48"
                  height="56"
                  rx="3"
                  fill="#E8ECEF"
                  stroke="#9AA3AB"
                  stroke-width="0.5"
                />
                <g clip-path="url(#batClip4)">
                  <rect
                    x="-24"
                    y="${34 - (batterySoC / 100) * 56}"
                    width="48"
                    height="${(batterySoC / 100) * 56}"
                    fill="url(#batCharge4)"
                  />
                  ${batCharging
                    ? html`
                        <circle cx="-12" cy="20" r="1.5" fill="#FFFFFF" opacity="0.6">
                          <animate
                            attributeName="cy"
                            values="32;-8"
                            dur="3s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0;0.7;0"
                            dur="3s"
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle cx="6" cy="20" r="1.2" fill="#FFFFFF" opacity="0.5">
                          <animate
                            attributeName="cy"
                            values="32;-8"
                            dur="3.5s"
                            begin="0.7s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0;0.6;0"
                            dur="3.5s"
                            begin="0.7s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      `
                    : ""}
                </g>
                <text x="0" y="6" text-anchor="middle" font-size="13" fill="#FFFFFF" font-weight="500">
                  ${batterySoC}%
                </text>
                <rect x="-24" y="40" width="6" height="4" fill="#5F676E" />
                <rect x="18" y="40" width="6" height="4" fill="#5F676E" />
                <text x="0" y="60" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">
                  BATTERY ·
                  ${batCharging ? "+" : "-"}${this._formatPower(Math.abs(batteryKW) * 1000)}
                </text>
              </g>

              <!-- House -->
              <g transform="translate(610, 380)">
                <ellipse cx="0" cy="20" rx="42" ry="3" fill="#000" opacity="0.18" />
                <rect x="-32" y="-12" width="64" height="28" fill="url(#houseWall4)" stroke="#A89674" stroke-width="0.5" />
                <path d="M -38 -12 L 0 -38 L 38 -12 Z" fill="url(#houseRoof4)" stroke="#3A1E18" stroke-width="0.6" />
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
                <text x="0" y="32" text-anchor="middle" font-size="10" fill="#2C2C2A" font-weight="500">
                  HOME · ${this._formatPower(homeKW * 1000)}
                </text>
              </g>

              <!-- Flow paths -->
              <path id="p4-solar-inv" d="M 140 320 Q 280 340 404 320" fill="none" stroke="#FFB347" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />
              <path id="p4-grid-inv" d="M 318 305 Q 380 305 404 315" fill="none" stroke="#5DBFEB" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />
              <path id="p4-inv-bat" d="M 496 305 Q 555 305 580 315" fill="none" stroke="#34D08C" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />
              <path id="p4-inv-home" d="M 496 330 Q 555 360 580 380" fill="none" stroke="#B8A5F0" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="2 4" />

              ${solarParticles} ${gridInParticles} ${gridOutParticles}
              ${batParticles} ${homeParticles}
            </svg>
          </div>

          <div class="totals">
            <p class="totals-label">Cumulative totals</p>

            ${this._totalsRow(
              "Solar",
              "#EF9F27",
              "#FAEEDA",
              "#854F0B",
              "#633806",
              solarToday,
              solarMonth,
              solarYear
            )}
            ${this._totalsRow(
              "Grid in",
              "#378ADD",
              "#E6F1FB",
              "#0C447C",
              "#042C53",
              gridInToday,
              gridInMonth,
              gridInYear
            )}
            ${this._totalsRow(
              "Grid out",
              "#97C459",
              "#EAF3DE",
              "#3B6D11",
              "#173404",
              gridOutToday,
              gridOutMonth,
              gridOutYear
            )}
            ${this._totalsRow(
              "Home",
              "#7F77DD",
              "#EEEDFE",
              "#3C3489",
              "#26215C",
              homeToday,
              homeMonth,
              homeYear
            )}
          </div>
        </div>
      </ha-card>
    `;
  }

  // ---------- render helpers ----------
  _photons(speed) {
    const out = [];
    const dur = 1.6 * speed;
    for (let i = 0; i < 4; i++) {
      out.push(html`
        <circle r="2" fill="#FFEB8A">
          <animateMotion
            dur="${dur}s"
            begin="${(dur / 4) * i}s"
            repeatCount="indefinite"
          >
            <mpath href="#p-sun-panel-static" />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.1;0.85;1"
            dur="${dur}s"
            begin="${(dur / 4) * i}s"
            repeatCount="indefinite"
          />
        </circle>
      `);
    }
    // The path itself
    return html`
      <path
        id="p-sun-panel-static"
        d="M 180 80 Q 145 180 110 250"
        fill="none"
        stroke="#FFD562"
        stroke-width="1"
        stroke-opacity="0.4"
        stroke-dasharray="2 3"
      />
      ${out}
    `;
  }

  _particles(pathId, color, radius, dur, count, reverse = false) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const begin = (dur / count) * i;
      items.push(html`
        <circle r="${radius}" fill="${color}">
          <animateMotion
            dur="${dur}s"
            begin="${begin}s"
            repeatCount="indefinite"
            ${reverse ? 'keyPoints="1;0" keyTimes="0;1"' : ""}
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

  _totalsRow(label, dotColor, bg, labelColor, valueColor, today, month, year) {
    return html`
      <div class="totals-row">
        <div class="totals-label-cell">
          <span class="dot" style="background:${dotColor}"></span>
          <span style="color:${labelColor}">${label}</span>
        </div>
        <div class="cell" style="background:${bg};border-left-color:${dotColor}">
          <span class="cell-label" style="color:${labelColor}">Today</span>
          <span class="cell-value" style="color:${valueColor}"
            >${this._formatEnergy(today)}
            <span class="cell-unit">kWh</span></span
          >
        </div>
        <div class="cell" style="background:${bg};border-left-color:${dotColor}">
          <span class="cell-label" style="color:${labelColor}">This month</span>
          <span class="cell-value" style="color:${valueColor}"
            >${this._formatEnergy(month)}
            <span class="cell-unit">kWh</span></span
          >
        </div>
        <div class="cell" style="background:${bg};border-left-color:${dotColor}">
          <span class="cell-label" style="color:${labelColor}">This year</span>
          <span class="cell-value" style="color:${valueColor}"
            >${this._formatEnergy(year)}
            <span class="cell-unit">kWh</span></span
          >
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      ha-card {
        padding: 0;
        overflow: hidden;
      }
      .card-content {
        padding: 1.5rem;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
      }
      .header-eyebrow {
        font-size: 13px;
        color: var(--secondary-text-color);
        margin: 0 0 4px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .header-title {
        font-size: 22px;
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
      .live-indicator {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .live-text {
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .sun-status {
        font-size: 11px;
        color: var(--disabled-text-color, #9b9b9b);
        letter-spacing: 0.04em;
      }
      .pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #1d9e75;
        box-shadow: 0 0 0 0 rgba(29, 158, 117, 0.7);
        animation: pulse-ring 2s infinite;
      }
      @keyframes pulse-ring {
        0% {
          box-shadow: 0 0 0 0 rgba(29, 158, 117, 0.7);
        }
        70% {
          box-shadow: 0 0 0 8px rgba(29, 158, 117, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(29, 158, 117, 0);
        }
      }
      .scene {
        position: relative;
        height: 420px;
        margin: 0 -0.5rem;
        border-radius: 12px;
        overflow: hidden;
      }
      .scene svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .totals {
        margin-top: 1.5rem;
        padding-top: 1.25rem;
        border-top: 0.5px solid var(--divider-color);
      }
      .totals-label {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin: 0 0 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .totals-row {
        display: grid;
        grid-template-columns: 90px repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 8px;
      }
      .totals-row:last-child {
        margin-bottom: 0;
      }
      .totals-label-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 4px;
        font-size: 13px;
        font-weight: 500;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .cell {
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        border-radius: 8px;
        border-left: 2px solid;
      }
      .cell-label {
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-bottom: 2px;
        opacity: 0.85;
      }
      .cell-value {
        font-size: 15px;
        font-weight: 500;
      }
      .cell-unit {
        font-size: 11px;
        font-weight: 400;
        opacity: 0.7;
      }
    `;
  }
}

customElements.define("energy-flow-card", EnergyFlowCard);

// Register with HA's card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-flow-card",
  name: "Energy Flow Card",
  description:
    "Live cinematic energy flow with sun-tracking, inverter and rolling totals",
  preview: true,
});

console.info(
  "%c ENERGY-FLOW-CARD %c v1.0.0 ",
  "color: white; background: #EF9F27; font-weight: 700;",
  "color: white; background: #1D9E75; font-weight: 700;"
);
