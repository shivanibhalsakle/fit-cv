"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setPersonaSelection } from "@/lib/actions/personas";
import { Tag, buttonClass } from "@/components/ui";

export type EditorBullet = { id: string; text: string; selected: boolean };

export type EditorFact = {
  id: string;
  kind: string;
  section: string;
  title: string;
  org: string | null;
  dateRange: string;
  selected: boolean;
  bullets: EditorBullet[];
};

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Saving…" : "Save selection"}
    </button>
  );
}

function FactRow({ fact }: { fact: EditorFact }) {
  const [on, setOn] = useState(fact.selected);
  const [bullets, setBullets] = useState(
    () => new Set(fact.bullets.filter((b) => b.selected).map((b) => b.id)),
  );

  function toggleBullet(id: string) {
    setBullets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        on
          ? "border-neutral-300 dark:border-neutral-700"
          : "border-neutral-200 opacity-55 dark:border-neutral-800"
      }`}
    >
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="fact"
          value={fact.id}
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-700"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{fact.title}</span>
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
              {fact.dateRange}
            </span>
          </span>
          {fact.org && (
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">
              {fact.org}
            </span>
          )}
        </span>
      </label>

      {on && fact.bullets.length > 0 && (
        <ul className="mt-2 space-y-1 pl-6">
          {fact.bullets.map((b) => (
            <li key={b.id}>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="bullet"
                  value={b.id}
                  checked={bullets.has(b.id)}
                  onChange={() => toggleBullet(b.id)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-neutral-300 dark:border-neutral-700"
                />
                <span
                  className={`text-xs leading-relaxed ${
                    bullets.has(b.id)
                      ? ""
                      : "text-neutral-400 line-through dark:text-neutral-600"
                  }`}
                >
                  {b.text}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PersonaEditor({
  personaId,
  factsBySection,
}: {
  personaId: string;
  factsBySection: { section: string; label: string; facts: EditorFact[] }[];
}) {
  return (
    <form action={setPersonaSelection} className="space-y-5">
      <input type="hidden" name="id" value={personaId} />

      {factsBySection.map((group) => (
        <section key={group.section}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {group.label}
            <span className="ml-2 normal-case tracking-normal">
              <Tag>
                {group.facts.filter((f) => f.selected).length}/
                {group.facts.length}
              </Tag>
            </span>
          </h3>
          <div className="space-y-1.5">
            {group.facts.map((f) => (
              <FactRow key={f.id} fact={f} />
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border border-neutral-300 bg-white/95 p-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-950/95">
        <Save />
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          The preview refreshes after saving.
        </span>
      </div>
    </form>
  );
}
