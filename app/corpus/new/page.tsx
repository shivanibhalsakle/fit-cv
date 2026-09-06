import Link from "next/link";
import { FactForm } from "@/components/fact-form";

export default function NewFactPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/corpus"
          className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
        >
          ← Corpus
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New fact</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Bullets are added after the fact is created.
        </p>
      </header>
      <FactForm mode="create" />
    </main>
  );
}
