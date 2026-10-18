// Spec 123: opening a course from a path remembers the path, so finishing the course brings the learner back to it.
const KEY = 'pupitre.returnPath'

type Target = { courseSlug: string; to: string; title: string }

export function rememberReturnPath(target: Target) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(target))
  } catch {}
}

/** The remembered path, if it was set for this course. */
export function returnPathFor(courseSlug: string): Target | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Target | null
    return t?.courseSlug === courseSlug ? t : null
  } catch {
    return null
  }
}

/** Where to go once the course is completed: the path page (forgotten after use), else the course page. */
export function afterCourseCompleted(courseSlug: string) {
  const t = returnPathFor(courseSlug)
  if (!t) return `/courses/${courseSlug}`
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
  return t.to
}
