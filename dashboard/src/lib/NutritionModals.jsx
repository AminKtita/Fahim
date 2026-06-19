/**
 * NutritionModals — shared nutrition log/edit/detail modals
 * Used by both Schedule and Nutrition pages.
 */
import { useState } from 'react'
import { logNutrition, updateNutrition, deleteNutrition } from './api'
import styles from './WorkoutModals.module.css'
import nutStyles from './NutritionModals.module.css'
import dayjs from 'dayjs'

const positiveNum = v => (!v || Number(v) > 0) ? v : ''

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
  const tCal  = targets.calories   ?? 0
  const tProt = targets.protein_g  ?? 0

  if (tCal > 0 && cal < tCal * 0.40) return 'missed'

  const calOk  = tCal  > 0 ? cal  >= tCal  * 0.95 : true
  const protOk = tProt > 0 ? prot >= tProt * 0.95 : true
  const carbOk = targets.carbs_g > 0 ? (n.carbs_g ?? 0) >= targets.carbs_g * 0.90 : true
  const fatOk  = targets.fat_g   > 0 ? (n.fat_g   ?? 0) >= targets.fat_g   * 0.85 : true
  const filled = [n.calories, n.protein_g, n.carbs_g, n.fat_g].filter(v => v != null && v > 0).length

  if (calOk && protOk && carbOk && fatOk && filled === 4) return 'hit'
  if (tCal > 0 && cal < tCal * 0.70) return 'off'
  return 'partial'
}

const STATUS_CFG = {
  hit:     { label:'On target', cls: nutStyles.statusHit },
  partial: { label:'Partial',   cls: nutStyles.statusPartial },
  off:     { label:'Off plan',  cls: nutStyles.statusOff },
  missed:  { label:'Missed',    cls: nutStyles.statusMissed },
}

export function useNutritionModals({ selDate, selNutrition, plan, onSaved }) {
  const [modal,   setModal]   = useState(null) // null | 'log' | 'detail'
  const [nMode,   setNMode]   = useState('log')
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [editMode,setEditMode]= useState(false)
  const [confirmDel,setConfirmDel] = useState(false)

  const targets = plan?.nutrition_targets ?? {}

  const openLog = () => {
    setEditMode(false); setNMode('log')
    setForm({ calories:'', protein_g:'', carbs_g:'', fat_g:'', water_l:'', notes:'' })
    setError(null); setConfirmDel(false)
    setModal('log')
  }

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
                {[{k:'log',l:'Log nutrition'},{k:'missed',l:'Mark as missed'}].map(t=>(
                  <button key={t.k} onClick={()=>setNMode(t.k)}
                    className={`${styles.statusBtn} ${nMode===t.k?`${styles.active} ${styles[t.k==='log'?'workout':'missed']}`:''}`}>{t.l}</button>
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

              <div className={styles.actions}>
                {error && <span className={styles.error}>{error}</span>}
                {editMode && !confirmDel && (
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
                {!confirmDel && (
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

  return { modal, openLog, openEdit, openDetail, close, Modals }
}