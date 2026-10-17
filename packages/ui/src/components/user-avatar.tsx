import { isImageUrl } from '@pupitre/shared'
import { Avatar, AvatarFallback, AvatarImage } from '@pupitre/ui/components/ui/avatar'
import { cn } from '@pupitre/ui/lib/utils'

/**
 * Spec 035 avatar rule: an `http(s)://` value is an image (initial while loading or on error), any other value is
 * shown as text (an emoji), none = the first letter of the name.
 */
export function UserAvatar({ image, name, className }: { image: string | null | undefined; name: string; className?: string }) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?'
  const emoji = image && !isImageUrl(image) ? image : null
  return (
    <Avatar className={cn('size-8', className)}>
      {image && isImageUrl(image) && <AvatarImage src={image} alt="" />}
      <AvatarFallback className={cn('font-semibold', emoji ? 'bg-secondary text-[1.1em]' : 'bg-primary/15 text-primary')}>
        {emoji ?? initial}
      </AvatarFallback>
    </Avatar>
  )
}
