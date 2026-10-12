import { z } from "zod";

/**
 * Purpose-specific guided application forms.
 *
 * One declarative field list drives the UI (steps, conditional display,
 * bilingual labels, review screen) and one Zod schema per form validates the
 * submitted data server-side. Fields marked `conditionalOn` render only when
 * the referenced field has the given value, so applicants never see irrelevant
 * questions.
 *
 * Nothing here asserts government requirements: document lists describe what
 * our case officers ask for, and every listing in the catalog carries its own
 * official source.
 */

export type FormKind =
  | "work"
  | "student"
  | "tourist"
  | "business"
  | "family"
  | "transit"
  | "medical"
  | "other";

export const FORM_KINDS: { kind: FormKind; categoryCode: string; labelEn: string; labelBn: string; blurbEn: string }[] = [
  { kind: "work", categoryCode: "work", labelEn: "Work visa", labelBn: "কর্ম ভিসা", blurbEn: "Employment abroad with a job offer or work permit." },
  { kind: "student", categoryCode: "student", labelEn: "Student visa", labelBn: "শিক্ষার্থী ভিসা", blurbEn: "Study at a recognized institution overseas." },
  { kind: "tourist", categoryCode: "tourist", labelEn: "Tourist / visitor", labelBn: "পর্যটন / ভিজিটর", blurbEn: "Tourism, visiting family or friends." },
  { kind: "business", categoryCode: "business", labelEn: "Business travel", labelBn: "ব্যবসায়িক ভ্রমণ", blurbEn: "Meetings, conferences, investment visits." },
  { kind: "family", categoryCode: "family", labelEn: "Family visit / joining", labelBn: "পরিবার ভিজিট", blurbEn: "Visiting or joining family members abroad." },
  { kind: "transit", categoryCode: "transit", labelEn: "Transit", labelBn: "ট্রানজিট", blurbEn: "Passing through en route to another destination." },
  { kind: "medical", categoryCode: "medical", labelEn: "Medical travel", labelBn: "চিকিৎসা ভ্রমণ", blurbEn: "Treatment at a hospital or clinic abroad." },
  { kind: "other", categoryCode: "other", labelEn: "Other / not sure", labelBn: "অন্যান্য", blurbEn: "Describe your plan and we will guide you." },
];

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "select"
  | "textarea"
  | "checkbox";

export interface FormField {
  name: string;
  type: FieldType;
  labelEn: string;
  labelBn: string;
  helpEn?: string;
  helpBn?: string;
  required?: boolean;
  optionsEn?: { value: string; label: string }[];
  /** Show this field only when the named field has one of these values. */
  conditionalOn?: { field: string; equals: string[] };
  maxLength?: number;
  min?: string;
}

export interface FormStep {
  key: string;
  titleEn: string;
  titleBn: string;
  fields: FormField[];
}

const EMPTY_TO_UNDEFINED = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = (schema: z.ZodString) => z.preprocess(EMPTY_TO_UNDEFINED, schema.optional());

const reqText = (max = 200) => z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(max));
const optText = (max = 200) => z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(max).optional());
const reqDate = () => z.preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined), z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const optDate = () => z.preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
const reqEmail = () => z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.string().email());
const reqSelect = (values: string[]) => z.preprocess(EMPTY_TO_UNDEFINED, z.enum(values as [string, ...string[]]));
const optSelect = (values: string[]) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.enum(values as [string, ...string[]]).optional());
const optBool = () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
/** Checkbox value normalized from form strings to the required `true` literal. */
const reqBool = () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.literal(true));

