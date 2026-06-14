/**
 * Visual editor for energy-flow-card v2.2.0
 *
 * Totals are now configured with just the daily ("today") sensor per
 * category — the card self-tracks month and year. The month/year pickers
 * still exist as an optional override, tucked into a collapsible section.
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

const DEFAULTS = {
  title: "Energy Flow",
  sun_entity: "sun.sun",
  inverter_label: "Inverter",
  animation_speed: "normal",
  show_totals: true,
  pv_peak_kw: 6,
  pwr_peak_kw: 8,
  // Inverex / Deye / Sunsynk default: battery_power is negative while
  // charging, so invert the sign by default. Users on inverters with
  // the opposite convention can toggle this off.
  invert_battery_sign: true,
};

let _pickerLoaded = false;
async function ensureEntityPicker() {
  if (_pickerLoaded) return;
  if (customElements.get("ha-entity-picker")) {
    _pickerLoaded = true;
    return;
  }
  try {
    const helpers = await window.loadCardHelpers?.();
    if (helpers) {
      const card = await helpers.createCardElement({ type: "entities", entities: [] });
      card.hass = undefined;
    }
  } catch (e) { /* ignore */ }
  for (let i = 0; i < 20 && !customElements.get("ha-entity-picker"); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  _pickerLoaded = !!customElements.get("ha-entity-picker");
}

class EnergyFlowCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _ready: { state: true },
    };
  }

  constructor() {
    super();
    this._ready = false;
    // Bind delegated handlers so `this` survives being passed by reference
    // into lit-html templates (lit-element 2.4 doesn't auto-bind).
    this._onBrandGridClick = this._onBrandGridClick.bind(this);
  }

  async connectedCallback() {
    super.connectedCallback();
    await ensureEntityPicker();
    this._ready = true;
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...(config || {}) };
  }

  _emit(newConfig) {
    this._config = newConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: newConfig },
        bubbles: true,
        composed: true,
      })
    );
  }

  _updateField(field, value) {
    if (!this._config) return;
    if (this._config[field] === value) return;

    const newConfig = { ...this._config };
    if (value === "" || value === null || value === undefined) {
      delete newConfig[field];
    } else {
      newConfig[field] = value;
    }
    this._emit(newConfig);
  }

  _entityChanged(field, ev) {
    ev.stopPropagation();
    this._updateField(field, ev.detail.value);
  }

  _textChanged(field, ev) {
    this._updateField(field, ev.target.value);
  }

  _numberChanged(field, ev) {
    const v = parseFloat(ev.target.value);
    this._updateField(field, isFinite(v) ? v : undefined);
  }

  _selectChanged(field, ev) {
    ev.stopPropagation();
    const v = ev.target.value;
    if (v === undefined || v === "") return;

    // Special-case: when the user changes the inverter preset, drop any
    // existing explicit sign-convention overrides so the new preset's
    // defaults take effect immediately. (Otherwise picking "Sunsynk"
    // wouldn't change anything if the user had previously toggled
    // invert_battery_sign manually.) Same for inverter_label if it
    // was unset or matched the old preset.
    if (field === "inverter_preset") {
      this._setPreset(v);
      return;
    }

    this._updateField(field, v);
  }

  /** Apply a new inverter_preset by key. Clears sign-convention
   *  overrides so the new preset's defaults kick in, and drops the
   *  label/image if they still match the *previous* preset (i.e. the
   *  user never customised them). Used by both the visual tile picker
   *  and the legacy select fallback. */
  _setPreset(key) {
    if (!key) return;
    // Normalise: an unset inverter_preset is treated as "default".
    const current = this._config.inverter_preset || "default";
    if (current === key) return;

    const newConfig = { ...this._config, inverter_preset: key };
    delete newConfig.invert_battery_sign;
    delete newConfig.invert_grid_sign;
    const presets = (typeof window !== "undefined" && window._efcInverterPresets) || {};
    const oldPreset = presets[current]?.config || {};
    if (oldPreset.inverter_label &&
        this._config.inverter_label === oldPreset.inverter_label) {
      delete newConfig.inverter_label;
    }
    if (oldPreset.inverter_image &&
        this._config.inverter_image === oldPreset.inverter_image) {
      delete newConfig.inverter_image;
    }
    this._emit(newConfig);
  }

  /** Delegated click handler for the brand-tile grid. Walks up from the
   *  click target until it finds an element with data-preset-key, so
   *  taps anywhere inside a tile (image, label, thumb wrapper) still
   *  select the correct preset. */
  _onBrandGridClick(ev) {
    let el = ev.target;
    while (el && el !== ev.currentTarget) {
      const key = el.getAttribute && el.getAttribute("data-preset-key");
      if (key) {
        ev.stopPropagation();
        this._setPreset(key);
        return;
      }
      el = el.parentNode;
    }
  }

  _toggleChanged(field, ev) {
    this._updateField(field, ev.target.checked);
  }

  _renderEntityPicker(field, label, includeDomains) {
    return html`
      <ha-entity-picker
        .hass=${this.hass}
        .value=${this._config[field] || ""}
        .label=${label}
        .includeDomains=${includeDomains}
        allow-custom-entity
        @value-changed=${(ev) => this._entityChanged(field, ev)}
      ></ha-entity-picker>
    `;
  }

  _renderTextInput(field, label, placeholder = "") {
    return html`
      <ha-textfield
        .label=${label}
        .value=${this._config[field] || ""}
        .placeholder=${placeholder}
        @input=${(ev) => this._textChanged(field, ev)}
      ></ha-textfield>
    `;
  }

  _renderNumberInput(field, label, placeholder = "") {
    return html`
      <ha-textfield
        type="number"
        .label=${label}
        .value=${this._config[field] != null ? String(this._config[field]) : ""}
        .placeholder=${placeholder}
        @input=${(ev) => this._numberChanged(field, ev)}
      ></ha-textfield>
    `;
  }

  _renderSelect(field, label, options) {
    const value = this._config[field] || options[0].value;
    // ha-select wraps mwc-select. The `selected` event fires on
    // highlight change (including keyboard hover) and `ev.target.value`
    // isn't reliable at fire time. The correct hook is either:
    //   * `closed`        — fired after the user picks an item AND the
    //                       menu closes; ev.target.value is correct.
    //   * `selected` with ev.detail.index — index into the option list.
    //
    // We use `closed` because it's the canonical "user committed a
    // choice" event in Material Web Components, then read the live
    // .value off the element itself.
    return html`
      <ha-select
        .label=${label}
        .value=${value}
        @closed=${(ev) => {
          ev.stopPropagation();
          // After menu closes, ev.target.value holds the chosen value.
          const v = ev.target && ev.target.value;
          if (v != null && v !== "") {
            if (field === "inverter_preset") {
              this._setPreset(v);
            } else {
              this._updateField(field, v);
            }
          }
        }}
        fixedMenuPosition
        naturalMenuWidth
      >
        ${options.map(
          (opt) =>
            html`<mwc-list-item .value=${opt.value}>${opt.label}</mwc-list-item>`
        )}
      </ha-select>
    `;
  }

  _renderToggle(field, label, defaultOn = true) {
    const raw = this._config[field];
    const value = raw === undefined ? defaultOn : !!raw;
    return html`
      <div class="toggle-row">
        <span class="toggle-label">${label}</span>
        <ha-switch
          .checked=${value}
          @change=${(ev) => this._toggleChanged(field, ev)}
        ></ha-switch>
      </div>
    `;
  }

  /** Toggle whose default tracks the active inverter preset. Shows a
   *  small hint when the preset's value would differ from the toggle
   *  state, so users can see whether the preset is supplying the
   *  current behaviour or they've overridden it. */
  _renderPresetAwareToggle(field, label, presetDefault) {
    const raw = this._config[field];
    const overridden = raw !== undefined;
    const value = overridden ? !!raw : presetDefault;
    const presetHint = `(preset: ${presetDefault ? "on" : "off"})`;
    return html`
      <div class="toggle-row">
        <span class="toggle-label">
          ${label}
          <span class="preset-hint">${presetHint}</span>
        </span>
        <ha-switch
          .checked=${value}
          @change=${(ev) => this._toggleChanged(field, ev)}
        ></ha-switch>
      </div>
    `;
  }

  render() {
    if (!this._config) return html``;
    if (!this._ready) {
      return html`<div class="loading">Loading editor…</div>`;
    }

    const sensorDomains = ["sensor"];
    const sunDomains = ["sun"];
    const weatherDomains = ["weather"];

    // Pull the preset list registered by the card module. Fall back to
    // a minimal hard-coded set if the card script hasn't loaded yet
    // (this can happen when the editor opens before the card itself).
    const presets = (typeof window !== "undefined" && window._efcInverterPresets) || {
      default:  { label: "Default (no preset)" },
      sunsynk:  { label: "Sunsynk" },
      deye:     { label: "Deye" },
      inverex:  { label: "Inverex" },
    };

    // Resolve sibling /icons/ folder the same way the card itself does,
    // so thumbnails work no matter where HACS dropped the files.
    const cardBase =
      (typeof window !== "undefined" && window._efcCardBaseUrl) ||
      "/hacsfiles/lovelace-energy-flow-card/";

    // Curate display order: Default first, then the most common families
    // we ship brand artwork for, then any extras.
    const ORDER = [
      "default",
      "sunsynk", "deye", "inverex",
      "goodwe_hybrid", "growatt", "victron",
      "solis_hybrid", "solaredge", "fronius_gen24",
    ];
    const presetKeys = Object.keys(presets);
    const orderedKeys = [
      ...ORDER.filter((k) => presetKeys.includes(k)),
      ...presetKeys.filter((k) => !ORDER.includes(k)),
    ];

    const currentPreset = this._config.inverter_preset || "default";
    const presetCfg = (presets[currentPreset] && presets[currentPreset].config) || {};

    const resolveIcon = (rel) => {
      if (!rel) return null;
      // Allow absolute URLs (https://, /local/...) to pass through.
      if (/^(https?:)?\/\//.test(rel) || rel.startsWith("/")) return rel;
      return cardBase + rel;
    };

    return html`
      <div class="card-config">

        <div class="section">
          <h3>Inverter preset</h3>
          <p class="hint">
            Pick your inverter family to auto-configure sign conventions
            and label. Choose <strong>Default</strong> for no overrides.
            Anything you set manually below still wins over the preset.
          </p>
          <div
            class="brand-grid"
            role="radiogroup"
            aria-label="Inverter preset"
            @click=${this._onBrandGridClick}
          >
            ${orderedKeys.map((key) => {
              const p = presets[key] || {};
              const iconUrl = resolveIcon(p.icon);
              const isSelected = key === currentPreset;
              const isDefault = key === "default";
              const shortLabel = (p.config && p.config.inverter_label) ||
                (isDefault ? "None" : (p.label || key).split(" ")[0]);
              const fullLabel = p.label || key;
              return html`
                <div
                  class="brand-tile ${isSelected ? "selected" : ""} ${isDefault ? "is-default" : ""}"
                  role="radio"
                  tabindex="0"
                  aria-checked=${isSelected}
                  title=${fullLabel}
                  data-preset-key=${key}
                >
                  <div class="brand-thumb" data-preset-key=${key}>
                    ${iconUrl
                      ? html`<img src=${iconUrl} alt=${fullLabel} loading="lazy" data-preset-key=${key} />`
                      : html`<div class="brand-placeholder" data-preset-key=${key}>
                          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                            <path fill="currentColor" d="M12 2 1 9l4 1.5V17l7 4 7-4v-6.5l2-.7V17h2V9zM12 4.3 18.5 9 12 13.7 5.5 9zM7 11.5l5 3.2 5-3.2V15l-5 2.9L7 15z"/>
                          </svg>
                        </div>`}
                    ${isSelected ? html`<span class="check-badge" aria-hidden="true">✓</span>` : null}
                  </div>
                  <div class="brand-label" data-preset-key=${key}>${shortLabel}</div>
                </div>
              `;
            })}
          </div>
          <p class="hint preset-meta">
            <strong>Selected:</strong>
            ${(presets[currentPreset] && presets[currentPreset].label) || "Default"}
          </p>
        </div>

        <div class="section">
          <h3>Card</h3>
          ${this._renderTextInput("title", "Title", "Energy Flow")}
          ${this._renderTextInput("inverter_label", "Inverter label",
            presetCfg.inverter_label || "Inverter")}
          ${this._renderTextInput(
            "inverter_image",
            "Inverter image URL (optional)",
            presetCfg.inverter_image || "(text tile)"
          )}
          <p class="hint">
            Leave blank to use the preset's image. Each branded preset
            (Sunsynk, Deye, Inverex, GoodWe, Growatt, Victron) ships with
            its own bundled photo. For anything else, paste a URL — e.g.
            <code>/local/my-inverter.png</code> — or leave blank for the
            orange text tile.
          </p>
        </div>

        <div class="section">
          <h3>Live power sensors</h3>
          <p class="hint">Sensors that report current power (W or kW). All optional except solar / grid / battery / home.</p>
          ${this._renderEntityPicker("solar_power", "Total solar power", sensorDomains)}
          ${this._renderEntityPicker("pv1_power", "PV1 power (optional)", sensorDomains)}
          ${this._renderEntityPicker("pv2_power", "PV2 power (optional)", sensorDomains)}
          ${this._renderEntityPicker("grid_power", "Grid power (+ import / − export)", sensorDomains)}
          ${this._renderEntityPicker("battery_power", "Battery power (+ charge / − discharge)", sensorDomains)}
          ${this._renderEntityPicker("battery_soc", "Battery state-of-charge (%)", sensorDomains)}
          ${this._renderEntityPicker("home_power", "Home consumption", sensorDomains)}
        </div>

        <div class="section">
          <h3>Sign conventions</h3>
          <p class="hint">
            The selected inverter preset already sets these for you. Only
            change them if your dashed flow lines are still animating the
            wrong way. Default values from the preset are shown when no
            explicit override is set.
          </p>
          ${this._renderPresetAwareToggle(
            "invert_battery_sign",
            "Invert battery sign (negative = charging)",
            !!presetCfg.invert_battery_sign
          )}
          ${this._renderPresetAwareToggle(
            "invert_grid_sign",
            "Invert grid sign (negative = importing)",
            !!presetCfg.invert_grid_sign
          )}
        </div>

        <div class="section">
          <h3>Battery telemetry (optional)</h3>
          ${this._renderEntityPicker("battery_voltage", "Battery voltage (V)", sensorDomains)}
          ${this._renderEntityPicker("battery_current", "Battery current (A)", sensorDomains)}
          ${this._renderEntityPicker("battery_temp_a", "Battery temp A (°C)", sensorDomains)}
          ${this._renderEntityPicker("battery_temp_b", "Battery temp B (°C)", sensorDomains)}
          ${this._renderEntityPicker("bms_temp", "BMS temp (°C)", sensorDomains)}
          ${this._renderEntityPicker("min_cell_voltage", "Min cell voltage (V)", sensorDomains)}
          ${this._renderEntityPicker("max_cell_voltage", "Max cell voltage (V)", sensorDomains)}
          ${this._renderEntityPicker("endurance_eta", "Endurance / ETA", sensorDomains)}
          ${this._renderEntityPicker("battery_remaining_ah", "Battery remaining (Ah)", sensorDomains)}
        </div>

        <div class="section">
          <h3>Inverter telemetry (optional)</h3>
          ${this._renderEntityPicker("inverter_temp", "Inverter temp (°C)", sensorDomains)}
          ${this._renderEntityPicker("inverter_load_power", "Inverter load (W or kW)", sensorDomains)}
          ${this._renderEntityPicker("inverter_load_pct", "Inverter load (%) — fallback only", sensorDomains)}
          <p class="hint">
            If you set both, the card prefers the W/kW reading. The
            percent sensor is only used when no W/kW sensor is wired up.
          </p>
        </div>

        <div class="section">
          <h3>EV charger (optional)</h3>
          <p class="hint">Leave blank to hide the EV/car node entirely.</p>
          ${this._renderEntityPicker("ev_power", "EV charging power", sensorDomains)}
          ${this._renderEntityPicker("ev_current", "EV charging current (A)", sensorDomains)}
        </div>

        <div class="section">
          <h3>Sun &amp; sky</h3>
          <p class="hint">Sun position is computed from your real sunrise/sunset times.</p>
          ${this._renderEntityPicker("sun_entity", "Sun entity", sunDomains)}
          <p class="hint">
            Optional: pick a <strong>weather</strong> entity to make the sky
            live — drifting clouds by day, rain when it's raining, a moon and
            stars at night.
          </p>
          ${this._renderEntityPicker("weather_entity", "Weather entity (optional)", weatherDomains)}
        </div>

        <div class="section">
          <h3>Energy totals (kWh)</h3>
          <p class="hint">
            Pick just the <strong>daily ("today")</strong> sensor for each
            category. The card tracks <strong>this&nbsp;month</strong> and
            <strong>this&nbsp;year</strong> from it automatically — you don't
            need to create or pick any month/year sensors.
          </p>
          ${this._renderEntityPicker("solar_daily", "Solar today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("grid_import_daily", "Grid imported today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("grid_export_daily", "Grid exported today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("home_daily", "Home consumption today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("battery_charge_daily", "Battery charged today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("battery_discharged_daily", "Battery discharged today (kWh)", sensorDomains)}

          <details class="advanced">
            <summary>Optional: month / year override</summary>
            <p class="hint">
              Most people can ignore this. Only fill these in if you already
              have Home Assistant monthly/yearly utility_meter sensors and
              want the numbers to match exactly across every device, even
              when no dashboard is open. Anything you leave blank keeps using
              the card's own tracking.
            </p>
            ${this._renderEntityPicker("solar_monthly", "Solar this month (kWh)", sensorDomains)}
            ${this._renderEntityPicker("solar_yearly", "Solar this year (kWh)", sensorDomains)}
            ${this._renderEntityPicker("grid_import_monthly", "Grid imported this month (kWh)", sensorDomains)}
            ${this._renderEntityPicker("grid_import_yearly", "Grid imported this year (kWh)", sensorDomains)}
            ${this._renderEntityPicker("grid_export_monthly", "Grid exported this month (kWh)", sensorDomains)}
            ${this._renderEntityPicker("grid_export_yearly", "Grid exported this year (kWh)", sensorDomains)}
            ${this._renderEntityPicker("home_monthly", "Home consumption this month (kWh)", sensorDomains)}
            ${this._renderEntityPicker("home_yearly", "Home consumption this year (kWh)", sensorDomains)}
          </details>
        </div>

        <div class="section">
          <h3>Scaling</h3>
          ${this._renderNumberInput("pv_peak_kw", "PV peak (kW) — for bar scaling", "6")}
          ${this._renderNumberInput("pwr_peak_kw", "Home power peak (kW) — for bar scaling", "8")}
        </div>

        <div class="section">
          <h3>Display options</h3>
          ${this._renderToggle("show_totals", "Show today/month/year totals table", true)}
          ${this._renderSelect("animation_speed", "Animation speed", [
            { value: "slow", label: "Slow" },
            { value: "normal", label: "Normal" },
            { value: "fast", label: "Fast" },
          ])}
        </div>

      </div>
    `;
  }

  static get styles() {
    return css`
      .card-config {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .loading {
        padding: 20px;
        color: var(--secondary-text-color);
        text-align: center;
      }
      .section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--divider-color);
      }
      .section:last-child { border-bottom: none; }
      .section h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .hint {
        margin: 0;
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .hint strong { color: var(--primary-text-color); }
      .advanced {
        margin-top: 6px;
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.1));
        padding-top: 8px;
      }
      .advanced > summary {
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: var(--secondary-text-color);
        list-style: revert;
        padding: 4px 0;
      }
      .advanced[open] > summary { color: var(--primary-text-color); }
      ha-entity-picker, ha-textfield, ha-select {
        display: block;
        width: 100%;
      }
      .toggle-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0;
      }
      .toggle-label {
        font-size: 14px;
        color: var(--primary-text-color);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .preset-hint {
        font-size: 11px;
        color: var(--secondary-text-color);
        font-style: italic;
      }

      /* ---- Brand-tile inverter picker --------------------------- */
      .brand-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
        gap: 10px;
        margin-top: 4px;
      }
      .brand-tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 10px 8px;
        background: var(--card-background-color,
                    var(--ha-card-background, #1c1c1c));
        border: 2px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius: 10px;
        color: var(--primary-text-color);
        font: inherit;
        cursor: pointer;
        user-select: none;
        transition: border-color 0.15s ease,
                    transform 0.15s ease,
                    box-shadow 0.15s ease,
                    background-color 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .brand-tile:hover {
        border-color: var(--primary-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      }
      .brand-tile:focus-visible {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px var(--primary-color);
      }
      .brand-tile.selected {
        border-color: var(--primary-color);
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        box-shadow: 0 0 0 1px var(--primary-color) inset;
      }
      .brand-thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--secondary-background-color, rgba(255,255,255,0.04));
        border-radius: 6px;
        overflow: hidden;
      }
      .brand-thumb img {
        max-width: 80%;
        max-height: 80%;
        object-fit: contain;
        pointer-events: none;
      }
      .brand-placeholder {
        color: var(--secondary-text-color);
        opacity: 0.7;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .brand-tile.is-default .brand-thumb {
        background: repeating-linear-gradient(
          45deg,
          var(--secondary-background-color, rgba(255,255,255,0.04)),
          var(--secondary-background-color, rgba(255,255,255,0.04)) 6px,
          transparent 6px,
          transparent 12px
        );
      }
      .brand-label {
        font-size: 12px;
        font-weight: 500;
        text-align: center;
        line-height: 1.2;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .check-badge {
        position: absolute;
        top: 4px;
        right: 4px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        font-size: 11px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        border-radius: 9px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }
      .preset-meta {
        margin-top: 4px;
      }
    `;
  }
}

customElements.define("energy-flow-card-editor", EnergyFlowCardEditor);
