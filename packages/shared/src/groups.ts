import { z } from 'zod'

/** Spec 130 / 191. */
export const GROUP_MAX_DEPTH = 10
export const DEFAULT_GROUP_NAME = 'everyone'
export const MEMBERSHIP_ROLES = ['member', 'manager'] as const
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number]
/** `idp`: synced from an identity provider (SSO); `default`: the `everyone` group. */
export const MEMBERSHIP_ORIGINS = ['manual', 'idp', 'default'] as const
export type MembershipOrigin = (typeof MEMBERSHIP_ORIGINS)[number]

const groupName = z.string().trim().min(1, 'name required').max(100)

export const groupCreateSchema = z.object({
  name: groupName,
  description: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
})
export type GroupCreateInput = z.input<typeof groupCreateSchema>

export const groupUpdateSchema = z.object({
  name: groupName.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  /** Move (spec 132): null = root. */
  parentId: z.string().min(1).nullable().optional(),
})
export type GroupUpdateInput = z.input<typeof groupUpdateSchema>

export const membershipSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  role: z.enum(MEMBERSHIP_ROLES).default('member'),
})
export type MembershipInput = z.input<typeof membershipSchema>

export type AdminGroup = {
  id: string
  name: string
  description: string | null
  /** `local`, or the identity provider that created it. */
  origin: string
  parentId: string | null
  depth: number
  isDefault: boolean
  memberCount: number
  managerCount: number
  courseCount: number
  createdAt: string
}

export type GroupMember = {
  userId: string
  username: string | null
  name: string
  email: string
  image: string | null
  role: MembershipRole
  origin: MembershipOrigin
  /** Recursive listings: the subgroup the membership is in. */
  groupId: string
  groupName: string
  addedAt: string
}

export type GroupCourse = { courseId: string; slug: string; title: string; enrolledAt: string }

/** `GET /api/my/groups` (spec 136): the default group is left out. */
export type MyGroup = {
  id: string
  name: string
  description: string | null
  origin: string
  role: MembershipRole
  path: string[]
  courses: { slug: string; title: string }[]
  members: { id: string; username: string; image: string | null; role: MembershipRole }[]
}

/** Spec 141: a user in the manager's scope. */
export type ManagerMember = {
  id: string
  username: string | null
  name: string
  email: string
  image: string | null
  groups: { id: string; name: string }[]
  enrolledCourses: number
}

/** Spec 141: one course of a member, as the manager sees it. */
export type ManagerMemberCourse = {
  courseId: string
  slug: string
  title: string
  sources: string[]
  /** The manager can withdraw it: a manager grant exists. */
  removable: boolean
}

/** Spec 140: what the signed-in user manages (empty for non-managers). */
export type ManagerScope = { groups: AdminGroup[]; canManage: boolean }