/** Passport block shared by every guided form. */
const passportFields: FormField[] = [
  { name: "passport_no", type: "text", labelEn: "Passport number", labelBn: "পাসপোর্ট নম্বর", required: true, maxLength: 30 },
  { name: "passport_issue_date", type: "date", labelEn: "Passport issue date", labelBn: "পাসপোর্ট ইস্যুর তারিখ", required: true },
  { name: "passport_expiry_date", type: "date", labelEn: "Passport expiry date", labelBn: "পাসপোর্ট মেয়াদোত্তীর্ণের তারিখ", required: true, helpEn: "Most destinations require validity of at least 6 months beyond your travel date.", helpBn: "বেশিরভাগ গন্তব্যে ভ্রমণের তারিখের পর কমপক্ষে ৬ মাস মেয়াদ প্রয়োজন।" },
  { name: "passport_place_of_issue", type: "text", labelEn: "Place of issue", labelBn: "ইস্যুর স্থান", maxLength: 120 },
];

/** Common declarations step. */
const declarationFields: FormField[] = [
  { name: "declaration_accuracy", type: "checkbox", labelEn: "I declare that the information I have given is true and complete.", labelBn: "আমি ঘোষণা করছি যে আমি প্রদত্ত তথ্য সত্য ও সম্পূর্ণ।", required: true },
  { name: "declaration_terms", type: "checkbox", labelEn: "I understand that no visa outcome is guaranteed and that official decisions rest with the authorities.", labelBn: "আমি বুঝি যে ভিসার ফলাফল নিশ্চিত নয় এবং চূড়ান্ত সিদ্ধান্ত কর্তৃপক্ষের।", required: true },
];

const schemas: Partial<Record<FormKind, z.ZodTypeAny>> = {
  work: z.object({
    full_name: reqText(160),
    email: reqEmail(),
    phone: reqText(40),
    nationality_country: reqText(2),
    residence_country: reqText(2),
    destination_country: reqText(2),
    origin_city: optText(120),
    travel_date: reqDate(),
    ...passportFields.reduce((acc, f) => ({ ...acc, [f.name]: f.required ? reqText(60) : optText(120) }), {} as Record<string, z.ZodTypeAny>),
    passport_issue_date: reqDate(),
    passport_expiry_date: reqDate(),
    job_title: reqText(160),
    job_category: reqSelect(["construction","healthcare","domestic","hospitality","agriculture","manufacturing","transport","it","education","other"]),
    experience_years: z.preprocess((v) => Number(v), z.number().min(0).max(60)),
    qualifications: optText(600),
    has_job_offer: optBool(),
    employer_name: optText(200),
    employer_country: optText(80),
    work_permit_details: optText(600),
    documents_ready: optText(600),
    declaration_accuracy: reqBool(),
    declaration_terms: reqBool(),
  }),
  student: z.object({
    full_name: reqText(160),
    email: reqEmail(),
    phone: reqText(40),
    nationality_country: reqText(2),
    residence_country: reqText(2),
    destination_country: reqText(2),
    origin_city: optText(120),
    travel_date: optDate(),
    ...passportFields.reduce((acc, f) => ({ ...acc, [f.name]: f.required ? reqText(60) : optText(120) }), {} as Record<string, z.ZodTypeAny>),
    passport_issue_date: reqDate(),
    passport_expiry_date: reqDate(),
    institution_name: reqText(200),
    course_name: reqText(200),
    degree_level: reqSelect(["foundation","diploma","bachelor","master","phd","language","other"]),
    intended_intake: optText(40),
    has_admission_offer: optBool(),
    funding_source: reqSelect(["self","parents","sponsor","scholarship","mixed"]),
    sponsor_name: optText(160),
    english_test: optSelect(["ielts","toefl","pte","duolingo","none","pending"]),
    english_score: optText(20),
    highest_qualification: reqText(200),
    declaration_accuracy: reqBool(),
    declaration_terms: reqBool(),
  }),
  tourist: z.object({
    full_name: reqText(160),
    email: reqEmail(),
    phone: reqText(40),
    nationality_country: reqText(2),
    residence_country: reqText(2),
    destination_country: reqText(2),
    origin_city: optText(120),
    travel_date: reqDate(),
    return_date: optDate(),
    ...passportFields.reduce((acc, f) => ({ ...acc, [f.name]: f.required ? reqText(60) : optText(120) }), {} as Record<string, z.ZodTypeAny>),
    passport_issue_date: reqDate(),
    passport_expiry_date: reqDate(),
    stay_length_days: z.preprocess((v) => Number(v), z.number().int().min(1).max(365)),
    travel_purpose: reqSelect(["tourism","family_visit","friends_visit","honeymoon","other"]),
    itinerary_notes: optText(800),
    accommodation_details: optText(300),
    funding_source: reqSelect(["self","sponsored","mixed"]),
    sponsor_name: optText(160),
    employment_status: reqSelect(["employed","self_employed","student","retired","unemployed"]),
    has_travel_insurance: optBool(),
    visited_before: optBool(),
    declaration_accuracy: reqBool(),
    declaration_terms: reqBool(),
  }),
};

