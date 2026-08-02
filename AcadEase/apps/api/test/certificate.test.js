import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { toPublicStoragePath } from "../src/utils/certificate.js";
import { downloadCertificate } from "../src/controllers/certificateController.js";
import Certificate from "../src/models/Certificate.js";

test("converts generated certificate paths into public storage paths", () => {
  const absolutePath = path.resolve("storage/certificates/sample.pdf");
  assert.equal(toPublicStoragePath(absolutePath), "storage/certificates/sample.pdf");
});

test("downloadCertificate serves the PDF file instead of exposing a raw storage URL", async () => {
  const originalFindOne = Certificate.findOne;
  const targetPath = path.resolve("storage/certificates/test-cert.pdf");

  // The file has to actually exist: downloadCertificate now refuses to serve a
  // record whose stored PDF is missing, rather than throwing from res.download.
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, "%PDF-1.4 unit test fixture");

  Certificate.findOne = async () => ({
    certId: "cert-123",
    studentId: "student-42",
    pdfPath: targetPath,
    downloadUrlExpiresAt: new Date(Date.now() + 60_000),
    downloadCount: 0,
    save: async function () { this.downloadCount += 1; },
  });

  try {
    let downloadCalled = false;
    let downloadPath = null;
    const req = {
      params: { certId: "cert-123" },
      user: { userId: "student-42", role: "student" },
    };
    const res = {
      download(filePath, filename) {
        downloadCalled = true;
        downloadPath = filePath;
        return { filePath, filename };
      },
      json(payload) {
        throw new Error(`Unexpected JSON response: ${JSON.stringify(payload)}`);
      },
      status(code) {
        throw new Error(`Unexpected status ${code}`);
      },
    };

    await downloadCertificate(req, res);

    assert.equal(downloadCalled, true);
    assert.equal(downloadPath, targetPath);
  } finally {
    Certificate.findOne = originalFindOne;
    fs.rmSync(targetPath, { force: true });
  }
});

// On a host with an ephemeral filesystem the database row outlives the file.
// That must read as "the PDF is gone", not as "your certificate is invalid" —
// the record still verifies at its public link.
test("downloadCertificate reports a missing PDF instead of throwing", async () => {
  const originalFindOne = Certificate.findOne;
  Certificate.findOne = async () => ({
    certId: "cert-missing",
    studentId: "student-42",
    pdfPath: path.resolve("storage/certificates/definitely-not-here.pdf"),
    downloadUrlExpiresAt: new Date(Date.now() + 60_000),
    downloadCount: 0,
    save: async function () { this.downloadCount += 1; },
  });

  try {
    let statusCode = null;
    let payload = null;
    const res = {
      download() { throw new Error("must not attempt to send a file that is not there"); },
      status(code) { statusCode = code; return this; },
      json(body) { payload = body; return this; },
    };

    await downloadCertificate(
      { params: { certId: "cert-missing" }, user: { userId: "student-42", role: "student" } },
      res
    );

    assert.equal(statusCode, 410);
    assert.match(payload.error, /no longer on the server/i);
    // The student is pointed at the thing that does still work.
    assert.equal(payload.verifyPath, "/verify/cert-missing");
  } finally {
    Certificate.findOne = originalFindOne;
  }
});
