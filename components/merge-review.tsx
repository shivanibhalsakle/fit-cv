"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { applyImport } from "@/lib/actions/import";
import type { MergePlan } from "@/lib/merge";
import { Tag, buttonClass, inputClass } from "@/components/ui";

function Apply() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Merging…" : "Apply to corpus"}
    </button>
  );
}

const DISPOSITION_STYLE: Record<string, string> = {
  new: "border-green-300 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20",
  variant:
    "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
  duplicate: "border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/30",
};

const DISPOSITION_LABEL: Record<string, string> = {
  new: "new bullet",
  variant: "new phrasing",
  duplicate: "already held",
};

function FactCard({ plan, index }: { plan: MergePlan["facts"][number]; index: number }) {
  const p = plan.parsed;
  const [target, setTarget] = useState(
    plan.suggestedFactId ?? (plan.matchScore > 0 ? "new" : "new"),
  );

  const range = [p.startDate, p.isCurrent ? "present" : p.endDate]
    .filter(Boolean)
    .join(" – ");

  // Attach-target dropdowns only make sense when merging into an existing fact.
  const isMerging = target !== "skip" && target !== "new";

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{p.title}</h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {[p.kind, p.org, p.location, range].filter(Boolean).join(" · ")}
          </p>
        </div>
        {plan.matchScore > 0 && (
          <Tag>{Math.round(plan.matchScore * 100)}% match</Tag>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <span className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
          Merge into
        </span>
        <select
          name={`fact-${index}-target`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className={inputClass}
        >
          <option value="skip">Skip — do not import this entry</option>
          <option value="new">Create a new fact</option>
          {plan.suggestedFactId && (
            <option value={plan.suggestedFactId}>
              {plan.suggestedFactLabel} (suggested)
            </option>
          )}
          {plan.alternatives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} ({Math.round(a.score * 100)}%)
            </option>
          ))}
        </select>
      </div>

      {plan.conflicts.length > 0 && target !== "skip" && target !== "new" && (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-2.5 dark:border-amber-900 dark:bg-amber-950/20">
          {plan.conflicts.map((c) => (
            <li key={c.field} className="text-xs">
              <span className="font-medium">{c.field}:</span>{" "}
              <span className="line-through opacity-60">{c.incoming}</span> →{" "}
              <span className="font-medium">{c.canonical}</span>
              <span className="block text-[11px] text-neutral-600 dark:text-neutral-400">
                {c.note}
              </span>
            </li>
          ))}
        </ul>
      )}

      {p.bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {plan.bullets.map((b, j) => (
            <li
              key={j}
              className={`rounded-md border p-2.5 ${DISPOSITION_STYLE[b.disposition]}`}
            >
              <div className="flex gap-2.5">
                <input
                  type="checkbox"
                  name={`fact-${index}-bullet-${j}`}
                  defaultChecked={b.disposition !== "duplicate"}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-700"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed">{b.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Tag>{DISPOSITION_LABEL[b.disposition]}</Tag>
                    {b.score > 0 && <Tag>{Math.round(b.score * 100)}%</Tag>}
                    {b.metrics.map((m) => (
                      <Tag key={m}>{m}</Tag>
                    ))}
                  </div>

                  {/* Only meaningful when merging into an existing fact. */}
                  {isMerging && plan.targetBullets.length > 0 && (
                    <select
                      name={`fact-${index}-bullet-${j}-mode`}
                      defaultValue={b.matchedBulletId ?? "new"}
                      className="mt-1.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] dark:border-neutral-700 dark:bg-neutral-950"
                    >
                      <option value="new">Add as its own bullet</option>
                      {plan.targetBullets.map((tb) => (
                        <option key={tb.id} value={tb.id}>
                          Phrasing of: {tb.text.slice(0, 70)}
                          {tb.text.length > 70 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MergeReview({
  importId,
  plan,
}: {
  importId: string;
  plan: MergePlan;
}) {
  return (
    <form action={applyImport} className="space-y-5">
      <input type="hidden" name="id" value={importId} />

      <div className="rounded-lg border border-neutral-200 p-4 text-xs dark:border-neutral-800">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-5">
          {[
            ["New facts", plan.summary.newFacts],
            ["Matched", plan.summary.matchedFacts],
            ["New bullets", plan.summary.newBullets],
            ["New phrasings", plan.summary.newVariants],
            ["Already held", plan.summary.duplicateBullets],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="text-lg font-semibold tabular-nums">{value}</div>
              <div className="text-neutral-500 dark:text-neutral-400">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {plan.contactConflicts.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          {plan.contactConflicts.map((c) => (
            <p key={c.field} className="text-xs">
              <span className="font-medium">Contact {c.field}:</span> this file
              has <span className="line-through opacity-60">{c.incoming}</span>,
              canonical is <span className="font-medium">{c.canonical}</span>.{" "}
              {c.note}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {plan.facts.map((f, i) => (
          <FactCard key={i} plan={f} index={i} />
        ))}
      </div>

      {plan.newSkills.length > 0 && (
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 className="text-sm font-medium">
            New skills
            <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
              not already in the corpus
            </span>
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.newSkills.map((s) => (
              <label
                key={s}
                className="inline-flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
              >
                <input
                  type="checkbox"
                  name="skill"
                  value={s}
                  defaultChecked
                  className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-700"
                />
                {s}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <Apply />
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Titles, employers and dates on existing facts are never overwritten.
        </span>
      </div>
    </form>
  );
}
