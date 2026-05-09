interface Props {
  incomeCad: number
  expenseCad: number
  profitCad: number
  txCount: number
}

export default function SummaryCards({ incomeCad, expenseCad, profitCad, txCount }: Props) {
  const fmt = (n: number) => `CA$${n.toFixed(2)}`
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card label="本月收入" value={fmt(incomeCad)} color="green" />
      <Card label="本月支出" value={fmt(expenseCad)} color="red" />
      <Card label="本月利润" value={fmt(profitCad)} color={profitCad >= 0 ? 'blue' : 'red'} />
      <Card label="交易笔数" value={String(txCount)} color="gray" />
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-700', red: 'text-red-600', blue: 'text-blue-700', gray: 'text-gray-700',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${colors[color]}`}>{value}</div>
    </div>
  )
}
