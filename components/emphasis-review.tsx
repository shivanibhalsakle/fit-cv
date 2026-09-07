"use client";

import { useFormStatus } from "react-dom";
import {
  applyEmphasis,
  clearEmphasis,
  suggestPersonaEmphasis,
} from "@/lib/actions/personas";
import { splitEmphasis } from "@/lib/resume-pdf";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export type EmphasisRow = {
  personaBulletId: string;
  text: string;
  approved: string[];
  suggested: string[];
};

function Pending({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Working…" : label}
    </button>
  );
}

/** Renders the bullet with the given phrases marked, so the effect is visible. */
function Preview({ text, phrases }: { text: string; phrases: string[] }) {
  return (
    <p className="text-xs leading-relaxed">
      {splitEmphasis(text, phrases).map((run, i) =>
        run.bold ? (
          <strong key={i} className="font-semibold">
            {run.text}
          </strong>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </p>
  );
}

export function EmphasisReview({
  personaId,
  rows,
}: {
  personaId: string;
  rows: EmphasisRow[];
}) {
  const pending = rows.filter((r) => r.suggested.length > 0);
  const anyApproved = rows.some((r) => r.approved.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action={suggestPersonaEmphasis}>
          <input type="hidden" name="id" value={personaId} />
          <Pending label="Suggest emphasis" className={secondaryButtonClass} />
        </form>
        {anyApproved && (
          <form action={clearEmphasis}>
            <input type="hidden" name="id" value={personaId} />
            <Pending label="Clear all bold" className={secondaryButtonClass} />
          </form>
        )}
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          One model call over every bullet in this persona (~$0.02).
        </span>
      </div>

      {pending.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {anyApproved
            ? "No pending suggestions. Bold phrases below are already applied."
            : "No suggestions yet."}
        </p>
      ) : (
        <form action={applyEmphasis} className="space-y-3">
          <input type="hidden" name="id" value={personaId} />

          {/* Approved phrases are re-posted so that an untouched bullet keeps
              its emphasis — the action replaces the whole set. */}
          {rows.map((r) =>
            r.suggested.length === 0
              ? r.approved.map((p) => (
                  <input
                    key={`${r.personaBulletId}-${p}`}
                    type="hidden"
                    name="phrase"
                    value={`${r.personaBulletId}::${p}`}
                  />
                ))
              : null,
          )}

          {pending.map((r) => (
            <div
              key={r.personaBulletId}
              className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <Preview text={r.text} phrases={r.suggested} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.suggested.map((p) => (
                  <label
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1 text-[11px] dark:border-neutral-800"
                  >
                    <input
                      type="checkbox"
                      name="phrase"
                      value={`${r.personaBulletId}::${p}`}
                      defaultChecked
                      className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-700"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <Pending label="Apply emphasis" className={buttonClass} />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Unticked phrases are discarded, not kept pending.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
