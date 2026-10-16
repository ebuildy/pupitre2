import type { CategoryRef, CourseCategory } from '@pupitre/shared'
import { asc } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { category } from '../db/schema/index.ts'

export type Category = typeof category.$inferSelect

/**
 * The whole category tree, loaded in one query. Categories are few, so walking the tree in memory is
 * simpler and cheaper than recursive SQL. Load it once per request.
 */
export class CategoryTree {
  readonly byId: Map<string, Category>
  private readonly children = new Map<string, Category[]>()

  constructor(readonly all: Category[]) {
    this.byId = new Map(all.map((c) => [c.id, c]))
    for (const c of all) {
      if (!c.parentId) continue
      const siblings = this.children.get(c.parentId) ?? []
      siblings.push(c)
      this.children.set(c.parentId, siblings)
    }
  }

  static async load() {
    return new CategoryTree(await db.select().from(category).orderBy(asc(category.title)))
  }

  bySlug(slug: string) {
    const wanted = slug.toLowerCase()
    return this.all.find((c) => c.slug === wanted)
  }

  childrenOf(id: string) {
    return this.children.get(id) ?? []
  }

  /** From the root down to the parent of `id` (excluded). */
  ancestors(id: string): Category[] {
    const chain: Category[] = []
    const seen = new Set([id])
    let parentId = this.byId.get(id)?.parentId
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = this.byId.get(parentId)
      if (!parent) break
      chain.unshift(parent)
      parentId = parent.parentId
    }
    return chain
  }

  /** `id` and every category below it. */
  subtreeIds(id: string): string[] {
    const ids: string[] = []
    const stack = [id]
    while (stack.length) {
      const current = stack.pop()!
      if (ids.includes(current)) continue
      ids.push(current)
      stack.push(...this.childrenOf(current).map((c) => c.id))
    }
    return ids
  }

  rootOf(id: string) {
    return this.ancestors(id)[0] ?? this.byId.get(id)
  }

  /** The value of a course's `category` field, or null. */
  courseCategory(id: string | null): CourseCategory | null {
    const found = id ? this.byId.get(id) : undefined
    if (!found) return null
    return { ...ref(found), ancestors: this.ancestors(found.id).map(ref) }
  }
}

export function ref(c: Category): CategoryRef {
  return { slug: c.slug, title: c.title }
}
