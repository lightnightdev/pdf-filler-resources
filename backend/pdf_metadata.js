// #TODO: Need to move logging function into DI model

// Checks whether a PDF array buffer allows content modifications
async function isPdfEditingAllowed(ab) {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: ab });
    const pdfDoc = await loadingTask.promise;

    const permissions = await pdfDoc.getPermissions();

    // If null, then no restrictions
    if (!permissions) {
      await pdfDoc.destroy();
      return true;
    }

    log('Encryption detected. Checking for permissions...');

    const canModify = permissions.includes(
      pdfjsLib.PermissionFlag.MODIFY_CONTENTS
    );

    if (canModify) log('Modify permissions enabled.');

    await pdfDoc.destroy();
    return canModify;
  } catch (err) {
    console.error('Error checking PDF permissions:', err);
    return false;
  }
}

async function flattenAndCompressFile(arrayBuffer) {
  try {
    // Get PDF from Array buffer
    const pdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
    });

    // Flatten form fields
    const form = pdfLibDoc.getForm();
    if (form) form.flatten();

    // Save bytes
    const pdfBytes = await pdfLibDoc.save({
      useObjectStreams: true,
      compress: true,
    });
    return pdfBytes;
  } catch (err) {
    log('Error processing PDF: ' + err.message);
    console.error(err);
    return arrayBuffer;
  }
}

// #TODO: Calculating width/height manually ignores page rotation and breaks output. Need to reconsider how to manage that
/**
 * Rasterize a PDF into an image-only PDF.
 * Requires pdfjsLib (PDF.js) and PDFLib (pdf-lib) to be loaded globally.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} input
 * @param {Object} [opts]
 * @param {number} [opts.dpi=144]                 // Render resolution; 144 is a good quality/size balance
 * @param {"jpeg"|"png"} [opts.imageType="jpeg"]  // JPEG is smaller; PNG is lossless (bigger)
 * @param {number} [opts.jpegQuality=0.92]        // Only used when imageType="jpeg"
 * @param {function} [opts.onProgress]            // (pageIndex, pageCount) => void
 * @returns {Promise<Uint8Array>}
 */
async function rasterizeFile(input, opts = {}) {
  const {
    dpi = 144,
    imageType = 'jpeg',
    jpegQuality = 0.92,
    onProgress,
  } = opts;

  // ------------- helpers -------------
  const toArrayBuffer = async (x) => {
    if (x instanceof ArrayBuffer) return x;
    if (x instanceof Uint8Array) return x.buffer;
    if (x instanceof Blob) return await x.arrayBuffer();
    throw new Error('Unsupported input type for rasterizeFile');
  };

  const makeCanvas = (w, h) => {
    // Prefer OffscreenCanvas when available to avoid layout thrash
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(
        Math.max(1, Math.ceil(w)),
        Math.max(1, Math.ceil(h))
      );
      return { canvas: c, ctx: c.getContext('2d') };
    } else {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w));
      c.height = Math.max(1, Math.ceil(h));
      return { canvas: c, ctx: c.getContext('2d') };
    }
  };

  const canvasToBlob = (canvas, type, quality) => {
    if (canvas instanceof OffscreenCanvas) {
      return canvas.convertToBlob({ type: `image/${type}`, quality });
    }
    return new Promise((resolve) =>
      canvas.toBlob(resolve, `image/${type}`, quality)
    );
  };

  // ------------- load source PDF with PDF.js -------------
  const srcAB = await toArrayBuffer(input);
  const loadingTask = pdfjsLib.getDocument({ data: srcAB });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;

  // ------------- create destination PDF with PDF-Lib -------------
  const outDoc = await PDFLib.PDFDocument.create();

  // Process pages sequentially to keep memory modest
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);

    // PDF native size in points (72 pts/inch), independent of rotation
    // page.view = [xMin, yMin, xMax, yMax]; userUnit defaults to 1 for most PDFs
    const [x1, y1, x2, y2] = page.view;
    const userUnit = page.userUnit || 1;
    const widthPts = (x2 - x1) * userUnit;
    const heightPts = (y2 - y1) * userUnit;

    // Render at requested DPI in pixels: scale = dpi / 72
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });

    const { canvas, ctx } = makeCanvas(viewport.width, viewport.height);

    // Render with PDF.js
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Extract bitmap as Blob
    const blob = await canvasToBlob(
      canvas,
      imageType === 'png' ? 'png' : 'jpeg',
      jpegQuality
    );
    const imgBytes = new Uint8Array(await blob.arrayBuffer());

    // Embed into out PDF
    const img =
      imageType === 'png'
        ? await outDoc.embedPng(imgBytes)
        : await outDoc.embedJpg(imgBytes);

    const outPage = outDoc.addPage([widthPts, heightPts]);
    outPage.drawImage(img, { x: 0, y: 0, width: widthPts, height: heightPts });

    // Cleanup memory for this page
    try {
      page.cleanup();
    } catch {}
    if (!(canvas instanceof OffscreenCanvas)) {
      // help GC
      canvas.width = 1;
      canvas.height = 1;
    }

    onProgress?.(i, pageCount);
  }

  // Optional: copy minimal metadata (edit as needed)
  try {
    const meta = await pdf.getMetadata();
    if (meta?.info?.Title) outDoc.setTitle(meta.info.Title);
    if (meta?.info?.Author) outDoc.setAuthor(meta.info.Author);
  } catch {
    /* metadata is optional */
  }

  // Save rasterized PDF
  return await outDoc.save({
    useObjectStreams: false,
    addDefaultPage: false,
    compress: true,
  });
}