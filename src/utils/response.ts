export function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, data }) }] };
}

export function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }) }], isError: true };
}
