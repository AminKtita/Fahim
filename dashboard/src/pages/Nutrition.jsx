import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getNutrition, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { useNutritionModals, deriveNutStatus } from '../lib/NutritionModals'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import MacroBar from '../components/ui/MacroBar'
import CalorieChart from '../components/charts/CalorieChart'
import dayjs from 'dayjs'
import styles from './Nutrition.module.css'

const STATUS_LABEL = { hit:'HIT', partial:'PARTIAL', off:'OFF', missed:'MISSED', null:null }
const STATUS_CLS   = { hit: styles.statusHit, partial: styles.statusPartial, off: styles.statusOff, missed: styles.statusMissed }

export default function Nutrition() {
  const { refresh: refreshStatus } = useStatus()
  const { data: nutrition, refetch } = useApi(() => getNutrition(30))
  const { data: plan }               = useApi(getPlan)

  const targets = plan?.nutrition_targets ?? {}
  const today   = dayjs().format('YYYY-MM-DD')
  const todayNut = nutrition?.find(n => n.date === today)
  const canLogToday = !todayNut?.calories && todayNut?.notes !== '__MISSED__'
  const isMissedToday = todayNut?.notes === '__MISSED__'

  const onSaved = () => { refetch(); refreshStatus() }

  const todayModals = useNutritionModals({ selDate: today, selNutrition: todayNut, plan, onSaved })

  // For history rows
  const [histDate, setHistDate] = useState(null)
  const [histNut,  setHistNut]  = useState(null)
  const histModals = useNutritionModals({ selDate: histDate, selNutrition: histNut, plan, onSaved })

  const logged = nutrition?.filter(n => n.calories || n.notes === '__MISSED__') ?? []

  // 30d averages (exclude missed)
  const realLogged = nutrition?.filter(n => n.calories) ?? []
  const avg = key => realLogged.length
    ? Math.round(realLogged.reduce((s,n) => s + (n[key] ?? 0), 0) / realLogged.length) : null

  // heatmap: last 30 days
  const last30 = Array.from({ length: 30 }, (_, i) => dayjs().subtract(29 - i, 'day').format('YYYY-MM-DD'))
  const nutMap = {}; nutrition?.forEach(n => { nutMap[n.date] = n })

  const heatStatus = date => {
    const n = nutMap[date]
    if (!n) return null
    return deriveNutStatus(n, targets)
  }

  // macro hit check for table
  const macroHit = (v, target, thr = 0.95) => target && v != null && v >= target * thr
  const macroMiss = (v, target, thr = 0.70) => target && v != null && v < target * thr

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>NUTRITION.db</div>
          <div className={styles.pageTitle}>Nutrition log</div>
        </div>
      </div>

      {/* TODAY */}
      <SectionDivider label="TODAY.snapshot" />
      <div className={styles.todayGrid}>
        <Panel label="TODAY.macros">
          {isMissedToday ? (
            <div className={styles.missedDay}>
              <span className={styles.missedIcon}>✗</span>
              <span className={styles.missedLabel}>Nutrition missed today</span>
              <div className={styles.todayBtns}>
                <button className="btn-ghost" style={{ padding:'4px 12px', fontSize:10 }} onClick={todayModals.openEdit}>edit</button>
              </div>
            </div>
          ) : todayNut?.calories ? (
            <>
              <div className={styles.bigCal}>
                {todayNut.calories}<span className={styles.bigCalUnit}>kcal</span>
                {targets.calories && <span className={styles.bigCalTarget}>/ {targets.calories}</span>}
                {(() => {
                  const st = deriveNutStatus(todayNut, targets)
                  return st ? <span className={`${styles.inlineStatus} ${STATUS_CLS[st]}`}>{st.toUpperCase()}</span> : null
                })()}
              </div>
              <div style={{ marginTop: 16 }}>
                <MacroBar label="Protein" current={todayNut.protein_g ?? 0}  target={targets.protein_g}  color="accent" />
                <MacroBar label="Carbs"   current={todayNut.carbs_g  ?? 0}   target={targets.carbs_g}    color="blue" />
                <MacroBar label="Fat"     current={todayNut.fat_g    ?? 0}   target={targets.fat_g}      color="warning" />
                <MacroBar label="Water"   current={todayNut.water_ml ? +(todayNut.water_ml/1000).toFixed(2) : 0} target={targets.water_l ?? 3} color="faint" />
              </div>
              <div className={styles.todayBtns}>
                <button className="btn-ghost" style={{ padding:'4px 12px', fontSize:10 }} onClick={todayModals.openEdit}>edit</button>
                <button className="btn-ghost" style={{ padding:'4px 12px', fontSize:10 }} onClick={todayModals.openDetail}>details →</button>
              </div>
            </>
          ) : (
            <div className={styles.todayEmpty}>
              <span className={styles.todayEmptyMono}>NOT_LOGGED · no nutrition today yet</span>
              <button style={{ padding:'7px 18px' }} onClick={todayModals.openLog}>+ LOG_TODAY</button>
            </div>
          )}
        </Panel>

        <Panel label="TARGETS.active">
          {Object.keys(targets).length ? (
            [
              { label:'Calories', val:targets.calories,  unit:'kcal' },
              { label:'Protein',  val:targets.protein_g, unit:'g' },
              { label:'Carbs',    val:targets.carbs_g,   unit:'g' },
              { label:'Fat',      val:targets.fat_g,     unit:'g' },
            ].map(t => (
              <div key={t.label} className={styles.targetRow}>
                <span className={styles.targetLabel}>{t.label}</span>
                <span className={styles.targetVal}>{t.val ?? '—'}<span className={styles.targetUnit}>{t.unit}</span></span>
              </div>
            ))
          ) : (
            <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--faint)' }}>
              NO_TARGETS · set a training plan to enable targets
            </span>
          )}
        </Panel>

        <Panel label="30D_AVERAGES">
          <div className={styles.avgGrid}>
            {[
              { label:'Avg calories', val:avg('calories'),  unit:'kcal' },
              { label:'Avg protein',  val:avg('protein_g'), unit:'g' },
              { label:'Avg carbs',    val:avg('carbs_g'),   unit:'g' },
              { label:'Avg fat',      val:avg('fat_g'),     unit:'g' },
            ].map(a => (
              <div key={a.label} className={styles.avgItem}>
                <span className={styles.avgLabel}>{a.label}</span>
                <span className={styles.avgVal}>{a.val ?? '—'}<span className={styles.avgUnit}>{a.unit}</span></span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* CALORIE TREND */}
      <SectionDivider label="CALORIE_TREND.30d" />
      <div className={styles.chartWrap}>
        <Panel label="CALORIES_PER_DAY.area_chart">
          <CalorieChart data={nutrition ?? []} targetCalories={targets.calories} />
        </Panel>
      </div>

      {/* HEATMAP */}
      <SectionDivider label="LOGGING_CONSISTENCY.30d" />
      <Panel label="NUTRITION_STATUS.heatmap">
        <div className={styles.heatmap}>
          {last30.map(date => {
            const st = heatStatus(date)
            const cellCls =
              st === 'hit' ? styles.heatHit :
              st === 'partial' ? styles.heatPartial :
              st === 'off' ? styles.heatOff :
              st === 'missed' ? styles.heatMissed :
              styles.heatEmpty

            return (
              <div
                key={date}
                className={`${styles.heatCell} ${cellCls}`}
                title={`${date}: ${st ?? 'not logged'}`}
              >
                <span className={styles.heatDay}>{dayjs(date).format('D')}</span>
              </div>
            )
          })}
        </div>
        <div className={styles.heatLegend}>
          <span className={styles.lHit}>■ hit</span>
          <span className={styles.lPartial}>■ partial</span>
          <span className={styles.lOff}>■ off target</span>
          <span className={styles.lMissed}>■ missed</span>
          <span className={styles.lEmpty}>■ not logged</span>
        </div>
      </Panel>

      {/* LOG TABLE */}
      <SectionDivider label="NUTRITION_LOG.table" />
      <Panel label="DAILY_ENTRIES.30d">
        {!logged.length
          ? <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--faint)' }}>NO_DATA · start logging nutrition</span>
          : (
            <table className={styles.logTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Calories</th>
                  <th>Protein</th>
                  <th>Carbs</th>
                  <th>Fat</th>
                  <th>Water</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...logged].sort((a,b) => b.date.localeCompare(a.date)).map(n => {
                  const st = deriveNutStatus(n, targets)
                  const isMissed = n.notes === '__MISSED__'
                  return (
                    <tr key={n.date}>
                      <td className={styles.dateCell}>{dayjs(n.date).format('MMM D')}</td>
                      <td>
                        {st && <span className={`${styles.statusPill} ${STATUS_CLS[st] ?? ''}`}>{st.toUpperCase()}</span>}
                      </td>
                      <td className={macroHit(n.calories, targets.calories) ? styles.hit : macroMiss(n.calories, targets.calories) ? styles.miss : ''}>{isMissed ? '—' : (n.calories ?? '—')}</td>
                      <td className={macroHit(n.protein_g, targets.protein_g) ? styles.hit : macroMiss(n.protein_g, targets.protein_g) ? styles.miss : ''}>{isMissed ? '—' : (n.protein_g != null ? `${n.protein_g}g` : '—')}</td>
                      <td className={macroHit(n.carbs_g, targets.carbs_g, 0.90) ? styles.hit : macroMiss(n.carbs_g, targets.carbs_g) ? styles.miss : ''}>{isMissed ? '—' : (n.carbs_g != null ? `${n.carbs_g}g` : '—')}</td>
                      <td className={macroHit(n.fat_g, targets.fat_g, 0.85) ? styles.hit : macroMiss(n.fat_g, targets.fat_g) ? styles.miss : ''}>{isMissed ? '—' : (n.fat_g != null ? `${n.fat_g}g` : '—')}</td>
                      <td>{isMissed ? '—' : (n.water_ml ? `${+(n.water_ml/1000).toFixed(2)}L` : '—')}</td>
                      <td className={styles.actionCell}>
                        <button className={styles.iconBtn} onClick={() => { setHistDate(n.date); setHistNut(n); setTimeout(histModals.openEdit, 0) }}>edit</button>
                        {!isMissed && <button className={styles.iconBtn} onClick={() => { setHistDate(n.date); setHistNut(n); setTimeout(histModals.openDetail, 0) }}>details →</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        }
      </Panel>

      {todayModals.Modals()}
      {histModals.Modals()}
    </div>
  )
}