import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { toPublicStoragePath } from "../src/utils/certificate.js";

test("converts generated certificate paths into public storage paths", () => {
  const absolutePath = path.resolve("storage/certificates/sample.pdf");
  assert.equal(toPublicStoragePath(absolutePath), "storage/certificates/sample.pdf");
});
