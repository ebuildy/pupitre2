# 091 — Lab checks by policy (OPA / Rego)

A lab step can be checked by a Rego policy evaluated against the learner's GitLab project, next to the built-in
GitLab step checks of spec 092.

## Authoring

- A step of type `opa_policy` with parameters `project` (may contain `{{username}}` / `{{ .Username }}`), `files`
  (paths read on the project's default branch) and `policy` (a `.rego` file, relative to the module's content file).
- Or, as in the original: a GitLab lab **without steps** whose content comes from git, with a `check.yaml` next to the
  content file. It becomes one step, "Vérification du lab" (or its `title`):

  ```yaml
  provider: gitlab
  project: "e-learning/{{ .Username }}"
  files: ["lab.py"]
  policy: "check.rego"
  ```

- The policy is always read from the lab's repository (same repository and ref as the content, through the content
  loader). It may not leave the repository (`..` is refused). Raw Rego is never accepted from a request.
- The policy declares `package checker.lab`; its `allow` (boolean) and `violations` (set of strings) are the verdict.
  Sample: `apps/api/content-samples/pupitre-git/labs/merge-request/`.

## Policy input

```json
{ "project": { "id", "name", "pathWithNamespace", "defaultBranch" },
  "openMrs": [{ "iid", "title", "sourceBranch", "pipelineStatus", "commits": [{ "message" }] }],
  "mergedMrCount": 0,
  "files": { "lab.py": "…content on the default branch…" } }
```

Missing files are absent from `files`. An unknown project answers "Projet introuvable : …" without evaluating.
Inputs over 5 MB are refused.

## Engines

`PolicyEngine` (`apps/api/src/services/policy.ts`) has one method, `evaluate(policy, input)`, and two implementations,
chosen by the platform setting `lab_policy_engine` (admin "Paramètres" → "🧪 Vérification des labs par politique (OPA)"):

| Setting | Class | How |
| --- | --- | --- |
| `none` (default) | — | the step fails with "Moteur de politiques non configuré" |
| `server` | `OpaServerEngine(opa_url)` | OPA REST API: `PUT /v1/policies/pupitre-<hash>` once per policy, with its package renamed to `pupitre.labs.<hash>` so labs never share rules, then `POST /v1/data/pupitre/labs/<hash> {input}` |
| `cli` | `OpaCliEngine(OPA_BIN)` | `opa eval --format json --capabilities <file> --data check.rego --input input.json data.checker.lab` |

- The CLI engine removes `http.*`, `net.*` and `opa.runtime` from `opa capabilities --current` (as the original
  checker did). An OPA server cannot be restricted per request: start it with such a capabilities file.
- The binary path is an environment variable (`OPA_BIN`, default `opa`), not a setting: admins cannot make the server
  run a program. `opa_url` is a setting (`server` engine only).
- Timeouts: 10 s per server call, 15 s per `opa` run.
- Engine and policy problems (unreachable server, invalid policy, policy path outside the repository, unreadable
  policy) answer 502 with the reason and are not recorded as attempts; a verdict is recorded like any check (spec 094).

## Tests

`e2e/fake-opa.mjs` stands in for the OPA server and `e2e/fake-opa-cli.mjs` for the binary (`OPA_BIN` in the e2e
config). They do not evaluate Rego: tests set the verdict per project and check what was evaluated (policy text,
package, input). Tests are in `e2e/global-settings.spec.ts` (the engine is a platform setting).

## Differences from the original

- No separate checker service: the API builds the input and calls the engine; OPA is either a server or a binary,
  chosen at run time.
- Policies are checks of steps, so a lab can mix policy steps with GitLab and local steps; `check.yaml` remains
  supported for labs without steps.
- The policy is read through the content loader (cached clones, spec 064), not fetched again on every check.
- Rego is not evaluated in the e2e suite (no OPA binary there); the engines' requests and the result handling are.
  The sample policy and the CLI flow (`opa capabilities --current`, filtered capabilities refusing `http.send`, `opa eval`
  JSON output) were checked by hand with `openpolicyagent/opa:1.4.2`.

## Source

- Original spec: `../../pupitre/docs/spec/091-lab-policy-check.md`, `../../pupitre/checker-service/`
- `apps/api/src/services/policy.ts`, `apps/api/src/routes/modules.ts`, `packages/shared/src/labs.ts`,
  `packages/shared/src/settings.ts`, `apps/admin/src/routes/Settings.tsx`
- Tests: `e2e/global-settings.spec.ts`, `e2e/fake-opa.mjs`, `e2e/fake-opa-cli.mjs`
