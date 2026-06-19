import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import dayjs from 'dayjs'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border2)',
      borderRadius: 6, padding: '9px 13px', fontFamily: 'var(--mono)', fontSize: 11,
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      <div style={{ color: 'var(--blue)', fontWeight: 600 }}>
        {payload[0].value} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>kcal</span>
      </div>
      {payload[1] && (
        <div style={{ color: 'var(--accent)', marginTop: 3 }}>
          {payload[1].value}g <span style={{ color: 'var(--faint)', fontWeight: 400 }}>protein</span>
        </div>
      )}
    </div>
  )
}

export default function CalorieChart({ data, targetCalories }) {
  const formatted = (data ?? [])
    .filter(d => d.calories)
    .map(d => ({ ...d, label: dayjs(d.date).format('MMM D') }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!formatted.length) return (
    <div style={{
      height: 180, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      border: '1px dashed var(--border)', borderRadius: 6,
    }}>
      <span style={{ fontSize: 20 }}>🍽</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
        No nutrition data yet
      </span>
    </div>
  )

  const cals    = formatted.map(d => d.calories)
  const maxCal  = Math.max(...cals, targetCalories ?? 0)
  const minCal  = Math.max(0, Math.min(...cals) - 200)

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#58a6ff" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#58a6ff" stopOpacity={0}    />
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
          axisLine={false} tickLine={false} width={38}
          domain={[minCal, Math.ceil(maxCal * 1.08)]}
          tickFormatter={v => `${v}`}
          label={{
            value: 'kcal',
            angle: -90,
            position: 'insideLeft',
            offset: 14,
            style: { fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }
          }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border2)', strokeWidth: 1 }} />
        {targetCalories && (
          <ReferenceLine
            y={targetCalories}
            stroke="var(--accent)"
            strokeDasharray="5 4"
            strokeOpacity={0.5}
            label={{
              value: `Target: ${targetCalories}`,
              position: 'right',
              style: { fill: 'var(--accent)', fontSize: 9, fontFamily: 'var(--mono)' }
            }}
          />
        )}
        <Area
          type="monotone" dataKey="calories"
          stroke="var(--blue)" strokeWidth={2}
          fill="url(#calGrad)"
          dot={false}
          activeDot={{ r: 4, fill: 'var(--blue)', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
