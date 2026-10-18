# 040 — Courses, visibility and catalogue

| Field | Value |
| --- | --- |
| Area | Catalogue |
| Actors | anyone |
| Related | [045](045-course-page-and-enrollment.md), [052](052-my-courses.md), [165](165-admin-courses.md) |

Covers the original 040 (catalogue API), 041 (catalogue page), 044 (course card) and 046 (visibility).

## Course

Table `course` (spec 191 "Course", without modules, XP, badge or thumbnail yet):

| Field | Rules |
| --- | --- |
| `id` | UUID; what other tables reference |
| `slug` | unique, `^[a-z0-9][a-z0-9-]*$` (`SLUG_PATTERN`); used in learner URLs; **an admin may change it** |
| `title` | required |
| `description` | optional |
| `categoryId` | optional; a [category](#categories) |
| `difficulty` | optional: `beginner`, `intermediate`, `advanced` |
| `xpRequired` | ≥ 0, default 0: minimum XP to self-enroll ([103](103-xp.md)) |
| `completionXp` | ≥ 0, default 200: XP granted on completion ([103](103-xp.md)) |
| `visibility` | `public` (listed, open to self-enrollment) or `private` (granted access only); default `private` |
| `status` | `draft` (admins only), `published`, `archived` (unlisted, no new enrollments, enrolled learners keep access); default `draft` |

## Categories

Table `category`, a tree:

| Field | Rules |
| --- | --- |
| `id` | UUID; what courses and subcategories reference |
| `slug` | unique, `SLUG_PATTERN`; used in catalogue URLs (`?category=<slug>`); an admin may change it |
| `title` | required; shown as is (not translated) |
| `parentId` | optional parent category; any depth; never itself or one of its subcategories |

A course's category is returned with its ancestors: `{ slug, title, ancestors: [{ slug, title }, …] }` (root first),
displayed "DevOps › Docker". Icons are chosen by slug (linux 🐧, devops ⚙️, kubernetes ☸️, docker 🐋, networking 🌐,
security 🛡️, programming 💻, python 🐍, git 🔀, cloud ☁️, database 🗄️, internal-testing 🧪); a category without one
uses its nearest ancestor's, else 📖.

Admin management: [165](165-admin-courses.md).

## Who sees a course

| | published public | published private | archived | draft |
| --- | --- | --- | --- | --- |
| catalogue | listed | — | — | — |
| course page, anonymous / not enrolled | ✓ | 404 | 404 | 404 |
| course page, enrolled | ✓ | ✓ | ✓ | 404 |
| admin | ✓ | ✓ | ✓ | ✓ |

A course the user may not see answers 404 `Course not found` (its existence is not revealed).

## API

`GET /api/courses?search=&difficulty=&category=a&category=b` (public) → `CourseListResponse`:

```json
{
  "courses": [{ "slug": "docker-intro", "title": "…", "description": "…",
                "category": { "slug": "docker", "title": "Docker", "ancestors": [{ "slug": "devops", "title": "DevOps" }] },
                "difficulty": "intermediate", "enrolled": false }],
  "total": 1,
  "categories": [{ "slug": "devops", "title": "DevOps", "count": 1 }]
}
```

- Published public courses only. `search`: case-insensitive substring of the title or description, or of the title of the course's category or any of its ancestors. `difficulty`: exact. `category`: category slugs, repeatable (OR); each includes its subcategories; unknown slugs match nothing.
- `categories` lists the **top-level** categories of the courses matching `search` + `difficulty` (before the category filter), each with the number of courses in its whole subtree, for the chips.
- `enrolled` is computed for the signed-in user (always `false` anonymously).

`GET /api/courses/:slug` → `CourseDetail` (see [045](045-course-page-and-enrollment.md)).

## UI — `/courses` ("Catalogue")

- Toolbar: search "Rechercher un cours…" (debounced 280 ms), difficulty **slider** with four stops "Toutes",
  "Débutant", "Intermédiaire", "Avancé" (`role="slider"` named "Difficulté", value text = the stop; arrows / Home / End,
  drag, or click a stop label; the URL changes on release), result count "N cours" (`role="status"`).
- Transitions (`motion`): when the results change, cards that stay glide to their new place, removed ones fade and
  shrink out, new ones rise in (slightly staggered); category chips slide the same way; the count rolls to its new
  value; loading, empty and results cross-fade. While new results load, the previous ones stay, dimmed
  (`aria-busy="true"` on the list). Everything follows the system's "reduce motion" setting (`MotionConfig` at the app root).
- Category chips "Tout" + one per top-level category (icon, title, count including subcategories; multi-select, OR). Shown when there are ≥ 2 categories, or a category is selected (selected categories stay visible with count 0 so they can be cleared).
- Filters are kept in the URL (`?search=&difficulty=&category=`), so a filtered view can be shared and survives reload.
- Grid of course cards sorted by title in the current language (accent-insensitive, numeric).
- States: "Chargement des cours…", "📭 Aucun cours trouvé — Essayez d'ajuster votre recherche ou vos filtres".

### Course card

Category icon, category path ("DevOps › Docker"), title, "⚡ N XP requis" when gated, "+N XP" reward, "✓ Terminé" when completed (else "✓ Inscrit") — (link to `/courses/:slug`), difficulty badge (green Débutant / orange Intermédiaire / red Avancé), "✓ Inscrit" when enrolled.

## Acceptance criteria

- Private, draft and archived courses are never listed.
- Search, difficulty and category filters combine; the view survives a reload.
- Selecting a category that the other filters empty out still lets the user clear it ("Tout").
- Selecting a top-level category shows the courses of its subcategories too.
- Searching a category's title finds the courses filed under it or its subcategories.

## Differences from the original

- Visibility is the target model (spec 191: visibility + status) instead of `public` + an unused `hidden` flag.
- Courses have an id and a mutable slug (the original slug was immutable).
- Categories are managed objects (a tree with titles) instead of free-text slugs with built-in French labels.
- Not yet: thumbnails, prerequisites (050), in-person sessions.
- The difficulty filter is a stepped slider (the original had a select), and filter changes are animated.

## Card, hero (specs 043, 044)

- Cards: icon inferred from skills and title keywords (pentest 🔐, security 🛡️, linux/bash 🐧, kubernetes ☸️, docker 🐋, git/devops ⚙️, python 🐍, network 🌐, cloud ☁️, database 🗄️…), else the category's; badge icon before the title; module count; progress bar "x/y modules · p %" when enrolled; up to 3 skill chips.
- "Reprendre" hero at the top of the catalogue (signed in, no search or skill filter): the most recently worked-on course in progress, else the first open enrolled course; title, progress, "Continuer ▸".

## Source

`apps/api/src/routes/courses.ts`, `apps/api/src/services/courses.ts`, `apps/api/src/services/categories.ts`, `apps/api/src/db/schema/courses.ts`,
`apps/app/src/routes/Catalogue.tsx`, `apps/app/src/components/CourseCard.tsx`, `packages/ui/src/course.tsx`, `e2e/courses.spec.ts`.
