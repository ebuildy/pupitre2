import { useTranslation } from '@pupitre/i18n'
import { ErrorState, LoadingState, toast, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pupitre/ui/components/ui/dialog'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../../lib/api.ts'

/** Spec 170: the course definition (spec 169), pretty-printed, with "Copier". */
export function DefinitionDialog({ courseId, slug, open, onOpenChange }: { courseId: string; slug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const definition = useQuery({
    queryKey: ['admin-definition', courseId],
    queryFn: () => unwrap(adminApi.courses[':id'].definition.$get({ param: { id: courseId } })),
    enabled: open,
    staleTime: 0,
  })
  const json = definition.data ? JSON.stringify(definition.data, null, 2) : ''
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('authoring.definitionTitle', { slug })}</DialogTitle>
          <DialogDescription className="sr-only">{t('authoring.definition')}</DialogDescription>
        </DialogHeader>
        {definition.isPending ? (
          <LoadingState label={t('courses.loading')} rows={2} />
        ) : definition.isError ? (
          <ErrorState message={definition.error.message} />
        ) : (
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-xs" data-testid="definition-json">
            {json}
          </pre>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!json}
            onClick={async () => {
              await navigator.clipboard.writeText(json)
              toast.success(t('authoring.copied'))
            }}
          >
            {t('authoring.copy')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('common:close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
