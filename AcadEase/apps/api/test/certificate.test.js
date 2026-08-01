import test from "node:test";
import assert from "node:assert/strict";
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
  }
});
