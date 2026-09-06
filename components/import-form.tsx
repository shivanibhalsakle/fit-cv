"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createImport } from "@/lib/actions/import";
import type { ActionState } from "@/lib/validation";
import { buttonClass, inputClass } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending ? "Reading…" : "Add to queue"}
    </button>
  );
}

export function ImportForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createImport,
    {},
  );
  const [mode, setMode] = useState<"file" | "paste">("file");

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
        {(["file", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }`}
          >
            {m === "file" ? "Upload a file" : "Paste text"}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <div className="space-y-1.5">
          <input
            type="file"
            name="file"
            accept=".pdf,.docx,.txt,.md"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:text-white dark:file:bg-white dark:file:text-neutral-900"
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            PDF, DOCX, TXT or MD, up to 10 MB. Text extraction is free — no model
            call happens until you press Parse on the next screen.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <textarea
            name="pasted"
            rows={10}
            placeholder="Paste the resume text…"
            className={inputClass}
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Useful for a resume you do not have as a file, or a fragment of one.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Submit />
        {state.error && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
