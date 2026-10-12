/**
 * Guided application form schemas: what the server accepts, and what it must
 * reject. These run against the real Zod schemas used by the submit action.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSchema, getSteps, isFormKind, categoryFor, FORM_KINDS } from "../../src/lib/application-forms.ts";

const validTourist = {
  full_name: "Test Applicant",
  email: "applicant@example.com",
  phone: "+8801700000000",
  nationality_country: "BD",
  residence_country: "BD",
  destination_country: "TH",
  travel_date: "2027-03-01",
  passport_no: "AB0123456",
  passport_issue_date: "2020-01-01",
  passport_expiry_date: "2030-01-01",
  stay_length_days: "7",
  travel_purpose: "tourism",
  funding_source: "self",
  employment_status: "employed",
  declaration_accuracy: "on",
  declaration_terms: "on",
};

test("tourist schema accepts a complete valid submission", () => {
  const r = getSchema("tourist").safeParse(validTourist);
  assert.equal(r.success, true);
});

test("tourist schema rejects when declarations are unchecked", () => {
  const r = getSchema("tourist").safeParse({ ...validTourist, declaration_accuracy: false });
  assert.equal(r.success, false);
});

test("tourist schema rejects a bad email and reports the field", () => {
  const r = getSchema("tourist").safeParse({ ...validTourist, email: "not-an-email" });
  assert.equal(r.success, false);
  if (!r.success) {
    assert.ok(r.error.issues.some((i) => i.path[0] === "email"));
  }
});

test("tourist schema rejects non-date travel_date values", () => {
  const r = getSchema("tourist").safeParse({ ...validTourist, travel_date: "tomorrow" });
  assert.equal(r.success, false);
});

test("student schema requires institution and course", () => {
  const base = {
    full_name: "Test Applicant",
    email: "s@example.com",
    phone: "+8801700000000",
    nationality_country: "BD",
    residence_country: "BD",
    destination_country: "GB",
    passport_no: "AB0123456",
    passport_issue_date: "2020-01-01",
    passport_expiry_date: "2030-01-01",
    highest_qualification: "HSC",
    funding_source: "self",
    declaration_accuracy: "on",
    declaration_terms: "on",
  };
  assert.equal(getSchema("student").safeParse(base).success, false);
  assert.equal(
    getSchema("student").safeParse({ ...base, institution_name: "UCL", course_name: "MSc Data Science", degree_level: "master" }).success,
    true,
  );
});

test("work schema rejects a missing job category", () => {
  const base = {
    full_name: "Test Applicant",
    email: "w@example.com",
    phone: "+8801700000000",
    nationality_country: "BD",
    residence_country: "BD",
    destination_country: "AE",
    travel_date: "2027-06-01",
    passport_no: "AB0123456",
    passport_issue_date: "2020-01-01",
    passport_expiry_date: "2030-01-01",
    job_title: "Welder",
    experience_years: "5",
    declaration_accuracy: "on",
    declaration_terms: "on",
  };
  const missing = getSchema("work").safeParse(base);
  assert.equal(missing.success, false);
  const complete = getSchema("work").safeParse({ ...base, job_category: "manufacturing" });
  assert.equal(complete.success, true);
});

test("every form kind has steps ending with declarations", () => {
  for (const f of FORM_KINDS) {
    assert.equal(isFormKind(f.kind), true);
    const steps = getSteps(f.kind);
    assert.ok(steps.length >= 3);
    assert.equal(steps[steps.length - 1].key, "declarations");
  }
});

test("form kinds map onto existing visa category codes", () => {
  for (const f of FORM_KINDS) {
    assert.ok(categoryFor(f.kind).length >= 4);
  }
  assert.equal(categoryFor("work"), "work");
  assert.equal(categoryFor("tourist"), "tourist");
});
