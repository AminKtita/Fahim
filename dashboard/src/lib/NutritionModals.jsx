/**
 * NutritionModals — shared nutrition log/edit/detail modals
 * Used by both Schedule and Nutrition pages.
 */
import { useState } from 'react'
import { logNutrition, updateNutrition, deleteNutrition, getRecipes, logMeal, getMeals, deleteMeal as deleteMealApi, resolveRecipeImageSrc, setWater } from './api'
import styles from './WorkoutModals.module.css'
import nutStyles from './NutritionModals.module.css'
import dayjs from 'dayjs'

const positiveNum = v => (!v || Number(v) > 0) ? v : ''

/**
 * deriveNutStatus — mirrors memory_manager.py: _nutrition_status(). Keep
 * the two in sync if this formula ever changes.
 *
 * Returns one of: null, 'missed', 'off', 'partial', 'exceeded', 'hit'.
 *
 * Floors (min % of target to count as "hit" that macro): calories/protein
 * 95%, carbs 90%, fat 85% — tightest on protein/calories since those drive
 * outcomes most directly, looser on carbs/fat which vary more day to day.
 *
 * Ceilings (max % of target before a macro counts as "exceeded") are
 * intentionally asymmetric per macro:
 *   - calories 110%: the primary lever for cut/bulk/recomp, kept tight —
 *     overshooting calories works directly against a cut and can turn a
 *     lean bulk into a dirty one.
 *   - protein 160%: extra protein has minimal downside for a healthy
 *     athlete, so the ceiling is generous and only flags extreme intake.
 *   - carbs / fat 130%: looser than calories since day-to-day variation in
 *     carb/fat sources is normal, but still catches a clear overshoot.
 *
 * A day that undershoots calories (<70%, or <40% for 'missed') is always
 * reported as 'off'/'missed' even if another macro is over its ceiling —
 * a large calorie deficit is the more urgent signal to surface.
 */
export function deriveNutStatus(n, targets) {
  if (!n) return null
  if (n.notes === '__MISSED__' || n.missed) return 'missed'
  const hasAny = n.calories || n.protein_g || n.carbs_g || n.fat_g
  if (!hasAny) return null

  if (!targets || !targets.calories) {
    const filled = [n.calories, n.protein_g, n.carbs_g, n.fat_g].filter(v => v != null && v > 0).length
    if (filled === 4) return 'hit'
    if (filled > 0)   return 'partial'
    return 'off'
  }

  const cal  = n.calories   ?? 0
  const prot = n.protein_g  ?? 0
  const carb = n.carbs_g    ?? 0
  const fat  = n.fat_g      ?? 0
  const tCal  = targets.calories   ?? 0
  const tProt = targets.protein_g  ?? 0
  const tCarb = targets.carbs_g    ?? 0
  const tFat  = targets.fat_g      ?? 0

  if (tCal > 0 && cal < tCal * 0.40) return 'missed'

  const calOk  = tCal  > 0 ? cal  >= tCal  * 0.95 : true
  const protOk = tProt > 0 ? prot >= tProt * 0.95 : true
  const carbOk = tCarb > 0 ? carb >= tCarb * 0.90 : true
  const fatOk  = tFat  > 0 ? fat  >= tFat  * 0.85 : true
  const filled = [n.calories, n.protein_g, n.carbs_g, n.fat_g].filter(v => v != null && v > 0).length

  if (tCal > 0 && cal < tCal * 0.70) return 'off'

  const calOver  = tCal  > 0 && cal  > tCal  * 1.30
  const protOver = tProt > 0 && prot > tProt * 1.60
  const carbOver = tCarb > 0 && carb > tCarb * 1.30
  const fatOver  = tFat  > 0 && fat  > tFat  * 1.30
  if (calOver || protOver || carbOver || fatOver) return 'exceeded'

  if (calOk && protOk && carbOk && fatOk && filled === 4) return 'hit'
  return 'partial'
}

