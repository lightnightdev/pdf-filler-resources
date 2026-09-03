
async function embedFontsForDoc(doc) {
  const fontkitGlobal = window.fontkit || globalThis.fontkit;
  if (!fontkitGlobal) {
    throw new Error('fontkit library was not loaded');
  }

  doc.registerFontkit(fontkitGlobal);

  let sig = null,
    norm = null,
    mono = null;
  symb = null;
  try {
    const bytes = await loadAllCustomFontBytes();

    // Embed fonts to PDF document
    sig = await doc.embedFont(bytes._signature, { subset: false });
    norm = await doc.embedFont(bytes._normal, { subset: false });
    times = await doc.embedFont(bytes._times, { subset: false });
    mono = await doc.embedFont(bytes._monospace, { subset: false });
    symb = await doc.embedFont(bytes._symbol, { subset: false });
  } catch (e) {
    console.warn('Falling back to standard fonts:', e);
    sig = await doc.embedFont(PDFLib.StandardFonts.HelveticaOblique);
    norm = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    mono = await doc.embedFont(PDFLib.StandardFonts.Courier);
    symb = await doc.embedFont(PDFLib.StandardFonts.Courier);
  }

  return {
    _signature: sig,
    _normal: norm,
    _times: times,
    _monospace: mono,
    _symbol: symb,
  };
}

function cloneFontBytes(rawBytes) {
  const requiredKeys = ['_signature', '_normal', '_times', '_monospace', '_symbol'];
  const cloned = {};

  for (const key of requiredKeys) {
    const source = rawBytes?.[key];
    if (!source) throw new Error(`Missing font bytes for "${key}"`);

    cloned[key] =
      source instanceof Uint8Array ? source : new Uint8Array(source);
  }

  return cloned;
}

async function loadAllCustomFontBytes() {
  if (CUSTOM_FONT_BYTE_CACHE) return CUSTOM_FONT_BYTE_CACHE;

  const fontBytes = initFontBytes(); // Call the init function

  if (!fontBytes) {
    throw new Error('Custom font bytes were not initialised');
  }

  CUSTOM_FONT_BYTE_CACHE = cloneFontBytes(fontBytes);
  return CUSTOM_FONT_BYTE_CACHE;
}