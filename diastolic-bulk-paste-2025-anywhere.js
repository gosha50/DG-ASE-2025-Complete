
/*! Diastolic Bulk-Paste Injector v1.2.0 (2025-11-07)
   - Global paste interception ("anywhere in the app")
   - Safe heuristics so normal single-value or non-echo text pastes still work
   - 2025 extensions included (LARS, PV S/D, IVRT, PASP/RAP, LV GLS, LA stiffness, exercise E/e′ & TRV)
   MIT License.
*/
(function(global){
  'use strict';

  // -----------------------------
  // Helpers
  // -----------------------------
  const round = (x, d=2) => (x==null || Number.isNaN(+x)) ? null : +(+x).toFixed(d);
  const toNum = (s) => (s==null) ? null : Number(String(s).replace(/[^0-9.+-]/g, ""));
  const isTextEntry = (el) => !!el && el instanceof Element && (el.matches('input,textarea,[contenteditable="true"]'));
  const inFormControl = (el) => !!el && el instanceof Element && el.closest('input,textarea,[contenteditable="true"],select');
  const dispatchInput = (el) => { try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch {} };

  function showToast(msg){
    try {
      const id = 'diasto-toast';
      let t = document.getElementById(id);
      if (!t) {
        t = document.createElement('div');
        t.id = id;
        t.style.position = 'fixed';
        t.style.zIndex = '2147483647';
        t.style.right = '12px';
        t.style.bottom = '12px';
        t.style.maxWidth = '60ch';
        t.style.padding = '10px 12px';
        t.style.borderRadius = '10px';
        t.style.border = '1px solid #cdd4ff';
        t.style.background = '#eef1ff';
        t.style.boxShadow = '0 6px 20px rgba(0,0,0,.08)';
        t.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
        t.style.fontSize = '14px';
        t.style.color = '#102a43';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      setTimeout(()=>{ t.style.transition = 'opacity .6s ease'; t.style.opacity = '0'; }, 1800);
    } catch {}
  }

  const hasMultiLineSignal = (t) => {
    if (!t) return false;
    const lines = t.trim().split(/\r?\n/);
    if (lines.length >= 3) return true;
    if (/\b(?:MV\s*E|Mitral\s*E|E\/A|e['′` ]|TR\s*(?:Vmax|peak)|LAVI|LA\s*volume|Deceleration\s*time|DT|HR|BP|Rhythm|LASr|LARS|PALS|IVRT|PASP|RVSP|pulmonary\s*vein|PV\s*S\/D)\b/i.test(t)) return true;
    if ((t.match(/:/g)||[]).length >= 2) return true;
    return false;
  };

  // -----------------------------
  // Canonical fields (2016 + 2025)
  // -----------------------------
  const FIELD_SPECS = {
    // Mitral inflow
    MV_E_m_s: {
      label: "Mitral E velocity (m/s)",
      patterns: [
        /(?:\b(?:MV|Mitral)\s*E(?:\s*(?:peak|wave))?(?:\s*velocity)?)[^0-9]{0,10}([0-9.]+)\s*(m\/s|cm\/s)?/i,
        /(?:\bE\s*wave(?:\s*velocity)?)\s*[:=]?\s*([0-9.]+)\s*(m\/s|cm\/s)?\b/i
      ],
      normalize: (v, unit) => {
        const x = toNum(v);
        if (!x && x !== 0) return null;
        if (!unit || /m\/s/i.test(unit)) return round(x, 3);
        if (/cm\/s/i.test(unit)) return round(x/100, 3);
        return round(x, 3);
      }
    },
    MV_A_m_s: {
      label: "Mitral A velocity (m/s)",
      patterns: [
        /(?:\b(?:MV|Mitral)\s*A(?:\s*(?:peak|wave))?(?:\s*velocity)?)[^0-9]{0,10}([0-9.]+)\s*(m\/s|cm\/s)?/i,
        /(?:\bA\s*wave(?:\s*velocity)?)\s*[:=]?\s*([0-9.]+)\s*(m\/s|cm\/s)?\b/i
      ],
      normalize: (v, unit) => {
        const x = toNum(v);
        if (!x && x !== 0) return null;
        if (!unit || /m\/s/i.test(unit)) return round(x, 3);
        if (/cm\/s/i.test(unit)) return round(x/100, 3);
        return round(x, 3);
      }
    },
    EA_ratio: {
      label: "E/A ratio",
      patterns: [
        /\bE\s*\/\s*A\s*(?:ratio)?\s*[:=]?\s*([0-9.]+)/i,
        /\bE:?A\s*(?:ratio)?\s*[:=]?\s*([0-9.]+)/i
      ],
      normalize: (v) => round(toNum(v), 2),
      derive: (bag) => {
        const E = bag.MV_E_m_s, A = bag.MV_A_m_s;
        if (E != null && A != null && A !== 0) return round(E/A, 2);
        return null;
      }
    },
    DT_ms: {
      label: "MV E deceleration time (ms)",
      patterns: [ /\b(?:Deceleration\s*time|DT)\s*[:=]?\s*([0-9.]+)\s*ms\b/i ],
      normalize: (v) => round(toNum(v), 0)
    },

    // Tissue Doppler e′
    eprime_septal_cm_s: {
      label: "e′ (septal) (cm/s)",
      patterns: [
        /\b(?:septal|medial)\s*(?:e['′` ]|e-?prime)\s*[:=]?\s*([0-9.]+)\s*(cm\/s|m\/s)?\b/i,
        /\be['′` ](?:septal|medial)\s*[:=]?\s*([0-9.]+)\s*(cm\/s|m\/s)?\b/i
      ],
      normalize: (v, unit) => {
        const x = toNum(v);
        if (!x && x !== 0) return null;
        if (!unit || /cm\/s/i.test(unit)) return round(x, 2);
        if (/m\/s/i.test(unit)) return round(x*100, 2);
        return round(x, 2);
      }
    },
    eprime_lateral_cm_s: {
      label: "e′ (lateral) (cm/s)",
      patterns: [
        /\b(?:lateral|lat)\s*(?:e['′` ]|e-?prime)\s*[:=]?\s*([0-9.]+)\s*(cm\/s|m\/s)?\b/i,
        /\be['′` ](?:lateral|lat)\s*[:=]?\s*([0-9.]+)\s*(cm\/s|m\/s)?\b/i
      ],
      normalize: (v, unit) => {
        const x = toNum(v);
        if (!x && x !== 0) return null;
        if (!unit || /cm\/s/i.test(unit)) return round(x, 2);
        if (/m\/s/i.test(unit)) return round(x*100, 2);
        return round(x, 2);
      }
    },
    eprime_avg_cm_s: {
      label: "e′ (average) (cm/s)",
      patterns: [ /\b(?:average|avg)\s*e['′` ]\s*[:=]?\s*([0-9.]+)\s*(cm\/s|m\/s)?\b/i ],
      normalize: (v, unit) => {
        const x = toNum(v);
        if (!x && x !== 0) return null;
        if (!unit || /cm\/s/i.test(unit)) return round(x, 2);
        if (/m\/s/i.test(unit)) return round(x*100, 2);
        return round(x, 2);
      },
      derive: (bag) => {
        const s = bag.eprime_septal_cm_s, l = bag.eprime_lateral_cm_s;
        if (s != null && l != null) return round((s + l)/2, 2);
        return null;
      }
    },

    // E/e′
    E_over_eprime_septal: {
      label: "E/e′ (septal)",
      patterns: [ /\bE\s*\/\s*e['′` ]\s*(?:septal|medial)\s*[:=]?\s*([0-9.]+)/i ],
      normalize: (v) => round(toNum(v), 2),
      derive: (bag) => {
        const E_ms = bag.MV_E_m_s;
        const e_cm = bag.eprime_septal_cm_s;
        if (E_ms != null && e_cm != null && e_cm !== 0) {
          const E_cm_s = E_ms * 100;
          return round(E_cm_s / e_cm, 2);
        }
        return null;
      }
    },
    E_over_eprime_lateral: {
      label: "E/e′ (lateral)",
      patterns: [ /\bE\s*\/\s*e['′` ]\s*(?:lateral|lat)\s*[:=]?\s*([0-9.]+)/i ],
      normalize: (v) => round(toNum(v), 2),
      derive: (bag) => {
        const E_ms = bag.MV_E_m_s;
        const e_cm = bag.eprime_lateral_cm_s;
        if (E_ms != null && e_cm != null && e_cm !== 0) {
          const E_cm_s = E_ms * 100;
          return round(E_cm_s / e_cm, 2);
        }
        return null;
      }
    },
    E_over_eprime_avg: {
      label: "E/e′ (average)",
      patterns: [ /\bE\s*\/\s*e['′` ]\s*(?:avg|average)\s*[:=]?\s*([0-9.]+)/i ],
      normalize: (v) => round(toNum(v), 2),
      derive: (bag) => {
        const E_ms = bag.MV_E_m_s;
        const e_cm = bag.eprime_avg_cm_s ?? (bag.eprime_septal_cm_s!=null && bag.eprime_lateral_cm_s!=null ? (bag.eprime_septal_cm_s + bag.eprime_lateral_cm_s)/2 : null);
        if (E_ms != null && e_cm != null && e_cm !== 0) {
          const E_cm_s = E_ms * 100;
          return round(E_cm_s / e_cm, 2);
        }
        return null;
      }
    },

    // TR & LA
    TR_Vmax_m_s: {
      label: "TR peak velocity (m/s)",
      patterns: [
        /\bTR\s*(?:Vmax|Vmax\.?|V max|peak\s*velocity)\s*[:=]?\s*([0-9.]+)\s*m\/s\b/i,
        /\btricuspid\s*regurgitation.*?peak\s*velocity[^0-9]{0,10}([0-9.]+)\s*m\/s\b/i
      ],
      normalize: (v) => round(toNum(v), 2)
    },
    LAVI_ml_m2: {
      label: "LA volume index (mL/m²)",
      patterns: [ /\b(?:LA\s*volume\s*index|LAVI)\s*[:=]?\s*([0-9.]+)\s*(?:ml|mL)\s*\/\s*m(?:2|\^2)\b/i ],
      normalize: (v) => round(toNum(v), 1),
      derive: (bag) => {
        const vol = bag.LA_volume_ml, bsa = bag.BSA_m2;
        if (vol != null && bsa != null && bsa !== 0) return round(vol / bsa, 1);
        return null;
      }
    },
    LA_volume_ml: {
      label: "LA volume (mL)",
      patterns: [ /\bLA\s*volume(?:\s*\(biplane\))?\s*[:=]?\s*([0-9.]+)\s*(?:ml|mL)\b/i ],
      normalize: (v) => round(toNum(v), 1)
    },
    BSA_m2: {
      label: "Body surface area (m²)",
      patterns: [
        /\bBSA\s*[:=]?\s*([0-9.]+)\s*m(?:2|\^2)\b/i,
        /\bBody\s*surface\s*area\s*[:=]?\s*([0-9.]+)\s*m(?:2|\^2)\b/i
      ],
      normalize: (v) => round(toNum(v), 2)
    },

    // Vitals/Context
    HR_bpm: { label: "Heart rate (bpm)", patterns: [ /\b(?:HR|Heart\s*rate)\s*[:=]?\s*([0-9.]+)\s*bpm\b/i ], normalize: (v) => round(toNum(v), 0) },
    BP_sys: { label: "Systolic BP (mmHg)", patterns: [ /\b(?:BP|Blood\s*pressure)\s*[:=]?\s*([0-9]{2,3})\s*\/\s*([0-9]{2,3})\b/i ], normalize: () => null },
    BP_dia: { label: "Diastolic BP (mmHg)", patterns: [ /\b(?:BP|Blood\s*pressure)\s*[:=]?\s*([0-9]{2,3})\s*\/\s*([0-9]{2,3})\b/i ], normalize: () => null },
    Rhythm: {
      label: "Rhythm",
      patterns: [
        /\b(?:Rhythm|Underlying\s*rhythm)\s*[:=]?\s*([A-Za-z ]{2,})/i,
        /\bAtrial\s*fibrillation\b/i, /\bAF(?:ib)?\b/i,
        /\bSinus\s*rhythm\b/i, /\bNSR\b/i
      ],
      normalize: (v, unit, bag, all) => {
        const txt = (all && all[0] || "").toLowerCase();
        if (/atrial\s*fibrillation|afib|\baf\b/.test(txt)) return "AF";
        if (/sinus\s*rhythm|\bnsr\b/.test(txt)) return "Sinus";
        if (v) return String(v).trim();
        return null;
      }
    },

    // 2025 extensions
    LA_reservoir_strain_pct: {
      label: "LA reservoir strain (%, LASr/LARS/PALS)",
      patterns: [
        /\b(?:LA|Left\s*atrial)\s*(?:reservoir\s*strain|strain\s*\(reservoir\)|LASr|LARS|PALS)\s*[:=]?\s*(-?[0-9.]+)\s*%/i,
        /\bLA\s*strain\s*[:=]?\s*(-?[0-9.]+)\s*%\b/i
      ],
      normalize: (v) => round(toNum(v), 1)
    },
    PV_SD_ratio: {
      label: "Pulmonary vein S/D ratio",
      patterns: [
        /\b(?:pulmonary\s*vein(?:ous)?|PV)\s*S\s*\/\s*D\s*(?:ratio)?\s*[:=]?\s*([0-9.]+)/i,
        /\bS\s*\/\s*D\s*[:=]?\s*([0-9.]+)\b(?=.*pulmonary\s*vein)/i
      ],
      normalize: (v) => round(toNum(v), 2)
    },
    IVRT_ms: {
      label: "Isovolumic relaxation time (ms)",
      patterns: [
        /\bIVRT\s*[:=]?\s*([0-9.]+)\s*ms\b/i,
        /\bisovolumic\s*relaxation\s*time\s*[:=]?\s*([0-9.]+)\s*ms\b/i
      ],
      normalize: (v) => round(toNum(v), 0)
    },
    PASP_mmHg: {
      label: "Pulmonary artery systolic pressure (mmHg)",
      patterns: [
        /\bPASP\s*[:=]?\s*([0-9.]+)\s*mmHg\b/i,
        /\bRVSP\s*[:=]?\s*([0-9.]+)\s*mmHg\b/i,
        /\bSystolic\s*PAP\s*[:=]?\s*([0-9.]+)\s*mmHg\b/i
      ],
      normalize: (v) => round(toNum(v), 0),
      derive: (bag) => {
        const tr = bag.TR_Vmax_m_s;
        const rap = bag.RA_pressure_mmHg;
        if (tr != null && rap != null) {
          return round(4 * tr * tr + rap, 0);
        }
        return null;
      }
    },
    RA_pressure_mmHg: {
      label: "Right atrial pressure (mmHg)",
      patterns: [ /\b(?:RA\s*pressure|RAP|Estimated\s*RA\s*pressure)\s*[:=]?\s*([0-9.]+)\s*mmHg\b/i ],
      normalize: (v) => round(toNum(v), 0)
    },
    LV_GLS_pct: {
      label: "LV global longitudinal strain (%)",
      patterns: [ /\b(?:LV\s*)?(?:global\s*longitudinal\s*strain|GLS)\s*[:=]?\s*(-?[0-9.]+)\s*%\b/i ],
      normalize: (v) => round(toNum(v), 1)
    },
    LA_stiffness_index: {
      label: "LA stiffness index (E/e′avg ÷ LARS%)",
      patterns: [],
      normalize: (v) => round(toNum(v), 2),
      derive: (bag) => {
        const eOverE = bag.E_over_eprime_avg;
        const lars = bag.LA_reservoir_strain_pct;
        if (eOverE != null && lars != null && lars !== 0) return round(eOverE / lars, 2);
        return null;
      }
    },
    E_over_eprime_avg_exercise: {
      label: "Exercise E/e′ (average)",
      patterns: [ /\b(?:exercise|stress|peak)\s*E\s*\/\s*e['′` ]\s*(?:avg|average)?\s*[:=]?\s*([0-9.]+)/i ],
      normalize: (v) => round(toNum(v), 2)
    },
    TR_Vmax_exercise_m_s: {
      label: "Exercise TR Vmax (m/s)",
      patterns: [ /\b(?:exercise|stress|peak)\s*TR\s*(?:Vmax|peak\s*velocity)\s*[:=]?\s*([0-9.]+)\s*m\/s\b/i ],
      normalize: (v) => round(toNum(v), 2)
    }
  };

  function parseReport(text){
    const bag = {};
    for (const [key, spec] of Object.entries(FIELD_SPECS)) {
      for (const rx of (spec.patterns||[])) {
        const m = rx.exec(text);
        if (m) {
          const val = (spec.normalize||((v)=>v))(m[1], m[2], bag, m);
          if (val!=null) { bag[key]=val; break; }
          if ((key==="BP_sys"||key==="BP_dia") && m[1] && m[2]) { bag.BP_sys=round(toNum(m[1]),0); bag.BP_dia=round(toNum(m[2]),0); break; }
        }
      }
    }
    for (const [key, spec] of Object.entries(FIELD_SPECS)) {
      if (bag[key]==null && typeof spec.derive==="function") {
        try { const dv = spec.derive(bag); if (dv!=null) bag[key]=dv; } catch {}
      }
    }
    return bag;
  }

  // -----------------------------
  // DOM integration (global paste)
  // -----------------------------
  const DEFAULT_SELECTOR_MAP = {
    // Core
    MV_E_m_s: "#mv_e, [name='mv_e']",
    MV_A_m_s: "#mv_a, [name='mv_a']",
    EA_ratio: "#ea_ratio, [name='ea_ratio']",
    DT_ms: "#dt_ms, [name='dt_ms']",
    eprime_septal_cm_s: "#eprime_septal, [name='eprime_septal']",
    eprime_lateral_cm_s: "#eprime_lateral, [name='eprime_lateral']",
    eprime_avg_cm_s: "#eprime_avg, [name='eprime_avg']",
    E_over_eprime_septal: "#e_over_eprime_septal, [name='e_over_eprime_septal']",
    E_over_eprime_lateral: "#e_over_eprime_lateral, [name='e_over_eprime_lateral']",
    E_over_eprime_avg: "#e_over_eprime_avg, [name='e_over_eprime_avg']",
    TR_Vmax_m_s: "#tr_vmax, [name='tr_vmax']",
    LAVI_ml_m2: "#lavi, [name='lavi']",
    LA_volume_ml: "#la_volume, [name='la_volume']",
    BSA_m2: "#bsa, [name='bsa']",
    HR_bpm: "#hr, [name='hr']",
    BP_sys: "#bp_sys, [name='bp_sys']",
    BP_dia: "#bp_dia, [name='bp_dia']",
    Rhythm: "#rhythm, [name='rhythm']",
    // 2025
    LA_reservoir_strain_pct: "#la_strain, [name='la_strain'], [name='lars'], [name='lasr'], [name='pals']",
    PV_SD_ratio: "#pv_sd, [name='pv_sd']",
    IVRT_ms: "#ivrt, [name='ivrt']",
    PASP_mmHg: "#pasp, [name='pasp'], #rvsp, [name='rvsp']",
    RA_pressure_mmHg: "#rap, [name='rap']",
    LV_GLS_pct: "#gls, [name='gls'], [name='lv_gls']",
    LA_stiffness_index: "#la_stiffness, [name='la_stiffness']",
    // Exercise
    E_over_eprime_avg_exercise: "#e_over_eprime_avg_ex, [name='e_over_eprime_avg_ex']",
    TR_Vmax_exercise_m_s: "#tr_vmax_ex, [name='tr_vmax_ex']"
  };

  function pickEl(sel){ if(!sel) return null; return document.querySelector(sel); }
  function setField(el, val){ if(!el) return false; const tag=el.tagName&&el.tagName.toLowerCase(); if(tag==='input'||tag==='textarea'){ el.value=String(val); } else if (el.isContentEditable || el.getAttribute && el.getAttribute('contenteditable')==='true'){ el.textContent=String(val); } else { el.textContent=String(val); } dispatchInput(el); try{ el.classList.add('diasto-flash'); setTimeout(()=>el.classList.remove('diasto-flash'),800);}catch{} return true; }
  function applyBagToSelectors(bag, map){ let updated=0; for (const [k,v] of Object.entries(bag)) { if(v==null) continue; const sel=map[k]; if(!sel) continue; const el=pickEl(sel); if(el && setField(el,v)) updated++; } return updated; }

  function createStyles(){
    const css = `.diasto-flash{ outline:2px solid rgba(66,133,244,.8); transition:outline-color .8s ease; }`;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  }

  /**
   * Setup global paste handling
   * @param {Object} selectorMap canonicalKey => CSS selector(s) mapping
   * @param {Object} options
   *   - scope: 'anywhere' | 'inputs-only'  (default 'anywhere')
   *   - trigger: 'auto' | 'modifier'       (default 'auto'; 'modifier' requires Shift while pasting)
   *   - onlyWhenMultiLine: boolean          (default true)
   *   - signalsMin: number                  (default 2; minimum extracted fields to intercept)
   *   - onAfterFill: function(bag, updated) called after population
   */
  function setup(selectorMap={}, options={}){
    const map = Object.assign({}, DEFAULT_SELECTOR_MAP, selectorMap);
    const opts = Object.assign({
      scope: 'anywhere',
      trigger: 'auto',          // 'modifier' => require Shift+Paste
      onlyWhenMultiLine: true,
      signalsMin: 2,
      onAfterFill: null
    }, options||{});

    createStyles();

    const handler = (e) => {
      const tgt = e.target;
      const inInputsOnly = (opts.scope === 'inputs-only');
      if (inInputsOnly && !isTextEntry(tgt)) return; // ignore if inputs-only

      const txt = e.clipboardData && e.clipboardData.getData('text/plain') || '';
      if (!txt) return;

      // If require modifier: need shift key (or meta/ctrl+shift) with paste
      if (opts.trigger === 'modifier') {
        if (!(e.shiftKey)) return; // require Shift as a simple, reliable modifier
      }

      // Check bulk signals
      const hasSignals = opts.onlyWhenMultiLine ? hasMultiLineSignal(txt) : true;

      // Parse to confirm there's enough fields to justify intercept
      const parsed = parseReport(txt);
      const signalCount = Object.values(parsed).filter(v => v != null).length;
      const enough = signalCount >= (opts.signalsMin || 1);

      if (hasSignals && enough) {
        // Intercept and fill
        e.preventDefault();
        const updated = applyBagToSelectors(parsed, map);
        if (updated > 0) {
          showToast(`Diastolic paste: filled ${updated} field${updated===1?'':'s'}.`);
          if (typeof opts.onAfterFill === 'function') { try { opts.onAfterFill(parsed, updated); } catch {} }
        } else {
          // No fields wired in mapping; don't block paste if inside a text entry
          if (isTextEntry(tgt)) return; // let default happen
        }
      } else {
        // Not an echo report or too few signals; allow normal paste
        return;
      }
    };

    document.addEventListener('paste', handler, true);

    // Optional: keybind fallback (Ctrl/Cmd+Shift+V to force clipboard parse anywhere)
    const keyHandler = async (e) => {
      try {
        const isPasteCombo = ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'v'));
        if (!isPasteCombo) return;
        e.preventDefault();
        const txt = await navigator.clipboard.readText();
        if (!txt) return;
        const parsed = parseReport(txt);
        const updated = applyBagToSelectors(parsed, map);
        if (updated > 0) showToast(`Diastolic paste: filled ${updated} field${updated===1?'':'s'}.`);
      } catch {}
    };
    document.addEventListener('keydown', keyHandler, true);

    // expose programmatic API
    return {
      parse: parseReport,
      fill: (textOrBag) => {
        const bag = (typeof textOrBag === 'string') ? parseReport(textOrBag) : (textOrBag || {});
        return applyBagToSelectors(bag, map);
      }
    };
  }

  const DiastolicPaste = { setup, parse: (t)=>parseReport(t) };
  global.DiastolicPaste = DiastolicPaste;

})(typeof window!=='undefined'?window:globalThis);
