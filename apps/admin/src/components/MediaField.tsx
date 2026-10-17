import { useTranslation } from '@pupitre/i18n'
import { ApiRequestError, toast } from '@pupitre/ui'
import { Input } from '@pupitre/ui/components/ui/input'
import { useState } from 'react'

/** Spec 062: `POST /api/admin/media` (multipart), answers the served URL. */
export async function uploadMedia(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/admin/media', { method: 'POST', body })
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
  if (!res.ok || !data?.url) throw new ApiRequestError(res.status, data?.error ?? `HTTP ${res.status}`)
  return data.url
}

/** A media URL input with an upload button (images and videos). */
export function MediaField({
  id,
  name,
  value,
  onChange,
  accept,
}: {
  id: string
  name?: string
  value: string
  onChange: (url: string) => void
  accept: string
}) {
  const { t } = useTranslation('admin')
  const [uploading, setUploading] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/uploads/… ou https://…" className="min-w-60 flex-1" />
      <label className="cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-muted">
        {uploading ? t('authoring.modules.uploading') : t('authoring.modules.upload')}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setUploading(true)
            try {
              onChange(await uploadMedia(file))
              toast.success(t('authoring.modules.uploaded'))
            } catch (err) {
              toast.error((err as Error).message)
            } finally {
              setUploading(false)
              e.target.value = ''
            }
          }}
        />
      </label>
    </div>
  )
}
