import { z } from 'zod'

/** Spec 092: GitLab step checks, verified by the server. */
export const GITLAB_CHECK_TYPES = [
  'gitlab_branch',
  'gitlab_mr_open',
  'gitlab_conventional_commit',
  'gitlab_pipeline_passed',
  'gitlab_commit_on_branch',
  'gitlab_file_on_branch',
  'gitlab_conventional_commit_on_branch',
] as const

/**
 * Spec 091: a step checked by an OPA / Rego policy against the learner's GitLab project. Parameters: `project`,
 * `files` (read on the default branch) and `policy` (a .rego file next to the module's content, in its repository).
 */
export const POLICY_CHECK_TYPE = 'opa_policy'

/** Spec 091: how policies are evaluated (setting `lab_policy_engine`). */
export const POLICY_ENGINES = ['none', 'server', 'cli'] as const
export type PolicyEngineKind = (typeof POLICY_ENGINES)[number]

/** `gitlab`: checked by the API against GitLab; `local`: checked on the learner's machine by the desktop app (093). */
export const LAB_PROVIDERS = ['gitlab', 'local'] as const
export type LabProvider = (typeof LAB_PROVIDERS)[number]

export const labStepSchema = z.object({
  title: z.string().trim().min(1, 'Step title is required').max(200),
  checkType: z.string().trim().min(1, 'checkType is required').max(100),
  /** Strings may contain `{{username}}` (or `{{ .Username }}`); GitLab checks need `project`. */
  checkParams: z.record(z.string(), z.unknown()).default({}),
})
export type LabStep = z.output<typeof labStepSchema>

/** Spec 090: a lab module's settings. Without steps, the lab is completed like a lesson. */
export const labConfigSchema = z.object({
  /** Link to the learner's workspace (e.g. their GitLab project); may contain `{{username}}`. */
  labUrl: z.string().trim().max(2048).nullable().optional(),
  provider: z.enum(LAB_PROVIDERS).default('gitlab'),
  steps: z.array(labStepSchema).max(50).default([]),
})
export type LabConfig = z.output<typeof labConfigSchema>
export type LabConfigInput = z.input<typeof labConfigSchema>

export const labCheckResultSchema = z.object({ allow: z.boolean(), violations: z.array(z.string()) }).meta({ id: 'LabCheckResult' })
export type LabCheckResult = z.infer<typeof labCheckResultSchema>

/** `POST …/steps/:index/record`: the result of a local check, reported by the desktop app (spec 093). */
export const labStepRecordSchema = z.object({ allow: z.boolean(), violations: z.array(z.string().max(500)).max(50).default([]) })

/** In a lab module's detail. */
export const labViewSchema = z
  .object({
    labUrl: z.string().nullable(),
    provider: z.enum(LAB_PROVIDERS),
    steps: z.array(
      z.object({
        index: z.number(),
        title: z.string(),
        checkType: z.string(),
        checkParams: z.record(z.string(), z.unknown()),
        passed: z.boolean(),
        lastCheck: labCheckResultSchema.extend({ checkedAt: z.string() }).nullable(),
      }),
    ),
  })
  .meta({ id: 'LabView' })
export type LabView = z.infer<typeof labViewSchema>

/** `POST …/steps/:index/check` and `…/record`. */
export const labStepCheckResponseSchema = labCheckResultSchema
  .extend({ completed: z.boolean(), courseCompleted: z.boolean() })
  .meta({ id: 'LabStepCheck' })
export type LabStepCheckResponse = z.infer<typeof labStepCheckResponseSchema>

/** `GET /api/admin/lab-checks` (spec 094). */
export const adminLabCheckSchema = z
  .object({
    id: z.string(),
    user: z.object({ id: z.string(), username: z.string(), email: z.string() }).nullable(),
    userEmail: z.string(),
    course: z.object({ id: z.string(), slug: z.string(), title: z.string() }).nullable(),
    module: z.string(),
    step: z.string().nullable(),
    allow: z.boolean(),
    violations: z.array(z.string()),
    verified: z.boolean(),
    checkedAt: z.string(),
  })
  .meta({ id: 'AdminLabCheck' })
export type AdminLabCheck = z.infer<typeof adminLabCheckSchema>
