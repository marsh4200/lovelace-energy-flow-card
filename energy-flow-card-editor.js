/**
 * Visual editor for energy-flow-card.
 * Provides entity-pickers, toggles and selects so users never touch YAML.
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class EnergyFlowCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = { ...config };
  }

  _valueChanged(field, ev) {
    if (!this._config) return;
    const target = ev.target;
    let value = target.value;

    // Checkbox / toggle support
    if (target.checked !== undefined && target.tagName === "HA-SWITCH") {
      value = target.checked;
    } else if (target.type === "checkbox") {
      value = target.checked;
    }

    if (this._config[field] === value) return;

    const newConfig = { ...this._config, [field]: value };
    this._config = newConfig;

    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  _entityPicker(field, label, includeDomains = null) {
    const value = this._config[field] || "";
    return html`
      <div class="row">
        <ha-entity-picker
          .hass=${this.hass}
          .value=${value}
          .label=${label}
          .includeDomains=${includeDomains}
          allow-custom-entity
          @value-changed=${(ev) =>
            this._valueChanged(field, {
              target: { value: ev.detail.value },
            })}
        ></ha-entity-picker>
      </div>
    `;
  }

  _textInput(field, label, placeholder = "") {
    return html`
      <div class="row">
        <ha-textfield
          .label=${label}
          .value=${this._config[field] || ""}
          .placeholder=${placeholder}
          @input=${(ev) => this._valueChanged(field, ev)}
        ></ha-textfield>
      </div>
    `;
  }

  _select(field, label, options) {
    const value = this._config[field] || options[0].value;
    return html`
      <div class="row">
        <ha-select
          .label=${label}
          .value=${value}
          @selected=${(ev) =>
            this._valueChanged(field, { target: { value: ev.target.value } })}
          @closed=${(ev) => ev.stopPropagation()}
        >
          ${options.map(
            (opt) =>
              html`<mwc-list-item .value=${opt.value}>${opt.label}</mwc-list-item>`
          )}
        </ha-select>
      </div>
    `;
  }

  _toggle(field, label) {
    const value = this._config[field] !== false;
    return html`
      <div class="row toggle-row">
        <span class="toggle-label">${label}</span>
        <ha-switch
          .checked=${value}
          @change=${(ev) =>
            this._valueChanged(field, {
              target: { tagName: "HA-SWITCH", checked: ev.target.checked },
            })}
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
          ${this._textInput("title", "Title", "Home grid")}
        </div>

        <div class="section">
          <h3>Live power sensors</h3>
          <p class="hint">Pick the sensors that report current power (W or kW).</p>
          ${this._entityPicker("solar_power", "Solar power (production)", sensorDomains)}
          ${this._entityPicker(
            "grid_power",
            "Grid power (+ import / − export)",
            sensorDomains
          )}
          ${this._entityPicker(
            "battery_power",
            "Battery power (+ charge / − discharge)",
            sensorDomains
          )}
          ${this._entityPicker("battery_soc", "Battery state-of-charge (%)", sensorDomains)}
          ${this._entityPicker("home_power", "Home consumption", sensorDomains)}
          ${this._entityPicker(
            "inverter_efficiency",
            "Inverter efficiency (optional)",
            sensorDomains
          )}
        </div>

        <div class="section">
          <h3>Sun tracking</h3>
          <p class="hint">
            Used to position the sun across the sky based on its real elevation
            and azimuth.
          </p>
          ${this._entityPicker("sun_entity", "Sun entity", sunDomains)}
          ${this._toggle("show_sun_arc", "Show sunrise→sunset arc")}
        </div>

        <div class="section">
          <h3>Solar totals</h3>
          <p class="hint">
            Use utility_meter helpers (daily / monthly / yearly cycles).
          </p>
          ${this._entityPicker("solar_daily", "Solar today", sensorDomains)}
          ${this._entityPicker("solar_monthly", "Solar this month", sensorDomains)}
          ${this._entityPicker("solar_yearly", "Solar this year", sensorDomains)}
        </div>

        <div class="section">
          <h3>Grid import totals</h3>
          ${this._entityPicker("grid_import_daily", "Grid in today", sensorDomains)}
          ${this._entityPicker(
            "grid_import_monthly",
            "Grid in this month",
            sensorDomains
          )}
          ${this._entityPicker(
            "grid_import_yearly",
            "Grid in this year",
            sensorDomains
          )}
        </div>

        <div class="section">
          <h3>Grid export totals</h3>
          ${this._entityPicker("grid_export_daily", "Grid out today", sensorDomains)}
          ${this._entityPicker(
            "grid_export_monthly",
            "Grid out this month",
            sensorDomains
          )}
          ${this._entityPicker(
            "grid_export_yearly",
            "Grid out this year",
            sensorDomains
          )}
        </div>

        <div class="section">
          <h3>Home consumption totals</h3>
          ${this._entityPicker("home_daily", "Home today", sensorDomains)}
          ${this._entityPicker("home_monthly", "Home this month", sensorDomains)}
          ${this._entityPicker("home_yearly", "Home this year", sensorDomains)}
        </div>

        <div class="section">
          <h3>Animation</h3>
          ${this._select("animation_speed", "Speed", [
            { value: "slow", label: "Slow" },
            { value: "normal", label: "Normal" },
            { value: "fast", label: "Fast" },
          ])}
          ${this._select("particle_density", "Particle density", [
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
        gap: 8px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--divider-color);
      }
      .section:last-child {
        border-bottom: none;
      }
      .section h3 {
        margin: 4px 0 4px;
        font-size: 14px;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .hint {
        margin: 0 0 4px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .row {
        display: flex;
        flex-direction: column;
      }
      ha-entity-picker,
      ha-textfield,
      ha-select {
        width: 100%;
      }
      .toggle-row {
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
