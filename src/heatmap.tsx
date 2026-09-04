type StateTile = { code: string; row: number; col: number };

const STATES: StateTile[] = [
  { code: "AK", row: 1, col: 1 }, { code: "ME", row: 1, col: 12 },
  { code: "WA", row: 2, col: 1 }, { code: "ID", row: 2, col: 2 }, { code: "MT", row: 2, col: 3 }, { code: "ND", row: 2, col: 4 }, { code: "MN", row: 2, col: 5 }, { code: "WI", row: 2, col: 6 }, { code: "MI", row: 2, col: 8 }, { code: "NY", row: 2, col: 9 }, { code: "VT", row: 2, col: 10 }, { code: "NH", row: 2, col: 11 },
  { code: "OR", row: 3, col: 1 }, { code: "NV", row: 3, col: 2 }, { code: "WY", row: 3, col: 3 }, { code: "SD", row: 3, col: 4 }, { code: "IA", row: 3, col: 5 }, { code: "IL", row: 3, col: 6 }, { code: "IN", row: 3, col: 7 }, { code: "OH", row: 3, col: 8 }, { code: "PA", row: 3, col: 9 }, { code: "NJ", row: 3, col: 10 }, { code: "CT", row: 3, col: 11 }, { code: "RI", row: 3, col: 12 },
  { code: "CA", row: 4, col: 1 }, { code: "UT", row: 4, col: 2 }, { code: "CO", row: 4, col: 3 }, { code: "NE", row: 4, col: 4 }, { code: "MO", row: 4, col: 5 }, { code: "KY", row: 4, col: 6 }, { code: "WV", row: 4, col: 7 }, { code: "VA", row: 4, col: 8 }, { code: "MD", row: 4, col: 9 }, { code: "DE", row: 4, col: 10 }, { code: "MA", row: 4, col: 11 },
  { code: "AZ", row: 5, col: 2 }, { code: "NM", row: 5, col: 3 }, { code: "KS", row: 5, col: 4 }, { code: "AR", row: 5, col: 5 }, { code: "TN", row: 5, col: 6 }, { code: "NC", row: 5, col: 8 }, { code: "SC", row: 5, col: 9 }, { code: "DC", row: 5, col: 10 },
  { code: "OK", row: 6, col: 4 }, { code: "LA", row: 6, col: 5 }, { code: "MS", row: 6, col: 6 }, { code: "AL", row: 6, col: 7 }, { code: "GA", row: 6, col: 8 },
  { code: "HI", row: 7, col: 1 }, { code: "TX", row: 7, col: 4 }, { code: "FL", row: 7, col: 9 },
];

function mix(from: string, to: string, amount: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [fr, fg, fb] = parse(from);
  const [tr, tg, tb] = parse(to);
  return `rgb(${Math.round(fr + (tr - fr) * amount)}, ${Math.round(fg + (tg - fg) * amount)}, ${Math.round(fb + (tb - fb) * amount)})`;
}

export function USHeatmap({ values, stage }: { values: Record<string, number>; stage: "Applications" | "Deposits" }) {
  const max = Math.max(1, ...Object.values(values));
  const high = stage === "Deposits" ? "#ba0c2f" : "#002856";
  return (
    <div className="heatmap-wrap">
      <div className="us-heatmap" role="img" aria-label={`United States heatmap of ${stage.toLowerCase()} by reported state`}>
        {STATES.map(({ code, row, col }) => {
          const reported = Object.prototype.hasOwnProperty.call(values, code);
          const value = values[code] ?? 0;
          const background = reported ? mix("#d8dfe1", high, value / max) : "#f4f6f7";
          const dark = reported && value / max > 0.48;
          return <div className={`state-tile ${reported ? "reported" : "unreported"}`} style={{ gridRow: row, gridColumn: col, background, color: dark ? "#fff" : "#002856" }} title={`${code}: ${reported ? value.toLocaleString("en-US") : "not reported in workbook"}`} key={code}><strong>{code}</strong>{reported && <span>{value.toLocaleString("en-US")}</span>}</div>;
        })}
      </div>
      <div className="heat-legend"><span>Not reported</span><i className="heat-swatch unreported" /><span>Lower</span><i className="heat-gradient" style={{ background: `linear-gradient(90deg, #d8dfe1, ${high})` }} /><span>Higher</span></div>
    </div>
  );
}
