import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// Debug server function: returns incoming request headers and authorization info
export const debugEcho = createServerFn({ method: "POST" }).handler(async () => {
  const req = getRequest();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const auth = headers['authorization'] ?? headers['Authorization'] ?? null;

  return {
    ok: true,
    headers,
    auth,
  };
});
