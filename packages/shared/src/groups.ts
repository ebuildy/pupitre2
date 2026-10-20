import { z } from 'zod'
import { MEMBERSHIP_ROLES } from './common.ts'

/** Spec 130 / 191. */
export const GROUP_MAX_DEPTH = 10
export const DEFAULT_GROUP_NAME = 'everyone'
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

export const adminGroupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    /** `local`, or the identity provider that created it. */
    origin: z.string(),
    parentId: z.string().nullable(),
    depth: z.number(),
    isDefault: z.boolean(),
    memberCount: z.number(),
    managerCount: z.number(),
    courseCount: z.number(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminGroup' })
export type AdminGroup = z.infer<typeof adminGroupSchema>

export const groupMemberSchema = z
  .object({
    userId: z.string(),
    username: z.string().nullable(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    role: z.enum(MEMBERSHIP_ROLES),
    origin: z.enum(MEMBERSHIP_ORIGINS),
    /** Recursive listings: the subgroup the membership is in. */
    groupId: z.string(),
    groupName: z.string(),
    addedAt: z.string(),
  })
  .meta({ id: 'GroupMember' })
export type GroupMember = z.infer<typeof groupMemberSchema>

export const groupCourseSchema = z
  .object({ courseId: z.string(), slug: z.string(), title: z.string(), enrolledAt: z.string() })
  .meta({ id: 'GroupCourse' })
export type GroupCourse = z.infer<typeof groupCourseSchema>

/** `GET /api/my/groups` (spec 136): the default group is left out. */
export const myGroupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    origin: z.string(),
    role: z.enum(MEMBERSHIP_ROLES),
    path: z.array(z.string()),
    courses: z.array(z.object({ slug: z.string(), title: z.string() })),
    members: z.array(z.object({ id: z.string(), username: z.string(), image: z.string().nullable(), role: z.enum(MEMBERSHIP_ROLES) })),
  })
  .meta({ id: 'MyGroup' })
export type MyGroup = z.infer<typeof myGroupSchema>

/** Spec 141: a user in the manager's scope. */
export const managerMemberSchema = z
  .object({
    id: z.string(),
    username: z.string().nullable(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    groups: z.array(z.object({ id: z.string(), name: z.string() })),
    enrolledCourses: z.number(),
  })
  .meta({ id: 'ManagerMember' })
export type ManagerMember = z.infer<typeof managerMemberSchema>

/** Spec 141: one course of a member, as the manager sees it. */
export const managerMemberCourseSchema = z
  .object({
    courseId: z.string(),
    slug: z.string(),
    title: z.string(),
    sources: z.array(z.string()),
    /** The manager can withdraw it: a manager grant exists. */
    removable: z.boolean(),
  })
  .meta({ id: 'ManagerMemberCourse' })
export type ManagerMemberCourse = z.infer<typeof managerMemberCourseSchema>

/** Spec 140: what the signed-in user manages (empty for non-managers). */
export const managerScopeSchema = z
  .object({ groups: z.array(adminGroupSchema), canManage: z.boolean() })
  .meta({ id: 'ManagerScope' })
export type ManagerScope = z.infer<typeof managerScopeSchema>