const STATUS_CFG = {
  hit:      { label:'On target', cls: nutStyles.statusHit },
  exceeded: { label:'Exceeded',  cls: nutStyles.statusExceeded },
  partial:  { label:'Partial',   cls: nutStyles.statusPartial },
  off:      { label:'Off plan',  cls: nutStyles.statusOff },
  missed:   { label:'Missed',    cls: nutStyles.statusMissed },
}

export function useNutritionModals({ selDate, selNutrition, plan, onSaved }) {
  const [modal,   setModal]   = useState(null) // null | 'log' | 'detail'
  const [nMode,   setNMode]   = useState('log') // 'log' | 'missed' | 'meals'
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [editMode,setEditMode]= useState(false)
  const [confirmDel,setConfirmDel] = useState(false)

  // ── Meal-composer sub-state ──
  const [recipes,           setRecipes]           = useState(null)
  const [recipeSearch,      setRecipeSearch]       = useState('')
  const [recipeCategory,    setRecipeCategory]     = useState('All')
  const [dayMeals,          setDayMeals]           = useState([])
  const [mealsListCollapsed,setMealsListCollapsed] = useState(false)  // shrink/expand the logged meals list
  const [recipesCollapsed,  setRecipesCollapsed]   = useState(false)  // shrink/expand the recipe picker list
  const [pickedRecipe,      setPickedRecipe]       = useState(null)
  const [pickedRows,        setPickedRows]         = useState([])
  const [mealsLoading,      setMealsLoading]       = useState(false)
  const [mealsSaving,       setMealsSaving]        = useState(false)
  const [mealsError,        setMealsError]         = useState(null)

  // ── Water quick-add (meals tab only) — kept separate from `form.water_l`
  // (the manual-totals tab) because it saves independently via a dedicated
  // water-only endpoint that never touches meal-derived macros. ──
  const [mealsWaterL,       setMealsWaterL]        = useState('')
  const [waterSaving,       setWaterSaving]        = useState(false)
  const [waterError,        setWaterError]         = useState(null)

  const loadDayMeals = async (date) => {
    if (!date) return
    setMealsLoading(true)
    try { setDayMeals(await getMeals(date)) }
    catch (e) { setMealsError(e.message) }
    finally { setMealsLoading(false) }
  }

  const [recipesFailed, setRecipesFailed] = useState(false)

  const ensureRecipesLoaded = async () => {
    console.log('[NutritionModals] ensureRecipesLoaded called. recipes=', recipes, 'recipesFailed=', recipesFailed)
    // Only short-circuit if we already have a *successful* load. A prior
    // failure must NOT permanently block retries — without recipesFailed
    // as a separate flag, setting `recipes` to [] to clear the infinite
    // "Loading recipes…" spinner on error would make `if (recipes) return`
    // treat that failure as if it had succeeded forever, since [] is
    // truthy in JS. That left the picker silently empty on every future
    // open with no way to recover short of a full page reload.
    if (recipes && !recipesFailed) {
      console.log('[NutritionModals] skipping fetch — already loaded successfully')
      return
    }
    setRecipesFailed(false)
    console.log('[NutritionModals] calling getRecipes()...')
    try {
      const result = await getRecipes()
      console.log('[NutritionModals] getRecipes() returned', result?.length, 'recipes')
      setRecipes(result)
    } catch (e) {
      console.error('[NutritionModals] getRecipes() FAILED:', e)
      setRecipes([])
      setRecipesFailed(true)
      setMealsError(`Couldn't load recipes: ${e.response?.data?.detail || e.message}`)
    }
  }

  const targets = plan?.nutrition_targets ?? {}

  const openLog = () => {
    setEditMode(false); setNMode('log')
    setForm({ calories:'', protein_g:'', carbs_g:'', fat_g:'', water_l:'', notes:'' })
    setError(null); setConfirmDel(false)
    setPickedRecipe(null); setPickedRows([]); setMealsError(null)
    loadDayMeals(selDate)
    setModal('log')
  }

  const openMeals = () => {
    console.log('[NutritionModals] openMeals called. selDate=', selDate)
    setEditMode(false); setNMode('meals')
    setForm({ calories:'', protein_g:'', carbs_g:'', fat_g:'', water_l:'', notes:'' })
    setError(null); setConfirmDel(false)
    setPickedRecipe(null); setPickedRows([]); setMealsError(null)
    setRecipeSearch(''); setRecipeCategory('All'); setMealsListCollapsed(false); setRecipesCollapsed(false)
    setMealsWaterL(selNutrition?.water_ml ? (selNutrition.water_ml / 1000).toString() : '')
    setWaterError(null)
    setModal('log')
    // Sequential, not concurrent: avoids two SQLite connections opening
    // within the same instant, which has been a source of "database is
    // locked" errors on Windows even with busy_timeout configured.
    ;(async () => {
      await ensureRecipesLoaded()
      await loadDayMeals(selDate)
    })()
  }

  const saveMealsWater = async () => {
    const ml = mealsWaterL ? Math.round(Number(mealsWaterL) * 1000) : 0
    setWaterSaving(true); setWaterError(null)
    try {
      await setWater(selDate, ml)
      onSaved?.()
    } catch (e) {
      setWaterError(e.response?.data?.detail || e.message)
    } finally {
      setWaterSaving(false)
    }
  }

  // user selects a recipe from the library to start editing quantities
  const pickRecipe = (recipe) => {
    setPickedRecipe(recipe)
    setPickedRows(recipe.ingredients.map(i => ({
      ingredient_id:   i.ingredient_id,
      name:            i.name,
      unit_label:      i.unit_label,
      grams_per_unit:  i.grams_per_unit,
      calories_per_100g: i.calories_per_100g,
      protein_per_100g:  i.protein_per_100g,
      carbs_per_100g:    i.carbs_per_100g,
      fat_per_100g:      i.fat_per_100g,
      quantity_g: i.quantity_g,
    })))
  }

  const updatePickedRowGrams = (idx, grams) => {
    setPickedRows(rows => rows.map((r, i) => i === idx ? { ...r, quantity_g: grams } : r))
  }

  const updatePickedRowUnits = (idx, units) => {
    setPickedRows(rows => rows.map((r, i) => {
      if (i !== idx) return r
      const grams = (Number(units) || 0) * (r.grams_per_unit || 100)
      return { ...r, quantity_g: +grams.toFixed(1) }
    }))
  }

  const cancelPickedRecipe = () => { setPickedRecipe(null); setPickedRows([]) }

  // live macro totals for the recipe currently being edited
  const pickedTotals = pickedRows.reduce((acc, r) => {
    const factor = (Number(r.quantity_g) || 0) / 100
    return {
      calories:  acc.calories  + r.calories_per_100g * factor,
      protein_g: acc.protein_g + r.protein_per_100g  * factor,
      carbs_g:   acc.carbs_g   + r.carbs_per_100g    * factor,
      fat_g:     acc.fat_g     + r.fat_per_100g      * factor,
    }
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  const confirmAddMeal = async () => {
    if (!pickedRecipe) return
    setMealsSaving(true); setMealsError(null)
    try {
      await logMeal({
        log_date: selDate,
        recipe_id: pickedRecipe.id,
        recipe_name_snapshot: pickedRecipe.name,
        calories:  Math.round(pickedTotals.calories),
        protein_g: +pickedTotals.protein_g.toFixed(1),
        carbs_g:   +pickedTotals.carbs_g.toFixed(1),
        fat_g:     +pickedTotals.fat_g.toFixed(1),
      })
      cancelPickedRecipe()
      await loadDayMeals(selDate)
      onSaved?.()
    } catch (e) {
      setMealsError(e.response?.data?.detail || e.message)
    } finally {
      setMealsSaving(false)
    }
  }

  const removeMeal = async (mealId) => {
    setMealsSaving(true); setMealsError(null)
    try {
      await deleteMealApi(mealId, selDate)
      await loadDayMeals(selDate)
      onSaved?.()
    } catch (e) {
      setMealsError(e.response?.data?.detail || e.message)
    } finally {
      setMealsSaving(false)
    }
  }

  const dayMealTotals = dayMeals.reduce((acc, m) => ({
    calories:  acc.calories  + (m.calories  ?? 0),
    protein_g: acc.protein_g + (m.protein_g ?? 0),
    carbs_g:   acc.carbs_g   + (m.carbs_g   ?? 0),
    fat_g:     acc.fat_g     + (m.fat_g     ?? 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  const filteredRecipes = (recipes ?? []).filter(r => {
    const matchSearch   = !recipeSearch || r.name.toLowerCase().includes(recipeSearch.toLowerCase())
    const matchCategory = recipeCategory === 'All' || r.category === recipeCategory
    return matchSearch && matchCategory
  })

  // Category pills shown above the recipe list, each with a live count.
  // 'All' first, then the fixed category set in a stable order (matches
  // the CHECK constraint in db/migrate_meals.py).
  const recipeCategoryPills = ['All', 'Breakfast', 'Lunch/Dinner', 'Snack/Base'].map(cat => ({
    key: cat,
    count: cat === 'All'
      ? (recipes ?? []).length
      : (recipes ?? []).filter(r => r.category === cat).length,
  }))

  const openEdit = () => {
    if (!selNutrition) return
    const isMissed = selNutrition.notes === '__MISSED__'
    setEditMode(true)
    setNMode(isMissed ? 'missed' : 'log')
    setForm({
      calories:  selNutrition.calories  ?? '',
      protein_g: selNutrition.protein_g ?? '',
      carbs_g:   selNutrition.carbs_g   ?? '',
      fat_g:     selNutrition.fat_g     ?? '',
      water_l:   selNutrition.water_ml  ? (selNutrition.water_ml / 1000).toString() : '',
      notes:     isMissed ? '' : (selNutrition.notes ?? ''),
    })
    setError(null); setConfirmDel(false)
    setModal('log')
  }

  const openDetail = () => setModal('detail')
  const close = () => setModal(null)

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))

  const handleSubmit = async () => {
    setError(null)
    let payload
    if (nMode === 'missed') {
      payload = { date:selDate, calories:null, protein_g:null, carbs_g:null, fat_g:null, water_ml:null, notes:'__MISSED__' }
    } else {
      if (!form.calories) { setError('Calories is required.'); return }
      payload = {
        date:      selDate,
        calories:  Number(form.calories),
        protein_g: form.protein_g ? Number(form.protein_g) : null,
        carbs_g:   form.carbs_g   ? Number(form.carbs_g)   : null,
        fat_g:     form.fat_g     ? Number(form.fat_g)     : null,
        water_ml:  form.water_l   ? Math.round(Number(form.water_l) * 1000) : null,
        notes:     form.notes     || null,
      }
    }
    setSaving(true)
    try {
      if (editMode) await updateNutrition(selDate, payload)
      else          await logNutrition(payload)
      setModal(null); onSaved?.()
    } catch(e) { setError(e.message) }
    finally    { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true)
    try { await deleteNutrition(selDate); setModal(null); onSaved?.() }
    catch(e) { setError(e.message) }
    finally  { setSaving(false) }
  }

  // live status preview while typing
  const previewStatus = nMode === 'log' ? deriveNutStatus(
    { calories:form.calories?Number(form.calories):null, protein_g:form.protein_g?Number(form.protein_g):null,
      carbs_g:form.carbs_g?Number(form.carbs_g):null, fat_g:form.fat_g?Number(form.fat_g):null },
    targets
  ) : null

  function Modals() {
    if (!modal) return null
    return (
      <div className={styles.overlay} onClick={e=>{if(e.target===e.currentTarget) close()}}>

        {/* ── LOG / EDIT ── */}
        {modal==='log' && (
          <div className={styles.modal}>
            <div className={styles.mHead}>
              <div className={styles.mTitle}>
                <span className={styles.mLabel}>{editMode?'Edit nutrition':'Log nutrition'}</span>
                <span className={styles.mDate}>{dayjs(selDate).format('dddd, MMMM D YYYY')}</span>
              </div>
              <button className={styles.mClose} onClick={close}>✕</button>
            </div>
            <div className={styles.mBody}>

              {/* mode tabs */}
              <div className={styles.statusBtns}>
                {[{k:'log',l:'Manual totals'},{k:'meals',l:'From recipes'},{k:'missed',l:'Mark as missed'}].map(t=>(
                  <button key={t.k} onClick={() => {
                    setNMode(t.k)
                    if (t.k === 'meals') {
                      setMealsError(null)
                      ;(async () => {
                        await ensureRecipesLoaded()
                        await loadDayMeals(selDate)
                      })()
                    }
                  }}
                    className={`${styles.statusBtn} ${nMode===t.k?`${styles.active} ${styles[t.k==='missed'?'missed':'workout']}`:''}`}>{t.l}</button>
                ))}
              </div>

              {nMode==='missed' && (
                <div className={styles.statusMsg}>This day will be marked as a missed nutrition day.</div>
              )}

              {nMode==='log' && (
                <>
                  {/* plan targets strip */}
                  {Object.keys(targets).length>0 && (
                    <div className={nutStyles.targetsStrip}>
                      <span className={nutStyles.targetsLabel}>Plan targets</span>
                      {[{k:'calories',u:'kcal'},{k:'protein_g',u:'g'},{k:'carbs_g',u:'g'},{k:'fat_g',u:'g'}]
                        .filter(t=>targets[t.k])
                        .map(t=>(
                          <span key={t.k} className={nutStyles.targetItem}>
                            {t.k.replace('_g','').replace('calories','cal')}: <strong>{targets[t.k]}{t.u}</strong>
                          </span>
                        ))}
                    </div>
                  )}

                  <div className={nutStyles.grid2}>
                    {[
                      {k:'calories',  l:'Calories (kcal)', ph:'e.g. 2400', req:true},
                      {k:'protein_g', l:'Protein (g)',     ph:'e.g. 185'},
                      {k:'carbs_g',   l:'Carbs (g)',       ph:'e.g. 300'},
                      {k:'fat_g',     l:'Fat (g)',         ph:'e.g. 80'},
                      {k:'water_l',   l:'Water (L)',       ph:'e.g. 2.5'},
                    ].map(f=>(
                      <div key={f.k} className={styles.field}>
                        <label className={styles.label}>{f.l}{f.req&&<span className={nutStyles.req}> *</span>}</label>
                        <input type="number" min="0" step={f.k==='water_l'?'0.1':'1'} placeholder={f.ph} value={form[f.k]??''}
                          onChange={e=>setF(f.k,positiveNum(e.target.value))}
                          style={f.req&&error&&!form[f.k]?{borderColor:'var(--danger)'}:{}} />
                      </div>
                    ))}
                    <div className={styles.field}>
                      <label className={styles.label}>Notes</label>
                      <input type="text" placeholder="optional" value={form.notes??''} onChange={e=>setF('notes',e.target.value)}/>
                    </div>
                  </div>

                  {/* live status preview */}
                  {previewStatus && (
                    <div className={nutStyles.previewRow}>
                      <span className={nutStyles.previewLabel}>Status preview</span>
                      <span className={`${nutStyles.statusBadge} ${STATUS_CFG[previewStatus]?.cls}`}>
                        {STATUS_CFG[previewStatus]?.label}
                      </span>
                    </div>
                  )}
                </>
              )}

              {nMode==='meals' && (
                <div className={nutStyles.mealsWrap}>

                  {/* water — independent of meal logging, saves via its own endpoint
                      so it never disturbs macros computed from logged meals */}
                  <div className={nutStyles.waterQuickAdd}>
                    <span className={nutStyles.waterQuickAddLabel}>💧 Water (L)</span>
                    <input type="number" min="0" step="0.1" placeholder="e.g. 2.5"
                      value={mealsWaterL}
                      onChange={e => setMealsWaterL(e.target.value)}
                      className={nutStyles.waterQuickAddInput} />
                    <button type="button" onClick={saveMealsWater} disabled={waterSaving}
                      className={nutStyles.waterQuickAddBtn}>
                      {waterSaving ? 'Saving…' : 'Save'}
                    </button>
                    {waterError && <span className={styles.error}>{waterError}</span>}
                  </div>

                  {/* logged meals so far today */}
                  {mealsLoading && <div className={nutStyles.recipeHint}>Loading today's meals…</div>}
                  {!mealsLoading && dayMeals.length > 0 && (() => {
                    // compute status from accumulated meal totals vs plan targets
                    const mealNutRow = {
                      calories:  dayMealTotals.calories,
                      protein_g: dayMealTotals.protein_g,
                      carbs_g:   dayMealTotals.carbs_g,
                      fat_g:     dayMealTotals.fat_g,
                    }
                    const st = deriveNutStatus(mealNutRow, targets)
                    const STATUS_LABEL = { hit: 'On target', exceeded: 'Exceeded', partial: 'Partial', off: 'Off plan', missed: 'Missed' }
                    const STATUS_CLS   = { hit: nutStyles.mealStatusHit, exceeded: nutStyles.mealStatusExceeded, partial: nutStyles.mealStatusPartial, off: nutStyles.mealStatusOff, missed: nutStyles.mealStatusMissed }
                    return (
                      <div className={nutStyles.loggedMealsBox}>
                        <div className={nutStyles.loggedMealsHead}
                          onClick={() => setMealsListCollapsed(c => !c)}
                          style={{ cursor: 'pointer' }}>
                          <span>
                            {mealsListCollapsed ? '▶' : '▼'} {dayMeals.length} meal{dayMeals.length !== 1 ? 's' : ''} logged
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {st && <span className={`${nutStyles.mealStatusBadge} ${STATUS_CLS[st]}`}>{STATUS_LABEL[st]}</span>}
                            <span className={nutStyles.loggedMealsTotal}>
                              {Math.round(dayMealTotals.calories)} kcal · {Math.round(dayMealTotals.protein_g)}P
                              / {Math.round(dayMealTotals.carbs_g)}C / {Math.round(dayMealTotals.fat_g)}F
                            </span>
                          </div>
                        </div>
                        {!mealsListCollapsed && dayMeals.map(m => (
                          <div key={m.id} className={nutStyles.loggedMealRow}>
                            <span className={nutStyles.loggedMealName}>
                              {m.recipe_name_snapshot || 'Custom meal'}
                            </span>
                            <span className={nutStyles.loggedMealMacros}>
                              {Math.round(m.calories)} kcal
                            </span>
                            <button className={nutStyles.loggedMealRemove}
                              onClick={() => removeMeal(m.id)} disabled={mealsSaving}>✕</button>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {!pickedRecipe ? (
                    <>
                      <div className={nutStyles.recipeSectionHead}
                        onClick={() => setRecipesCollapsed(c => !c)}
                        style={{ cursor: 'pointer' }}>
                        <span>{recipesCollapsed ? '▶' : '▼'} Recipes</span>
                        {recipes !== null && (
                          <span className={nutStyles.recipeSectionCount}>
                            {filteredRecipes.length} of {(recipes ?? []).length}
                          </span>
                        )}
                      </div>

                      {!recipesCollapsed && (
                        <>
                          <div className={nutStyles.recipeCatPills}>
                            {recipeCategoryPills.map(c => (
                              <button key={c.key}
                                className={`${nutStyles.recipeCatPill} ${recipeCategory === c.key ? nutStyles.recipeCatPillActive : ''}`}
                                onClick={() => setRecipeCategory(c.key)}>
                                {c.key} <span className={nutStyles.recipeCatPillCount}>{c.count}</span>
                              </button>
                            ))}
                          </div>
                          <input
                            type="text" placeholder="Search recipes…"
                            className={nutStyles.recipeSearch}
                            value={recipeSearch}
                            onChange={e => setRecipeSearch(e.target.value)}
                          />
                          {mealsError && (
                            <p className={styles.error}>
                              {mealsError}{' '}
                              <button className="btn-ghost" style={{ padding: '2px 10px', fontSize: 11 }}
                                onClick={() => { setRecipes(null); setRecipesFailed(false); setMealsError(null); ensureRecipesLoaded() }}>
                                Retry
                              </button>
                            </p>
                          )}
                          <div className={nutStyles.recipePickList}>
                            {recipes === null && <div className={nutStyles.recipeHint}>Loading recipes…</div>}
                            {recipes !== null && !mealsError && filteredRecipes.length === 0 && (
                              <div className={nutStyles.recipeHint}>
                                {recipeCategory === 'All'
                                  ? <>No recipes found. Add some in the Recipes &amp; Ingredients tab.</>
                                  : <>No {recipeCategory} recipes{recipeSearch ? ' match your search' : ''}. Try a different category.</>}
                              </div>
                            )}
                            {filteredRecipes.map(r => (
                              <button key={r.id} className={nutStyles.recipePickRow} onClick={() => { pickRecipe(r); setRecipesCollapsed(true) }}>
                                {r.image_url && (
                                  <img src={resolveRecipeImageSrc(r.image_url)} alt="" className={nutStyles.recipePickThumb}
                                    onError={e => { e.currentTarget.style.display = 'none' }} />
                                )}
                                <span className={nutStyles.recipePickName}>{r.name}</span>
                                <span className={nutStyles.recipePickMacros}>
                                  {Math.round(r.total_calories)} kcal · {Math.round(r.total_protein)}P
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className={nutStyles.recipeEditor}>
                      <div className={nutStyles.recipeEditorHead}>
                        <span className={nutStyles.recipeEditorName}>{pickedRecipe.name}</span>
                        <button className="btn-ghost" style={{padding:'4px 10px',fontSize:11}}
                          onClick={cancelPickedRecipe}>← Back</button>
                      </div>

                      {pickedRows.map((row, idx) => {
                        const qtyUnits = row.grams_per_unit
                          ? +(Number(row.quantity_g) / row.grams_per_unit).toFixed(2)
                          : null
                        const isNaturalUnit = row.unit_label !== 'g' && row.unit_label !== 'ml'
                        return (
                          <div key={idx} className={nutStyles.ingEditRow}>
                            <span className={nutStyles.ingEditName}>{row.name}</span>
                            <div className={nutStyles.ingEditQty}>
                              <input type="number" min="0" step="1"
                                value={row.quantity_g}
                                onChange={e => updatePickedRowGrams(idx, e.target.value)} />
                              <span className={nutStyles.ingEditUnit}>g</span>
                              {isNaturalUnit && (
                                <>
                                  <span className={nutStyles.ingEditOr}>/</span>
                                  <input type="number" min="0" step="0.25"
                                    value={qtyUnits ?? ''}
                                    onChange={e => updatePickedRowUnits(idx, e.target.value)} />
                                  <span className={nutStyles.ingEditUnit}>{row.unit_label}</span>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      <div className={nutStyles.recipeEditorTotals}>
                        <span>{Math.round(pickedTotals.calories)} kcal</span>
                        <span>{Math.round(pickedTotals.protein_g)}g protein</span>
                        <span>{Math.round(pickedTotals.carbs_g)}g carbs</span>
                        <span>{Math.round(pickedTotals.fat_g)}g fat</span>
                      </div>

                      {mealsError && <p className={styles.error}>{mealsError}</p>}
                      <button className="btn-primary" style={{width:'100%'}}
                        onClick={confirmAddMeal} disabled={mealsSaving}>
                        {mealsSaving ? 'Adding…' : 'Add this meal'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className={styles.actions}>
                {nMode!=='meals' && error && <span className={styles.error}>{error}</span>}
                {nMode==='meals' && (
                  <>
                    {dayMeals.length === 0 && (
                      <span style={{fontSize:11,color:'var(--muted)',flex:1}}>
                        No meals logged yet — pick a recipe above to start.
                      </span>
                    )}
                    <button
                      onClick={close}
                      disabled={mealsSaving}
                      style={{ marginLeft: 'auto' }}
                    >
                      {dayMeals.length > 0 ? 'Save & Done' : 'Cancel'}
                    </button>
                  </>
                )}
                {editMode && !confirmDel && nMode!=='meals' && (
                  <button className="btn-ghost" style={{color:'var(--danger)',borderColor:'transparent',marginRight:'auto'}}
                    onClick={()=>setConfirmDel(true)}>Delete</button>
                )}
                {confirmDel && (
                  <>
                    <span style={{fontSize:12,color:'var(--warn)',flex:1}}>Delete this nutrition log?</span>
                    <button className="btn-danger" onClick={handleDelete} disabled={saving}>{saving?'…':'Confirm delete'}</button>
                    <button className="btn-ghost" onClick={()=>setConfirmDel(false)}>Cancel</button>
                  </>
                )}
                {!confirmDel && nMode!=='meals' && (
                  <>
                    <button onClick={handleSubmit} disabled={saving}>
                      {saving?'Saving…':nMode==='missed'?'Mark as missed':editMode?'Save changes':'Save log'}
                    </button>
                    <button className="btn-ghost" onClick={close}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── DETAIL ── */}
        {modal==='detail' && selNutrition && (
          <div className={styles.modal}>
            <div className={styles.mHead}>
              <div className={styles.mTitle}>
                <span className={styles.mLabel}>Nutrition detail</span>
                <span className={styles.mDate}>{dayjs(selDate).format('dddd, MMMM D YYYY')}</span>
              </div>
              <button className={styles.mClose} onClick={close}>✕</button>
            </div>
            <div className={styles.mBody}>
              {/* big status */}
              {(() => {
                const st = deriveNutStatus(selNutrition, targets)
                const c = STATUS_CFG[st] ?? STATUS_CFG['partial']
                return (
                  <div className={nutStyles.detailStatusWrap}>
                    <span className={`${nutStyles.detailStatusBadge} ${c.cls}`}>{c.label}</span>
                  </div>
                )
              })()}

              {/* logged vs target table */}
              <table className={nutStyles.detailTable}>
                <thead>
                  <tr><th>Macro</th><th>Logged</th><th>Target</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {[
                    {k:'Calories', v:selNutrition.calories,  u:'kcal', t:targets.calories,   thr:0.95},
                    {k:'Protein',  v:selNutrition.protein_g, u:'g',    t:targets.protein_g,  thr:0.95},
                    {k:'Carbs',    v:selNutrition.carbs_g,   u:'g',    t:targets.carbs_g,    thr:0.90},
                    {k:'Fat',      v:selNutrition.fat_g,     u:'g',    t:targets.fat_g,      thr:0.85},
                    {k:'Water',    v:selNutrition.water_ml!=null?+(selNutrition.water_ml/1000).toFixed(2):null, u:'L', t:null},
                  ].filter(r=>r.v!=null).map(r=>{
                    const hit = r.t && r.v >= r.t * r.thr
                    const miss = r.t && r.v < r.t * 0.70
                    return (
                      <tr key={r.k}>
                        <td className={nutStyles.detailMacroName}>{r.k}</td>
                        <td className={hit?nutStyles.hitCell:miss?nutStyles.missCell:''}>{r.v}{r.u}</td>
                        <td className={nutStyles.targetCell}>{r.t?`${r.t}${r.u}`:'—'}</td>
                        <td>{r.t?(hit?<span className={nutStyles.microHit}>✓</span>:miss?<span className={nutStyles.microMiss}>✗</span>:<span className={nutStyles.microPartial}>~</span>):'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {selNutrition.notes && selNutrition.notes !== '__MISSED__' && (
                <div className={styles.notesBlock}>
                  <div className={styles.sectionMono}>Notes</div>
                  <p className={styles.notesText}>{selNutrition.notes}</p>
                </div>
              )}
              <div className={styles.actions}>
                <button className="btn-ghost" onClick={()=>{close();setTimeout(openEdit,50)}}>Edit log</button>
                <button className="btn-ghost" onClick={close}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return { modal, openLog, openMeals, openEdit, openDetail, close, Modals }
}