import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox } from "../../components/primitives.jsx";
import { PageHeader, MetricCard, LatencyChart, RequestsTable } from "../../components/dashboard-widgets.jsx";

export default function Overview() {
  const { loading, data, error } = useAsync(() => api("/api/console/overview"), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const m = data.metrics;
  return (
    <div>
      <PageHeader title="概览" sub="cn-east-1 · 实时" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <MetricCard label="UPTIME · 30D" value={m.uptime_30d} unit="%" delta="+0.04 vs 上月" deltaTone="up" />
        <MetricCard label="P99 · LIVE" value={m.p99_live_ms} unit="ms" delta="−18 vs 1h 前" deltaTone="up" />
        <MetricCard label="请求 · 30D" value={m.requests_30d} unit="" delta="较上月 +12%" deltaTone="up" />
        <MetricCard label="本月费用" value={m.spent} unit="" delta={`预计 ${m.projection} / 月`} deltaTone="neutral" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <LatencyChart series={data.latency_series} />
      </div>
      <RequestsTable rows={data.recent_requests} compact />
    </div>
  );
}
