import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import dayjs from 'dayjs'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border2)',
      borderRadius: 4, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--blue)' }}>{payload[0].value.toFixed(1)} kg</div>
    </div>
  )
}

export default function WeightChart({ data, goalWeight }) {
  if (!data?.length) return (
    <div style={{
      height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--border)', borderRadius: 4,
      fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)',
    }}>
      NO_DATA · log body metrics to see trend
    </div>
  )

  const formatted = data.map(d => ({
    ...d,
    label: dayjs(d.date).format('MMM D'),
  }))

  const weights = data.map(d => d.weight_kg)
  const minY = Math.floor(Math.min(...weights) - 1)
  const maxY = Math.ceil(Math.max(...weights) + 1)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={formatted}>
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
          axisLine={false} tickLine={false}
          interval={Math.floor(formatted.length / 5)}
        />
        <YAxis
          domain={[minY, maxY]}
          tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
          axisLine={false} tickLine={false} width={36}
          tickFormatter={v => `${v}kg`}
        />
        <Tooltip content={<CustomTooltip />} />
        {goalWeight && (
          <ReferenceLine
            y={goalWeight} stroke="var(--accent)" strokeDasharray="4 4"
            strokeOpacity={0.5} label={null}
          />
        )}
        <Line
          type="monotone" dataKey="weight_kg"
          stroke="var(--blue)" strokeWidth={1.5}
          dot={{ fill: 'var(--blue)', r: 2, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: 'var(--blue)' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}