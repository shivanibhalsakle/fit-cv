import Anthropic from "@anthropic-ai/sdk";

/**
 * One client for the process. Every model call in the app goes through here so
 * that model choice, cost accounting, and error handling stay in one place.
 */
let client: Anthropic | null = null;

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server.",
    );
  }
}

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new MissingApiKeyError();

  // An org-level key (one not created inside a workspace) must name the
  // workspace on every request. A workspace-scoped key needs no header, so
  // this is only set when ANTHROPIC_WORKSPACE_ID is present.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

  client ??= new Anthropic(
    workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {},
  );
  return client;
}

export const MODEL = "claude-opus-5";

/** Rough spend estimate, for showing cost in the UI. Opus 5: $5/MTok in, $25 out. */
export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * 5 + (outputTokens / 1e6) * 25;
}
