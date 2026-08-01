// Legibility checks that run the moment a file is uploaded, so the applicant
// fixes a bad scan while they are still at their desk — instead of finding out
// weeks later when a TNTEU reviewer cannot read it.
//
// Everything here is measured, not judged: pixel dimensions, effective DPI
// against A4, file size, and (for JPEG) the encoder's own quantisation tables.
// No model decides whether a scan "looks" acceptable.

export const SIZE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  warnBytes: 8 * 1024 * 1024,
  // Only meaningful for photographed/scanned images. A born-digital PDF (a
  // DigiLocker download, a university-issued certificate) is routinely under
  // 50 KB and perfectly legible, so file size is the wrong test for PDFs —
  // they are judged on whether they actually carry content instead.
  imageWarnBytes: 60 * 1024,
};

// A4 at 200 DPI ≈ 1654 x 2339. Government offices generally accept 200 DPI;
// below ~150 DPI small print stops being reliably readable.
export const IMAGE_LIMITS = {
  minWidth: 900,
  minHeight: 1100,
  minMegapixels: 1.0,
  recommendedDpi: 200,
  minDpi: 150,
};

const A4_WIDTH_INCHES = 8.27;
const A4_HEIGHT_INCHES = 11.69;

function readPngSize(buffer) {
  // PNG signature then an IHDR chunk whose width/height are big-endian uint32.
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  if (buffer.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegInfo(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  let size = null;
  let quantSum = 0;
  let quantCount = 0;

  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image

    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;

    // SOF0..SOF15, excluding the non-frame markers in that range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      size = { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    // DQT — high quantisation values mean the encoder threw away detail, which
    // is what a heavily re-compressed or screenshotted document looks like.
    if (marker === 0xc4 - 0x04 /* 0xdb */) {
      let cursor = offset + 4;
      const end = offset + 2 + length;
      while (cursor < end) {
        const precision = buffer[cursor] >> 4;
        const entryBytes = precision === 0 ? 1 : 2;
        cursor += 1;
        for (let i = 0; i < 64 && cursor < end; i += 1) {
          quantSum += entryBytes === 1 ? buffer[cursor] : buffer.readUInt16BE(cursor);
          quantCount += 1;
          cursor += entryBytes;
        }
      }
    }

    offset += 2 + length;
  }

  if (!size) return null;
  return { ...size, avgQuantisation: quantCount ? quantSum / quantCount : null };
}

export function readImageSize(buffer, mimeType) {
  if (mimeType === "image/png") return readPngSize(buffer);
  if (mimeType === "image/jpeg") return readJpegInfo(buffer);
  return null;
}

/**
 * @returns {{ ok: boolean, hardFailures: string[], warnings: string[], metrics: object }}
 * `hardFailures` block the upload outright; `warnings` are shown to the
 * applicant and recorded as flags for the reviewer.
 */
export function inspectUpload(buffer, mimeType) {
  const hardFailures = [];
  const warnings = [];
  const metrics = { bytes: buffer.length };

  if (buffer.length > SIZE_LIMITS.maxBytes) {
    hardFailures.push(
      `File is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. The limit is ${SIZE_LIMITS.maxBytes / 1024 / 1024} MB — rescan at 200 DPI in black and white, or save as PDF.`
    );
  } else if (buffer.length > SIZE_LIMITS.warnBytes) {
    warnings.push("File is very large and may be slow to open for the reviewer.");
  }

  if (mimeType === "application/pdf") {
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      hardFailures.push("This file is named as a PDF but its contents are not a PDF.");
    }
    metrics.kind = "pdf";
    return { ok: hardFailures.length === 0, hardFailures, warnings, metrics };
  }

  if (buffer.length < SIZE_LIMITS.imageWarnBytes) {
    warnings.push(
      `The scan is only ${Math.round(buffer.length / 1024)} KB. Check that small print is legible before submitting.`
    );
  }

  const size = readImageSize(buffer, mimeType);
  metrics.kind = "image";

  if (!size) {
    hardFailures.push("The image could not be read. Re-save it as a standard JPG or PNG and try again.");
    return { ok: false, hardFailures, warnings, metrics };
  }

  const megapixels = (size.width * size.height) / 1e6;
  const dpi = Math.round(Math.min(size.width / A4_WIDTH_INCHES, size.height / A4_HEIGHT_INCHES));
  Object.assign(metrics, { width: size.width, height: size.height, megapixels: Number(megapixels.toFixed(2)), estimatedDpi: dpi });

  if (size.width < IMAGE_LIMITS.minWidth || size.height < IMAGE_LIMITS.minHeight) {
    hardFailures.push(
      `Image is ${size.width}x${size.height} pixels. A certificate needs at least ${IMAGE_LIMITS.minWidth}x${IMAGE_LIMITS.minHeight} to stay readable — rescan at 200 DPI.`
    );
  } else if (dpi < IMAGE_LIMITS.minDpi) {
    hardFailures.push(
      `Scan resolution works out to about ${dpi} DPI for an A4 page. Rescan at ${IMAGE_LIMITS.recommendedDpi} DPI or higher.`
    );
  } else if (dpi < IMAGE_LIMITS.recommendedDpi) {
    warnings.push(`Scan is about ${dpi} DPI. ${IMAGE_LIMITS.recommendedDpi} DPI is recommended for small print.`);
  }

  if (megapixels < IMAGE_LIMITS.minMegapixels && !hardFailures.length) {
    warnings.push("Image is low detail — check that register numbers and dates are legible before submitting.");
  }

  // Empirically, JPEG quantisation averages above ~40 correspond to visibly
  // mushy text; above ~60 the document is usually a re-compressed screenshot.
  if (size.avgQuantisation != null) {
    metrics.avgQuantisation = Number(size.avgQuantisation.toFixed(1));
    if (size.avgQuantisation > 60) {
      hardFailures.push(
        "This image has been compressed so heavily that text will not be reliable. Upload the original scan rather than a forwarded or screenshotted copy."
      );
    } else if (size.avgQuantisation > 40) {
      warnings.push("Image shows heavy compression artefacts — the original scan would be clearer.");
    }
  }

  // A very large page rendered into very few bytes means almost no real detail.
  const bytesPerMegapixel = buffer.length / Math.max(megapixels, 0.01);
  metrics.bytesPerMegapixel = Math.round(bytesPerMegapixel);
  if (megapixels > 1 && bytesPerMegapixel < 40 * 1024) {
    warnings.push("Very little image detail for this page size — confirm the scan is sharp.");
  }

  return { ok: hardFailures.length === 0, hardFailures, warnings, metrics };
}
