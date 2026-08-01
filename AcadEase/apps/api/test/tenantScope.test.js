import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/models/User.js';
import { buildCollegeScope, isCollegeScopedRole } from '../src/middleware/auth.js';

test('tenants use collegeId and TNTEU roles', () => {
  const enumValues = User.schema.path('role').enumValues;
  assert.ok(enumValues.includes('college_admin'));
  assert.ok(enumValues.includes('tnteu_admin'));
  assert.ok(isCollegeScopedRole('college_admin'));
  assert.deepEqual(buildCollegeScope({ role: 'college_admin', collegeId: 'TNTEU_COL_0417' }), {
    collegeId: 'TNTEU_COL_0417',
  });
});
