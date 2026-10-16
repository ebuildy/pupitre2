/** An API answer that is not 2xx; `message` is the `{ error }` of the body (spec 005). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> }

/** The success bodies of a (union of) Hono RPC responses: every body except the `{ error }` envelope. */
type SuccessBody<R> = R extends { json(): Promise<infer T> } ? (T extends { error: string } ? never : T) : never

/** Resolves a Hono RPC response to its success body, or throws `ApiRequestError`. */
export async function unwrap<R extends JsonResponse>(response: Promise<R> | R): Promise<SuccessBody<R>> {
  const res = await response
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiRequestError(res.status, body?.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as SuccessBody<R>
}

export function isNotFound(error: unknown) {
  return error instanceof ApiRequestError && error.status === 404
}
