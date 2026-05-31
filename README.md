# Energy Flow Card

A live, cinematic energy monitoring card for Home Assistant Lovelace dashboards.

Shows a real scene — sun arcing across the sky based on `sun.sun`, photons hitting your solar panels, power flowing into the inverter, the inverter distributing to your battery and home, with rolling **today / this month / this year** totals underneath for solar, grid import, grid export and home consumption.

The sky behind the scene is **live**: it tracks the time of day (vivid blue by day, warm at dawn/dusk, a dark sky with a moon and twinkling stars at night) and, if you point it at a Home Assistant `weather.*` entity, it shows drifting clouds, rain when it's raining and snow when it's snowing.

Fully UI-configurable. No YAML editing required to add or change entities.

---

## What you'll need

Six live power sensors and twelve cumulative energy sensors. The live ones you almost certainly already have from your inverter integration. The cumulative ones we'll create with `utility_meter` helpers — see step 2.

| Live (W or kW) | Energy total (kWh) — needs daily/monthly/yearly |
|---|---|
| Solar power | Solar production |
| Grid power (+ import / − export) | Grid import |
| Battery power | Grid export |
| Battery SoC (%) | Home consumption |
| Home consumption | |
| Inverter efficiency (optional) | |

---

## 1. Install the card

### Option A — manual

1. Copy both `energy-flow-card.js` and `energy-flow-card-editor.js` into:
   ```
   /config/www/community/energy-flow-card/
   ```
2. In Home Assistant, go to **Settings → Dashboards → Resources → Add Resource**:
   - URL: `/local/community/energy-flow-card/energy-flow-card.js`
   - Resource type: **JavaScript Module**
3. Hard-refresh your browser (Ctrl+Shift+R).

### Option B — HACS (custom repository)

1. HACS → Frontend → ⋯ → Custom repositories
2. Add the repo URL, category: **Lovelace**
3. Install, then refresh.

---

## 2. Create the rolling totals (utility_meter)

Add this to your `configuration.yaml` (or a package). Replace the `source:` values with your own sensor entity IDs.

```yaml
utility_meter:
  # ---------- Solar ----------
  solar_daily:
    source: sensor.solar_energy_total
    name: Solar today
    cycle: daily
  solar_monthly:
    source: sensor.solar_energy_total
    name: Solar this month
    cycle: monthly
  solar_yearly:
    source: sensor.solar_energy_total
    name: Solar this year
    cycle: yearly

  # ---------- Grid import ----------
  grid_import_daily:
    source: sensor.grid_import_total
    name: Grid in today
    cycle: daily
  grid_import_monthly:
    source: sensor.grid_import_total
    name: Grid in this month
    cycle: monthly
  grid_import_yearly:
    source: sensor.grid_import_total
    name: Grid in this year
    cycle: yearly

  # ---------- Grid export ----------
  grid_export_daily:
    source: sensor.grid_export_total
    name: Grid out today
    cycle: daily
  grid_export_monthly:
    source: sensor.grid_export_total
    name: Grid out this month
    cycle: monthly
  grid_export_yearly:
    source: sensor.grid_export_total
    name: Grid out this year
    cycle: yearly

  # ---------- Home consumption ----------
  home_daily:
    source: sensor.home_energy_total
    name: Home today
    cycle: daily
  home_monthly:
    source: sensor.home_energy_total
    name: Home this month
    cycle: monthly
  home_yearly:
    source: sensor.home_energy_total
    name: Home this year
    cycle: yearly
```

Restart Home Assistant. You'll get twelve new sensors named `sensor.solar_daily`, `sensor.solar_monthly`, etc.

> **Tip:** if your inverter integration only gives you a single `..._energy_total` sensor for everything combined, you may need a couple of `template:` sensors first to split solar production, grid import and grid export apart. Most modern integrations (SolarEdge, Sungrow, Goodwe, Huawei FusionSolar, Solis, Victron, ESPHome) already expose them separately.

---

## 3. Add the card to your dashboard

