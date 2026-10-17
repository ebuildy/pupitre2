import { useTranslation } from '@pupitre/i18n'
import { unwrap } from '@pupitre/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api.ts'
import { SessionCard } from './SessionCard.tsx'

/** Spec 152: the sessions of an in-person course, on its page. */
export function CourseSessions({ slug }: { slug: string }) {
  const { t } = useTranslation('app')
  const { data } = useQuery({
    queryKey: ['sessions', { courseSlug: slug }],
    queryFn: () => unwrap(api.api.sessions.$get({ query: { courseSlug: slug } })),
  })
  if (!data) return null
  return (
    <section className="flex flex-col gap-3" aria-labelledby="course-sessions">
      <h2 id="course-sessions" className="text-xl font-semibold tracking-tight">
        {t('sessions.courseTitle')}
      </h2>
      {data.sessions.length === 0 ? (
        <p className="text-muted-foreground">{t('sessions.courseEmpty')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </section>
  )
}
