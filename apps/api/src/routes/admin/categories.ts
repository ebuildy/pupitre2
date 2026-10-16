import { type AdminCategory, categoryCreateSchema, categoryUpdateSchema } from '@pupitre/shared'
import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db/index.ts'
import { category, course } from '../../db/schema/index.ts'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { type Category, CategoryTree } from '../../services/categories.ts'

const NOT_FOUND = 'Category not found'
const SLUG_TAKEN = 'Category already exists'

function isSlugTaken(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed: category\.slug/.test(String(err.cause ?? err.message))
}

async function courseCounts() {
  const rows = await db
    .select({ categoryId: course.categoryId, n: count() })
    .from(course)
    .groupBy(course.categoryId)
  return new Map(rows.map((r) => [r.categoryId, r.n]))
}

function toAdminCategory(c: Category, tree: CategoryTree, courses: Map<string | null, number>): AdminCategory {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    parentId: c.parentId,
    courseCount: courses.get(c.id) ?? 0,
    childCount: tree.childrenOf(c.id).length,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

/** 400 unless `parentId` exists and is neither `id` itself nor one of its subcategories (no cycles). */
function checkParent(tree: CategoryTree, parentId: string | null | undefined, id?: string) {
  if (!parentId) return
  if (!tree.byId.has(parentId)) throw new HTTPException(400, { message: 'Unknown parent category' })
  if (id && tree.subtreeIds(id).includes(parentId)) {
    throw new HTTPException(400, { message: 'A category cannot be moved under itself or its subcategories' })
  }
}

/** Course categories (a tree), under /api/admin/categories. */
export const adminCategoryRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const tree = await CategoryTree.load()
    const courses = await courseCounts()
    return c.json<{ categories: AdminCategory[]; total: number }>({
      categories: tree.all.map((x) => toAdminCategory(x, tree, courses)),
      total: tree.all.length,
    })
  })
  .post('/', validate('json', categoryCreateSchema), async (c) => {
    const input = c.req.valid('json')
    const tree = await CategoryTree.load()
    checkParent(tree, input.parentId)
    try {
      const [created] = await db.insert(category).values(input).returning()
      return c.json<AdminCategory>(toAdminCategory(created!, tree, new Map()), 201)
    } catch (err) {
      if (isSlugTaken(err)) throw new HTTPException(409, { message: SLUG_TAKEN })
      throw err
    }
  })
  .get('/:id', async (c) => {
    const tree = await CategoryTree.load()
    const found = tree.byId.get(c.req.param('id'))
    if (!found) throw new HTTPException(404, { message: NOT_FOUND })
    return c.json<AdminCategory>(toAdminCategory(found, tree, await courseCounts()))
  })
  .patch('/:id', validate('json', categoryUpdateSchema), async (c) => {
    const tree = await CategoryTree.load()
    const found = tree.byId.get(c.req.param('id'))
    if (!found) throw new HTTPException(404, { message: NOT_FOUND })
    const input = c.req.valid('json')
    checkParent(tree, input.parentId, found.id)
    try {
      const [updated] = await db.update(category).set(input).where(eq(category.id, found.id)).returning()
      return c.json<AdminCategory>(toAdminCategory(updated!, tree, await courseCounts()))
    } catch (err) {
      if (isSlugTaken(err)) throw new HTTPException(409, { message: SLUG_TAKEN })
      throw err
    }
  })
  .delete('/:id', async (c) => {
    const tree = await CategoryTree.load()
    const found = tree.byId.get(c.req.param('id'))
    if (!found) throw new HTTPException(404, { message: NOT_FOUND })
    // Nothing is re-filed silently: move or delete the subcategories and courses first.
    if (tree.childrenOf(found.id).length) throw new HTTPException(409, { message: 'Category has subcategories' })
    if ((await courseCounts()).get(found.id)) throw new HTTPException(409, { message: 'Category is used by courses' })
    await db.delete(category).where(eq(category.id, found.id))
    return c.json({ message: 'Category deleted' })
  })