1. Edit your dashboard → **Add Card** → search for **"Energy Flow Card"**
2. The visual editor opens. Use the entity-picker dropdowns to fill in:
   - Live power sensors (5–6 entities)
   - `sun.sun` (auto-selected)
   - Solar / Grid in / Grid out / Home — daily, monthly and yearly (12 entities)
3. Optional: pick animation speed and particle density.
4. Save.

That's it. The card updates live as your sensors change.

---

## Configuration reference

If you'd rather edit YAML directly:

```yaml
type: custom:energy-flow-card
title: Home grid

# Live power
solar_power: sensor.solar_power
grid_power: sensor.grid_power            # + import, − export
battery_power: sensor.battery_power      # + charge,  − discharge
battery_soc: sensor.battery_soc
home_power: sensor.home_power
inverter_efficiency: sensor.inverter_efficiency  # optional

# Sun
sun_entity: sun.sun
show_sun_arc: true

# Live weather sky (optional)
weather_entity: weather.forecast_home   # any weather.* entity

# Totals — solar
# Configure the monthly/yearly sensors too (not just daily): when present
# they're read straight from Home Assistant, so every device shows the same
# numbers. Leave them out and the card falls back to a per-device estimate.
solar_daily: sensor.solar_daily
solar_monthly: sensor.solar_monthly
solar_yearly: sensor.solar_yearly

# Totals — grid import
grid_import_daily: sensor.grid_import_daily
grid_import_monthly: sensor.grid_import_monthly
grid_import_yearly: sensor.grid_import_yearly

# Totals — grid export
grid_export_daily: sensor.grid_export_daily
grid_export_monthly: sensor.grid_export_monthly
grid_export_yearly: sensor.grid_export_yearly

# Totals — home
home_daily: sensor.home_daily
home_monthly: sensor.home_monthly
home_yearly: sensor.home_yearly

# Animation
animation_speed: normal     # slow | normal | fast
particle_density: medium    # low  | medium | high
```

---

## How it reads your data

- **Power values** auto-detect units. If your sensor reports `W`, the card converts to kW for display. If it reports `kW`, it's used as-is.
- **Energy totals** auto-detect `Wh` / `kWh` / `MWh` and normalise to kWh.
- **Grid direction** is inferred from sign — positive means importing, negative means exporting. Adjust your sensor sign convention if it's flipped.
- **Sun position** comes from `sun.sun` attributes:
  - `azimuth` (0–360°) → horizontal position along the sunrise→sunset arc
  - `elevation` (degrees) → if below 0, the sun hides and the card shows "SUN BELOW HORIZON"

---

## Troubleshooting

**Card shows "Loading…" forever**
The card is waiting for `hass`. If it persists, check the browser console for errors — usually a missing entity ID.

**Particle flow doesn't appear for a node**
Particles only show when that node has > 50 W of activity. If your solar is making 30 W, you won't see flow — that's intentional.

**Sun is in the wrong place**
The mapping uses azimuth 90° as east (sunrise) and 270° as west (sunset). If you're in the southern hemisphere, the sun arcs through the north — the card still draws the path the same way; the elevation/azimuth values from `sun.sun` already account for your location.

**Battery percentage looks wrong**
Make sure your `battery_soc` sensor reports 0–100, not 0–1.

**"Custom element doesn't exist: energy-flow-card"**
Resource wasn't registered or the browser cached the old page. Re-add the resource and hard-refresh.

**Totals differ between devices / don't match your sensors**
The month and year columns can only match across devices if the card reads the real Home Assistant monthly and yearly sensors. Set `solar_monthly` / `solar_yearly`, `grid_import_monthly` / `_yearly`, `grid_export_monthly` / `_yearly` and `home_monthly` / `_yearly` (the `utility_meter` helpers from step 2). When those are configured the values come straight from HA and are identical everywhere. If you only configure the daily sensors, the card estimates month/year locally in each browser, so different devices will drift apart — that's expected for the fallback.

---

## Version

v2.1.0
