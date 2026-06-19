import { NavLink } from 'react-router-dom'
import { useStatus } from '../../lib/StatusContext'
import styles from './Layout.module.css'

const NAV_LINKS = [
  { to: '/',          label: 'Overview'   },
  { to: '/schedule',  label: 'Schedule'   },
  { to: '/workouts',  label: 'Workouts'   },
  { to: '/nutrition', label: 'Nutrition'  },
  { to: '/progress',  label: 'Progress'   },
  { to: '/goals',     label: 'Goals'      },
]

export default function Layout({ children }) {
  const { status } = useStatus()

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.logo}>
          <span className={styles.logoMark}>F</span>
          <span className={styles.logoText}>ahim</span>
        </span>
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
        <div className={styles.navRight}>
          <div className={`${styles.syncDot} ${status?.ollamaOk ? styles.online : styles.offline}`} />
          <span className={styles.syncLabel}>{status?.ollamaOk ? 'AI online' : 'AI offline'}</span>
        </div>
      </nav>

      {status && (
        <div className={styles.statusBar}>
          <StatusChip
            icon="🔥"
            value={`${status.streak} day streak`}
            active={status.streak > 0}
          />
          <div className={styles.statusDivider} />
          <StatusChip
            icon={status.nutritionLoggedToday ? '✓' : '○'}
            value={status.nutritionLoggedToday ? 'Nutrition logged' : 'Nutrition pending'}
            active={status.nutritionLoggedToday}
            warn={!status.nutritionLoggedToday}
          />
          <div className={styles.statusDivider} />
          <StatusChip
            icon={status.workoutToday ? '✓' : '○'}
            value={status.workoutToday ? 'Session logged' : 'No session today'}
            active={status.workoutToday}
          />
        </div>
      )}

      <main className={styles.main}>{children}</main>
    </div>
  )
}

function StatusChip({ icon, value, active, warn }) {
  return (
    <div className={`${styles.chip} ${active ? styles.chipActive : ''} ${warn ? styles.chipWarn : ''}`}>
      <span className={styles.chipIcon}>{icon}</span>
      <span className={styles.chipLabel}>{value}</span>
    </div>
  )
}
