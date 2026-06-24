import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getNutrition, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { useNutritionModals, deriveNutStatus } from '../lib/NutritionModals'
import MealLibrary from '../lib/MealLibrary'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import MacroBar from '../components/ui/Macrobar'
import CalorieChart from '../components/charts/CalorieChart'
import dayjs from 'dayjs'
import styles from './Nutrition.module.css'

const STATUS_CLS = {
  hit:     styles.statusHit,
  partial: styles.statusPartial,
  off:     styles.statusOff,
  missed:  styles.statusMissed,
}

const STATUS_LABEL = { hit: 'On target', partial: 'Partial', off: 'Off plan', missed: 'Missed' }

const TOP_TABS = [
  { key: 'log',     label: 'Log & Tracking' },
  { key: 'library',  label: 'Recipes & Ingredients' },
]

export default function Nutrition() {
  const [topTab, setTopTab] = useState('log')

  const { refresh: refreshStatus } = useStatus()
  const { data: nutrition, refetch } = useApi(() => getNutrition(30))
  const { data: plan }               = useApi(getPlan)

  const targets      = plan?.nutrition_targets ?? {}
  const today        = dayjs().format('YYYY-MM-DD')
  const todayNut     = nutrition?.find(n => n.date === today)
  const isMissedToday = todayNut?.notes === '__MISSED__'

  const onSaved = () => { refetch(); refreshStatus() }
  const todayModals = useNutritionModals({ selDate: today, selNutrition: todayNut, plan, onSaved })

  const [histDate, setHistDate] = useState(null)
  const [histNut,  setHistNut]  = useState(null)
  const histModals = useNutritionModals({ selDate: histDate, selNutrition: histNut, plan, onSaved })

  const logged    = nutrition?.filter(n => n.calories || n.notes === '__MISSED__') ?? []
  const realLogged = nutrition?.filter(n => n.calories) ?? []
  const avg = key => realLogged.length
    ? Math.round(realLogged.reduce((s, n) => s + (n[key] ?? 0), 0) / realLogged.length) : null

  const last30  = Array.from({ length: 30 }, (_, i) => dayjs().subtract(29 - i, 'day').format('YYYY-MM-DD'))
  const nutMap  = {}; nutrition?.forEach(n => { nutMap[n.date] = n })
  const heatStatus = date => deriveNutStatus(nutMap[date], targets)

  const macroHit  = (v, target, thr = 0.95) => target && v != null && v >= target * thr
  const macroMiss = (v, target, thr = 0.70) => target && v != null && v < target * thr

  const todayStatus = deriveNutStatus(todayNut, targets)
  const hasTargets  = Object.keys(targets).length > 0

  return (
    <div>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Nutrition</div>
          <div className={styles.pageSub}>Daily intake log, macro tracking, and your recipe library.</div>
        </div>
        {topTab === 'log' && !todayNut?.calories && !isMissedToday && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={todayModals.openMeals}>
              Add from recipe
            </button>
            <button className="btn-primary" onClick={todayModals.openLog}>
              Log today
            </button>
          </div>
        )}
      </div>

      {/* TOP-LEVEL SECTION TABS */}
      <div className={styles.topTabs}>
        {TOP_TABS.map(t => (
          <button key={t.key}
            className={`${styles.topTab} ${topTab === t.key ? styles.topTabActive : ''}`}
            onClick={() => setTopTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {topTab === 'library' && <MealLibrary />}

      {topTab === 'log' && (
        <>
      {/* TODAY */}
      <SectionDivider label="Today's intake" />
      <div className={styles.todayGrid}>

        {/* — Left: macros logged — */}
        <div className={styles.todayMacros}>
          <div className={styles.todayPanelHeader}>
            <span className={styles.todayPanelTitle}>Today's macros</span>
            {todayStatus && (
              <span className={`${styles.statusPill} ${STATUS_CLS[todayStatus]}`}>
                {STATUS_LABEL[todayStatus]}
              </span>
            )}
          </div>

          {isMissedToday ? (
            <div className={styles.missedState}>
              <span className={styles.missedIcon}>✗</span>
              <span className={styles.missedLabel}>Nutrition missed today</span>
              <button className="btn-ghost" style={{ padding: '5px 14px', fontSize: 11 }}
                onClick={todayModals.openEdit}>Edit</button>
            </div>
          ) : todayNut?.calories ? (
            <div className={styles.macrosLogged}>
              <div className={styles.calHero}>
                <span className={styles.calVal}>{todayNut.calories}</span>
                <span className={styles.calUnit}>kcal</span>
                {targets.calories && (
                  <span className={styles.calTarget}>/ {targets.calories}</span>
                )}
              </div>
              <div className={styles.macroBarGroup}>
                <MacroBar label="Protein" current={todayNut.protein_g ?? 0} target={targets.protein_g} color="accent" />
                <MacroBar label="Carbs"   current={todayNut.carbs_g  ?? 0} target={targets.carbs_g}   color="blue" />
                <MacroBar label="Fat"     current={todayNut.fat_g    ?? 0} target={targets.fat_g}     color="warning" />
                {targets.water_l && (
                  <MacroBar label="Water"
                    current={todayNut.water_ml ? +(todayNut.water_ml / 1000).toFixed(2) : 0}
                    target={targets.water_l} color="faint" />
                )}
              </div>
              <div className={styles.todayBtns}>
                <button className="btn-ghost" style={{ padding: '5px 14px', fontSize: 11 }}
                  onClick={todayModals.openMeals}>Add meal</button>
                <button className="btn-ghost" style={{ padding: '5px 14px', fontSize: 11 }}
                  onClick={todayModals.openEdit}>Edit</button>
                <button className="btn-ghost" style={{ padding: '5px 14px', fontSize: 11 }}
                  onClick={todayModals.openDetail}>Details →</button>
              </div>
            </div>
          ) : (
            <div className={styles.todayEmpty}>
              <span className={styles.todayEmptyIcon}>🥗</span>
              <span className={styles.todayEmptyText}>No nutrition logged today</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn-ghost" onClick={todayModals.openMeals}>
                  Add from recipe
                </button>
                <button className="btn-primary" onClick={todayModals.openLog}>
                  Log today's intake
                </button>
              </div>
            </div>
          )}
        </div>

        {/* — Right: targets + 30d averages stacked — */}
        <div className={styles.todayRight}>
          <Panel label="Targets">
            {hasTargets ? (
              <div className={styles.targetList}>
                {[
                  { label: 'Calories', val: targets.calories,  unit: 'kcal' },
                  { label: 'Protein',  val: targets.protein_g, unit: 'g'    },
                  { label: 'Carbs',    val: targets.carbs_g,   unit: 'g'    },
                  { label: 'Fat',      val: targets.fat_g,     unit: 'g'    },
                ].map(t => (
                  <div key={t.label} className={styles.targetRow}>
                    <span className={styles.targetLabel}>{t.label}</span>
                    <span className={styles.targetVal}>
                      {t.val ?? '—'}
                      <span className={styles.targetUnit}>{t.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.noTargets}>
                <span className={styles.noTargetsIcon}>📋</span>
                <span className={styles.noTargetsText}>No targets set</span>
                <span className={styles.noTargetsSub}>Ask Fahim to build a nutrition plan.</span>
              </div>
            )}
          </Panel>

          <Panel label="30-day averages">
            {realLogged.length ? (
              <div className={styles.avgGrid}>
                {[
                  { label: 'Calories', val: avg('calories'),  unit: 'kcal' },
                  { label: 'Protein',  val: avg('protein_g'), unit: 'g'    },
                  { label: 'Carbs',    val: avg('carbs_g'),   unit: 'g'    },
                  { label: 'Fat',      val: avg('fat_g'),     unit: 'g'    },
                ].map(a => (
                  <div key={a.label} className={styles.avgItem}>
                    <span className={styles.avgLabel}>{a.label}</span>
                    <span className={styles.avgVal}>
                      {a.val ?? '—'}<span className={styles.avgUnit}>{a.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className={styles.noDataHint}>Log nutrition to see averages</span>
            )}
          </Panel>
        </div>
      </div>

      {/* CALORIE CHART */}
      <SectionDivider label="Calorie trend · 30 days" />
      <div className={styles.chartWrap}>
        <Panel label="Daily calories vs target" noPad>
          <div style={{ padding: '12px 16px 8px' }}>
            <CalorieChart data={nutrition ?? []} targetCalories={targets.calories} />
          </div>
        </Panel>
      </div>

      {/* CONSISTENCY HEATMAP */}
      <SectionDivider label="30-day consistency" />
      <Panel label="Nutrition log · 30 days">
        <div className={styles.heatmap}>
          {last30.map(date => {
            const st = heatStatus(date)
            const cellCls =
              st === 'hit'     ? styles.heatHit     :
              st === 'partial' ? styles.heatPartial :
              st === 'off'     ? styles.heatOff     :
              st === 'missed'  ? styles.heatMissed  :
              styles.heatEmpty
            return (
              <div key={date} className={`${styles.heatCell} ${cellCls}`}
                title={`${dayjs(date).format('MMM D')}: ${st ? STATUS_LABEL[st] : 'Not logged'}`}>
                <span className={styles.heatDay}>{dayjs(date).format('D')}</span>
              </div>
            )
          })}
        </div>
        <div className={styles.heatLegend}>
          <span className={styles.lHit}>■ On target</span>
          <span className={styles.lPartial}>■ Partial</span>
          <span className={styles.lOff}>■ Off plan</span>
          <span className={styles.lMissed}>■ Missed</span>
          <span className={styles.lEmpty}>■ Not logged</span>
        </div>
      </Panel>

      {/* HISTORY TABLE */}
      <SectionDivider label="History" />
      <Panel label="All entries">
        {!logged.length ? (
          <div className={styles.emptyTableState}>
            <span className={styles.emptyTableIcon}>📊</span>
            <span className={styles.emptyTableText}>No entries yet — start logging nutrition</span>
          </div>
        ) : (
          <div className={styles.tableWrap}>
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
                {[...logged].sort((a, b) => b.date.localeCompare(a.date)).map(n => {
                  const st = deriveNutStatus(n, targets)
                  const isMissed = n.notes === '__MISSED__'
                  return (
                    <tr key={n.date}>
                      <td className={styles.dateCell}>{dayjs(n.date).format('MMM D')}</td>
                      <td>
                        {st && (
                          <span className={`${styles.statusPillSm} ${STATUS_CLS[st]}`}>
                            {STATUS_LABEL[st]}
                          </span>
                        )}
                      </td>
                      <td className={macroHit(n.calories, targets.calories) ? styles.hit : macroMiss(n.calories, targets.calories) ? styles.miss : ''}>
                        {isMissed ? '—' : (n.calories ?? '—')}
                      </td>
                      <td className={macroHit(n.protein_g, targets.protein_g) ? styles.hit : macroMiss(n.protein_g, targets.protein_g) ? styles.miss : ''}>
                        {isMissed ? '—' : (n.protein_g != null ? `${n.protein_g}g` : '—')}
                      </td>
                      <td className={macroHit(n.carbs_g, targets.carbs_g, 0.90) ? styles.hit : macroMiss(n.carbs_g, targets.carbs_g) ? styles.miss : ''}>
                        {isMissed ? '—' : (n.carbs_g != null ? `${n.carbs_g}g` : '—')}
                      </td>
                      <td className={macroHit(n.fat_g, targets.fat_g, 0.85) ? styles.hit : macroMiss(n.fat_g, targets.fat_g) ? styles.miss : ''}>
                        {isMissed ? '—' : (n.fat_g != null ? `${n.fat_g}g` : '—')}
                      </td>
                      <td>{isMissed ? '—' : (n.water_ml ? `${+(n.water_ml / 1000).toFixed(2)}L` : '—')}</td>
                      <td className={styles.actionCell}>
                        <button className={styles.rowBtn}
                          onClick={() => { setHistDate(n.date); setHistNut(n); setTimeout(histModals.openEdit, 0) }}>
                          Edit
                        </button>
                        {!isMissed && (
                          <button className={styles.rowBtn}
                            onClick={() => { setHistDate(n.date); setHistNut(n); setTimeout(histModals.openDetail, 0) }}>
                            Details →
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
        </>
      )}

      {todayModals.Modals()}
      {histModals.Modals()}
    </div>
  )
}
