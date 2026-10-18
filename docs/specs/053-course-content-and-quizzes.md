# 053 — Course content, progress and quizzes

| Field | Value |
| --- | --- |
| Area | Course consumption |
| Actors | enrolled learner, admin |
| Related | [045](045-course-page-and-enrollment.md), [103](103-xp.md), [015](015-dev-seed-data.md) |

Covers the original 053–056 (modules, locking, hidden, lesson player), 058–059 (markdown, admonitions), 064 (content from
git, through a fake loader for now), 067–068 (lesson completion, course completion), 075–085 (quizzes) and 100–101
(progress), on the spec 191 model.

## Data (spec 191)

| Table | Content |
| --- | --- |
| `module` | course, `position`, `slug` (unique per course; letters of any script, digits, `-`, `_`), `name`, `type` (`text`, `quiz`; `video`, `image`, `lab` reserved), `hidden`, `inline` (quizzes only), and **exactly one** content source: `body` (written in the platform) or `sourceRepo` + `sourceRef` + `sourcePath` |
| `module_prerequisite` | module → required module (same course) |
| `module_progress` | per (user, module): `viewedAt`, `bestScore`, `maxScore`, `attempts`, `passedAt` (first pass, never cleared), `lastActivityAt` |
| `quiz_submission` | every submission: answers, score, max, passed, per-question results |
| `question_attempt_state` | per (user, module, question key): failed attempts, `cooldownUntil`, `locked` |

Everything references the module **id**: renaming, moving or re-slugging a module keeps progress and attempts.
Deleting a module deletes its progress, submissions and attempt states; completions and XP already earned stay.

**Quiz questions** are not rows: a quiz's content is a document (YAML, below), written in the platform or read from a
repository, and each question is identified by its `id` (key), unique within the quiz. This keeps git-sourced quizzes
free of a sync step; attempt states reference (module, key).

## Content loading (spec 064)

- `ContentLoader.read({ repo, ref, path })` returns a file's text. `CONTENT_LOADER=fake` (default) is the only
  implementation so far: `FakeContentLoader` reads `CONTENT_SAMPLES_DIR` (default `apps/api/content-samples`)
  `/<repo name>/<path>`, where the repo name is the last URL segment without `.git`; `ref` is ignored; paths that leave
  the repository folder are refused. `CONTENT_LOADER=git` stops the API at startup ("not implemented yet").
- A lesson whose source can't be read shows "⚠️ Ce contenu n’est pas encore disponible…" (`lesson.unavailable`); a
  quiz answers 502 `Failed to fetch quiz content`; an invalid quiz document answers 500 `Invalid quiz: …`.

## Rendering (specs 058, 059)

On the server (markdown-it, `html: false`, then sanitize-html): GFM tables, linkified URLs, highlighted fenced code
(highlight.js classes), heading ids `heading-N` and a table of contents from h2/h3, external links in a new tab, and
admonitions `:::note|tip|info|warning|danger|caution Title` / `:::type[Title]` … `:::` (ignored inside fenced code,
left as is when unclosed). Quiz prompts, answers and feedback are markdown too.

## Quiz document (spec 075)

```yaml
title: Quiz final — Docker
passingScore: 70                 # percent, default 80
cooldown: { strategy: exponential, baseSeconds: 5, multiplier: 2, maxSeconds: 60 }   # baseSeconds 0 = none (default)
maxAttemptsPerQuestion: 5        # optional
lockOnMaxAttempts: true          # default false
questions:
  - id: noyau                     # key, unique in the quiz
    type: single                  # single | multiple | boolean | order
    points: 1                     # default 1
    question: Qu'est-ce qu'un conteneur partage avec sa machine hôte ?
    answers: [{ id: noyau, text: Le noyau, correct: true }, { id: bios, text: Le BIOS }]
    feedback: { correct: "…", wrong: "…" }
  - { id: q2, type: multiple, partialScoring: { enabled: true, allowNegative: false }, answers: [...], question: … }
  - { id: q3, type: boolean, correctAnswer: false, question: … }
  - { id: q4, type: order, items: [{ id: a, text: … }], correctOrder: [a, …], question: … }
```

