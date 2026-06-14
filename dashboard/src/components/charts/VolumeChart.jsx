import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import dayjs from 'dayjs'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border2)',
      borderRadius: 4, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--accent)' }}>{payload[0].value} sets</div>
    </div>
  )
}

export default function VolumeChart({ workouts }) {
  if (!workouts?.length) return <EmptyState />

  const byDate = {}
  workouts.forEach(w => {
    const d = w.date
    const sets = w.sets?.filter(s => !s.is_warmup).length ?? 0
    byDate[d] = (byDate[d] || 0) + sets
  })

  const data = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, sets]) => ({
      date,
      label: dayjs(date).format('MMM D'),
      sets,
    }))

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={data} barCategoryGap="30%">
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
          axisLine={false} tickLine={false}
          interval={Math.floor(data.length / 5)}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface2)' }} />
        <Bar dataKey="sets" radius={[2, 2, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.sets === 0 ? 'var(--faint)' : 'var(--accent)'}
              opacity={entry.sets === 0 ? 0.3 : 0.75}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function EmptyState() {
  return (
    <div style={{
      height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--border)', borderRadius: 4,
      fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)',
    }}>
      NO_DATA · log your first workout
    </div>
  )
}