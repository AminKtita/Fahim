import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import dayjs from 'dayjs'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border2)',
      borderRadius: 6, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11,
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
        {payload[0].value} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>sets</span>
      </div>
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

  const maxSets = Math.max(...data.map(d => d.sets), 1)

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} barCategoryGap="35%" margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
          axisLine={false} tickLine={false}
          interval={Math.floor(data.length / 5)}
        />
        <YAxis
          tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
          axisLine={false} tickLine={false}
          width={24}
          tickCount={4}
          domain={[0, maxSets + 2]}
          label={{
            value: 'sets',
            angle: -90,
            position: 'insideLeft',
            offset: 14,
            style: { fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }
          }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface2)', opacity: 0.5 }} />
        <Bar dataKey="sets" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.sets === 0 ? 'var(--faint)' : 'var(--accent)'}
              opacity={entry.sets === 0 ? 0.2 : 0.8}
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
      height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px dashed var(--border)', borderRadius: 6,
      fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', flexDirection: 'column', gap: 6,
    }}>
      <span style={{ fontSize: 20 }}>📊</span>
      <span>No workout data yet</span>
    </div>
  )
}