// business / family / transit / medical / other share the tourist skeleton with
// an extra purpose field; their Zod schemas derive from the same base.
const simplePurposes: FormKind[] = ["business", "family", "transit", "medical", "other"];
for (const kind of simplePurposes) {
  schemas[kind] = z.object({
    full_name: reqText(160),
    email: reqEmail(),
    phone: reqText(40),
    nationality_country: reqText(2),
    residence_country: reqText(2),
    destination_country: reqText(2),
    origin_city: optText(120),
    travel_date: reqDate(),
    return_date: optDate(),
    ...passportFields.reduce((acc, f) => ({ ...acc, [f.name]: f.required ? reqText(60) : optText(120) }), {} as Record<string, z.ZodTypeAny>),
    passport_issue_date: reqDate(),
    passport_expiry_date: reqDate(),
    purpose_detail: reqText(800),
    funding_source: reqSelect(["self","sponsored","mixed"]),
    sponsor_name: optText(160),
    declaration_accuracy: reqBool(),
    declaration_terms: reqBool(),
  });
}

export function getSchema(kind: FormKind): z.ZodTypeAny {
  const schema = schemas[kind];
  if (!schema) throw new Error(`No schema for form kind: ${kind}`);
  return schema;
}

/** Which category each form posts under (applications.category_code). */
export function categoryFor(kind: FormKind): string {
  return FORM_KINDS.find((f) => f.kind === kind)?.categoryCode ?? "other";
}

const passportStep: FormStep = {
  key: "passport",
  titleEn: "Passport",
  titleBn: "পাসপোর্ট",
  fields: passportFields,
};
const declarationsStep: FormStep = {
  key: "declarations",
  titleEn: "Declarations",
  titleBn: "ঘোষণা",
  fields: declarationFields,
};

const contactFields: FormField[] = [
  { name: "full_name", type: "text", labelEn: "Full name (as in passport)", labelBn: "পুরো নাম (পাসপোর্ট অনুযায়ী)", required: true, maxLength: 160 },
  { name: "email", type: "email", labelEn: "Email", labelBn: "ইমেইল", required: true },
  { name: "phone", type: "tel", labelEn: "Phone / WhatsApp", labelBn: "ফোন / হোয়াটসঅ্যাপ", required: true, maxLength: 40 },
  { name: "nationality_country", type: "select", labelEn: "Nationality", labelBn: "জাতীয়তা", required: true },
  { name: "residence_country", type: "select", labelEn: "Country of residence", labelBn: "আবাসের দেশ", required: true },
  { name: "origin_city", type: "text", labelEn: "Departure city", labelBn: "প্রস্থানের শহর", maxLength: 120 },
];

const tripFields: FormField[] = [
  { name: "destination_country", type: "select", labelEn: "Destination country", labelBn: "গন্তব্যের দেশ", required: true },
  { name: "travel_date", type: "date", labelEn: "Intended travel date", labelBn: "ভ্রমণের তারিখ", required: true },
];

