"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createFact, updateFact } from "@/lib/actions/corpus";
import {
  FACT_KINDS,
  FACT_KIND_LABELS,
  type ActionState,
} from "@/lib/validation";
import { Field, buttonClass, inputClass } from "@/components/ui";

export type FactFormValues = {
  id?: string;
  kind: string;
  title: string;
  org: string;
  orgDescriptor: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  tagline: string;
  tags: string;
  archivedTitles: string;
};

const EMPTY: FactFormValues = {
  kind: "EXPERIENCE",
  title: "",
  org: "",
  orgDescriptor: "",
  location: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  tagline: "",
  tags: "",
  archivedTitles: "",
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function FactForm({
  initial,
  mode,
}: {
  initial?: FactFormValues;
  mode: "create" | "edit";
}) {
  const values = initial ?? EMPTY;
  const action = mode === "create" ? createFact : updateFact;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  // Controlled only where the UI must react: "current role" hides the end date.
  const [isCurrent, setIsCurrent] = useState(values.isCurrent);
  const [kind, setKind] = useState(values.kind);

  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind" errors={err.kind}>
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputClass}
          >
            {FACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {FACT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Title"
          hint="Immutable — identical in every persona."
          errors={err.title}
        >
          <input
            name="title"
            defaultValue={values.title}
            className={inputClass}
            placeholder="Software Engineer Intern"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organisation" errors={err.org}>
          <input
            name="org"
            defaultValue={values.org}
            className={inputClass}
            placeholder="InnovateMore LLC"
          />
        </Field>

        <Field label="Location" errors={err.location}>
          <input
            name="location"
            defaultValue={values.location}
            className={inputClass}
            placeholder="San Antonio, TX"
          />
        </Field>
      </div>

      <Field
        label="Organisation descriptor"
        hint="Optional context, e.g. “Regd. Indian NGO — Women & Children Rights”."
        errors={err.orgDescriptor}
      >
        <input
          name="orgDescriptor"
          defaultValue={values.orgDescriptor}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Start" errors={err.startDate}>
          <input
            type="month"
            name="startDate"
            defaultValue={values.startDate}
            className={inputClass}
          />
        </Field>

        <Field label="End" errors={err.endDate}>
          <input
            type="month"
            name="endDate"
            defaultValue={values.endDate}
            disabled={isCurrent}
            className={`${inputClass} disabled:opacity-40`}
          />
        </Field>

        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              name="isCurrent"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            Current / ongoing
          </label>
        </div>
      </div>

      <Field
        label="Tagline"
        hint="One-line descriptor. Projects use it for a summary; education for GPA."
        errors={err.tagline}
      >
        <input
          name="tagline"
          defaultValue={values.tagline}
          className={inputClass}
        />
      </Field>

      <Field
        label="Tags"
        hint="Comma-separated. Used for persona matching and retrieval."
        errors={err.tags}
      >
        <input
          name="tags"
          defaultValue={values.tags}
          className={inputClass}
          placeholder="backend, mobile, agentic-ai"
        />
      </Field>

      <Field
        label="Archived titles"
        hint="Titles used on older resumes. Reference only — never emitted."
        errors={err.archivedTitles}
      >
        <input
          name="archivedTitles"
          defaultValue={values.archivedTitles}
          className={inputClass}
          placeholder="Product Lead, Business Analyst Intern"
        />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton label={mode === "create" ? "Create fact" : "Save changes"} />
        {state.error && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </span>
        )}
        {state.ok && (
          <span className="text-xs text-green-700 dark:text-green-500">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
