/**
 * WorkoutModals — shared workout log/edit/detail/plan-detail modals
 * Used by both Schedule and Workouts pages.
 */

import { useState } from 'react'
import { logWorkout, updateWorkout, deleteWorkout, getExerciseLibrary, getExerciseImages } from './api'
import { useApi } from '../hooks/useApi'
import ExerciseInput from '../components/ui/ExerciseInput'
import ExerciseFlicker from '../components/ui/ExerciseFlicker'
import { jsonArrayToText, jsonArrayToList } from './exerciseGrouping'
import styles from './WorkoutModals.module.css'
import dayjs from 'dayjs'

const SESSION_TYPES = ['push','pull','legs','upper','lower','full_body','cardio','general']

const DAY_NAME_MAP = {
  sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,
  sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,
}
export function getPlanDayForDate(plan, date) {
  if (!plan?.days?.length) return null
  const dow = dayjs(date).day()
  return plan.days.find(d => DAY_NAME_MAP[d.day_name?.toLowerCase()] === dow) ?? null
}

function parseMaxReps(r) {
  if (!r) return ''
  const range = String(r).match(/(\d+)\s*[-–]\s*(\d+)/)
  if (range) return range[2]
  const single = String(r).match(/\d+/)
  return single ? single[0] : ''
}

function buildPrefilledSets(planDay) {
  if (!planDay?.exercises?.length) return [blankSet()]
  return planDay.exercises
    .sort((a,b)=>(a.order_index??0)-(b.order_index??0))
    .map(ex => ({
      exercise:    ex.exercise ?? '',
      exercise_id: ex.exercise_id ?? null,
      sets:        ex.sets ?? 1,
      reps:        parseMaxReps(ex.reps),
      weight_kg:   '',
      rpe:         '',
      is_warmup:   false,
    }))
}

const blankSet = () => ({ exercise:'', exercise_id:null, sets:1, reps:'', weight_kg:'', rpe:'', is_warmup:false })
const positiveNum = v => (!v || Number(v) > 0) ? v : ''

