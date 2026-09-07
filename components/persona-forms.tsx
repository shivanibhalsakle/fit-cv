"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createPersona,
  deletePersona,
  duplicatePersona,
} from "@/lib/actions/personas";
import type { ActionState } from "@/lib/validation";
import {
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "…" : label}
    </button>
  );
}

export function NewPersonaForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createPersona,
    {},
  );
  return (
    <form action={formAction} className="flex items-start gap-2">
      <div className="flex-1">
        <input
          name="name"
          placeholder="e.g. Data Analyst"
          className={inputClass}
        />
        {state.error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
      </div>
      <Submit label="Create" className={buttonClass} />
    </form>
  );
}

export function PersonaActions({
  id,
  name,
  factCount,
}: {
  id: string;
  name: string;
  factCount: number;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <form action={duplicatePersona}>
        <input type="hidden" name="id" value={id} />
        <Submit label="Duplicate" className={secondaryButtonClass} />
      </form>

      {confirming ? (
        <form action={deletePersona} className="flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            Delete “{name}”? The {factCount} corpus entries it selects are not
            affected.
          </span>
          <Submit label="Delete" className={dangerButtonClass} />
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={dangerButtonClass}
        >
          Delete
        </button>
      )}
    </div>
  );
}
