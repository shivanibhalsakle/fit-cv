"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { answerGap, createTailoringSession, skipGap } from "@/lib/actions/tailor";
import type { ActionState } from "@/lib/validation";
import { Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Working…" : label}
    </button>
  );
}

export function NewSessionForm({
  personas,
}: {
  personas: { id: string; name: string; bulletCount: number }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createTailoringSession,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Base persona" errors={state.fieldErrors?.personaId}>
        <select name="personaId" className={inputClass} defaultValue={personas[0]?.id}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.bulletCount} bullets)
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company">
          <input name="company" className={inputClass} placeholder="Deloitte" />
        </Field>
        <Field label="Role">
          <input name="role" className={inputClass} placeholder="Business Analyst" />
        </Field>
      </div>

      <Field label="Job ID" hint="Optional — the posting's reference number.">
        <input name="jobId" className={inputClass} />
      </Field>

      <Field label="Job description" hint="Paste the full posting.">
        <textarea name="jdText" rows={12} className={inputClass} />
      </Field>

      <Field
        label="One-off customization"
        hint="Applies to THIS generation only. Never becomes a standing preference."
      >
        <textarea
          name="oneOffInstructions"
          rows={2}
          className={inputClass}
          placeholder="Lead with the healthcare project for this one."
        />
      </Field>

      <div className="flex items-center gap-3">
        <Submit label="Create session" className={buttonClass} />
        {state.error && (
          <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>
        )}
      </div>
    </form>
  );
}

export function GapAnswer({
  sessionId,
  keyword,
  facts,
  existingAnswer,
  answered,
}: {
  sessionId: string;
  keyword: string;
  facts: { id: string; label: string }[];
  existingAnswer: string;
  answered: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (answered && !open) {
    return (
      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{keyword}</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={secondaryButtonClass}
          >
            Change
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          {existingAnswer ? existingAnswer : "Skipped — left off the resume."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
      <p className="text-sm font-medium">{keyword}</p>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        The posting asks for this and nothing in your corpus evidences it. If you
        have done it, describe it — the answer becomes a permanent bullet you own,
        not a one-off. If you have not, skip it.
      </p>

      <form action={answerGap} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={sessionId} />
        <input type="hidden" name="keyword" value={keyword} />
        <textarea
          name="answer"
          rows={3}
          defaultValue={existingAnswer}
          placeholder="Write it as a resume bullet, in your own voice."
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select name="factId" className={`${inputClass} max-w-xs text-xs`}>
            <option value="">Attach to which role or project…</option>
            {facts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <Submit label="Save to corpus" className={secondaryButtonClass} />
        </div>
      </form>

      <form action={skipGap} className="mt-2">
        <input type="hidden" name="id" value={sessionId} />
        <input type="hidden" name="keyword" value={keyword} />
        <Submit label="I have not done this" className={secondaryButtonClass} />
      </form>
    </div>
  );
}
