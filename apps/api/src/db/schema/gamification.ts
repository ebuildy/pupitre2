import { SKILL_LEVELS } from '@pupitre/shared'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { courseModule } from './content.ts'
import { course, createdAt } from './courses.ts'

/** Spec 191 "Skill": created on the fly when a module references a new slug. */
export const skill = sqliteTable('skill', {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text().notNull().unique(),
  label: text().notNull(),
  description: text(),
  createdAt: createdAt(),
})

/** Spec 110: the skills a module teaches. A course's skills are those of its visible modules. */
export const moduleSkill = sqliteTable(
  'module_skill',
  {
    moduleId: text()
      .notNull()
      .references(() => courseModule.id, { onDelete: 'cascade' }),
    skillId: text()
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.moduleId, t.skillId] }), index('module_skill_skill_idx').on(t.skillId)],
)

/**
 * Spec 191 "BadgeAward": once per (user, course). Keeps the badge and course title as awarded, so editing or deleting
 * the course does not change it.
 */
export const badgeAward = sqliteTable(
  'badge_award',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    courseId: text().references(() => course.id, { onDelete: 'set null' }),
    courseTitle: text().notNull(),
    name: text().notNull(),
    icon: text().notNull(),
    awardedAt: createdAt(),
  },
  (t) => [uniqueIndex('badge_award_user_course_idx').on(t.userId, t.courseId), index('badge_award_course_idx').on(t.courseId)],
)

/** Spec 113 / 191 "SkillLevel": one per (user, skill). */
export const skillLevel = sqliteTable(
  'skill_level',
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    skillId: text()
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
    level: text({ enum: SKILL_LEVELS }).notNull(),
    completedCourses: integer().notNull().default(0),
    totalCourses: integer().notNull().default(0),
    updatedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] })],
)
