// Express 5 types treat all params as string | string[].
// This helper extracts a single string param safely.
export function p(req: { params: Record<string, any> }, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : (v ?? "");
}

// Extract wildcard param (req.params[0])
export function pw(req: { params: any[] | Record<string, any> }): string {
  if (Array.isArray(req.params)) return req.params[0] ?? "";
  const v = req.params["0"];
  return Array.isArray(v) ? v[0] : (v ?? "");
}
