import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import {
  getExerciseLibrary, getExercise, createExercise, updateExercise, deleteExercise,
  uploadExerciseImage, addExerciseImageUrl, deleteExerciseImage, reorderExerciseImages, resolveImageSrc,
} from './api'
import { jsonArrayToText } from './exerciseGrouping'
import ExerciseFlicker from '../components/ui/ExerciseFlicker'
import styles from './ExerciseLibraryTab.module.css'

const EMPTY_FORM = {
  exercise_name: '', body_part: '', movement_pattern: '',
  primary_muscles: '', secondary_muscles: '', equipment: '', difficulty: '',
  image_url: '', video_url: '', instructions: '', technique_cues: '', common_mistakes: '',
}

// technique_cues / common_mistakes use the JSON-array text on the way in (jsonArrayToText,
// shared with the Schedule plan-detail view) but still need the reverse conversion here
// for saving the add/edit form back to the API.
function textToJsonArray(text) {
  const items = (text ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return JSON.stringify(items)
}

export default function ExerciseLibraryTab() {
  const { data: library, loading, refetch } = useApi(() => getExerciseLibrary())
  const [search, setSearch] = useState('')
  const [detailExercise, setDetailExercise] = useState(null) // full row shown in modal
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null) // exercise_id being edited, or null for "create new"
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const filtered = (library ?? []).filter(ex => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return ex.exercise_name.toLowerCase().includes(q) ||
           (ex.body_part ?? '').toLowerCase().includes(q) ||
           (ex.equipment ?? '').toLowerCase().includes(q)
  })

  const openDetail = async (ex) => {
    setDetailExercise(ex) // show immediately with what we have (e.g. thumbnail)
    const full = await getExercise(ex.exercise_id) // then replace with the full row including all images
    setDetailExercise(full)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormImages([])
    setError(null)
    setFormOpen(true)
  }

  const openEdit = async (ex) => {
    setEditingId(ex.exercise_id)
    setForm({
      exercise_name: ex.exercise_name ?? '',
      body_part: ex.body_part ?? '',
      movement_pattern: ex.movement_pattern ?? '',
      primary_muscles: jsonArrayToText(ex.primary_muscles),
      secondary_muscles: jsonArrayToText(ex.secondary_muscles),
      equipment: ex.equipment ?? '',
      difficulty: ex.difficulty ?? '',
      image_url: ex.image_url ?? '',
      video_url: ex.video_url ?? '',
      instructions: ex.instructions ?? '',
      technique_cues: jsonArrayToText(ex.technique_cues),
      common_mistakes: jsonArrayToText(ex.common_mistakes),
    })
    setFormImages(ex.images ?? [])
    setError(null)
    setFormOpen(true)
    setDetailExercise(null)
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── image management (only active once the exercise exists, i.e. editingId is set —
  // a brand new exercise needs to be created first before it has an exercise_id to attach images to) ──
  const [formImages, setFormImages] = useState([])
  const [newImageUrl, setNewImageUrl] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState(null)

  const refreshFormImages = async () => {
    if (!editingId) return
    const full = await getExercise(editingId)
    setFormImages(full.images ?? [])
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file || !editingId) return
    setImageBusy(true)
    setImageError(null)
    try {
      await uploadExerciseImage(editingId, file)
      await refreshFormImages()
      refetch() // so the card thumbnail updates too if this was the first image
    } catch (err) {
      setImageError(err?.response?.data?.detail ?? 'Upload failed')
    } finally {
      setImageBusy(false)
    }
  }

  const handleAddImageUrl = async () => {
    if (!newImageUrl.trim() || !editingId) return
    setImageBusy(true)
    setImageError(null)
    try {
      await addExerciseImageUrl(editingId, newImageUrl.trim())
      setNewImageUrl('')
      await refreshFormImages()
      refetch()
    } catch (err) {
      setImageError(err?.response?.data?.detail ?? 'Could not add image URL')
    } finally {
      setImageBusy(false)
    }
  }

  const handleDeleteImage = async (imageId) => {
    if (!editingId) return
    setImageBusy(true)
    try {
      await deleteExerciseImage(editingId, imageId)
      await refreshFormImages()
      refetch()
    } finally {
      setImageBusy(false)
    }
  }

  const moveImage = async (index, direction) => {
    const newOrder = [...formImages]
    const target = index + direction
    if (target < 0 || target >= newOrder.length) return
    ;[newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]
    setFormImages(newOrder) // optimistic
    await reorderExerciseImages(editingId, newOrder.map(img => img.id))
    refetch()
  }

  const handleSubmit = async () => {
    if (!form.exercise_name.trim()) { setError('Exercise name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        primary_muscles: textToJsonArray(form.primary_muscles),
        secondary_muscles: textToJsonArray(form.secondary_muscles),
        technique_cues: textToJsonArray(form.technique_cues),
        common_mistakes: textToJsonArray(form.common_mistakes),
      }
      if (editingId) {
        await updateExercise(editingId, payload)
        setFormOpen(false)
      } else {
        const created = await createExercise(payload)
        // Switch into edit mode for the exercise we just created, instead
        // of closing — so the image manager (which needs an exercise_id)
        // becomes available right away without reopening the form.
        setEditingId(created.exercise_id)
        setFormImages([])
      }
      refetch()
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not save exercise')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (exerciseId) => {
    await deleteExercise(exerciseId)
    setConfirmDeleteId(null)
    setDetailExercise(null)
    refetch()
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Search by name, body part, or equipment…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.search}
        />
        <button className="btn-primary" onClick={openCreate}>+ Add exercise</button>
      </div>

      {loading && <div className={styles.emptyHint}>Loading library…</div>}

      {!loading && filtered.length === 0 && (
        <div className={styles.emptyHint}>
          {search ? 'No exercises match your search.' : 'No exercises in your library yet.'}
        </div>
      )}

      <div className={styles.grid}>
        {filtered.map(ex => (
          <div key={ex.exercise_id} className={styles.card} onClick={() => openDetail(ex)}>
            <div className={styles.cardImageWrap}>
              <ExerciseFlicker
                key={ex.exercise_id}
                images={ex.images}
                alt={ex.exercise_name}
                className={styles.cardImage}
                placeholderClassName={styles.cardImagePlaceholder}
                placeholderText={(ex.body_part ?? '?').charAt(0).toUpperCase()}
              />
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardName}>{ex.exercise_name}</div>
              <div className={styles.cardMeta}>
                {ex.body_part && <span className={styles.tag}>{ex.body_part}</span>}
                {ex.equipment && <span className={styles.tag}>{ex.equipment}</span>}
                {ex.difficulty && <span className={styles.tagFaint}>{ex.difficulty}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── DETAIL MODAL ── */}
      {detailExercise && (
        <div className={styles.overlay} onClick={() => setDetailExercise(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>{detailExercise.exercise_name}</span>
              <button className={styles.modalClose} onClick={() => setDetailExercise(null)}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {detailExercise.images?.length > 0 && (
                <ExerciseFlicker
                  key={detailExercise.exercise_id}
                  images={detailExercise.images}
                  alt={detailExercise.exercise_name}
                  className={styles.detailImage}
                />
              )}

              <div className={styles.detailMetaRow}>
                {detailExercise.body_part && <span className={styles.tag}>{detailExercise.body_part}</span>}
                {detailExercise.movement_pattern && <span className={styles.tag}>{detailExercise.movement_pattern}</span>}
                {detailExercise.equipment && <span className={styles.tag}>{detailExercise.equipment}</span>}
                {detailExercise.difficulty && <span className={styles.tagFaint}>{detailExercise.difficulty}</span>}
              </div>

              {detailExercise.instructions && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Instructions</div>
                  <p className={styles.detailText}>{detailExercise.instructions}</p>
                </div>
              )}

              {jsonArrayToText(detailExercise.primary_muscles) && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Primary muscles</div>
                  <p className={styles.detailText}>{jsonArrayToText(detailExercise.primary_muscles)}</p>
                </div>
              )}

              {jsonArrayToText(detailExercise.secondary_muscles) && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Secondary muscles</div>
                  <p className={styles.detailText}>{jsonArrayToText(detailExercise.secondary_muscles)}</p>
                </div>
              )}

              {jsonArrayToText(detailExercise.technique_cues) && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Technique cues</div>
                  <ul className={styles.detailList}>
                    {jsonArrayToText(detailExercise.technique_cues).split(',').map((c,i) => <li key={i}>{c.trim()}</li>)}
                  </ul>
                </div>
              )}

              {jsonArrayToText(detailExercise.common_mistakes) && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Common mistakes</div>
                  <ul className={styles.detailList}>
                    {jsonArrayToText(detailExercise.common_mistakes).split(',').map((c,i) => <li key={i}>{c.trim()}</li>)}
                  </ul>
                </div>
              )}

              {detailExercise.video_url && (
                <a href={detailExercise.video_url} target="_blank" rel="noreferrer" className={styles.videoLink}>
                  ▶ Watch technique video
                </a>
              )}
            </div>

            <div className={styles.modalFooter}>
              {confirmDeleteId === detailExercise.exercise_id ? (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmText}>Delete this exercise?</span>
                  <button className="btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  <button className={styles.dangerBtn} onClick={() => handleDelete(detailExercise.exercise_id)}>Delete</button>
                </div>
              ) : (
                <>
                  <button className={styles.dangerBtnGhost} onClick={() => setConfirmDeleteId(detailExercise.exercise_id)}>Delete</button>
                  <button className="btn-primary" onClick={() => openEdit(detailExercise)}>Edit</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT FORM MODAL ── */}
      {formOpen && (
        <div className={styles.overlay} onClick={() => setFormOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>{editingId ? 'Edit exercise' : 'Add exercise'}</span>
              <button className={styles.modalClose} onClick={() => setFormOpen(false)}>✕</button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Name *</span>
                  <input value={form.exercise_name} onChange={e => setF('exercise_name', e.target.value)} placeholder="e.g. Incline dumbbell press" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Body part</span>
                  <input value={form.body_part} onChange={e => setF('body_part', e.target.value)} placeholder="e.g. chest" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Movement pattern</span>
                  <input value={form.movement_pattern} onChange={e => setF('movement_pattern', e.target.value)} placeholder="e.g. horizontal push" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Equipment</span>
                  <input value={form.equipment} onChange={e => setF('equipment', e.target.value)} placeholder="e.g. dumbbell" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Difficulty</span>
                  <input value={form.difficulty} onChange={e => setF('difficulty', e.target.value)} placeholder="e.g. beginner" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Primary muscles (comma-separated)</span>
                  <input value={form.primary_muscles} onChange={e => setF('primary_muscles', e.target.value)} placeholder="e.g. pectoralis major, triceps" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Secondary muscles (comma-separated)</span>
                  <input value={form.secondary_muscles} onChange={e => setF('secondary_muscles', e.target.value)} placeholder="e.g. anterior deltoid" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Legacy image URL (optional fallback)</span>
                  <input value={form.image_url} onChange={e => setF('image_url', e.target.value)} placeholder="https://… (prefer the image manager below instead)" />
                </label>
                <label className={styles.formField}>
                  <span className={styles.formLabel}>Video URL</span>
                  <input value={form.video_url} onChange={e => setF('video_url', e.target.value)} placeholder="https://…" />
                </label>
                <label className={`${styles.formField} ${styles.formFieldWide}`}>
                  <span className={styles.formLabel}>Instructions</span>
                  <textarea value={form.instructions} onChange={e => setF('instructions', e.target.value)} rows={2} />
                </label>
                <label className={`${styles.formField} ${styles.formFieldWide}`}>
                  <span className={styles.formLabel}>Technique cues (comma-separated)</span>
                  <input value={form.technique_cues} onChange={e => setF('technique_cues', e.target.value)} placeholder="e.g. shoulder blades retracted, feet planted" />
                </label>
                <label className={`${styles.formField} ${styles.formFieldWide}`}>
                  <span className={styles.formLabel}>Common mistakes (comma-separated)</span>
                  <input value={form.common_mistakes} onChange={e => setF('common_mistakes', e.target.value)} placeholder="e.g. bouncing bar, elbows too flared" />
                </label>
              </div>

              {/* ── Image manager: multiple frames, animated like a flipbook ── */}
              <div className={styles.imageManager}>
                <div className={styles.formLabel}>
                  Images {formImages.length > 1 ? `(${formImages.length} frames — cycles automatically, like a GIF)` : ''}
                </div>

                {!editingId ? (
                  <p className={styles.imageManagerHint}>Save this exercise first, then come back to add images.</p>
                ) : (
                  <>
                    {formImages.length > 0 && (
                      <div className={styles.imageList}>
                        {formImages.map((img, i) => (
                          <div key={img.id} className={styles.imageRow}>
                            <img src={resolveImageSrc(img)} alt="" className={styles.imageRowThumb} />
                            <span className={styles.imageRowSource}>{img.source === 'upload' ? 'uploaded' : 'url'}</span>
                            <div className={styles.imageRowActions}>
                              <button type="button" className={styles.imageRowBtn} disabled={i===0} onClick={() => moveImage(i, -1)}>↑</button>
                              <button type="button" className={styles.imageRowBtn} disabled={i===formImages.length-1} onClick={() => moveImage(i, 1)}>↓</button>
                              <button type="button" className={styles.imageRowBtnDanger} onClick={() => handleDeleteImage(img.id)}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className={styles.imageAddRow}>
                      <label className={styles.uploadBtn}>
                        {imageBusy ? 'Working…' : '+ Upload image'}
                        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleFileUpload} disabled={imageBusy} hidden />
                      </label>
                      <input
                        type="text"
                        placeholder="or paste an image URL…"
                        value={newImageUrl}
                        onChange={e => setNewImageUrl(e.target.value)}
                        className={styles.imageUrlInput}
                      />
                      <button type="button" className="btn-ghost" onClick={handleAddImageUrl} disabled={imageBusy || !newImageUrl.trim()}>Add</button>
                    </div>
                    {imageError && <div className={styles.formError}>{imageError}</div>}
                  </>
                )}
              </div>

              {error && <div className={styles.formError}>{error}</div>}
            </div>

            <div className={styles.modalFooter}>
              <button className="btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add exercise'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}