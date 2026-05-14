/**
 * Visual editor for energy-flow-card v2.0.0
 *
 * Covers the v1 config keys (still supported) plus the new optional
 * keys exposed by v2's expanded layout: PV1/PV2 split, battery
 * telemetry, inverter telemetry, EV charger, cell voltages, BMS temp,
 * endurance ETA, etc.
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
    this._updateField(field, v);
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
    return html`
      <ha-select
        .label=${label}
        .value=${value}
        @selected=${(ev) => this._selectChanged(field, ev)}
        @closed=${(ev) => ev.stopPropagation()}
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

  render() {
    if (!this._config) return html``;
    if (!this._ready) {
      return html`<div class="loading">Loading editor…</div>`;
    }

    const sensorDomains = ["sensor"];
    const sunDomains = ["sun"];

    return html`
      <div class="card-config">

        <div class="section">
          <h3>Card</h3>
          ${this._renderTextInput("title", "Title", "Energy Flow")}
          ${this._renderTextInput("inverter_label", "Inverter label", "Inverter")}
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
          ${this._renderEntityPicker("inverter_load_pct", "Inverter load (%)", sensorDomains)}
        </div>

        <div class="section">
          <h3>EV charger (optional)</h3>
          <p class="hint">Leave blank to hide the EV/car node entirely.</p>
          ${this._renderEntityPicker("ev_power", "EV charging power", sensorDomains)}
          ${this._renderEntityPicker("ev_current", "EV charging current (A)", sensorDomains)}
        </div>

        <div class="section">
          <h3>Sun tracking</h3>
          <p class="hint">Sun position is computed from your real sunrise/sunset times.</p>
          ${this._renderEntityPicker("sun_entity", "Sun entity", sunDomains)}
        </div>

        <div class="section">
          <h3>Daily energy totals (kWh)</h3>
          <p class="hint">
            Pick the <strong>daily</strong> sensor for each category.
            The card auto-tracks monthly and yearly totals from these.
          </p>
          ${this._renderEntityPicker("solar_daily", "Solar today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("grid_import_daily", "Grid imported today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("grid_export_daily", "Grid exported today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("home_daily", "Home consumption today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("battery_charge_daily", "Battery charged today (kWh)", sensorDomains)}
          ${this._renderEntityPicker("battery_discharged_daily", "Battery discharged today (kWh)", sensorDomains)}
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
      }
    `;
  }
}

customElements.define("energy-flow-card-editor", EnergyFlowCardEditor);
