import { useEffect, useRef, useState, type MouseEvent } from "react";

export type ChartSeries = {
  name: string;
  values: number[];
  color: string;
  kind?: "line" | "bar";
  axis?: "left" | "right";
};

type SeriesChartProps = {
  labels: string[];
  series: ChartSeries[];
  formatLeft?: (value: number) => string;
  formatRight?: (value: number) => string;
  height?: number;
  ariaLabel: string;
};

const compact = (value: number) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function SeriesChart({ labels, series, formatLeft = compact, formatRight = compact, height = 310, ariaLabel }: SeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; values: { name: string; value: string; color: string }[] } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const width = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const margin = { top: 34, right: 66, bottom: 42, left: 88 };
      const chartWidth = Math.max(20, width - margin.left - margin.right);
      const chartHeight = height - margin.top - margin.bottom;
      const leftSeries = series.filter((item) => (item.axis ?? "left") === "left");
      const rightSeries = series.filter((item) => item.axis === "right");
      const maxOf = (items: ChartSeries[]) => Math.max(1, ...items.flatMap((item) => item.values.map((value) => Number.isFinite(value) ? value : 0))) * 1.12;
      const leftMax = maxOf(leftSeries);
      const rightMax = maxOf(rightSeries);

      ctx.font = '11px "Open Sans", Arial, system-ui, sans-serif';
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i += 1) {
        const y = margin.top + chartHeight * (i / 4);
        ctx.strokeStyle = "#d8dfe1";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(width - margin.right, y);
        ctx.stroke();
        ctx.fillStyle = "#536776";
        ctx.textAlign = "right";
        ctx.fillText(formatLeft(leftMax * (1 - i / 4)), margin.left - 8, y);
        if (rightSeries.length) {
          ctx.textAlign = "left";
          ctx.fillText(formatRight(rightMax * (1 - i / 4)), width - margin.right + 8, y);
        }
      }

      const step = chartWidth / Math.max(1, labels.length);
      labels.forEach((label, index) => {
        const x = margin.left + step * index + step / 2;
        ctx.fillStyle = "#536776";
        ctx.textAlign = "center";
        ctx.fillText(label.slice(0, 3), x, height - 18);
      });

      const barSeries = series.filter((item) => item.kind === "bar");
      series.forEach((item) => {
        const max = item.axis === "right" ? rightMax : leftMax;
        const yFor = (value: number) => margin.top + chartHeight - (Math.max(0, value) / max) * chartHeight;
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        if (item.kind === "bar") {
          const barIndex = barSeries.indexOf(item);
          const groupWidth = Math.min(46, step * 0.72);
          const barWidth = groupWidth / Math.max(1, barSeries.length);
          item.values.forEach((value, index) => {
            const x = margin.left + step * index + step / 2 - groupWidth / 2 + barIndex * barWidth + 1;
            const y = yFor(value);
            ctx.globalAlpha = 0.75;
            ctx.fillRect(x, y, Math.max(2, barWidth - 2), margin.top + chartHeight - y);
            ctx.globalAlpha = 1;
          });
          return;
        }
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.beginPath();
        item.values.forEach((value, index) => {
          const x = margin.left + step * index + step / 2;
          const y = yFor(value);
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        item.values.forEach((value, index) => {
          const x = margin.left + step * index + step / 2;
          const y = yFor(value);
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    };

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [labels, series, height, formatLeft, formatRight]);

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !labels.length) return;
    const rect = canvas.getBoundingClientRect();
    const chartLeft = 88;
    const chartRight = rect.width - 66;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < chartLeft || x > chartRight || y < 24 || y > height - 36) {
      setTooltip(null);
      return;
    }
    const step = (chartRight - chartLeft) / labels.length;
    const index = Math.max(0, Math.min(labels.length - 1, Math.floor((x - chartLeft) / step)));
    setTooltip({
      x: Math.min(rect.width - 175, Math.max(8, x + 12)),
      y: Math.max(8, y - 26),
      label: labels[index],
      values: series.map((item) => ({ name: item.name, value: (item.axis === "right" ? formatRight : formatLeft)(item.values[index] ?? 0), color: item.color })),
    });
  };

  return (
    <div className="chart-wrap" onMouseMove={handleMove} onMouseLeave={() => setTooltip(null)}>
      <canvas ref={canvasRef} className="series-chart" style={{ height }} role="img" aria-label={ariaLabel} />
      {tooltip && <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="status"><strong>{tooltip.label}</strong>{tooltip.values.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}<b>{item.value}</b></span>)}</div>}
    </div>
  );
}

export function BarList({ items, formatter = compact }: { items: { label: string; value: number; color?: string }[]; formatter?: (value: number) => string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-label"><span>{item.label}</span><strong>{formatter(item.value)}</strong></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color }} /></div>
        </div>
      ))}
    </div>
  );
}
