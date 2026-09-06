"use client";

import { useFormStatus } from "react-dom";
import { deleteFact } from "@/lib/actions/corpus";
import { dangerButtonClass } from "@/components/ui";

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={dangerButtonClass}>
      {pending ? "Deleting…" : "Delete fact"}
    </button>
  );
}

export function DeleteFact({
  id,
  title,
  bulletCount,
}: {
  id: string;
  title: string;
  bulletCount: number;
}) {
  return (
    <form
      action={deleteFact}
      onSubmit={(e) => {
        const ok = confirm(
          `Delete “${title}” and its ${bulletCount} bullet${
            bulletCount === 1 ? "" : "s"
          }?\n\nThis is permanent. Any variants recorded against those bullets go with them.`,
        );
        if (!ok) e.preventDefault();
      }}
      className="flex items-center justify-between gap-4"
    >
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Deleting removes this fact and all {bulletCount} of its bullets,
        permanently.
      </p>
      <Button />
    </form>
  );
}
