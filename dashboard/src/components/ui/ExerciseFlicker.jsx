import { useState, useEffect } from 'react'
import { resolveImageSrc } from '../../lib/api'

/**
 * ExerciseFlicker — cycles through an array of exercise_images rows (or a
 * single legacy thumbnail string) like a flipbook/GIF, auto-advancing on
 * a timer. Falls back to a static single image when there's only one
 * frame, and to a placeholder block when there are none.
 *
 * Pauses automatically when the tab/window isn't visible (no point
 * burning cycles on a hidden tab) and when the component unmounts.
 *
 * IMPORTANT for callers: pass a stable, unique `key` on the
 * ExerciseFlicker element itself (e.g. the exercise_id) whenever the
 * same component slot might display a different exercise's images over
 * time (e.g. a plan list -> detail sub-view, or any list of exercises).
 * A key change makes React remount the component, which naturally
 * resets the internal frame index to 0 — no manual reset logic needed.
 */
export default function ExerciseFlicker({
  images,            // array of exercise_images rows, OR a single thumbnail string/null
  alt = '',
  className,
  placeholderClassName,
  placeholderText = '?',
  intervalMs = 220,  // ~150-300ms per frame, per the reference example
}) {
  const frames = Array.isArray(images) ? images : (images ? [images] : [])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (frames.length <= 1) return undefined // nothing to animate

    function tick() {
      if (document.hidden) return // skip work on a hidden tab
      setIndex(i => (i + 1) % frames.length)
    }

    const timerId = setInterval(tick, intervalMs)
    return () => clearInterval(timerId)
  }, [frames.length, intervalMs])

  if (frames.length === 0) {
    return <div className={placeholderClassName}>{placeholderText}</div>
  }

  const src = resolveImageSrc(frames[index] ?? frames[0])

  return <img src={src} alt={alt} className={className} />
}