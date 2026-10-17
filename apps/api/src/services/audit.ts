import { db } from '../db/index.ts'
import { auditEvent } from '../db/schema/index.ts'

type Target = { type: string; id?: string | null; label?: string | null }

/** Spec 191 "AuditEvent": records a significant admin action. Never fails the action it records. */
export function audit(actor: { id: string; email: string } | null, action: string, target?: Target, details?: unknown) {
  try {
    db.insert(auditEvent)
      .values({
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        targetLabel: target?.label ?? null,
        details: details ?? null,
      })
      .run()
  } catch (err) {
    console.error('audit failed', err)
  }
}
