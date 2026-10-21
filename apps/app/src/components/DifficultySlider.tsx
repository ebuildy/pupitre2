import { useTranslation } from '@pupitre/i18n'
import { DIFFICULTIES, type Difficulty } from '@pupitre/shared'
import { Slider } from '@pupitre/ui/components/ui/slider'
import { cn } from '@pupitre/ui/lib/utils'
import { useState } from 'react'

/** Stops of the slider: every difficulty first, then each level. */
const STOPS = ['', ...DIFFICULTIES] as const
type Stop = (typeof STOPS)[number]

/**
 * Spec 041: the catalogue's difficulty filter as a stepped slider. The thumb follows the pointer at once; the filter
 * (URL) changes when it is released, or on each key press.
 */
export function DifficultySlider({ value, onChange }: { value: Difficulty | ''; onChange: (value: Difficulty | '') => void }) {
  const { t } = useTranslation(['app', 'common'])
  const [index, setIndex] = useState(() => Math.max(0, STOPS.indexOf(value)))
  // Back / forward navigation changes the URL under us: follow it (adjusting state while rendering, not in an effect).
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setIndex(Math.max(0, STOPS.indexOf(value)))
  }

  const label = (stop: Stop) => (stop ? t(`common:difficulty.${stop}`) : t('catalogue.difficultyAll'))
  const commit = (i: number) => {
    setIndex(i)
    if (STOPS[i] !== value) onChange(STOPS[i] ?? '')
  }
  const last = STOPS.length - 1

  return (
    <div className="flex w-full flex-col gap-2 px-1 sm:w-80" data-testid="difficulty-slider">
      <Slider
        min={0}
        max={last}
        step={1}
        value={[index]}
        onValueChange={([i]) => setIndex(i ?? 0)}
        onValueCommit={([i]) => commit(i ?? 0)}
        thumbProps={{ 'aria-label': t('catalogue.difficultyLabel'), 'aria-valuetext': label(STOPS[index] ?? '') }}
        // The thumb and the range glide from one stop to the next.
        className="py-2 [&_[data-slot=slider-range]]:transition-[left,right] [&_[data-slot=slider-range]]:duration-200 [&_[data-slot=slider-range]]:ease-out [&>span:has(>[data-slot=slider-thumb])]:transition-[left] [&>span:has(>[data-slot=slider-thumb])]:duration-200 [&>span:has(>[data-slot=slider-thumb])]:ease-out"
      />
      {/* Stop labels, under their stop; clicking one is a shortcut (the slider itself is the accessible control). */}
      <div className="relative h-4 text-xs" aria-hidden="true">
        {STOPS.map((stop, i) => (
          <button
            key={stop || 'all'}
            type="button"
            tabIndex={-1}
            onClick={() => commit(i)}
            style={{ left: `${(i / last) * 100}%` }}
            className={cn(
              'absolute top-0 whitespace-nowrap transition-colors duration-200',
              i === 0 ? 'translate-x-0' : i === last ? '-translate-x-full' : '-translate-x-1/2',
              i === index ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label(stop)}
          </button>
        ))}
      </div>
    </div>
  )
}
