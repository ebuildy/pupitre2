# Sample course content

Served by the **fake content loader** (`CONTENT_LOADER=fake`, the default) in place of git repositories: a module
whose source is `repo` + `ref` + `path` reads `content-samples/<repo-name>/<path>`, where `<repo-name>` is the last
segment of the repository URL without `.git` (`https://git.example.com/pupitre/pupitre-docker.git` →
`pupitre-docker/`). The `ref` is ignored.

- `*.md`: lessons (markdown, admonitions `:::tip …:::`, fenced code).
- `*.yaml`: quizzes (spec 075 format: `passingScore`, `cooldown`, `maxAttemptsPerQuestion`, `lockOnMaxAttempts`,
  `questions` of type `single`, `multiple`, `boolean`, `order`).

Used by the mock data (`apps/api/src/fixtures`). Add a folder to simulate another repository.
