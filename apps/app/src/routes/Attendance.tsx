import { useTranslation } from '@pupitre/i18n'
import { ATTENDANCES, type Attendance as AttendanceValue } from '@pupitre/shared'
import { EmptyState, ErrorState, isNotFound, LoadingState, PageHeader, toast, unwrap } from '@pupitre/ui'
import { Card } from '@pupitre/ui/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api } from '../lib/api.ts'

/** Spec 155: presence sheet of a session (admins and managers); each change saves at once. */
export function Attendance() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation(['app', 'common'])
  const queryClient = useQueryClient()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['attendance', id],
    queryFn: () => unwrap(api.api.sessions[':id'].participants.$get({ param: { id } })),
  })
  const mark = useMutation({
    mutationFn: (input: { userId: string; attendance: AttendanceValue }) =>
      unwrap(api.api.sessions[':id'].participants[':userId'].$patch({ param: { id, userId: input.userId }, json: { attendance: input.attendance } })),
    onSuccess: async () => {
      toast.success(t('attendance.saved'))
      await queryClient.invalidateQueries({ queryKey: ['attendance', id] })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex flex-col gap-6">
      <Link to="/agenda" className="text-sm text-muted-foreground hover:text-foreground">
        {t('attendance.back')}
      </Link>
      {isPending ? (
        <LoadingState label={t('attendance.loading')} />
      ) : isError ? (
        <ErrorState message={isNotFound(error) ? t('agenda.noSession') : error.message} />
      ) : (
        <>
          <PageHeader
            title={`${t('attendance.title')} — ${data.session.title}`}
            description={`${data.session.course.title} · ${t('sessions.when', { date: new Date(data.session.startsAt) })}${data.session.location ? ` · ${data.session.location}` : ''}`}
          />
          {data.participants.length === 0 ? (
            <EmptyState icon="🪑" title={t('attendance.empty')} />
          ) : (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('attendance.columns.participant')}</TableHead>
                    <TableHead>{t('attendance.columns.email')}</TableHead>
                    <TableHead>{t('attendance.columns.bookedAt')}</TableHead>
                    <TableHead>{t('attendance.columns.attendance')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.participants.map((p) => (
                    <TableRow key={p.userId}>
                      <TableCell className="font-medium">{p.username ?? p.name}</TableCell>
                      <TableCell>{p.email}</TableCell>
                      <TableCell>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(p.bookedAt))}</TableCell>
                      <TableCell>
                        <NativeSelect
                          aria-label={`${t('attendance.columns.attendance')} ${p.username ?? p.name}`}
                          value={p.attendance}
                          onChange={(e) => mark.mutate({ userId: p.userId, attendance: e.target.value as AttendanceValue })}
                        >
                          {ATTENDANCES.map((a) => (
                            <NativeSelectOption key={a} value={a}>
                              {t(`attendance.values.${a}`)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
