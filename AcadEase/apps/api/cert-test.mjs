import fs from 'fs';
import path from 'path';
import { generateCertificatePdf } from './src/utils/certificateGenerator.js';
import { verifyCertificate } from './src/utils/verifyCertificate.js';

async function run() {
  try {
    console.log('\n=== Certificate Generation & Verification Test ===\n');

    // 1) Generate PDF
    const input = {
      studentName: 'Alice Example',
      studentId: 'S2026001',
      department: 'Computer Science',
      institution: 'Example University',
      cgpa: '9.25',
      certificateId: 'EX-2026-001',
      issueDate: '2026-07-31'
    };

    console.log('Generating certificate PDF...');
    const result = await generateCertificatePdf(input);
    console.log('\nGenerated:');
    console.log(' filePath :', result.filePath);
    console.log(' fileName :', result.fileName);
    console.log(' storagePath :', result.storagePath);
    console.log(' hash :', result.hash);

    // 2) Verify generated PDF (should be authentic)
    console.log('\nVerifying original certificate...');
    const verification = await verifyCertificate({ uploadedCertificate: result.filePath, originalHash: result.hash });
    console.log(' Verification (original):', verification);

    // 3) Optional: tamper file and verify it fails
    const tamperedPath = path.join(path.dirname(result.filePath), 'TAMPERED_' + result.fileName);
    const buf = fs.readFileSync(result.filePath);

    // Safely tamper by flipping a byte if file is large enough
    const tamperBuf = Buffer.from(buf);
    if (tamperBuf.length > 120) {
      tamperBuf[100] = (tamperBuf[100] + 1) & 0xff;
    } else {
      // If unexpectedly small, append a byte
      const extra = Buffer.from([0x00]);
      const nb = Buffer.concat([tamperBuf, extra]);
      tamperBuf.set(nb);
    }
    fs.writeFileSync(tamperedPath, tamperBuf);

    console.log('\nVerifying tampered certificate...');
    const verificationTampered = await verifyCertificate({ uploadedCertificate: tamperedPath, originalHash: result.hash });
    console.log(' Verification (tampered):', verificationTampered);

    console.log('\nFiles created:');
    console.log(' - original:', result.filePath);
    console.log(' - tampered:', tamperedPath);

    console.log('\n=== Test complete ===\n');
  } catch (err) {
    console.error('Error during test:', err);
    process.exitCode = 1;
  }
}

run();
