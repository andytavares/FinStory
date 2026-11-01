/**
 * Add the fix to an API error that has an obvious one.
 *
 * The raw message is always kept: guessing at a cause and hiding the original
 * is how a wrong diagnosis becomes an hour of looking in the wrong place.
 */
export function explainModelError(message: string | null): string {
  if (!message) return 'The model failed for an unknown reason.';
  if (/anthropic-workspace-id/i.test(message)) {
    return `${message} — set the Workspace ID in Settings; identity-linked keys require it.`;
  }
  if (/invalid x-api-key|authentication_error|401/i.test(message)) {
    return `${message} — check the API key in Settings.`;
  }
  if (/credit balance|billing/i.test(message)) {
    return `${message} — the account needs credit before categorization can run.`;
  }
  if (/rate_limit|429/i.test(message)) {
    return `${message} — wait a moment and run it again.`;
  }
  if (/overloaded/i.test(message)) {
    return `${message} — the API is busy; running it again usually works.`;
  }
  if (/does not support chat/i.test(message)) {
    return `${message} — choose a different model in Settings; this one cannot answer chat requests.`;
  }
  if (/model .*not found/i.test(message)) {
    return `${message} — install it with \`ollama pull <model>\`, or choose an installed model in Settings.`;
  }
  return message;
}
