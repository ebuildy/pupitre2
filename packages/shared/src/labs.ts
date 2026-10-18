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

export type LabCheckResult = { allow: boolean; violations: string[] }

/** In a lab module's detail. */
export type LabView = {
  labUrl: string | null
  provider: LabProvider
  steps: { index: number; title: string; checkType: string; checkParams: Record<string, unknown>; passed: boolean; lastCheck: (LabCheckResult & { checkedAt: string }) | null }[]
}

/** `POST …/steps/:index/check` and `…/record`. */
export type LabStepCheckResponse = LabCheckResult & { completed: boolean; courseCompleted: boolean }

/** `GET /api/admin/lab-checks` (spec 094). */
export type AdminLabCheck = {
  id: string
  user: { id: string; username: string; email: string } | null
  userEmail: string
  course: { id: string; slug: string; title: string } | null
  module: string
  step: string | null
  allow: boolean
  violations: string[]
  verified: boolean
  checkedAt: string
}
