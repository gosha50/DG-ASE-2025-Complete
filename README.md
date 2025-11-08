# ASE 2025 Diastolic Function Calculator (with paste-anywhere)
This build adds a global paste extractor that parses echocardiography report text and auto-fills the calculator fields (2016 + extended 2025).

## Quick start
- Open `index.html` locally (or host on GitHub Pages or any static host).
- Paste an echo report **anywhere** on the page (Ctrl/Cmd+V). You’ll see fields populate and highlight.
- Optional shortcut: **Ctrl/Cmd+Shift+V** forces parsing even for single-line clipboard text.

## Files
- `index.html` – the sample calculator UI (fields only; algorithm integration TBD).
- `diastolic-bulk-paste-2025-anywhere.js` – the paste-anywhere injector.
- `service-worker.js` – caches files for offline PWA use.
- `manifest.webmanifest` – basic PWA manifest.
- `style.css` – simple dark theme UI.
- `LICENSE` – MIT.

## Wiring to your existing app
If you already have a calculator UI, copy `diastolic-bulk-paste-2025-anywhere.js` and initialize it with a mapping that points to your field selectors (IDs, names, or data-attributes).

```html
<script src="diastolic-bulk-paste-2025-anywhere.js"></script>
<script>
  DiastolicPaste.setup({ MV_E_m_s: '#mv_e', /* ... */ }, { scope:'anywhere', onlyWhenMultiLine:true, signalsMin:2 });
</script>
```

## Notes
- PASP derivation uses `4 × (TR_Vmax)^2 + RA pressure` when both are present.
- LA stiffness index is computed as `(E/e′ avg) / LARS%`.
- Units: E/A in m/s; e′ in cm/s; conversions are handled automatically during parsing.
