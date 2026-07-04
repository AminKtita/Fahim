/**
 * MealLibrary.jsx — Recipes & Ingredients library section
 *
 * Embedded inside the Nutrition page as its "Recipes & Ingredients" tab
 * (see pages/Nutrition.jsx). Two sub-tabs of its own:
 *   1. Recipes     — view, add, edit, delete all recipes (with live macro calc)
 *   2. Ingredients — view, add, edit, delete all ingredients
 *
 * "Log a meal from a recipe" itself happens in the nutrition log modal
 * (lib/NutritionModals.jsx, 'meals' mode) — this component only manages
 * the underlying library data.
 */

import { useState, useMemo } from 'react'
import {
  getIngredients,
  createIngredient, updateIngredient, deleteIngredient,
  getRecipes, getIngredients as fetchAllIngredients,
  createRecipe, updateRecipe, deleteRecipe,
  uploadRecipeImage, deleteRecipeImage, resolveRecipeImageSrc,
} from './api'
import { useApi } from '../hooks/useApi'
import styles from './MealLibrary.module.css'

// ─── tiny helpers ────────────────────────────────────────────────────────────

const MAC_COLORS = { calories: '#e8a838', protein: '#4da6ff', carbs: '#66cc88', fat: '#ff7c7c' }

// Fixed set of recipe categories — must match the CHECK constraint in the DB
// (db/migrate_meals.py) and the Literal type in api/routes/recipes.py.
const RECIPE_CATEGORIES = ['Breakfast', 'Lunch/Dinner', 'Snack/Base']

function MacroTag({ label, value, unit = 'g', color }) {
  return (
    <span className={styles.macroTag} style={{ borderColor: color, color }}>
      {label} <strong>{value ?? '—'}{unit}</strong>
    </span>
  )
}

function MacroRow({ cal, prot, carbs, fat, small }) {
  return (
    <div className={`${styles.macroRow} ${small ? styles.macroRowSm : ''}`}>
      <MacroTag label="Cal"     value={Math.round(cal ?? 0)}  unit="kcal" color={MAC_COLORS.calories} />
      <MacroTag label="Prot"    value={Math.round(prot ?? 0)} unit="g"    color={MAC_COLORS.protein} />
      <MacroTag label="Carbs"   value={Math.round(carbs ?? 0)} unit="g"   color={MAC_COLORS.carbs} />
      <MacroTag label="Fat"     value={Math.round(fat ?? 0)}  unit="g"    color={MAC_COLORS.fat} />
    </div>
  )
}

function CategoryPill({ label, active, onClick }) {
  return (
    <button
      className={`${styles.catPill} ${active ? styles.catPillActive : ''}`}
      onClick={onClick}
    >{label}</button>
  )
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${wide ? styles.modalWide : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  )
}

