"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createBullet,
  deleteBullet,
  moveBullet,
  updateBullet,
} from "@/lib/actions/corpus";
import type { ActionState } from "@/lib/validation";
import {
  Tag,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

export type BulletView = {
  id: string;
  canonicalText: string;
  metrics: string[];
  tags: string[];
  variantCount: number;
};

function Pending({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "…" : label}
    </button>
  );
}

function BulletRow({
  bullet,
  factId,
  isFirst,
  isLast,
}: {
  bullet: BulletView;
  factId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateBullet,
    {},
  );

  if (editing) {
    return (
      <li className="rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={bullet.id} />
          <input type="hidden" name="factId" value={factId} />
          <textarea
            name="canonicalText"
            defaultValue={bullet.canonicalText}
            rows={3}
            className={inputClass}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[11px] text-neutral-500">
                Metrics (one per line)
              </span>
              <textarea
                name="metrics"
                defaultValue={bullet.metrics.join("\n")}
                rows={2}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-neutral-500">
                Tags (comma-separated)
              </span>
              <input
                name="tags"
                defaultValue={bullet.tags.join(", ")}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pending label="Save" className={secondaryButtonClass} />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            {state.error && (
              <span className="text-xs text-red-600 dark:text-red-400">
                {state.error}
              </span>
            )}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="group rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="text-sm leading-relaxed">{bullet.canonicalText}</p>

      {(bullet.metrics.length > 0 ||
        bullet.tags.length > 0 ||
        bullet.variantCount > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {bullet.metrics.map((m) => (
            <Tag key={m}>{m}</Tag>
          ))}
          {bullet.tags.map((t) => (
            <Tag key={t}>#{t}</Tag>
          ))}
          {bullet.variantCount > 0 && (
            <Tag>
              {bullet.variantCount} version
              {bullet.variantCount === 1 ? "" : "s"}
            </Tag>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={secondaryButtonClass}
        >
          Edit
        </button>
        <form action={moveBullet}>
          <input type="hidden" name="id" value={bullet.id} />
          <input type="hidden" name="factId" value={factId} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            disabled={isFirst}
            className={secondaryButtonClass}
            aria-label="Move up"
          >
            ↑
          </button>
        </form>
        <form action={moveBullet}>
          <input type="hidden" name="id" value={bullet.id} />
          <input type="hidden" name="factId" value={factId} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            disabled={isLast}
            className={secondaryButtonClass}
            aria-label="Move down"
          >
            ↓
          </button>
        </form>
        <form
          action={deleteBullet}
          onSubmit={(e) => {
            if (!confirm("Delete this bullet? Its variants go with it.")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={bullet.id} />
          <input type="hidden" name="factId" value={factId} />
          <button type="submit" className={dangerButtonClass}>
            Delete
          </button>
        </form>
      </div>
    </li>
  );
}

function AddBullet({ factId }: { factId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createBullet,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={secondaryButtonClass}
      >
        + Add bullet
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        formAction(fd);
      }}
      className="space-y-3 rounded-lg border border-dashed border-neutral-300 p-3 dark:border-neutral-700"
    >
      <input type="hidden" name="factId" value={factId} />
      <textarea
        name="canonicalText"
        rows={3}
        placeholder="Built a Spring Boot admin-override service for job reassignment…"
        className={inputClass}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[11px] text-neutral-500">
            Metrics (one per line)
          </span>
          <textarea name="metrics" rows={2} className={inputClass} />
        </div>
        <div className="space-y-1">
          <span className="text-[11px] text-neutral-500">
            Tags (comma-separated)
          </span>
          <input name="tags" className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Pending label="Add bullet" className={secondaryButtonClass} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={secondaryButtonClass}
        >
          Done
        </button>
        {state.error && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

export function BulletEditor({
  factId,
  bullets,
}: {
  factId: string;
  bullets: BulletView[];
}) {
  return (
    <div className="space-y-3">
      {bullets.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No bullets yet.
        </p>
      )}
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <BulletRow
            key={b.id}
            bullet={b}
            factId={factId}
            isFirst={i === 0}
            isLast={i === bullets.length - 1}
          />
        ))}
      </ul>
      <AddBullet factId={factId} />
    </div>
  );
}
