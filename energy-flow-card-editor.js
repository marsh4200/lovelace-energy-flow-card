/**
 * Visual editor for energy-flow-card v1.0.1
 *
 * Fixes from v1.0.0:
 *  - ha-entity-picker uses native value-changed event (no manual unwrap)
 *  - ha-select event handling fixed (was firing on hover, now only on commit)
 *  - All field updates dispatch a single config-changed event with the
 *    full updated config, never partial
 *  - Defaults injected so toggles render correctly on a brand-new card
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

const DEFAULTS = {
  title: "Home grid",
  sun_entity: "sun.sun",
  show_sun_arc: true,
  animation_speed: "normal",
  particle_density: "medium",
};

class EnergyFlowCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
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

  _renderToggle(field, label) {
    const value = this._config[field] !== false;
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

    const sensorDomains = ["sensor"];
    const sunDomains = ["sun"];

    return html`
      <div class="card-config">
        <div class="section">
          <h3>Card</h3>
          ${this._renderTextInput("title", "Title", "Home grid")}
        </div>

        <div class="section">
          <h3>Live power sensors</h3>
          <p class="hint">Sensors that report current power (W or kW).</p>
          ${this._renderEntityPicker("solar_power", "Solar power (production)", sensorDomains)}
          ${this._renderEntityPicker("grid_power", "Grid power (+ import / − export)", sensorDomains)}
          ${this._renderEntityPicker("battery_power", "Battery power (+ charge / − discharge)", sensorDomains)}
          ${this._renderEntityPicker("battery_soc", "Battery state-of-charge (%)", sensorDomains)}
          ${this._renderEntityPicker("home_power", "Home consumption", sensorDomains)}
          ${this._renderEntityPicker("inverter_efficiency", "Inverter efficiency (optional)", sensorDomains)}
        </div>

        <div class="section">
          <h3>Sun tracking</h3>
          <p class="hint">Positions the sun across the sky based on real elevation and azimuth.</p>
          ${this._renderEntityPicker("sun_entity", "Sun entity", sunDomains)}
          ${this._renderToggle("show_sun_arc", "Show sunrise → sunset arc")}
        </div>

        <div class="section">
          <h3>Solar totals</h3>
          <p class="hint">Use utility_meter helpers (daily / monthly / yearly cycles).</p>
          ${this._renderEntityPicker("solar_daily", "Solar today", sensorDomains)}
          ${this._renderEntityPicker("solar_monthly", "Solar this month", sensorDomains)}
          ${this._renderEntityPicker("solar_yearly", "Solar this year", sensorDomains)}
        </div>

        <div class="section">
          <h3>Grid import totals</h3>
          ${this._renderEntityPicker("grid_import_daily", "Grid in today", sensorDomains)}
          ${this._renderEntityPicker("grid_import_monthly", "Grid in this month", sensorDomains)}
          ${this._renderEntityPicker("grid_import_yearly", "Grid in this year", sensorDomains)}
        </div>

        <div class="section">
          <h3>Grid export totals</h3>
          ${this._renderEntityPicker("grid_export_daily", "Grid out today", sensorDomains)}
          ${this._renderEntityPicker("grid_export_monthly", "Grid out this month", sensorDomains)}
          ${this._renderEntityPicker("grid_export_yearly", "Grid out this year", sensorDomains)}
        </div>

        <div class="section">
          <h3>Home consumption totals</h3>
          ${this._renderEntityPicker("home_daily", "Home today", sensorDomains)}
          ${this._renderEntityPicker("home_monthly", "Home this month", sensorDomains)}
          ${this._renderEntityPicker("home_yearly", "Home this year", sensorDomains)}
        </div>

        <div class="section">
          <h3>Animation</h3>
          ${this._renderSelect("animation_speed", "Speed", [
            { value: "slow", label: "Slow" },
            { value: "normal", label: "Normal" },
            { value: "fast", label: "Fast" },
          ])}
          ${this._renderSelect("particle_density", "Particle density", [
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
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
      .section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--divider-color);
      }
      .section:last-child {
        border-bottom: none;
      }
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
      ha-entity-picker,
      ha-textfield,
      ha-select {
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