const fundingFields: FormField[] = [
  { name: "funding_source", type: "select", labelEn: "How will the trip be funded?", labelBn: "ভ্রমণের খরচ কীভাবে বহন হবে?", required: true, optionsEn: [
    { value: "self", label: "Self-funded" },
    { value: "sponsored", label: "Sponsored by a person or organization" },
    { value: "mixed", label: "Mixed" },
  ]},
  { name: "sponsor_name", type: "text", labelEn: "Sponsor name", labelBn: "স্পন্সরের নাম", conditionalOn: { field: "funding_source", equals: ["sponsored", "mixed"] }, maxLength: 160 },
];

const steps: Partial<Record<FormKind, FormStep[]>> = {
  work: [
    { key: "applicant", titleEn: "Applicant", titleBn: "আবেদনকারী", fields: contactFields },
    { key: "trip", titleEn: "Trip & employment", titleBn: "ভ্রমণ ও কর্মসংস্থান", fields: [
      ...tripFields,
      { name: "job_title", type: "text", labelEn: "Occupation / job title", labelBn: "পেশা / পদের নাম", required: true, maxLength: 160 },
      { name: "job_category", type: "select", labelEn: "Job category", labelBn: "কাজের ধরন", required: true, optionsEn: [
        { value: "construction", label: "Construction & engineering" },
        { value: "healthcare", label: "Healthcare" },
        { value: "domestic", label: "Domestic work" },
        { value: "hospitality", label: "Hospitality & tourism" },
        { value: "agriculture", label: "Agriculture" },
        { value: "manufacturing", label: "Manufacturing" },
        { value: "transport", label: "Transport & driving" },
        { value: "it", label: "IT & technology" },
        { value: "education", label: "Education" },
        { value: "other", label: "Other" },
      ]},
      { name: "experience_years", type: "text", labelEn: "Years of experience", labelBn: "অভিজ্ঞতার বছর", required: true },
      { name: "qualifications", type: "textarea", labelEn: "Qualifications & training", labelBn: "শিক্ষাগত যোগ্যতা ও প্রশিক্ষণ", maxLength: 600 },
      { name: "has_job_offer", type: "checkbox", labelEn: "I have a job offer or employment contract", labelBn: "আমার কাজের অফার বা চুক্তি আছে" },
      { name: "employer_name", type: "text", labelEn: "Employer / sponsor name", labelBn: "নিয়োগকর্তার নাম", conditionalOn: { field: "has_job_offer", equals: ["on", "true"] }, maxLength: 200 },
      { name: "employer_country", type: "text", labelEn: "Employer country", labelBn: "নিয়োগকর্তার দেশ", conditionalOn: { field: "has_job_offer", equals: ["on", "true"] }, maxLength: 80 },
      { name: "work_permit_details", type: "textarea", labelEn: "Work permit / sponsorship details (if any)", labelBn: "ওয়ার্ক পারমিট / স্পন্সরশিপের বিবরণ (থাকলে)", maxLength: 600, helpEn: "Leave blank if the employer is still arranging this.", helpBn: "নিয়োগকর্তা এখনও এটি সাজাচ্ছেন হলে খালি রাখুন।" },
    ]},
    passportStep,
    { key: "documents", titleEn: "Documents", titleBn: "ডকুমেন্ট", fields: [
      { name: "documents_ready", type: "textarea", labelEn: "Which documents do you already have ready?", labelBn: "আপনার কাছে ইতিমধ্যে কোন ডকুমেন্ট প্রস্তুত আছে?", maxLength: 600, helpEn: "Your case officer confirms the exact list after submission — requirements depend on the destination.", helpBn: "জমা দেওয়ার পর কেস অফিসার সঠিক তালিকা নিশ্চিত করবেন — প্রয়োজনীয়তা গন্তব্যের উপর নির্ভর করে।" },
    ]},
    declarationsStep,
  ],
  student: [
    { key: "applicant", titleEn: "Applicant", titleBn: "আবেদনকারী", fields: contactFields },
    { key: "study", titleEn: "Study plan", titleBn: "পড়াশোনার পরিকল্পনা", fields: [
      { name: "destination_country", type: "select", labelEn: "Destination country", labelBn: "গন্তব্যের দেশ", required: true },
      { name: "intended_intake", type: "text", labelEn: "Intended intake (e.g. September 2027)", labelBn: "ভর্তির সময় (যেমন সেপ্টেম্বর ২০২৭)", maxLength: 40 },
      { name: "institution_name", type: "text", labelEn: "Institution", labelBn: "প্রতিষ্ঠান", required: true, maxLength: 200 },
      { name: "course_name", type: "text", labelEn: "Course", labelBn: "কোর্স", required: true, maxLength: 200 },
      { name: "degree_level", type: "select", labelEn: "Level", labelBn: "স্তর", required: true, optionsEn: [
        { value: "foundation", label: "Foundation" },
        { value: "diploma", label: "Diploma" },
        { value: "bachelor", label: "Bachelor" },
        { value: "master", label: "Master" },
        { value: "phd", label: "PhD" },
        { value: "language", label: "Language course" },
        { value: "other", label: "Other" },
      ]},
      { name: "has_admission_offer", type: "checkbox", labelEn: "I have an admission or acceptance letter", labelBn: "আমার ভর্তির চিঠি আছে" },
      { name: "highest_qualification", type: "text", labelEn: "Highest qualification completed", labelBn: "সর্বোচ্চ শিক্ষাগত যোগ্যতা", required: true, maxLength: 200 },
      { name: "english_test", type: "select", labelEn: "English test", labelBn: "ইংরেজি পরীক্ষা", optionsEn: [
        { value: "ielts", label: "IELTS" },
        { value: "toefl", label: "TOEFL" },
        { value: "pte", label: "PTE" },
        { value: "duolingo", label: "Duolingo" },
        { value: "pending", label: "Booked / not taken yet" },
        { value: "none", label: "None" },
      ]},
      { name: "english_score", type: "text", labelEn: "Score", labelBn: "স্কোর", conditionalOn: { field: "english_test", equals: ["ielts", "toefl", "pte", "duolingo"] }, maxLength: 20 },
    ]},
    { key: "funding", titleEn: "Funding", titleBn: "অর্থায়ন", fields: [
      { name: "funding_source", type: "select", labelEn: "How will tuition and living costs be funded?", labelBn: "টিউশন ও জীবনযাত্রার খরচ কীভাবে বহন হবে?", required: true, optionsEn: [
        { value: "self", label: "Self / family" },
        { value: "sponsor", label: "Sponsor" },
        { value: "scholarship", label: "Scholarship" },
        { value: "mixed", label: "Mixed" },
      ]},
      { name: "sponsor_name", type: "text", labelEn: "Sponsor name", labelBn: "স্পন্সরের নাম", conditionalOn: { field: "funding_source", equals: ["sponsor", "mixed"] }, maxLength: 160 },
    ]},
    passportStep,
    declarationsStep,
  ],
  tourist: [
    { key: "applicant", titleEn: "Applicant", titleBn: "আবেদনকারী", fields: contactFields },
    { key: "trip", titleEn: "Trip", titleBn: "ভ্রমণ", fields: [
      ...tripFields,
      { name: "return_date", type: "date", labelEn: "Return date", labelBn: "ফিরের তারিখ" },
      { name: "stay_length_days", type: "text", labelEn: "Length of stay (days)", labelBn: "অবস্থানের দৈর্ঘ্য (দিন)", required: true },
      { name: "travel_purpose", type: "select", labelEn: "Main purpose", labelBn: "মূল উদ্দেশ্য", required: true, optionsEn: [
        { value: "tourism", label: "Tourism" },
        { value: "family_visit", label: "Visiting family" },
        { value: "friends_visit", label: "Visiting friends" },
        { value: "honeymoon", label: "Honeymoon" },
        { value: "other", label: "Other" },
      ]},
      { name: "itinerary_notes", type: "textarea", labelEn: "Planned destinations / itinerary", labelBn: "পরিকল্পিত গন্তব্য / ভ্রমণসূচি", maxLength: 800 },
      { name: "accommodation_details", type: "textarea", labelEn: "Accommodation (hotel bookings or host)", labelBn: "থাকার ব্যবস্থা (হোটেল বুকিং বা হোস্ট)", maxLength: 300 },
    ]},
    { key: "background", titleEn: "Background", titleBn: "পটভূমি", fields: [
      { name: "employment_status", type: "select", labelEn: "Employment status", labelBn: "কর্মসংস্থান অবস্থা", required: true, optionsEn: [
        { value: "employed", label: "Employed" },
        { value: "self_employed", label: "Self-employed" },
        { value: "student", label: "Student" },
        { value: "retired", label: "Retired" },
        { value: "unemployed", label: "Not currently employed" },
      ]},
      ...fundingFields,
      { name: "has_travel_insurance", type: "checkbox", labelEn: "I have travel insurance", labelBn: "আমার ভ্রমণ বীমা আছে" },
      { name: "visited_before", type: "checkbox", labelEn: "I have visited this destination before", labelBn: "আমি আগে এই গন্তব্যে গিয়েছি" },
    ]},
    passportStep,
    declarationsStep,
  ],
};

