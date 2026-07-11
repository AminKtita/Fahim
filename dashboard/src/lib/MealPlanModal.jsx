/**
 * MealPlanModal — "Suggest meals for today" popup.
 * Calls /api/meal-recommend (pure-Python macro-fit engine, no LLM) which
 * picks a recipe + portion scale per meal slot to best fill whatever is
 * left of today's macro budget. Each suggestion can be logged directly
 * via the existing meal-logging endpoint (same one "Add from recipe" uses).
 */

import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getMealPlan, logMeal, resolveRecipeImageSrc } from './api'
import styles from './MealPlanModal.module.css'
import dayjs from 'dayjs'

export function useMealPlanModals({ onSaved } = {}) {
  const [date, setDate] = useState(null)
  const [numMeals, setNumMeals] = useState(3)
  const [loggedSlots, setLoggedSlots] = useState({}) // slot index -> true once logged
  const [logging, setLogging] = useState(null)        // slot index currently being logged
  const [error, setError] = useState(null)

  const { data: plan, refetch, loading } = useApi(
    () => (date ? getMealPlan(date, numMeals) : Promise.resolve(null)),
    [date, numMeals]
  )

  const open = (iso = dayjs().format('YYYY-MM-DD')) => {
    setDate(iso); setLoggedSlots({}); setError(null)
  }
  const close = () => { setDate(null); setLoggedSlots({}); setError(null) }

  const regenerate = () => { setLoggedSlots({}); refetch() }

  const logSlot = async (slot, index) => {
    if (!slot.recipe) return
    setLogging(index)
    setError(null)
    try {
      await logMeal({
        log_date: date,
        recipe_id: slot.recipe.id,
        recipe_name_snapshot: slot.recipe.name,
        calories: slot.macros.calories,
        protein_g: slot.macros.protein_g,
        carbs_g: slot.macros.carbs_g,
        fat_g: slot.macros.fat_g,
        notes: `Suggested ${slot.label} (x${slot.scale})`,
      })
      setLoggedSlots(s => ({ ...s, [index]: true }))
      onSaved?.()
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not log this meal.')
    } finally {
      setLogging(null)
    }
  }

  function Modals() {
    if (!date) return null

    return (
      <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div className={styles.modal}>
          <div className={styles.mHead}>
            <div className={styles.mTitle}>
              <span className={styles.mLabel}>Suggest meals</span>
              <span className={styles.mDate}>{dayjs(date).format('dddd, MMMM D')}</span>
            </div>
            <div className={styles.headActions}>
              <select className={styles.mealCountSelect} value={numMeals}
                onChange={e => setNumMeals(Number(e.target.value))}>
                {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} meals</option>)}
              </select>
              <button className={styles.mClose} onClick={close}>✕</button>
            </div>
          </div>

          <div className={styles.mBody}>
            {loading && <div className={styles.statusMsg}>Calculating…</div>}

            {plan?.error && (
              <div className={styles.errorCard}>{plan.error}</div>
            )}

            {plan && !plan.error && (
              <>
                <div className={styles.summaryRow}>
                  <MacroPill label="Calories left" value={plan.remaining_before.calories} unit="kcal" />
                  <MacroPill label="Protein left" value={plan.remaining_before.protein_g} unit="g" />
                  <MacroPill label="Carbs left" value={plan.remaining_before.carbs_g} unit="g" />
                  <MacroPill label="Fat left" value={plan.remaining_before.fat_g} unit="g" />
                </div>

                <div className={styles.slotList}>
                  {plan.slots.map((slot, i) => (
                    <div key={i} className={styles.slotCard}>
                      <div className={styles.slotHead}>
                        <span className={styles.slotLabel}>{slot.label}</span>
                        {slot.recipe && <span className={styles.slotCategory}>{slot.recipe.category}</span>}
                      </div>

                      {!slot.recipe ? (
                        <div className={styles.slotEmpty}>No suitable recipe found for this slot.</div>
                      ) : (
                        <>
                          <div className={styles.slotBody}>
                            {slot.recipe.image_url && (
                              <img className={styles.slotImg}
                                src={resolveRecipeImageSrc(slot.recipe.image_url)} alt="" />
                            )}
                            <div className={styles.slotInfo}>
                              <div className={styles.slotName}>
                                {slot.recipe.name}
                                <span className={styles.slotScale}>× {slot.scale}</span>
                              </div>
                              <div className={styles.slotMacros}>
                                {slot.macros.calories} kcal · {slot.macros.protein_g}g P ·
                                {' '}{slot.macros.carbs_g}g C · {slot.macros.fat_g}g F
                              </div>
                            </div>
                          </div>
                          <button
                            className={loggedSlots[i] ? styles.slotBtnDone : styles.slotBtn}
                            disabled={loggedSlots[i] || logging === i}
                            onClick={() => logSlot(slot, i)}
                          >
                            {loggedSlots[i] ? '✓ Logged' : logging === i ? 'Logging…' : 'Log this meal'}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className={styles.leftoverRow}>
                  <span className={styles.leftoverLabel}>Left over after this plan</span>
                  <span className={styles.leftoverVals}>
                    {plan.remaining_after.calories} kcal · {plan.remaining_after.protein_g}g P ·
                    {' '}{plan.remaining_after.carbs_g}g C · {plan.remaining_after.fat_g}g F
                  </span>
                </div>

                {error && <div className={styles.errorMsg}>{error}</div>}

                <div className={styles.actions}>
                  <button className="btn-ghost" onClick={regenerate}>Regenerate</button>
                  <button className="btn-primary" onClick={close}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return { open, close, Modals }
}

function MacroPill({ label, value, unit }) {
  const over = value < 0
  return (
    <div className={`${styles.macroPill} ${over ? styles.macroPillOver : ''}`}>
      <span className={styles.macroPillVal}>{Math.round(value)}{unit}</span>
      <span className={styles.macroPillLabel}>{label}</span>
    </div>
  )
}