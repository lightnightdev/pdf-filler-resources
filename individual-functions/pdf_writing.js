// Computes scaled PDF coordinates and font size based on page size and config
function computeExportCoords(page, cfg) {
  const pageW = page.getWidth();
  const pageH = page.getHeight();

  const stageW = Number(cfg.stageW) || pageW;
  const stageH = Number(cfg.stageH) || pageH;

  const scaleX = pageW / stageW;
  const scaleY = pageH / stageH;

  
  const exportX = (Number(cfg.x) || 0) * scaleX;

  // exportY is hard to get because HTML and PDF coordinates start from different corners
  // So, we need to adjust for the height of the font + typo descenders to get the write coordinate to draw at
  const cssPxSize = Number(cfg.size) || 12;
  const pdfFontSize = cssPxSize * scaleY;
  const exportYTop = pageH - (Number(cfg.y) || 0) * scaleY;

  const exportY = getCorrectYCoordinate(exportYTop, pdfFontSize, cfg.font);

  return { pdfFontSize, exportX, exportY };
}

// Adjusts Y coordinate to account for font ascender and PDF units
function getCorrectYCoordinate(exportYTop, fontSize, fontKey) {
  const ascender = FONT_STYPODESCENDERS[fontKey];
  const unitsPerEm = FONT_UNITS_PER_EM[fontKey] || 1000;

  const ascenderRatio = ascender / unitsPerEm;
  const adjustment = ascenderRatio * fontSize;

  const exportY = exportYTop - adjustment;
  return exportY;
}

// Copies a specified column in a 2D array to a new column
// This was used for a prior build, but not used now
function copyArrayColumn(arr, idx) {
  for (let i = 0; i < arr.length; i++) {
    arr[i].push(arr[i][idx]);
  }
  return arr[0].length - 1;
}

// Draws text on a page with optional per-character spacing
function drawPlacedText(page, cfg, text, fontsMap) {
  let fontToUse = cfg.font;
  if (text === "✓") {
    fontToUse = "_symbol";
  }
  const font = pickFontForPdf(fontToUse, fontsMap);

  const spacing = Number(cfg.spacing) * 0.5 || 0;
  const { pdfFontSize, exportX, exportY } = computeExportCoords(page, cfg);

  if (!spacing) {
    page.drawText(text, { x: exportX, y: exportY, size: pdfFontSize, font });
    return;
  }

  // Per-character draw (manual spacing). Skip extra space after last char.
  // It currently does not match actual CSS font spacing. May need to revisit #TODO
  let cursorX = exportX;
  for (const [i, ch] of Array.from(text).entries()) {
    page.drawText(ch, { x: cursorX, y: exportY, size: pdfFontSize, font });
    if (i < text.length - 1) {
      cursorX += font.widthOfTextAtSize(ch, pdfFontSize) + spacing;
    }
  }
}

// drawAllText
function drawStaticText(doc, docFonts, locDataPages) {
  if (!locDataPages || !doc) {
    return;
  }

  const totalPages = doc.getPageCount();

  let pgld;
  for (const pgNumStr of Object.keys(locDataPages)) {
    const pgNum = Number(pgNumStr);
    if (pgNum < 1 || pgNum > totalPages) continue; // skip invalid or overflow pages

    const page = doc.getPage(pgNum - 1);
    pgld = locDataPages[pgNum];

    if (!pgld) continue;

    if (pgld.customText) {
      for (let obj of Object.values(pgld.customText)) {
        if (obj.text == null) continue;
        drawPlacedText(page, obj, obj.text, docFonts);
      }
    }
    if (pgld.savedText) {
      for (let obj of Object.values(pgld.savedText)) {
        drawPlacedText(page, obj, obj.text, docFonts);
      }
    }
  }
}

function drawRowText(doc, docFonts, locDataPages, rowIdx) {
  if (!locDataPages || !doc) return;

  const totalPages = doc.getPageCount();

  for (const pgNumStr of Object.keys(locDataPages)) {
    const pgNum = Number(pgNumStr);
    if (pgNum < 1 || pgNum > totalPages) continue;

    const page = doc.getPage(pgNum - 1);
    const pgld = locDataPages[pgNum];
    if (!pgld || !pgld.csvColumns) continue;

    for (const obj of Object.values(pgld.csvColumns)) {
      const txt = getCellOrBlank(rowIdx, obj.colIdx);
      drawPlacedText(page, obj, txt, docFonts);
    }
  }
}

// essentially drawRowText but Row 1 only (after header) and checks for sizing
function drawSizingText(doc, docFonts, pageLocData, pgNum) {
  const totalPages = doc.getPageCount();
  if (pgNum < 1 || pgNum > totalPages) return;

  const page = doc.getPage(pgNum - 1);
  if (!pageLocData) {
    console.warn("No pageLocData for page", pgNum);
    return;
  }

  for (const group of ["customText", "savedText", "csvColumns"]) {
    const objs = pageLocData[group];
    if (!objs) continue;

    for (const obj of Object.values(objs)) {
      if (obj.spacing && obj.spacing > 0) {
        const txt =
          group === "csvColumns" ? getCellOrHeader(1, obj.colIdx) : obj.text;
        drawPlacedText(page, obj, txt, docFonts);
      }
    }
  }
}

function pickFontForPdf(fontKey, embedded) {
  switch ((fontKey || "").toLowerCase()) {
    case "_signature":
      return embedded._signature;
    case "_times":
      return embedded._times;
    case "_monospace":
      return embedded._monospace;
    case "_symbol":
      return embedded._symbol;
    case "_normal":
    default:
      return embedded._normal;
  }
}

function getCellOrHeader(rowIdx, colIdx) {
  csvData = Alpine.store("csvState").csvData;
  const val = csvData?.[rowIdx]?.[colIdx];
  if (val && String(val).trim() !== "") return String(val);
  const header = csvData?.[0]?.[colIdx];
  if (header && String(header).trim() !== "") return `[${header}]`;
  return `Col ${colIdx}`;
}

function getCellOrBlank(rowIdx, colIdx) {
  csvData = Alpine.store("csvState").csvData;
  const val = csvData?.[rowIdx]?.[colIdx];
  if (val && String(val).trim() !== "") return String(val);
  return ""; // Return empty string instead of falling back to header
}