Validated with `quizDocumentSchema` (`@pupitre/shared`): `single` has exactly one correct answer, `multiple` at least
one, `order`'s `correctOrder` lists every item once, keys are unique.

## Rules

- **Access**: content is for enrolled learners (any grant) and admins. A course the user can't see → 404; visible but
  not enrolled → 403 `Enroll in this course to access its content`.
- **Hidden** modules are left out for learners (lists, navigation, completion); admins see them with "masqué".
- **Done**: a quiz is done once passed; any other module once viewed.
- **Locked** (never for admins): a prerequisite is not done, or — for a non-inline module — the previous non-inline
  module is not done. The first module is always open. Locked modules answer 403 `Module is locked`.
- **Inline quiz**: a quiz with `inline: true` right after a lesson. No row and no page of its own (its URL leads to
  the lesson); embedded at the bottom of the lesson; outside the sequential order; counts for completion.
- **Lesson completion** `POST …/complete`: sets `viewedAt` (once) and earns 10 XP once.
- **Scoring** (server only, spec 077): single/boolean/order all-or-nothing; multiple full points for the exact set,
  else partial `round(points × (right − wrong) / correctCount)` (floored at 0 unless `allowNegative`) when enabled.
  `passed` = score / max × 100 ≥ `passingScore`.
- **Attempts** (specs 080, 081): a correct answer clears the question's state; a wrong one counts a failure and sets
  `cooldownUntil` = now + wait (`fixed`: base; `linear`: base × attempts; `exponential`: base × multiplier^(attempts−1);
  capped at `maxSeconds` when > 0). Reaching `maxAttemptsPerQuestion` with `lockOnMaxAttempts` locks the question: it
  scores 0 and stays in the maximum until an admin resets the learner's attempts. While any (unlocked) question is
  cooling down, `submit` answers **425** `{ error: "Cooldown active for some questions", cooldowns }` and scores nothing.
- **Progress**: each submission adds an attempt, keeps the best score, sets `passedAt` on the first pass (+25 XP once),
  and is kept in `quiz_submission`.
- **Course completion** (spec 068): when every visible module is done, the request that completes the last one creates
  the completion and grants the course's completion XP (`completeCourse`, spec 103). Admins can still mark completions
  by hand.
- **Confidentiality** (spec 085): learners never receive `correct`, `correctAnswer`, `correctOrder` or feedback before
  submitting; the result reveals the expected answers and the feedback.

## API

| Endpoint | Result |
| --- | --- |
| `GET /api/courses/:slug/modules` | `{ modules: ModuleSummary[], progress: { done, total } }` (`total` excludes hidden modules) |
| `GET /api/courses/:slug/modules/:moduleSlug` | `ModuleDetail`: summary + `lesson { html, toc, unavailable }` or `quiz { title, passingScore, maxScore, questions, cooldowns }`, `inlineQuiz { module, quiz }`, `hostSlug` (inline quiz), `previous`, `next` |
| `POST /api/courses/:slug/modules/:moduleSlug/complete` | non-quiz → `{ courseCompleted }` (400 for quizzes) |
| `POST /api/courses/:slug/modules/:moduleSlug/submit` `{ answers: { key: {single} \| {multiple} \| {boolean} \| {order} } }` | `QuizResult { score, maxScore, passed, passingScore, questionResults[], cooldowns, courseCompleted }`; 400 `Module is not a quiz`; 425 cooldown |
| `GET /api/admin/courses/:id/modules` | `{ modules: AdminModule[] }` |
| `PUT /api/admin/courses/:id/modules` `{ modules: ModuleInput[] }` | replaces the list in order, matched by slug (ids kept); 400 on duplicate slugs, unknown prerequisites, misplaced inline quiz, invalid inline quiz document |
| `DELETE /api/admin/users/:id/quiz-attempts` | resets the learner's cooldowns and locks → `{ message, count }` |

