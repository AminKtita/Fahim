import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import dayjs from 'dayjs'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border2)',
      borderRadius: 4, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--blue)' }}>{payload[0].value} kcal</div>
      {payload[1] && <div style={{ color: 'var(--accent)', marginTop: 2 }}>{payload[1].value}g protein</div>}
    </div>
  )
}

export default function CalorieChart({ data, targetCalories }) {
  if (!data?.length) return (
    <div style={{
      height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--border)', borderRadius: 4,
      fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)',
    }}>
      NO_DATA · log nutrition to see trend
    </div>
  )

  const formatted = data
    .filter(d => d.calories)
    .map(d => ({ ...d, label: dayjs(d.date).format('MMM D') }))
    .reverse()

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={formatted}>
        <defs>
          <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
          axisLine={false} tickLine={false}
          interval={Math.floor(formatted.length / 5)}
        />
        <YAxis
          tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
          axisLine={false} tickLine={false} width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        {targetCalories && (
          <ReferenceLine y={targetCalories} stroke="var(--accent)" strokeDasharray="4 4" strokeOpacity={0.4} />
        )}
        <Area
          type="monotone" dataKey="calories"
          stroke="var(--blue)" strokeWidth={1.5}
          fill="url(#calGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}