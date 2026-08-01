// Course eligibility for TNTEU's B.Ed and M.Ed programmes.
//
// These are the published admission norms expressed as arithmetic. There is no
// discretion in this file: given the same declared marks and category it always
// returns the same answer, and it says exactly which rule failed. Anything
// requiring judgement (is this marksheet genuine? is this an equivalent degree?)
// stays with the TNTEU reviewer.
//
// Marks are self-declared at application time and cross-checked against the
// uploaded documents by a human before enrolment — so this gate is provisional
// until every required document is verified.

// Relaxed qualifying mark for TN reserved categories.
const RESERVED_CATEGORIES = ["SC", "SCA", "ST", "BC", "BCM", "MBC", "DNC"];

export const ELIGIBILITY_RULES = {
  BEd: {
    label: "B.Ed (Bachelor of Education)",
    generalMinimum: 50,
    reservedMinimum: 45,
    qualifyingField: "ugPercentage",
    qualifyingLabel: "undergraduate degree",
    requires: ["tenthPercentage", "twelfthPercentage", "ugPercentage"],
  },
  MEd: {
    label: "M.Ed (Master of Education)",
    generalMinimum: 50,
    reservedMinimum: 45,
    qualifyingField: "bedPercentage",
    qualifyingLabel: "B.Ed degree",
    requires: ["tenthPercentage", "twelfthPercentage", "ugPercentage", "bedPercentage"],
  },
};

const FIELD_LABELS = {
  tenthPercentage: "10th standard percentage",
  twelfthPercentage: "12th standard percentage",
  ugPercentage: "undergraduate degree percentage",
  bedPercentage: "B.Ed degree percentage",
};

export function isReservedCategory(category) {
  return RESERVED_CATEGORIES.includes(String(category || "").toUpperCase().trim());
}

export function qualifyingMinimumFor(program, category) {
  const rule = ELIGIBILITY_RULES[program] || ELIGIBILITY_RULES.BEd;
  return isReservedCategory(category) ? rule.reservedMinimum : rule.generalMinimum;
}

function parsePercentage(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number;
}

/**
 * @param {object} applicant  program, category and the declared marks
 * @returns {{
 *   eligible: boolean, program: string, minimumRequired: number,
 *   checks: Array<{ rule: string, label: string, passed: boolean, detail: string }>,
 *   blockers: string[], missing: string[]
 * }}
 */
export function evaluateEligibility(applicant = {}) {
  const program = ELIGIBILITY_RULES[applicant.program] ? applicant.program : "BEd";
  const rule = ELIGIBILITY_RULES[program];
  const minimum = qualifyingMinimumFor(program, applicant.category);
  const reserved = isReservedCategory(applicant.category);

  const checks = [];
  const blockers = [];
  const missing = [];

  for (const field of rule.requires) {
    const value = parsePercentage(applicant[field]);

    if (value === null) {
      missing.push(field);
      checks.push({
        rule: field,
        label: FIELD_LABELS[field],
        passed: false,
        detail: "Not declared yet",
      });
      continue;
    }

    if (value < 0 || value > 100) {
      blockers.push(`${FIELD_LABELS[field]} must be between 0 and 100.`);
      checks.push({ rule: field, label: FIELD_LABELS[field], passed: false, detail: `${value}% is not a valid percentage` });
      continue;
    }

    // 10th and 12th only have to be passed; the qualifying degree carries the
    // percentage requirement.
    if (field === "tenthPercentage" || field === "twelfthPercentage") {
      const passed = value >= 35;
      if (!passed) blockers.push(`${FIELD_LABELS[field]} of ${value}% is below the pass mark of 35%.`);
      checks.push({
        rule: field,
        label: FIELD_LABELS[field],
        passed,
        detail: passed ? `${value}% — pass` : `${value}% — below the 35% pass mark`,
      });
      continue;
    }

    if (field === rule.qualifyingField) {
      const passed = value >= minimum;
      if (!passed) {
        blockers.push(
          `${rule.label} needs at least ${minimum}% in the ${rule.qualifyingLabel}${reserved ? " (relaxed rate for your category)" : ""}. You declared ${value}%.`
        );
      }
      checks.push({
        rule: field,
        label: `${FIELD_LABELS[field]} (minimum ${minimum}%)`,
        passed,
        detail: passed ? `${value}% — meets the ${minimum}% requirement` : `${value}% — short of the ${minimum}% requirement`,
      });
      continue;
    }

    // A prerequisite that only has to exist and be a pass (UG for M.Ed).
    const passed = value >= 35;
    if (!passed) blockers.push(`${FIELD_LABELS[field]} of ${value}% is below the pass mark.`);
    checks.push({
      rule: field,
      label: FIELD_LABELS[field],
      passed,
      detail: passed ? `${value}% — pass` : `${value}% — below the pass mark`,
    });
  }

  return {
    eligible: blockers.length === 0 && missing.length === 0,
    program,
    programLabel: rule.label,
    minimumRequired: minimum,
    reservedRate: reserved,
    checks,
    blockers,
    missing,
  };
}
