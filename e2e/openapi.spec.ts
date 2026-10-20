import { apiClient, expect, test } from './fixtures.ts'

type Operation = { operationId?: string; tags?: string[]; security?: unknown[]; responses: Record<string, unknown> }
type Document = {
  openapi: string
  paths: Record<string, Record<string, Operation>>
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> }
}

test.describe('Spec 005: OpenAPI document', () => {
  test('anyone gets the OpenAPI document of the whole API', async () => {
    const anonymous = await apiClient()
    const res = await anonymous.get('/api/docs/openapi.json')
    expect(res.status()).toBe(200)
    const doc = (await res.json()) as Document

    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/health', '/api/me', '/api/courses/{slug}/modules/{moduleSlug}', '/api/admin/courses/{id}']),
    )
    expect(doc.components.schemas).toHaveProperty('ApiError')
    expect(doc.components.schemas).toHaveProperty('CourseDetail')
    expect(doc.components.securitySchemes).toHaveProperty('session')

    const operations = Object.entries(doc.paths).flatMap(([path, ops]) => Object.entries(ops).map(([method, op]) => ({ path, method, op })))
    const ids = operations.map(({ op }) => op.operationId)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(operations.filter(({ op }) => !op.tags?.length)).toEqual([])
    // Admin routes document their guard; public routes drop the session requirement.
    const admin = operations.filter(({ path }) => path.startsWith('/api/admin/'))
    expect(admin.filter(({ op }) => !op.responses['401'] || !op.responses['403'])).toEqual([])
    expect(doc.paths['/api/courses']!.get!.security).toEqual([])
    expect(doc.paths['/api/me']!.get!.security).toBeUndefined()
    await anonymous.dispose()
  })

  test('anyone gets the Swagger UI page pointing at the document', async () => {
    const anonymous = await apiClient()
    const res = await anonymous.get('/api/docs/swagger')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('swagger-ui')
    expect(html).toContain('/api/docs/openapi.json')
    // The former admin-only addresses are gone.
    expect((await anonymous.get('/api/admin/docs')).status()).toBe(401)
    await anonymous.dispose()
  })

  test('invalid requests are refused with the error envelope', async ({ adminRequest }) => {
    const invalid = await adminRequest.post('/api/admin/categories', { data: { slug: 'Not A Slug', title: 'x' } })
    expect(invalid.status()).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'slug: Invalid slug' })

    const badQuery = await adminRequest.get('/api/admin/users?role=king')
    expect(badQuery.status()).toBe(400)
    expect((await badQuery.json()).error).toMatch(/^role: /)

    // A body of another media type is refused, not let through unvalidated.
    const notJson = await adminRequest.post('/api/admin/categories', {
      headers: { 'content-type': 'text/plain' },
      data: 'slug=x',
    })
    expect(notJson.status()).toBe(415)
    expect(await notJson.json()).toEqual({ error: 'Unsupported Media Type' })
  })
})