function ConfirmDelete({ label, onConfirm, onCancel, error }) {
  return (
    <div className={styles.confirmBox}>
      <p>Delete <strong>{label}</strong>? This cannot be undone.</p>
      {error && <p className={styles.errMsg}>{error}</p>}
      <div className={styles.confirmBtns}>
        <button className={styles.btnDanger} onClick={onConfirm}>Delete</button>
        <button className={styles.btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── INGREDIENT FORM ─────────────────────────────────────────────────────────

const BLANK_ING = {
  name: '', category: '', calories_per_100g: '', protein_per_100g: '',
  carbs_per_100g: '', fat_per_100g: '', price_per_unit: '',
  unit_label: 'g', grams_per_unit: '100', notes: '',
}

function IngredientForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial || BLANK_ING)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const num = v => v === '' ? '' : Number(v)

  const handleSubmit = () => {
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      category: form.category.trim() || 'Other',
      calories_per_100g: num(form.calories_per_100g) || 0,
      protein_per_100g:  num(form.protein_per_100g)  || 0,
      carbs_per_100g:    num(form.carbs_per_100g)    || 0,
      fat_per_100g:      num(form.fat_per_100g)      || 0,
      price_per_unit:    num(form.price_per_unit)    || 0,
      unit_label:        form.unit_label.trim() || 'g',
      grams_per_unit:    num(form.grams_per_unit)    || 100,
      notes:             form.notes || null,
    })
  }

  return (
    <div className={styles.form}>
      <div className={styles.formGrid2}>
        <label className={styles.field}>
          <span>Name *</span>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Chicken Breast" />
        </label>
        <label className={styles.field}>
          <span>Category</span>
          <input value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Protein" />
        </label>
      </div>

      <p className={styles.sectionLabel}>Macros per 100g / 100ml</p>
      <div className={styles.formGrid4}>
        {[['Calories (kcal)', 'calories_per_100g'], ['Protein (g)', 'protein_per_100g'],
          ['Carbs (g)', 'carbs_per_100g'], ['Fat (g)', 'fat_per_100g']].map(([label, key]) => (
          <label key={key} className={styles.field}>
            <span>{label}</span>
            <input type="number" min="0" step="0.1" value={form[key]}
              onChange={e => set(key, e.target.value)} placeholder="0" />
          </label>
        ))}
      </div>

      <p className={styles.sectionLabel}>Unit & Price</p>
      <div className={styles.formGrid3}>
        <label className={styles.field}>
          <span>Unit label</span>
          <input value={form.unit_label} onChange={e => set('unit_label', e.target.value)}
            placeholder="g / piece / can / pot" />
        </label>
        <label className={styles.field}>
          <span>Grams per unit</span>
          <input type="number" min="0.1" step="0.1" value={form.grams_per_unit}
            onChange={e => set('grams_per_unit', e.target.value)} placeholder="100" />
        </label>
        <label className={styles.field}>
          <span>Price per unit (TND)</span>
          <input type="number" min="0" step="0.01" value={form.price_per_unit}
            onChange={e => set('price_per_unit', e.target.value)} placeholder="0.00" />
        </label>
      </div>

      <label className={styles.field}>
        <span>Notes</span>
        <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
      </label>

      {error && <p className={styles.errMsg}>{error}</p>}
      <div className={styles.formActions}>
        <button className={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className={styles.btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── INGREDIENT CARD ─────────────────────────────────────────────────────────

function IngredientCard({ ing, onEdit, onDelete }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div>
          <p className={styles.cardName}>{ing.name}</p>
          <span className={styles.catBadge}>{ing.category}</span>
        </div>
        <div className={styles.cardActions}>
          <button className={styles.btnIcon} onClick={() => onEdit(ing)} title="Edit">✏️</button>
          <button className={styles.btnIcon} onClick={() => onDelete(ing)} title="Delete">🗑️</button>
        </div>
      </div>
      <MacroRow cal={ing.calories_per_100g} prot={ing.protein_per_100g}
        carbs={ing.carbs_per_100g} fat={ing.fat_per_100g} small />
      <div className={styles.cardMeta}>
        <span>per 100{ing.unit_label === 'g' || ing.unit_label === 'ml' ? ing.unit_label : 'g'}</span>
        <span>1 {ing.unit_label} = {ing.grams_per_unit}g</span>
        <span className={styles.price}>{ing.price_per_unit.toFixed(2)} TND / {ing.unit_label}</span>
      </div>
    </div>
  )
}

// ─── INGREDIENTS TAB ─────────────────────────────────────────────────────────

function IngredientsTab() {
  const { data: ingredients, loading, error, refetch } = useApi(getIngredients)
  const [activeCat, setActiveCat]   = useState('All')
  const [search, setSearch]         = useState('')
  const [modal, setModal]           = useState(null) // null | 'add' | 'edit' | 'delete'
  const [selected, setSelected]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const categories = useMemo(() => {
    if (!ingredients) return []
    return ['All', ...Array.from(new Set(ingredients.map(i => i.category))).sort()]
  }, [ingredients])

  const filtered = useMemo(() => {
    if (!ingredients) return []
    return ingredients.filter(i => {
      const matchCat = activeCat === 'All' || i.category === activeCat
      const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [ingredients, activeCat, search])

  const openAdd  = () => { setSelected(null); setFormError(null); setModal('add') }
  const openEdit = (ing) => { setSelected(ing); setFormError(null); setModal('edit') }
  const openDel  = (ing) => { setSelected(ing); setDeleteError(null); setModal('delete') }
  const close    = () => setModal(null)

  const handleSave = async (data) => {
    setSaving(true); setFormError(null)
    try {
      if (modal === 'add') await createIngredient(data)
      else await updateIngredient(selected.id, data)
      await refetch(); close()
    } catch (e) {
      setFormError(e.response?.data?.detail || e.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true); setDeleteError(null)
    try {
      await deleteIngredient(selected.id)
      await refetch(); close()
    } catch (e) {
      setDeleteError(e.response?.data?.detail || e.message)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className={styles.tabToolbar}>
        <input className={styles.searchInput} placeholder="Search ingredients…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className={styles.btnPrimary} onClick={openAdd}>+ Add Ingredient</button>
      </div>

      <div className={styles.catPills}>
        {categories.map(c => (
          <CategoryPill key={c} label={c} active={activeCat === c} onClick={() => setActiveCat(c)} />
        ))}
      </div>

      {loading && <p className={styles.muted}>Loading…</p>}
      {error   && <p className={styles.errMsg}>Failed to load ingredients.</p>}

      <div className={styles.cardGrid}>
        {filtered.map(ing => (
          <IngredientCard key={ing.id} ing={ing} onEdit={openEdit} onDelete={openDel} />
        ))}
        {!loading && filtered.length === 0 && (
          <p className={styles.muted}>No ingredients found.</p>
        )}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'New Ingredient' : `Edit: ${selected.name}`} onClose={close}>
          <IngredientForm
            initial={modal === 'edit' ? selected : null}
            onSave={handleSave} onCancel={close}
            saving={saving} error={formError}
          />
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal title="Delete Ingredient" onClose={close}>
          <ConfirmDelete
            label={selected?.name}
            onConfirm={handleDelete} onCancel={close}
            error={deleteError}
          />
        </Modal>
      )}
    </div>
  )
}

// ─── RECIPE INGREDIENT ROW (editable inside recipe form) ─────────────────────

function RecipeIngRow({ row, allIngredients, onChange, onRemove }) {
  const ing = allIngredients.find(i => i.id === row.ingredient_id)

  // Live macro calculation for this row
  const factor = (Number(row.quantity_g) || 0) / 100
  const cal   = ing ? Math.round(ing.calories_per_100g * factor) : 0
  const prot  = ing ? +(ing.protein_per_100g  * factor).toFixed(1) : 0
  const carbs = ing ? +(ing.carbs_per_100g    * factor).toFixed(1) : 0
  const fat   = ing ? +(ing.fat_per_100g      * factor).toFixed(1) : 0

  // Display in natural units
  const qtyUnits = ing && ing.grams_per_unit
    ? +(Number(row.quantity_g) / ing.grams_per_unit).toFixed(2)
    : null

  const handleGramsChange = (g) => onChange({ ...row, quantity_g: g })
  const handleUnitsChange = (u) => {
    if (!ing) return
    onChange({ ...row, quantity_g: String(+(Number(u) * ing.grams_per_unit).toFixed(1)) })
  }

  return (
    <div className={styles.recipeIngRow}>
      <select
        className={styles.ingSelect}
        value={row.ingredient_id || ''}
        onChange={e => onChange({ ...row, ingredient_id: Number(e.target.value), quantity_g: row.quantity_g })}
      >
        <option value="">— pick ingredient —</option>
        {allIngredients.map(i => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>

      <div className={styles.qtyGroup}>
        <input
          type="number" min="0" step="1" placeholder="g"
          className={styles.qtyInput}
          value={row.quantity_g}
          onChange={e => handleGramsChange(e.target.value)}
        />
        <span className={styles.qtyUnit}>g</span>
        {ing && ing.unit_label !== 'g' && ing.unit_label !== 'ml' && (
          <>
            <span className={styles.qtyOr}>/</span>
            <input
              type="number" min="0" step="0.25" placeholder={ing.unit_label}
              className={styles.qtyInput}
              value={qtyUnits ?? ''}
              onChange={e => handleUnitsChange(e.target.value)}
            />
            <span className={styles.qtyUnit}>{ing.unit_label}</span>
          </>
        )}
      </div>

      <div className={styles.ingRowMacros}>
        <span style={{ color: MAC_COLORS.calories }}>{cal} kcal</span>
        <span style={{ color: MAC_COLORS.protein }}>{prot}g P</span>
        <span style={{ color: MAC_COLORS.carbs }}>{carbs}g C</span>
        <span style={{ color: MAC_COLORS.fat }}>{fat}g F</span>
      </div>

      <button className={styles.removeBtn} onClick={onRemove} title="Remove">✕</button>
    </div>
  )
}

// ─── RECIPE FORM ─────────────────────────────────────────────────────────────

const BLANK_RECIPE = { name: '', category: RECIPE_CATEGORIES[0], image_url: '', video_url: '', notes: '' }

function RecipeForm({ initial, onSave, onCancel, saving, error, onImageChanged }) {
  const { data: allIngredients } = useApi(fetchAllIngredients)
  const recipeId = initial?.id ?? null // only set once the recipe has been created

  const [form, setForm]       = useState(initial ? {
    name: initial.name, category: initial.category,
    image_url: initial.image_url || '', video_url: initial.video_url || '', notes: initial.notes || '',
  } : BLANK_RECIPE)
  const [rows, setRows]       = useState(
    initial?.ingredients?.map(i => ({
      ingredient_id: i.ingredient_id,
      quantity_g: String(i.quantity_g),
    })) || [{ ingredient_id: '', quantity_g: '' }]
  )
  const [imgError, setImgError] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageUploadError, setImageUploadError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addRow = () => setRows(r => [...r, { ingredient_id: '', quantity_g: '' }])
  const removeRow = (idx) => setRows(r => r.filter((_, i) => i !== idx))
  const updateRow = (idx, val) => setRows(r => r.map((row, i) => i === idx ? val : row))

  // ── photo upload (only available once the recipe exists, i.e. recipeId is set —
  // a brand new recipe needs to be created first before it has an id to attach a photo to) ──
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file || !recipeId) return
    setImageBusy(true)
    setImageUploadError(null)
    try {
      const result = await uploadRecipeImage(recipeId, file)
      set('image_url', result.image_url)
      setImgError(false)
      onImageChanged?.()
    } catch (err) {
      setImageUploadError(err?.response?.data?.detail ?? 'Upload failed')
    } finally {
      setImageBusy(false)
    }
  }

  const handleRemoveImage = async () => {
    if (!recipeId) { set('image_url', ''); return } // not yet saved — just clear the field locally
    setImageBusy(true)
    setImageUploadError(null)
    try {
      await deleteRecipeImage(recipeId)
      set('image_url', '')
      setImgError(false)
      onImageChanged?.()
    } catch (err) {
      setImageUploadError(err?.response?.data?.detail ?? 'Could not remove photo')
    } finally {
      setImageBusy(false)
    }
  }

  // Live totals
  const totals = useMemo(() => {
    if (!allIngredients) return { cal: 0, prot: 0, carbs: 0, fat: 0 }
    return rows.reduce((acc, row) => {
      const ing = allIngredients.find(i => i.id === Number(row.ingredient_id))
      const factor = (Number(row.quantity_g) || 0) / 100
      if (!ing) return acc
      return {
        cal:   acc.cal   + ing.calories_per_100g * factor,
        prot:  acc.prot  + ing.protein_per_100g  * factor,
        carbs: acc.carbs + ing.carbs_per_100g    * factor,
        fat:   acc.fat   + ing.fat_per_100g      * factor,
      }
    }, { cal: 0, prot: 0, carbs: 0, fat: 0 })
  }, [rows, allIngredients])

  const handleSubmit = () => {
    if (!form.name.trim()) return
    const ingredients = rows
      .filter(r => r.ingredient_id && Number(r.quantity_g) > 0)
      .map(r => ({ ingredient_id: Number(r.ingredient_id), quantity_g: Number(r.quantity_g) }))
    onSave({
      name: form.name.trim(),
      category: form.category,
      image_url: form.image_url.trim() || null,
      video_url: form.video_url.trim() || null,
      notes: form.notes.trim() || null,
      ingredients,
    })
  }

  return (
    <div className={styles.form}>
      <div className={styles.formGrid2}>
        <label className={styles.field}>
          <span>Recipe Name *</span>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Chicken Bowl" />
        </label>
        <label className={styles.field}>
          <span>Category</span>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {RECIPE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <label className={styles.field}>
        <span>Image URL</span>
        <input value={form.image_url}
          onChange={e => { set('image_url', e.target.value); setImgError(false) }}
          placeholder="https://…/photo.jpg" />
      </label>

      <div className={styles.field}>
        <span>Or upload a photo from your device</span>
        {recipeId ? (
          <label className={styles.uploadBtn}>
            {imageBusy ? 'Uploading…' : 'Choose file…'}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleFileUpload} disabled={imageBusy} style={{ display: 'none' }} />
          </label>
        ) : (
          <span className={styles.muted}>Save the recipe first, then you can upload a photo.</span>
        )}
        {imageUploadError && <span className={styles.imgPreviewError}>{imageUploadError}</span>}
      </div>

      {form.image_url && (
        <div className={styles.imgPreviewBox}>
          {!imgError ? (
            <img src={resolveRecipeImageSrc(form.image_url)} alt="" className={styles.imgPreview}
              onError={() => setImgError(true)} />
          ) : (
            <span className={styles.imgPreviewError}>Couldn't load image from this URL</span>
          )}
          {recipeId && (
            <button type="button" className={styles.removeBtn} onClick={handleRemoveImage} disabled={imageBusy}>
              Remove photo
            </button>
          )}
        </div>
      )}

      <label className={styles.field}>
        <span>Video Tutorial URL</span>
        <input value={form.video_url} onChange={e => set('video_url', e.target.value)}
          placeholder="https://youtube.com/…" />
      </label>
      <label className={styles.field}>
        <span>Notes</span>
        <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
      </label>

      <div className={styles.recipeIngHeader}>
        <p className={styles.sectionLabel}>Ingredients</p>
        <div className={styles.recipeTotals}>
          <span style={{ color: MAC_COLORS.calories }}>{Math.round(totals.cal)} kcal</span>
          <span style={{ color: MAC_COLORS.protein }}>{Math.round(totals.prot)}g P</span>
          <span style={{ color: MAC_COLORS.carbs }}>{Math.round(totals.carbs)}g C</span>
          <span style={{ color: MAC_COLORS.fat }}>{Math.round(totals.fat)}g F</span>
        </div>
      </div>

      <div className={styles.recipeIngList}>
        {rows.map((row, idx) => (
          <RecipeIngRow
            key={idx}
            row={row}
            allIngredients={allIngredients || []}
            onChange={val => updateRow(idx, val)}
            onRemove={() => removeRow(idx)}
          />
        ))}
      </div>
      <button className={styles.btnSecondary} onClick={addRow}>+ Add Ingredient</button>

      {error && <p className={styles.errMsg}>{error}</p>}
      <div className={styles.formActions}>
        <button className={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Recipe'}
        </button>
        <button className={styles.btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── RECIPE CARD ─────────────────────────────────────────────────────────────

function RecipeCard({ recipe, onEdit, onDelete, onView }) {
  return (
    <div className={styles.recipeCard}>
      {recipe.image_url && (
        <button className={styles.cardThumbBtn} onClick={() => onView(recipe)}>
          <img src={resolveRecipeImageSrc(recipe.image_url)} alt="" className={styles.cardThumb}
            onError={e => { e.currentTarget.parentElement.style.display = 'none' }} />
        </button>
      )}
      <div className={styles.cardTop}>
        <div>
          <p className={styles.cardName}>{recipe.name}</p>
          <div className={styles.cardMeta}>
            <span className={styles.catBadge}>{recipe.category}</span>
            {recipe.video_url && (
              <a href={recipe.video_url} target="_blank" rel="noreferrer"
                className={styles.videoLink}>▶ Video</a>
            )}
          </div>
        </div>
        <div className={styles.cardActions}>
          <button className={styles.btnIcon} onClick={() => onView(recipe)} title="View">👁</button>
          <button className={styles.btnIcon} onClick={() => onEdit(recipe)} title="Edit">✏️</button>
          <button className={styles.btnIcon} onClick={() => onDelete(recipe)} title="Delete">🗑️</button>
        </div>
      </div>
      <MacroRow
        cal={recipe.total_calories} prot={recipe.total_protein}
        carbs={recipe.total_carbs} fat={recipe.total_fat} small
      />
      <p className={styles.ingCount}>{recipe.ingredients?.length ?? 0} ingredient{recipe.ingredients?.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ─── RECIPE DETAIL MODAL (view only, shows all ingredients) ──────────────────

function RecipeDetail({ recipe, onClose }) {
  const [imgError, setImgError] = useState(false)

  return (
    <Modal title={recipe.name} onClose={onClose} wide>
      {recipe.image_url && !imgError && (
        <img src={resolveRecipeImageSrc(recipe.image_url)} alt={recipe.name} className={styles.detailImg}
          onError={() => setImgError(true)} />
      )}

      <div className={styles.detailHeader}>
        <span className={styles.catBadge}>{recipe.category}</span>
        {recipe.video_url && (
          <a href={recipe.video_url} target="_blank" rel="noreferrer"
            className={styles.videoBtn}>
            ▶ Watch Video Tutorial
          </a>
        )}
      </div>
      <MacroRow cal={recipe.total_calories} prot={recipe.total_protein}
        carbs={recipe.total_carbs} fat={recipe.total_fat} />
      <table className={styles.ingTable}>
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Qty (g)</th>
            <th>Qty (unit)</th>
            <th style={{ color: MAC_COLORS.calories }}>Cal</th>
            <th style={{ color: MAC_COLORS.protein }}>Prot</th>
            <th style={{ color: MAC_COLORS.carbs }}>Carbs</th>
            <th style={{ color: MAC_COLORS.fat }}>Fat</th>
          </tr>
        </thead>
        <tbody>
          {recipe.ingredients?.map(ing => (
            <tr key={ing.ri_id}>
              <td>{ing.name}</td>
              <td>{ing.quantity_g}g</td>
              <td>{ing.quantity_units} {ing.unit_label}</td>
              <td>{Math.round(ing.calories)} kcal</td>
              <td>{ing.protein_g}g</td>
              <td>{ing.carbs_g}g</td>
              <td>{ing.fat_g}g</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.totalRow}>
            <td colSpan={3}><strong>Total</strong></td>
            <td><strong>{Math.round(recipe.total_calories)} kcal</strong></td>
            <td><strong>{Math.round(recipe.total_protein)}g</strong></td>
            <td><strong>{Math.round(recipe.total_carbs)}g</strong></td>
            <td><strong>{Math.round(recipe.total_fat)}g</strong></td>
          </tr>
        </tfoot>
      </table>
      {recipe.notes && <p className={styles.muted} style={{ marginTop: 12 }}>{recipe.notes}</p>}
    </Modal>
  )
}

// ─── RECIPES TAB ─────────────────────────────────────────────────────────────

function RecipesTab() {
  const { data: recipes, loading, error, refetch } = useApi(getRecipes)
  const [activeCat, setActiveCat]   = useState('All')
  const [search, setSearch]         = useState('')
  const [modal, setModal]           = useState(null) // null | 'add' | 'edit' | 'view' | 'delete'
  const [selected, setSelected]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const categories = useMemo(() => {
    if (!recipes) return []
    return ['All', ...Array.from(new Set(recipes.map(r => r.category))).sort()]
  }, [recipes])

  const filtered = useMemo(() => {
    if (!recipes) return []
    return recipes.filter(r => {
      const matchCat = activeCat === 'All' || r.category === activeCat
      const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [recipes, activeCat, search])

  const openAdd    = () => { setSelected(null); setFormError(null); setModal('add') }
  const openEdit   = (r) => { setSelected(r); setFormError(null); setModal('edit') }
  const openView   = (r) => { setSelected(r); setModal('view') }
  const openDelete = (r) => { setSelected(r); setDeleteError(null); setModal('delete') }
  const close      = () => setModal(null)

  const handleSave = async (data) => {
    setSaving(true); setFormError(null)
    try {
      if (modal === 'add') {
        const created = await createRecipe(data)
        // Switch into edit mode for the recipe we just created, instead
        // of closing — so the photo upload control (which needs a
        // recipe id) becomes available right away without reopening the form.
        setSelected({ ...data, id: created.id })
        setModal('edit')
      } else {
        await updateRecipe(selected.id, data)
        close()
      }
      await refetch()
    } catch (e) {
      setFormError(e.response?.data?.detail || e.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true); setDeleteError(null)
    try {
      await deleteRecipe(selected.id)
      await refetch(); close()
    } catch (e) {
      setDeleteError(e.response?.data?.detail || e.message)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className={styles.tabToolbar}>
        <input className={styles.searchInput} placeholder="Search recipes…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className={styles.btnPrimary} onClick={openAdd}>+ New Recipe</button>
      </div>

      <div className={styles.catPills}>
        {categories.map(c => (
          <CategoryPill key={c} label={c} active={activeCat === c} onClick={() => setActiveCat(c)} />
        ))}
      </div>

      {loading && <p className={styles.muted}>Loading…</p>}
      {error   && <p className={styles.errMsg}>Failed to load recipes.</p>}

      <div className={styles.cardGrid}>
        {filtered.map(r => (
          <RecipeCard key={r.id} recipe={r}
            onEdit={openEdit} onDelete={openDelete} onView={openView} />
        ))}
        {!loading && filtered.length === 0 && (
          <p className={styles.muted}>No recipes found.</p>
        )}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'add' ? 'New Recipe' : `Edit: ${selected?.name}`}
          onClose={close} wide
        >
          <RecipeForm
            initial={modal === 'edit' ? selected : null}
            onSave={handleSave} onCancel={close}
            saving={saving} error={formError}
            onImageChanged={refetch}
          />
        </Modal>
      )}

      {modal === 'view' && selected && (
        <RecipeDetail recipe={selected} onClose={close} />
      )}

      {modal === 'delete' && (
        <Modal title="Delete Recipe" onClose={close}>
          <ConfirmDelete
            label={selected?.name}
            onConfirm={handleDelete} onCancel={close}
            error={deleteError}
          />
        </Modal>
      )}
    </div>
  )
}

// ─── SECTION ROOT ──────────────────────────────────────────────────────────
// Embedded inside the Nutrition page as the "Recipes & Ingredients" tab.
// Keeps its own Recipes/Ingredients sub-tabs since that's a meaningful
// second-level split, but has no outer page header — the parent page owns that.

export default function MealLibrary() {
  const [tab, setTab] = useState('recipes')

  return (
    <div className={styles.section}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'recipes' ? styles.tabActive : ''}`}
          onClick={() => setTab('recipes')}
        >🍽 Recipes</button>
        <button
          className={`${styles.tab} ${tab === 'ingredients' ? styles.tabActive : ''}`}
          onClick={() => setTab('ingredients')}
        >🥦 Ingredients</button>
      </div>

      <div className={styles.tabContent}>
        {tab === 'recipes'     && <RecipesTab />}
        {tab === 'ingredients' && <IngredientsTab />}
      </div>
    </div>
  )
}