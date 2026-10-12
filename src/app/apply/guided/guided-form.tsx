"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  saveOrSubmitApplication,
  type ApplyState,
} from "../actions";
import {
  getSteps,
  COUNTRY_SELECT_FIELDS,
  type FormKind,
  type FormField,
} from "@/lib/application-forms";

interface Country {
  iso2: string;
  name: string;
}

interface Props {
  kind: FormKind;
  countries: Country[];
  locale: "en" | "bn";
  selectedVisaId: string | null;
  selectedVisaName: string | null;
  draftId: string | null;
  initialData: Record<string, unknown>;
}

const initial: ApplyState = { ok: false, error: "" };

export default function GuidedForm({
  kind,
  countries,
  locale,
  selectedVisaId,
  selectedVisaName,
  draftId,
  initialData,
}: Props) {
  const [state, formAction, pending] = useActionState(saveOrSubmitApplication, initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(initialData)) v[k] = typeof val === "string" ? val : "";
    return v;
  });

  const steps = useMemo(() => getSteps(kind), [kind]);
  const countryOptions = countries.map((c) => ({ value: c.iso2, label: c.name }));
  const lastStep = steps.length - 1;

  const L = (en: string, bn: string) => (locale === "bn" && bn ? bn : en);

  const visibleFields = (fields: FormField[]) =>
    fields.filter((f) => {
      if (!f.conditionalOn) return true;
      const current = values[f.conditionalOn.field];
      return f.conditionalOn.equals.includes(String(current ?? ""));
    });

  const reviewFields = useMemo(
    () => steps.flatMap((s) => visibleFields(s.fields)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, values],
  );

  if (state && "ok" in state && state.ok && state.reference) {
    return (
      <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <p className="font-medium text-emerald-900">{L("Application received.", "আবেদন গৃহীত হয়েছে।")}</p>
        <p className="mt-1 text-sm text-emerald-800">
          {L("Your reference number:", "আপনার রেফারেন্স নম্বর:")}{" "}
          <strong className="font-mono text-base">{state.reference}</strong>
        </p>
        <p className="mt-2 text-sm text-emerald-800">
          {L(
            "Keep this number — track progress and messages from your dashboard at any time.",
            "এই নম্বরটি সংরক্ষণ করুন — ড্যাশবোর্ড থেকে যেকোনো সময় অগ্রগতি দেখুন।",
          )}
        </p>
        <Link
          href="/account"
          className="mt-4 inline-block rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          {L("Go to my dashboard", "আমার ড্যাশবোর্ডে যান")}
        </Link>
      </div>
    );
  }

  const step = steps[stepIndex];
  const inputCls = "w-full rounded-md border border-navy-200 px-3 py-2 text-sm";

  const errorFor = (name: string) =>
    state && "fieldErrors" in state && state.fieldErrors ? state.fieldErrors[name] : undefined;

  const renderField = (f: FormField) => {
    const err = errorFor(f.name);
    const label = L(f.labelEn, f.labelBn);
    const help = f.helpEn ? L(f.helpEn, f.helpBn ?? "") : undefined;
    const options = COUNTRY_SELECT_FIELDS.has(f.name) ? countryOptions : (f.optionsEn ?? []);

    if (f.type === "checkbox") {
      return (
        <label key={f.name} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={f.name}
            defaultChecked={values[f.name] === "on" || values[f.name] === "true"}
            className="mt-1 h-4 w-4"
          />
          <span>
            {label}
            {f.required ? <span aria-hidden> *</span> : null}
            {help ? <span className="mt-0.5 block text-xs text-navy-500">{help}</span> : null}
            {err ? <span className="mt-0.5 block text-xs text-red-600">{err}</span> : null}
          </span>
        </label>
      );
    }

    return (
      <label key={f.name} className="block text-sm">
        <span className="mb-1 block font-medium">
          {label}
          {f.required ? <span aria-hidden> *</span> : <span className="text-navy-400"> ({L("optional", "ঐচ্ছিক")})</span>}
        </span>
        {f.type === "select" ? (
          <select
            name={f.name}
            defaultValue={values[f.name] ?? ""}
            className={inputCls}
            required={f.required}
          >
            <option value="" disabled>
              {L("Select…", "নির্বাচন করুন…")}
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : f.type === "textarea" ? (
          <textarea
            name={f.name}
            rows={3}
            maxLength={f.maxLength ?? 800}
            defaultValue={values[f.name] ?? ""}
            className={inputCls}
          />
        ) : (
          <input
            type={f.type}
            name={f.name}
            maxLength={f.maxLength}
            defaultValue={values[f.name] ?? ""}
            className={inputCls}
          />
        )}
        {help ? <span className="mt-1 block text-xs text-navy-500">{help}</span> : null}
        {err ? <span className="mt-1 block text-xs text-red-600">{err}</span> : null}
      </label>
    );
  };

  const onReview = stepIndex === lastStep + 1;

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="form_kind" value={kind} />
      <input type="hidden" name="application_id" value={draftId ?? ""} />
      {selectedVisaId ? <input type="hidden" name="visa_listing_id" value={selectedVisaId} /> : null}

      {/* Progress */}
      <ol className="mb-6 flex flex-wrap gap-2 text-xs" aria-label={L("Progress", "অগ্রগতি")}>
        {[...steps.map((s) => L(s.titleEn, s.titleBn)), L("Review", "পর্যালোচনা")].map((label, i) => (
          <li
            key={label}
            aria-current={i === stepIndex ? "step" : undefined}
            className={`rounded-full px-3 py-1 ${
              i === stepIndex
                ? "bg-[var(--brand-primary)] text-white"
                : i < stepIndex
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-navy-50 text-navy-500"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {state && "ok" in state && !state.ok && state.error === "validation" ? (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {L("Please correct the highlighted fields.", "হাইলাইট করা ঘরগুলো ঠিক করুন।")}
        </p>
      ) : null}
      {state && "ok" in state && !state.ok && state.error !== "validation" ? (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {L(
            "The application could not be saved right now. Please try again.",
            "আবেদন এখন সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
          )}
        </p>
      ) : null}
      {state && "saved" in state && state.saved ? (
        <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700" role="status">
          {L("Draft saved.", "ড্রাফট সংরক্ষিত হয়েছে।")}
        </p>
      ) : null}

      {!onReview ? (
        <>
          <h2 className="text-lg font-semibold">
            {L(step.titleEn, step.titleBn)}
          </h2>
          <div className="mt-4 space-y-4 rounded-xl border border-navy-100 bg-white p-5">
            {visibleFields(step.fields).map(renderField)}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-navy-100 bg-white p-5">
          <h2 className="text-lg font-semibold">{L("Review your answers", "আপনার উত্তর পর্যালোচনা করুন")}</h2>
          <p className="mt-1 text-sm text-navy-500">
            {L(
              "Check everything before submitting. Use Back to edit any step.",
              "জমা দেওয়ার আগে সবকিছু দেখে নিন। সম্পাদনার জন্য ফিরে যান।",
            )}
          </p>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {reviewFields
              .filter((f) => f.type !== "checkbox" || values[f.name])
              .map((f) => (
                <div key={f.name} className="border-b border-navy-50 py-1.5">
                  <dt className="text-xs text-navy-500">{L(f.labelEn, f.labelBn)}</dt>
                  <dd className="font-medium break-words">
                    {f.type === "select"
                      ? (COUNTRY_SELECT_FIELDS.has(f.name)
                          ? countries.find((c) => c.iso2 === values[f.name])?.name
                          : f.optionsEn?.find((o) => o.value === values[f.name])?.label) ??
                        values[f.name] ?? "—"
                      : f.type === "checkbox"
                        ? L("Yes", "হ্যাঁ")
                        : values[f.name] || "—"}
                  </dd>
                </div>
              ))}
          </dl>
          {selectedVisaName ? (
            <p className="mt-4 rounded-md bg-navy-50 p-3 text-sm">
              {L("Selected service:", "নির্বাচিত সেবা:")} <strong>{selectedVisaName}</strong>
            </p>
          ) : null}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            className="rounded-md border border-navy-200 px-4 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50"
          >
            {L("Back", "ফিরে যান")}
          </button>
        ) : null}
        {stepIndex < lastStep ? (
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.min(lastStep + 1, i + 1))}
            className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {L("Continue", "এগিয়ে যান")}
          </button>
        ) : null}
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
          className="rounded-md border border-navy-300 px-4 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50 disabled:opacity-50"
        >
          {pending ? L("Saving…", "সংরক্ষণ হচ্ছে…") : L("Save draft", "ড্রাফট সংরক্ষণ")}
        </button>
        {onReview ? (
          <button
            type="submit"
            name="intent"
            value="submit"
            disabled={pending}
            className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? L("Submitting…", "জমা হচ্ছে…") : L("Submit application", "আবেদন জমা দিন")}
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-navy-500">
        {L(
          "Submitting creates a real application record. We never guarantee visa outcomes — official decisions rest with the authorities.",
          "জমা দিলে সিস্টেমে একটি প্রকৃত আবেদন তৈরি হয়। ভিসার ফলাফল নিশ্চিত করা হয় না — চূড়ান্ত সিদ্ধান্ত কর্তৃপক্ষের।",
        )}
      </p>
    </form>
  );
}
