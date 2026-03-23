export function xmlWrap(tag: string, value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return `<${tag}>${value}</${tag}>`;
}

export function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function errorResult(error: unknown) {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  return { isError: true as const, content: [{ type: 'text' as const, text: `Error: ${msg}` }] };
}