## UI

- **Course page** (enrolled or admin): "Contenu du cours · N modules", "x/y complétés" with a progress bar and
  "Commencer / Continuer / Revoir le cours ▸" (first open module not done, or the lesson of a pending inline quiz); one
  row per module (icon, name, type, "Verrouillé", "N tentatives", "✓ x/y pts", "✓ Vu", inline quiz "✓ Quiz" /
  "🧩 Quiz à valider", "masqué"); locked rows are not links.
- **Lesson** `/courses/:slug/lessons/:moduleSlug`: module tree with ✓ and progress (left), breadcrumb and content
  (centre), "Sur cette page" table of contents (right); the mini-quiz below the content; "◂ Précédent" / "◂ Cours" and
  the next action: a button that completes then navigates ("Suivant ▸", "Passer au quiz ▸", on the last module
  "Terminer le cours ▸" or "Terminer la leçon ▸" + "Validez le quiz ci-dessous pour terminer le cours." while the
  inline quiz is pending) when the module isn't done yet or is the last one, else a link. Locked → back to the course.
- **Quiz** `/courses/:slug/quiz/:moduleSlug`: question cards (radio, checkbox, Vrai/Faux, ↑/↓ ordering), "Navigation"
  palette with "Répondues x / N" and "Soumettre le quiz", live "⏳ Réessayez dans N s" / "🔒 Question verrouillée"
  banners; result: score circle, "✓ Quiz réussi !" / "✗ Quiz échoué", "Recommencer" (disabled while cooling down),
  "Module suivant ▸", "Retour au cours", and the correction ("Bonne réponse : …", feedback). Copy, cut and the context
  menu are blocked on quizzes (spec 084).
- **Admin**: user page button "Réinitialiser les tentatives de quiz". No module editor yet (the API above is what it
  will use).

## Differences from the original

- Progress, attempts and submissions reference module ids (the original used positions and slugs).
- Quiz settings live in the quiz document for both inline and git-sourced quizzes; questions are identified by key.
- URLs use module slugs instead of positions.
- Locked questions are defined: they score 0 until an admin resets the learner's attempts.
- Not yet: lab modules (090), source references in feedback. Markdown patterns: [061](061-markdown-patterns.md). Git content, indexes and cache:
  [064](064-git-content.md). Done since: video / image modules ([062](062-media.md)), module editor ([169](169-course-authoring.md)),
  prerequisites and auto-enrollment ([050](050-prerequisites-and-auto-enrollment.md)).

## Rendering extras

- **Mermaid (060)**: ` ```mermaid ` blocks become `<pre class="mermaid">` (escaped source); the lesson page loads the
  library only when a page has one, draws the diagrams in the current theme, redraws on theme change, and keeps the
  source when a diagram fails.
- **Reading mode (057)**: a floating button switches between "docs" (modules, content, table of contents) and "focus"
  (content only, centred): "Lecture focus" / "Mode docs", remembered in `localStorage['pupitre.readingMode']`.
- **Anti-copy (084)**: on quizzes, `copy`, `cut` and the context menu are cancelled outside inputs.

## Source

`packages/shared/src/content.ts`, `apps/api/src/content/` (loader, markdown), `apps/api/src/services/learning.ts`,
`apps/api/src/services/modules-admin.ts`, `apps/api/src/routes/modules.ts`, `apps/api/content-samples/`,
`apps/app/src/routes/LessonPage.tsx`, `apps/app/src/routes/QuizPage.tsx`, `apps/app/src/components/quiz/`,
`apps/app/src/components/ModuleList.tsx`, `e2e/content.spec.ts`.
