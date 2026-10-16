import type { AdminCategory } from '@pupitre/shared'
import { sortByTitle, unwrap } from '@pupitre/ui'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from './api.ts'

export const categoriesQueryKey = ['admin-categories']

export function useCategories() {
  return useQuery({
    queryKey: categoriesQueryKey,
    queryFn: () => unwrap(adminApi.categories.$get()),
  })
}

export type TreeRow = { category: AdminCategory; depth: number; path: string }

/** Depth-first, siblings sorted by title: the order to display a tree as a flat list. */
export function flattenTree(categories: AdminCategory[]): TreeRow[] {
  const byParent = new Map<string | null, AdminCategory[]>()
  for (const c of categories) {
    const siblings = byParent.get(c.parentId) ?? []
    siblings.push(c)
    byParent.set(c.parentId, siblings)
  }
  const rows: TreeRow[] = []
  const visit = (parentId: string | null, depth: number, prefix: string) => {
    for (const c of sortByTitle(byParent.get(parentId) ?? [])) {
      const path = prefix ? `${prefix} › ${c.title}` : c.title
      rows.push({ category: c, depth, path })
      visit(c.id, depth + 1, path)
    }
  }
  visit(null, 0, '')
  return rows
}

/** `id` and every category below it (a category can't be moved there). */
export function subtreeIds(categories: AdminCategory[], id: string) {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id)
        grew = true
      }
    }
  }
  return ids
}
