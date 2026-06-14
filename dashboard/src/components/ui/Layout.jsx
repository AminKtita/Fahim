import { NavLink } from 'react-router-dom'
import { useStatus } from '../../lib/StatusContext'
import styles from './Layout.module.css'

const NAV_LINKS = [
  { to: '/',          label: 'overview'   },
  { to: '/schedule',  label: 'schedule'   },
  { to: '/workouts',  label: 'workouts'   },
  { to: '/nutrition', label: 'nutrition'  },
  { to: '/progress',  label: 'progress'   },
  { to: '/goals',     label: 'goals'      },
]

export default function Layout({ children }) {
  const { status } = useStatus()

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.logo}>$<span>Coach</span>.Fahim</span>
        <div className={styles.links}>
          {NAV_LINKS.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ''}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className={styles.statusPill}>
          <div className={`${styles.dot} ${status?.ollamaOk ? styles.green : styles.yellow}`} />
          <span>{status?.ollamaOk ? 'OPERATIONAL' : 'DEGRADED'}</span>
        </div>
      </nav>

      {status && (
        <div className={styles.statusBar}>
          <StatusItem
            dot={status.streak > 0 ? 'green' : 'faint'}
            label={`streak · ${status.streak} day${status.streak !== 1 ? 's' : ''}`}
          />
          <StatusItem
            dot={status.nutritionLoggedToday ? 'green' : 'yellow'}
            label={status.nutritionLoggedToday ? 'nutrition · logged' : 'nutrition · not logged today'}
          />
          <StatusItem
            dot={status.workoutToday ? 'green' : 'blue'}
            label={status.workoutToday ? 'trained today' : 'no session today'}
          />
        </div>
      )}

      <main className={styles.main}>{children}</main>
    </div>
  )
}

function StatusItem({ dot, label }) {
  const dotColors = { green:'var(--accent)', yellow:'var(--warn)', blue:'var(--blue)', faint:'var(--faint)' }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:10, color:'var(--faint)' }}>
      <div style={{ width:5, height:5, borderRadius:'50%', background: dotColors[dot] ?? 'var(--faint)' }} />
      {label}
    </div>
  )
}