// business / family / transit / medical / other: short shared flow
for (const kind of simplePurposes) {
  steps[kind] = [
    { key: "applicant", titleEn: "Applicant", titleBn: "আবেদনকারী", fields: contactFields },
    { key: "trip", titleEn: "Trip", titleBn: "ভ্রমণ", fields: [
      ...tripFields,
      { name: "return_date", type: "date", labelEn: "Return date", labelBn: "ফিরের তারিখ" },
      { name: "purpose_detail", type: "textarea", labelEn:
          kind === "business" ? "Purpose of the business visit (meetings, events, counterparties)"
          : kind === "family" ? "Who are you visiting, and how are you related?"
          : kind === "transit" ? "Final destination and transit details"
          : kind === "medical" ? "Treatment sought and the hospital or clinic (if decided)"
          : "Describe your plan",
        labelBn: "আপনার উদ্দেশ্য বিস্তারিত লিখুন", required: true, maxLength: 800 },
    ]},
    { key: "funding", titleEn: "Funding", titleBn: "অর্থায়ন", fields: fundingFields },
    passportStep,
    declarationsStep,
  ];
}

export function getSteps(kind: FormKind): FormStep[] {
  return steps[kind] ?? steps.tourist!;
}

export function isFormKind(value: string): value is FormKind {
  return FORM_KINDS.some((f) => f.kind === value);
}

