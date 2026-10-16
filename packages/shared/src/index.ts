// Code shared between the API and the web app: wire types, zod schemas, constants.

/** Every API error is `{ error }` with a user-displayable message (spec 005). */
export type ApiError = {
  error: string
}

/** `GET /health` response (spec 006). */
export type HealthResponse = {
  status: 'ok'
}