export function useWorkoutModals({ plan, selDate, selWorkout, onSaved }) {
  const [modal,             setModal]             = useState(null)
  const [dayStatus,         setDayStatus]         = useState('workout')
  const [form,              setForm]              = useState({})
  const [sets,              setSets]              = useState([])
  const [saving,            setSaving]            = useState(false)
  const [error,             setError]             = useState(null)
  const [editId,            setEditId]            = useState(null)
  const [confirmDel,        setConfirmDel]        = useState(false)
  const [planDetailExercise,setPlanDetailExercise]= useState(null)

  const { data: exerciseLibrary } = useApi(getExerciseLibrary)

  const selPlanDay = selDate ? getPlanDayForDate(plan, selDate) : null

  const openLog = () => {
    const pd = getPlanDayForDate(plan, selDate)
    setEditId(null)
    setDayStatus('workout')
    setForm({ date:selDate, session_type:pd?.session_type??'general', duration_min:'', perceived_effort:'', notes:'' })
    setSets(buildPrefilledSets(pd))
    setError(null); setConfirmDel(false)
    setModal('log')
  }

  const openEdit = () => {
    if (!selWorkout) return
    const isRM = selWorkout.session_type === 'rest' || selWorkout.session_type === 'missed'
    setEditId(selWorkout.id)
    setDayStatus(isRM ? selWorkout.session_type : 'workout')
    setForm({ date:selWorkout.date, session_type:selWorkout.session_type??'general', duration_min:selWorkout.duration_min??'', perceived_effort:selWorkout.perceived_effort??'', notes:selWorkout.notes??'' })
    const grouped = []; const seen = {}
    ;(selWorkout.sets??[]).filter(s=>!s.is_warmup).forEach(s => {
      if (!seen[s.exercise]) {
        seen[s.exercise] = { exercise:s.exercise, exercise_id:s.exercise_id??null, sets:0, reps:s.reps??'', weight_kg:s.weight_kg??'', rpe:s.rpe??'', is_warmup:false }
        grouped.push(seen[s.exercise])
      }
      seen[s.exercise].sets += 1
    })
    setSets(grouped.length ? grouped : [blankSet()])
    setError(null); setConfirmDel(false)
    setModal('log')
  }

  const openDetail     = () => setModal('detail')
  const openPlanDetail = () => { setPlanDetailExercise(null); setModal('planDetail') }

  const openPlanExerciseDetail = async (ex) => {
    setPlanDetailExercise(ex)
    if (ex.exercise_id) {
      const images = await getExerciseImages(ex.exercise_id)
      setPlanDetailExercise(prev =>
        (prev === ex || prev?.exercise_id === ex.exercise_id) ? { ...ex, images } : prev
      )
    }
  }

  const close = () => { setModal(null); setPlanDetailExercise(null) }

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))
  const setS = (i,k,v) => setSets(p=>p.map((s,idx)=>idx===i?{...s,[k]:v}:s))
  const setExercise = (i, text, libraryMatch) =>
    setSets(p=>p.map((s,idx)=>idx===i?{...s,exercise:text,exercise_id:libraryMatch?.exercise_id??null}:s))
  const addSet    = () => setSets(p=>[...p,blankSet()])
  const removeSet = i  => setSets(p=>p.filter((_,idx)=>idx!==i))

  const handleSubmit = async () => {
    setError(null)
    const isRM = dayStatus==='rest'||dayStatus==='missed'
    if (!isRM) {
      if (!form.duration_min)     { setError('Duration is required.'); return }
      if (!form.perceived_effort) { setError('Effort rating is required.'); return }
      if (sets.length===0)        { setError('Add at least one exercise.'); return }
      for (let i=0;i<sets.length;i++) {
        const s=sets[i]
        if (!s.exercise?.trim())                 { setError(`Row ${i+1}: exercise name required.`); return }
        if (!s.sets||Number(s.sets)<1)           { setError(`Row ${i+1}: sets count required.`); return }
        if (!s.reps||Number(s.reps)<1)           { setError(`Row ${i+1}: reps required.`); return }
        if (s.weight_kg===''||s.weight_kg==null) { setError(`Row ${i+1}: weight required (0 = bodyweight).`); return }
      }
    }
    setSaving(true)
    try {
      const payload = isRM
        ? { date:selDate, session_type:dayStatus, duration_min:null, perceived_effort:null,
            notes:dayStatus==='rest'?'Rest day':'Missed session', sets:[] }
        : { ...form,
            duration_min:form.duration_min?Number(form.duration_min):null,
            perceived_effort:form.perceived_effort?Number(form.perceived_effort):null,
            sets: sets.filter(s=>s.exercise).flatMap((s,ei)=>
              Array.from({length:Number(s.sets)||1},(_,k)=>({
                exercise:s.exercise, exercise_id:s.exercise_id||null,
                set_number:ei*10+k+1,
                reps:s.reps?Number(s.reps):null,
                weight_kg:s.weight_kg!==''?Number(s.weight_kg):null,
                rpe:s.rpe?Number(s.rpe):null,
                is_warmup:false,
              }))
            )
          }
      if (editId) await updateWorkout(editId, payload)
      else        await logWorkout(payload)
      setModal(null); onSaved?.()
    } catch(e) { setError(e.message) }
    finally    { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true)
    try { await deleteWorkout(selWorkout.id); setModal(null); onSaved?.() }
    catch(e) { setError(e.message) }
    finally  { setSaving(false) }
  }

  function Modals() {
    if (!modal) return null
    return (
      <div className={styles.overlay} onClick={e=>{if(e.target===e.currentTarget) close()}}>

        {/* ── LOG / EDIT ── */}
        {modal==='log' && (
          <div className={styles.modal}>
            <div className={styles.mHead}>
              <div className={styles.mTitle}>
                <span className={styles.mLabel}>{editId?'Edit workout':'Log workout'}</span>
                <span className={styles.mDate}>{dayjs(selDate).format('dddd, MMMM D YYYY')}</span>
              </div>
              <button className={styles.mClose} onClick={close}>✕</button>
            </div>
            <div className={styles.mBody}>
              {selPlanDay && (
                <div className={styles.statusBtns}>
                  {['workout','missed'].map(k=>(
                    <button key={k}
                      onClick={()=>setDayStatus(k)}
                      className={`${styles.statusBtn} ${dayStatus===k?`${styles.active} ${styles[k]}`:''}`}
                    >{k==='workout'?'Workout':'Missed'}</button>
                  ))}
                </div>
              )}

              {dayStatus==='workout' && (
                <>
                  {selPlanDay?.exercises?.length>0 && (
                    <div className={styles.planPreview}>
                      <div className={styles.planPreviewLabel}>PLAN · pre-filled — edit weights &amp; reps as needed</div>
                      {selPlanDay.exercises.sort((a,b)=>(a.order_index??0)-(b.order_index??0)).map((ex,i)=>(
                        <div key={i} className={styles.planPreviewRow}>
                          <span className={styles.planPreviewName}>{ex.exercise}</span>
                          <span className={styles.planPreviewDetail}>
                            {ex.sets??'?'} × {ex.reps??'?'}
                            {ex.rir!=null?` · ${ex.rir} RiR`:''}
                            {ex.progression_rule?` · ${ex.progression_rule}`:''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={styles.grid3}>
                    <div className={styles.field}>
                      <label className={styles.label}>Session type</label>
                      <select value={form.session_type} onChange={e=>setF('session_type',e.target.value)}>
                        {SESSION_TYPES.map(t=><option key={t} value={t}>{t.replace('_',' ').replace(/^./,c=>c.toUpperCase())}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Duration (min) *</label>
                      <input type="number" min="1" placeholder="e.g. 70" value={form.duration_min}
                        onChange={e=>setF('duration_min',positiveNum(e.target.value))} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Effort (1–10) *</label>
                      <input type="number" min="1" max="10" placeholder="e.g. 8" value={form.perceived_effort}
                        onChange={e=>{const v=Number(e.target.value);if(e.target.value===''||v>=1&&v<=10)setF('perceived_effort',e.target.value)}} />
                    </div>
                  </div>

                  <div className={styles.setsHead}>
                    <span className={styles.setsLabel}>Sets *</span>
                    <button className="btn-ghost" style={{padding:'2px 10px',fontSize:9}} onClick={addSet}>+ Add set</button>
                  </div>
                  <div className={styles.colHeaders}>
                    {['Exercise','Sets','Reps','kg','RPE',''].map((h,i)=><span key={i} className={styles.colHead}>{h}</span>)}
                  </div>
                  {sets.map((s,i)=>(
                    <div key={i} className={styles.setRow}>
                      <ExerciseInput
                        value={s.exercise}
                        onChange={(text,ex)=>setExercise(i,text,ex)}
                        library={exerciseLibrary ?? []}
                      />
                      <input type="number" min="1" placeholder="3" value={s.sets}
                        onChange={e=>setS(i,'sets',positiveNum(e.target.value))}/>
                      <input type="number" min="1" placeholder="—" value={s.reps}
                        onChange={e=>setS(i,'reps',positiveNum(e.target.value))}/>
                      <input type="number" min="0" placeholder="—" value={s.weight_kg}
                        onChange={e=>setS(i,'weight_kg',positiveNum(e.target.value))}/>
                      <input type="number" min="1" max="10" placeholder="—" value={s.rpe}
                        onChange={e=>{const v=Number(e.target.value);if(e.target.value===''||v>=1&&v<=10)setS(i,'rpe',e.target.value)}}/>
                      <button className="btn-ghost" style={{padding:'2px 6px',fontSize:10,borderColor:'transparent'}}
                        onClick={()=>removeSet(i)}>✕</button>
                    </div>
                  ))}

                  <div className={styles.field} style={{marginTop:12}}>
                    <label className={styles.label}>Notes</label>
                    <input type="text" placeholder="optional" value={form.notes}
                      onChange={e=>setF('notes',e.target.value)}/>
                  </div>
                </>
              )}

              {dayStatus==='missed' && (
                <div className={styles.statusMsg}>This session will be marked as missed.</div>
              )}

              <div className={styles.actions}>
                {error && <span className={styles.error}>{error}</span>}
                {editId && !confirmDel && (
                  <button className="btn-ghost"
                    style={{color:'var(--danger)',borderColor:'transparent',marginRight:'auto'}}
                    onClick={()=>setConfirmDel(true)}>Delete</button>
                )}
                {confirmDel && (
                  <>
                    <span style={{fontSize:12,color:'var(--warn)',flex:1}}>Delete this workout?</span>
                    <button className="btn-danger" onClick={handleDelete} disabled={saving}>
                      {saving?'…':'Confirm delete'}
                    </button>
                    <button className="btn-ghost" onClick={()=>setConfirmDel(false)}>Cancel</button>
                  </>
                )}
                {!confirmDel && (
                  <>
                    <button onClick={handleSubmit} disabled={saving}>
                      {saving?'Saving…':dayStatus==='missed'?'Mark as missed':editId?'Save changes':'Save workout'}
                    </button>
                    <button className="btn-ghost" onClick={close}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── DETAIL ── */}
        {modal==='detail' && selWorkout && (
          <div className={styles.modal}>
            <div className={styles.mHead}>
              <div className={styles.mTitle}>
                <span className={styles.mLabel}>Workout detail</span>
                <span className={styles.mDate}>{dayjs(selDate).format('dddd, MMMM D YYYY')}</span>
              </div>
              <button className={styles.mClose} onClick={close}>✕</button>
            </div>
            <div className={styles.mBody}>
              {[
                {k:'Session type',v:selWorkout.session_type??'—'},
                {k:'Duration',    v:selWorkout.duration_min?`${selWorkout.duration_min} min`:'—'},
                {k:'Effort',      v:selWorkout.perceived_effort?`${selWorkout.perceived_effort}/10`:'—'},
              ].map(r=>(
                <div key={r.k} className={styles.detailRow}>
                  <span className={styles.dk}>{r.k}</span>
                  <span className={styles.dv}>{r.v}</span>
                </div>
              ))}

              {selWorkout.sets?.filter(s=>!s.is_warmup).length>0 && (
                <>
                  <div className={styles.sectionMono}>Sets</div>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>RPE</th></tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const grouped=[]; const seen={}
                        selWorkout.sets.filter(s=>!s.is_warmup).forEach(s=>{
                          if(!seen[s.exercise]){
                            seen[s.exercise]={exercise:s.exercise,count:0,reps:s.reps,weight_kg:s.weight_kg,rpe:s.rpe}
                            grouped.push(seen[s.exercise])
                          }
                          seen[s.exercise].count+=1
                        })
                        return grouped.map((g,i)=>(
                          <tr key={i}>
                            <td style={{color:'var(--text)'}}>{g.exercise}</td>
                            <td>{g.count}</td>
                            <td>{g.reps??'—'}</td>
                            <td>{g.weight_kg!=null?`${g.weight_kg}kg`:'BW'}</td>
                            <td>{g.rpe??'—'}</td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </>
              )}

              {selWorkout.notes && (
                <div className={styles.notesBlock}>
                  <div className={styles.sectionMono}>Notes</div>
                  <p className={styles.notesText}>{selWorkout.notes}</p>
                </div>
              )}

              <div className={styles.actions}>
                <button className="btn-ghost" onClick={()=>{close();setTimeout(openEdit,50)}}>Edit workout</button>
                <button className="btn-ghost" onClick={close}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── PLAN DETAIL ── */}
        {modal==='planDetail' && selPlanDay && (
          <div className={styles.modal}>
            <div className={styles.mHead}>
              <div className={styles.mTitle}>
                {planDetailExercise ? (
                  <>
                    <button className={styles.mBack} onClick={()=>setPlanDetailExercise(null)}>← Back</button>
                    <span className={styles.mLabel}>{planDetailExercise.exercise_name ?? planDetailExercise.exercise}</span>
                  </>
                ) : (
                  <>
                    <span className={styles.mLabel}>Plan detail</span>
                    <span className={styles.mDate}>{selPlanDay.day_name} · {selPlanDay.session_type}</span>
                  </>
                )}
              </div>
              <button className={styles.mClose} onClick={close}>✕</button>
            </div>

            <div className={styles.mBody}>
              {!planDetailExercise ? (

                /* ── LIST VIEW ── */
                <>
                  {selPlanDay.exercises
                    ?.sort((a,b)=>(a.order_index??0)-(b.order_index??0))
                    .map((ex,i)=>(
                      <div
                        key={i}
                        className={`${styles.planDetailCard} ${styles.planDetailCardClickable}`}
                        onClick={()=>openPlanExerciseDetail(ex)}
                      >
                        <div className={styles.planDetailRow}>
                          <ExerciseFlicker
                            key={ex.exercise_id ?? ex.exercise}
                            images={ex.images}
                            alt=""
                            className={styles.planDetailThumb}
                            placeholderClassName={styles.planDetailThumbPlaceholder}
                            placeholderText={(ex.body_part ?? '?').charAt(0).toUpperCase()}
                          />
                          <div className={styles.planDetailInfo}>
                            <div className={styles.planDetailHeader}>
                              <span className={styles.planDetailName}>{ex.exercise_name ?? ex.exercise}</span>
                              <span className={styles.planDetailSets}>{ex.sets??'?'} × {ex.reps??'?'}</span>
                            </div>
                            <div className={styles.planDetailMeta}>
                              {ex.rir!=null&&<span className={styles.planDetailTag}>RiR {ex.rir}</span>}
                              {ex.rest_sec!=null&&<span className={styles.planDetailTag}>{ex.rest_sec}s rest</span>}
                              {ex.tempo&&<span className={styles.planDetailTag}>{ex.tempo}</span>}
                              {ex.body_part&&<span className={styles.planDetailTag}>{ex.body_part}</span>}
                              {ex.equipment&&<span className={styles.planDetailTag}>{ex.equipment}</span>}
                            </div>
                            {ex.progression_rule&&<div className={styles.planDetailProg}>{ex.progression_rule}</div>}
                          </div>
                          <span className={styles.planDetailChevron}>›</span>
                        </div>
                      </div>
                    ))
                  }
                  <div className={styles.actions}>
                    <button className="btn-ghost" onClick={close}>Close</button>
                  </div>
                </>

              ) : (

                /* ── EXERCISE DETAIL SUB-VIEW ── */
                <div className={styles.exDetailWrap}>
                  {planDetailExercise.images?.length > 0 && (
                    <ExerciseFlicker
                      key={planDetailExercise.exercise_id ?? planDetailExercise.exercise}
                      images={planDetailExercise.images}
                      alt=""
                      className={styles.exDetailImage}
                    />
                  )}

                  <div className={styles.planDetailMeta}>
                    {planDetailExercise.sets!=null&&<span className={styles.planDetailTag}>{planDetailExercise.sets} sets</span>}
                    {planDetailExercise.reps&&<span className={styles.planDetailTag}>{planDetailExercise.reps} reps</span>}
                    {planDetailExercise.rir!=null&&<span className={styles.planDetailTag}>RiR {planDetailExercise.rir}</span>}
                    {planDetailExercise.rest_sec!=null&&<span className={styles.planDetailTag}>{planDetailExercise.rest_sec}s rest</span>}
                    {planDetailExercise.tempo&&<span className={styles.planDetailTag}>tempo {planDetailExercise.tempo}</span>}
                    {planDetailExercise.body_part&&<span className={styles.planDetailTag}>{planDetailExercise.body_part}</span>}
                    {planDetailExercise.equipment&&<span className={styles.planDetailTag}>{planDetailExercise.equipment}</span>}
                    {planDetailExercise.difficulty&&<span className={styles.planDetailTag}>{planDetailExercise.difficulty}</span>}
                  </div>

                  {planDetailExercise.progression_rule&&(
                    <div className={styles.exDetailSection}>
                      <div className={styles.exDetailLabel}>Progression</div>
                      <p className={styles.exDetailText}>{planDetailExercise.progression_rule}</p>
                    </div>
                  )}

                  {planDetailExercise.instructions&&(
                    <div className={styles.exDetailSection}>
                      <div className={styles.exDetailLabel}>Instructions</div>
                      <p className={styles.exDetailText}>{planDetailExercise.instructions}</p>
                    </div>
                  )}

                  {jsonArrayToText(planDetailExercise.primary_muscles)&&(
                    <div className={styles.exDetailSection}>
                      <div className={styles.exDetailLabel}>Primary muscles</div>
                      <p className={styles.exDetailText}>{jsonArrayToText(planDetailExercise.primary_muscles)}</p>
                    </div>
                  )}

                  {jsonArrayToText(planDetailExercise.secondary_muscles)&&(
                    <div className={styles.exDetailSection}>
                      <div className={styles.exDetailLabel}>Secondary muscles</div>
                      <p className={styles.exDetailText}>{jsonArrayToText(planDetailExercise.secondary_muscles)}</p>
                    </div>
                  )}

                  {jsonArrayToList(planDetailExercise.technique_cues).length>0&&(
                    <div className={styles.exDetailSection}>
                      <div className={styles.exDetailLabel}>Technique cues</div>
                      <ul className={styles.exDetailList}>
                        {jsonArrayToList(planDetailExercise.technique_cues).map((c,i)=><li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {jsonArrayToList(planDetailExercise.common_mistakes).length>0&&(
                    <div className={styles.exDetailSection}>
                      <div className={styles.exDetailLabel}>Common mistakes</div>
                      <ul className={styles.exDetailList}>
                        {jsonArrayToList(planDetailExercise.common_mistakes).map((c,i)=><li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {planDetailExercise.notes&&(
                    <div className={styles.exDetailSection}>
                      <div className={styles.exDetailLabel}>Notes</div>
                      <p className={styles.exDetailText}>{planDetailExercise.notes}</p>
                    </div>
                  )}

                  {planDetailExercise.video_url&&(
                    <a href={planDetailExercise.video_url} target="_blank" rel="noreferrer"
                      className={styles.exDetailVideoLink}>
                      ▶ Watch technique video
                    </a>
                  )}

                  {!planDetailExercise.exercise_id&&(
                    <p className={styles.exDetailNotInLibrary}>
                      This exercise isn't in your library yet, so only the prescription details above are available.
                    </p>
                  )}

                  <div className={styles.actions}>
                    <button className="btn-ghost" onClick={()=>setPlanDetailExercise(null)}>← Back to plan</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    )
  }

  return { modal, openLog, openEdit, openDetail, openPlanDetail, close, Modals, selPlanDay }
}