/** Fields whose select options must be filled with the country list at runtime. */
export const COUNTRY_SELECT_FIELDS = new Set(["nationality_country", "residence_country", "destination_country"]);

/** Small helper vocabulary for explanations shown under fields. */
export const GLOSSARY: Record<string, { en: string; bn: string }> = {
  work_permit: {
    en: "A work permit is official permission from the destination country that lets a foreign citizen take up employment there. It is separate from the visa itself.",
    bn: "ওয়ার্ক পারমিট গন্তব্যের দেশের সরকারি অনুমতি, যা বিদেশি নাগরিককে সেখানে কাজ করতে দেয়। এটি ভিসা থেকে আলাদা।",
  },
  sponsorship: {
    en: "A sponsor is the person or organization that pays for your trip or studies and shows the money evidence for it.",
    bn: "স্পন্সর হলেন সেই ব্যক্তি বা প্রতিষ্ঠান যিনি আপনার ভ্রমণ বা পড়াশোনার খরচ বহন করেন এবং তার আর্থিক প্রমাণ দেন।",
  },
  intake: {
    en: "The intake is the semester when your course starts, for example September 2027.",
    bn: "ইনটেক হলো সেই সেমিস্টার যখন আপনার কোর্স শুরু হয়, যেমন সেপ্টেম্বর ২০২৭।",
  },
};
