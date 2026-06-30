# Speco Field Designer

An interactive security camera placement and planning tool for Speco Technologies dealers and installers.

## Features
- Drag-and-drop camera placement on blank canvas, uploaded floor plan, or live Google Maps aerial
- FOV cone visualization with DORI zone calculations (EN 62676-4)
- Full Speco product catalog with MAP pricing
- Bill of Materials with live totals
- PDF export with site overview, placement index, and BOM

## File Structure

```
speco-field-designer/
├── index.html          ← App shell, loads all scripts and styles
├── css/
│   └── styles.css      ← All UI styles and CSS variables
├── js/
│   ├── products.js     ← Product catalog (SKUs, descriptions, MAP pricing)
│   ├── camera.js       ← Camera specs, FOV/DORI calculations
│   ├── state.js        ← App state, product UI, tab switching
│   ├── canvas.js       ← Canvas drawing, FOV cones, placements
│   ├── maps.js         ← Google Maps integration
│   ├── app.js          ← Canvas interaction, BOM, PDF export
│   └── lens.js         ← Lens preview system (base64 images)
└── README.md
```

## Updating the Product Catalog

To update products, edit `js/products.js`. Each product is an object with:
```js
{ sku: 'O4T9', description: '4MP H.265 AI IP Turret Camera...', map: 490.30, category: 'Cameras' }
```

> **Roadmap:** Product catalog will be migrated to Supabase for live updates without code changes.

## Google Maps API Key

The Maps API key is embedded in `index.html`. Restrict it to your domain before sharing publicly:
https://console.cloud.google.com/apis/credentials

## Usage

Open `index.html` in any modern browser. No build step or server required for local use.

## Version History

- v24 — Current. PDF export redesigned with blue header, transparent logo, improved BOM layout
- v23 — Image compression (lens preview reduced from 814KB to 140KB)
- v22 — Initial cleaned version
