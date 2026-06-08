"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export function TrendChart({ data, xKey, yKey }: { data: Record<string, unknown>[]; xKey: string; yKey: string }) {
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} tickMargin={8} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={32} />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke="#22c55e" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
