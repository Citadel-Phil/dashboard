import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { BarList, SeriesChart, type ChartSeries } from "./charts";
import { loadDataset, mergeAdmissionsDatasets, parseAdvertisingBuffer, parseAdmissionsBuffer, saveDataset } from "./data";
import { USHeatmap } from "./heatmap";
import { MONTHS, type AdRecord, type AdmissionRecord, type AdmissionStage, type Campaign, type ImportedDataset } from "./types";

const CHANNELS = ["All channels", "Social", "Google Display", "Google Search", "YouTube", "Targeted"];
const CAMPAIGNS = ["Total", "SCCC", "CGC", "Degree Completion", "Veterans"] as const;
const COLORS = {
  flagBlue: "#002856",
  infantryBlue: "#7badd3",
  ringGold: "#edae17",
  modernBlue: "#3d7cc9",
  bigRed: "#ba0c2f",
  bulldogGray: "#d8dfe1",
};

const money = (value: number) => Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const moneyCents = (value: number) => Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const number = (value: number) => Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const signedPercent = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

type AdditiveMetric = "spend" | "impressions" | "clicks" | "budget";
type Metric = AdditiveMetric | "ctr" | "cpc" | "cpm";
type YearMode = "compare" | "current" | "previous";
const ALL_METRICS: Metric[] = ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "budget"];

function metricLabel(metric: Metric) {
  return ({ spend: "Spend", impressions: "Impressions", clicks: "Clicks", ctr: "CTR", cpc: "CPC", cpm: "CPM", budget: "Budget" } as const)[metric];
}

function metricFormatter(metric: Metric) {
  if (metric === "spend" || metric === "budget") return money;
  if (metric === "ctr") return percent;
  if (metric === "cpc" || metric === "cpm") return moneyCents;
  if (metric === "impressions") return number;
  return number;
}

function metricValue(row: ReturnType<typeof emptyTotals>, metric: Metric) {
  if (metric === "ctr") return row.impressions ? row.clicks / row.impressions : 0;
  if (metric === "cpc") return row.clicks ? row.spend / row.clicks : 0;
  if (metric === "cpm") return row.impressions ? (row.spend / row.impressions) * 1000 : 0;
  return row[metric];
}

function campaignDates(label: string) {
  const classMatch = label.match(/Class of (20\d{2})/i);
  if (classMatch) {
    const classYear = Number(classMatch[1]);
    return `Aug 15, ${classYear - 5} – Aug 14, ${classYear - 4}`;
  }
  const match = label.match(/(\d{4})\D+(\d{2,4})/);
  if (!match) return `${label} campaign year`;
  const end = Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2]);
  return `Aug 15, ${match[1]} – Aug 14, ${end}`;
}

function classForCampaignYear(label: string): string {
  const classMatch = label.match(/Class of (20\d{2})/i);
  if (classMatch) return classMatch[1];
  const match = label.match(/(\d{4})\D+(\d{2,4})/);
  const end = match ? (Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2])) : 2027;
  return String(end + 4);
}

function normalizeCampaignClass(label?: string) {
  if (!label) return "Unassigned";
  if (/^Class of 20\d{2}$/i.test(label)) return label.replace(/^class of/i, "Class of");
  return `Class of ${classForCampaignYear(label)}`;
}

function buildDemoYear(campaignYear: string, yearFactor: number, summary = false): AdRecord[] {
  const records: AdRecord[] = [];
  const definitions: [Campaign, string, number][] = [
    ["SCCC", "SCCC South Carolina", 1.35], ["SCCC", "SCCC Regional", 1.05], ["SCCC", "SCCC National", 0.9],
    ["CGC", "MBA", 0.7], ["CGC", "Education", 0.45], ["Degree Completion", "Nursing", 0.42], ["Veterans", "Veterans", 0.32],
  ];
  const sources = summary ? ["Overall"] : ["Social", "Google Display", "Google Search", "YouTube", "Targeted"];
  sources.forEach((source, sourceIndex) => definitions.forEach(([campaign, subcampaign, weight], definitionIndex) => MONTHS.forEach((month, monthIndex) => {
    const active = monthIndex < 8;
    const spend = active ? (720 + monthIndex * 115 + sourceIndex * 75) * weight * yearFactor : 0;
    const clicks = active ? Math.round(spend / (2.1 + definitionIndex * 0.18)) : 0;
    records.push({ source, campaignYear, isSummary: summary, campaign, subcampaign, originalLabel: subcampaign, month, impressions: clicks * (42 + sourceIndex * 7), clicks, spend, budget: active ? 1500 * weight : 0 });
  })));
  return records;
}

function buildDemoAdmissions(): AdmissionRecord[] {
  const records: AdmissionRecord[] = [];
  (["2029", "2030", "2031"] as const).forEach((classYear, classIndex) => MONTHS.forEach((month, index) => {
    const applications = Math.round((170 + index * 255) * (0.93 + classIndex * 0.05));
    const deposits = Math.max(0, Math.round((index - 1) * 72 * (0.94 + classIndex * 0.04)));
    records.push({ classYear, stage: "Applications", month, total: applications, inState: Math.round(applications * 0.44), outState: Math.round(applications * 0.56), international: Math.round(applications * .03), states: { NC: Math.round(applications * .07), GA: Math.round(applications * .06), FL: Math.round(applications * .05) } });
    records.push({ classYear, stage: "Deposits", month, total: deposits, inState: Math.round(deposits * 0.55), outState: Math.round(deposits * 0.45), international: Math.round(deposits * .02), states: { NC: Math.round(deposits * .06), GA: Math.round(deposits * .04), FL: Math.round(deposits * .05) } });
  }));
  return records;
}

const DEMO_CURRENT = buildDemoYear("Class of 2031", 1, false);
const DEMO_PREVIOUS = buildDemoYear("Class of 2030", .87, true);
const DEMO_ADMISSIONS = buildDemoAdmissions();

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function UploadCard({ title, description, status, kind, onFile }: { title: string; description: string; status: ImportedDataset<unknown> | null; kind: string; onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const handle = (file?: File) => file && onFile(file);
  return (
    <div className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); handle(event.dataTransfer.files[0]); }}>
      <div className="upload-icon" aria-hidden="true">↑</div>
      <div className="upload-copy"><strong>{title}</strong><span>{description}</span>{status && <small>Loaded: {status.fileName}</small>}</div>
      <label className="button secondary">{status ? "Replace file" : "Choose file"}<input type="file" accept=".xlsx,.xls" onChange={(event) => handle(event.target.files?.[0])} aria-label={`Upload ${kind} workbook`} /></label>
    </div>
  );
}

function ChartCard({ eyebrow, title, action, children, className = "" }: { eyebrow: string; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`chart-card ${className}`}><header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</header>{children}</section>;
}

const emptyTotals = () => ({ impressions: 0, clicks: 0, spend: 0, budget: 0 });

function recordsForChannel(records: AdRecord[], channel: string) {
  if (channel !== "All channels") return records.filter((record) => !record.isSummary && record.source === channel);
  const summaries = records.filter((record) => record.isSummary);
  return summaries.length ? summaries : records.filter((record) => !record.isSummary);
}

function monthlyTotals(records: AdRecord[]) {
  return MONTHS.map((month) => records.filter((record) => record.month === month).reduce((sum, record) => ({ impressions: sum.impressions + record.impressions, clicks: sum.clicks + record.clicks, spend: sum.spend + record.spend, budget: sum.budget + record.budget }), emptyTotals()));
}

function totalMetrics(monthly: ReturnType<typeof monthlyTotals>) {
  return monthly.reduce((sum, row) => ({ impressions: sum.impressions + row.impressions, clicks: sum.clicks + row.clicks, spend: sum.spend + row.spend, budget: sum.budget + row.budget }), emptyTotals());
}

function filterCampaign(records: AdRecord[], campaign: (typeof CAMPAIGNS)[number], subcampaign: string) {
  return records.filter((record) => {
    if (campaign !== "Total" && record.campaign !== campaign) return false;
    if (subcampaign !== "All subcampaigns" && record.subcampaign !== subcampaign) return false;
    return true;
  });
}

export default function App() {
  const [currentData, setCurrentData] = useState<ImportedDataset<AdRecord> | null>(null);
  const [previousData, setPreviousData] = useState<ImportedDataset<AdRecord> | null>(null);
  const [admissions, setAdmissions] = useState<ImportedDataset<AdmissionRecord> | null>(null);
  const [yearMode, setYearMode] = useState<YearMode>("compare");
  const [campaign, setCampaign] = useState<(typeof CAMPAIGNS)[number]>("SCCC");
  const [subcampaign, setSubcampaign] = useState("All subcampaigns");
  const [channel, setChannel] = useState("All channels");
  const [classYear, setClassYear] = useState("2030");
  const [trendMetric, setTrendMetric] = useState<Metric>("spend");
  const [mixMetric, setMixMetric] = useState<AdditiveMetric>("spend");
  const [yoyMetric, setYoyMetric] = useState<Metric>("spend");
  const [heatStage, setHeatStage] = useState<AdmissionStage>("Deposits");
  const [enrollmentCompareStage, setEnrollmentCompareStage] = useState<AdmissionStage>("Applications");
  const [message, setMessage] = useState<string | null>(null);
  const [showUploads, setShowUploads] = useState(true);

  useEffect(() => {
    Promise.all([loadDataset<AdRecord>("advertising-current"), loadDataset<AdRecord>("advertising-previous"), loadDataset<AdRecord>("advertising"), loadDataset<AdmissionRecord>("admissions")])
      .then(([savedCurrent, savedPrevious, legacyCurrent, savedAdmissions]) => {
        const selectedCurrent = savedCurrent ?? legacyCurrent;
        if (selectedCurrent) {
          selectedCurrent.campaignYear = normalizeCampaignClass(selectedCurrent.campaignYear ?? "2026–27");
          selectedCurrent.records = selectedCurrent.records.map((record) => ({ ...record, campaignYear: selectedCurrent.campaignYear!, isSummary: record.isSummary ?? false, subcampaign: record.subcampaign === "SCCC Instate" ? "SCCC South Carolina" : record.subcampaign }));
        }
        if (savedPrevious) {
          savedPrevious.campaignYear = normalizeCampaignClass(savedPrevious.campaignYear ?? "2025–26");
          savedPrevious.records = savedPrevious.records.map((record) => ({ ...record, campaignYear: savedPrevious.campaignYear!, subcampaign: record.subcampaign === "SCCC Instate" ? "SCCC South Carolina" : record.subcampaign }));
        }
        const standardizedAdmissions = savedAdmissions?.classFiles ? savedAdmissions : null;
        if (standardizedAdmissions) standardizedAdmissions.records = standardizedAdmissions.records.filter((record) => (record.stage as string) !== "Accepted").map((record) => ({ ...record, international: record.international ?? 0, states: record.states ?? {} }));
        setCurrentData(selectedCurrent);
        setPreviousData(savedPrevious);
        setAdmissions(standardizedAdmissions);
        if (savedAdmissions && !savedAdmissions.classFiles) setMessage("The previous admissions format has been retired. Upload the new ‘Class of YYYY’ workbook for each class you want to compare.");
        if (selectedCurrent && savedPrevious && standardizedAdmissions) setShowUploads(false);
      })
      .catch(() => setMessage("Saved browser data could not be opened. You can still upload fresh workbooks."));
  }, []);

  const currentYear = currentData?.campaignYear ?? "Class of 2031";
  const previousYear = previousData?.campaignYear ?? "Class of 2030";
  const currentRecords = currentData?.records ?? DEMO_CURRENT;
  const previousRecords = previousData?.records ?? DEMO_PREVIOUS;
  const admissionRecords = admissions?.records ?? DEMO_ADMISSIONS;
  const isDemo = !currentData || !previousData || !admissions;

  const uploadAdvertising = async (file: File, slot: "current" | "previous") => {
    try {
      setMessage(`Reading ${file.name}…`);
      const parsed = parseAdvertisingBuffer(await file.arrayBuffer(), file.name);
      await saveDataset(slot === "current" ? "advertising-current" : "advertising-previous", parsed);
      if (slot === "current") setCurrentData(parsed); else setPreviousData(parsed);
      setMessage(`${parsed.campaignYear} advertising updated: ${number(parsed.records.length)} monthly records loaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The advertising workbook could not be read.");
    }
  };

  const uploadAdmissions = async (file: File) => {
    try {
      setMessage(`Reading ${file.name}…`);
      const parsed = parseAdmissionsBuffer(await file.arrayBuffer(), file.name);
      const merged = mergeAdmissionsDatasets(admissions, parsed);
      await saveDataset("admissions", merged);
      setAdmissions(merged);
      setClassYear(parsed.records[0].classYear);
      const applications = parsed.records.filter((record) => record.stage === "Applications").reduce((sum, record) => sum + record.total, 0);
      const deposits = parsed.records.filter((record) => record.stage === "Deposits").reduce((sum, record) => sum + record.total, 0);
      const international = parsed.records.filter((record) => record.stage === "Applications").reduce((sum, record) => sum + record.international, 0);
      const mappedStates = new Set(parsed.records.filter((record) => record.stage === "Applications").flatMap((record) => Object.keys(record.states))).size;
      setMessage(`Class of ${parsed.records[0].classYear} updated: ${number(applications)} applications, ${number(deposits)} deposits, ${number(mappedStates)} U.S. states mapped, and ${number(international)} blank-State records reported as International Students.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The admissions workbook could not be read.");
    }
  };

  const currentFiltered = useMemo(() => filterCampaign(recordsForChannel(currentRecords, channel), campaign, subcampaign), [currentRecords, channel, campaign, subcampaign]);
  const previousFiltered = useMemo(() => filterCampaign(recordsForChannel(previousRecords, channel), campaign, subcampaign), [previousRecords, channel, campaign, subcampaign]);
  const activeFiltered = yearMode === "previous" ? previousFiltered : currentFiltered;
  const currentMonthly = useMemo(() => monthlyTotals(currentFiltered), [currentFiltered]);
  const previousMonthly = useMemo(() => monthlyTotals(previousFiltered), [previousFiltered]);
  const activeMonthly = yearMode === "previous" ? previousMonthly : currentMonthly;
  const currentTotals = useMemo(() => totalMetrics(currentMonthly), [currentMonthly]);
  const previousTotals = useMemo(() => totalMetrics(previousMonthly), [previousMonthly]);
  const activeTotals = yearMode === "previous" ? previousTotals : currentTotals;

  const subcampaigns = useMemo(() => campaign === "Total" ? [] : Array.from(new Set([...currentRecords, ...previousRecords].filter((record) => record.campaign === campaign).map((record) => record.subcampaign))).sort(), [campaign, currentRecords, previousRecords]);
  const classYears = useMemo(() => Array.from(new Set(admissionRecords.map((record) => record.classYear))).sort((a, b) => Number(b) - Number(a)), [admissionRecords]);
  const selectedAdmissions = admissionRecords.filter((record) => record.classYear === classYear);
  const latest = (stage: AdmissionStage) => selectedAdmissions.filter((record) => record.stage === stage).reduce((sum, record) => sum + record.total, 0);
  const latestApplications = latest("Applications");
  const latestDeposits = latest("Deposits");
  const ctr = activeTotals.impressions ? activeTotals.clicks / activeTotals.impressions : 0;
  const cpc = activeTotals.clicks ? activeTotals.spend / activeTotals.clicks : 0;
  const budgetPace = activeTotals.budget ? activeTotals.spend / activeTotals.budget : 0;
  const yoy = (metric: AdditiveMetric) => previousTotals[metric] ? (currentTotals[metric] - previousTotals[metric]) / previousTotals[metric] : 0;

  const trendSeries: ChartSeries[] = yearMode === "compare" ? [
    { name: currentYear, color: COLORS.flagBlue, values: currentMonthly.map((row) => metricValue(row, trendMetric)) },
    { name: previousYear, color: COLORS.infantryBlue, values: previousMonthly.map((row) => metricValue(row, trendMetric)) },
  ] : [
    { name: yearMode === "current" ? currentYear : previousYear, color: yearMode === "current" ? COLORS.flagBlue : COLORS.infantryBlue, values: activeMonthly.map((row) => metricValue(row, trendMetric)) },
    ...(trendMetric === "spend" ? [{ name: "Budget", color: COLORS.ringGold, values: activeMonthly.map((row) => row.budget) }] : []),
  ];

  const detailRecords = (yearMode === "previous" ? previousRecords : currentRecords).filter((record) => !record.isSummary).filter((record) => {
    if (campaign !== "Total" && record.campaign !== campaign) return false;
    if (subcampaign !== "All subcampaigns" && record.subcampaign !== subcampaign) return false;
    if (channel !== "All channels" && record.source !== channel) return false;
    return true;
  });
  const allocationLabel = (record: AdRecord) => record.source === "Targeted" ? `Targeted · ${record.originalLabel}` : record.source;
  const allocationLabels = Array.from(new Set(detailRecords.map(allocationLabel)));
  const allocationColors: Record<string, string> = { Social: COLORS.flagBlue, "Google Display": COLORS.infantryBlue, "Google Search": COLORS.modernBlue, YouTube: COLORS.ringGold };
  const channelMix = allocationLabels.map((label, index) => ({ label, value: detailRecords.filter((record) => allocationLabel(record) === label).reduce((sum, record) => sum + record[mixMetric], 0), color: allocationColors[label] ?? (label.startsWith("Targeted") ? COLORS.bigRed : [COLORS.flagBlue, COLORS.infantryBlue, COLORS.modernBlue, COLORS.ringGold, COLORS.bigRed][index % 5]) })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const subcampaignMix = Array.from(new Set(activeFiltered.map((record) => record.subcampaign))).map((label, index) => ({ label, value: activeFiltered.filter((record) => record.subcampaign === label).reduce((sum, record) => sum + record.spend, 0), color: [COLORS.flagBlue, COLORS.infantryBlue, COLORS.ringGold, COLORS.modernBlue, COLORS.bigRed][index % 5] })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);

  const admissionValue = (year: string, stage: AdmissionStage, month: string) => admissionRecords.find((record) => record.classYear === year && record.stage === stage && record.month === month)?.total ?? 0;
  const selectedAdmissionSeries = (stage: AdmissionStage) => MONTHS.map((month) => admissionValue(classYear, stage, month));
  const combinedSeries: ChartSeries[] = [
    { name: "Ad spend", values: activeMonthly.map((row) => row.spend), color: COLORS.ringGold, kind: "bar", axis: "left" },
    { name: "Applications", values: selectedAdmissionSeries("Applications"), color: COLORS.modernBlue, axis: "right" },
    { name: "Deposits", values: selectedAdmissionSeries("Deposits"), color: COLORS.bigRed, axis: "right" },
  ];
  const enrollmentMonthlySeries: ChartSeries[] = [
    { name: "Applications", values: selectedAdmissionSeries("Applications"), color: COLORS.modernBlue, kind: "bar" },
    { name: "Deposits", values: selectedAdmissionSeries("Deposits"), color: COLORS.bigRed, kind: "bar" },
  ];
  const cohortSeries: ChartSeries[] = classYears.map((year, index) => ({ name: `Class of ${year}`, values: MONTHS.map((month) => admissionValue(year, enrollmentCompareStage, month)), color: [COLORS.flagBlue, COLORS.infantryBlue, COLORS.modernBlue, COLORS.ringGold, COLORS.bigRed][index % 5] }));
  const heatValues = selectedAdmissions.filter((record) => record.stage === heatStage).reduce<Record<string, number>>((totals, record) => {
    Object.entries(record.states ?? {}).forEach(([state, value]) => { totals[state] = (totals[state] ?? 0) + value; });
    return totals;
  }, {});
  const internationalStudents = selectedAdmissions.filter((record) => record.stage === heatStage).reduce((sum, record) => sum + (record.international ?? 0), 0);
  const reportedStateCount = Object.values(heatValues).filter((value) => value > 0).length;
  const hasUploadedClass = Boolean(admissions?.records.some((record) => record.classYear === classYear));

  const handleCampaign = (event: ChangeEvent<HTMLSelectElement>) => {
    setCampaign(event.target.value as (typeof CAMPAIGNS)[number]);
    setSubcampaign("All subcampaigns");
  };

  const handleYearMode = (mode: YearMode) => {
    setYearMode(mode);
    const label = mode === "previous" ? previousYear : currentYear;
    setClassYear(classForCampaignYear(label));
  };

  const currentLabel = yearMode === "previous" ? previousYear : currentYear;
  const currentRange = yearMode === "previous" ? campaignDates(previousYear) : campaignDates(currentYear);
  const kpiDelta = (metric: AdditiveMetric) => yearMode === "compare" ? <small className={yoy(metric) >= 0 ? "positive" : "negative"}>{signedPercent(yoy(metric))} vs {previousYear}</small> : null;

  return (
    <div className="app-shell">
      <header className="hero">
        <nav><div className="brand-mark"><img src={`${import.meta.env.BASE_URL}citadel-brandmark-navy.png`} alt="" /></div><div className="brand"><strong>The Citadel</strong><span>Marketing Intelligence</span></div><button className="button ghost" onClick={() => setShowUploads((value) => !value)}>{showUploads ? "Hide uploads" : "Update data"}</button></nav>
        <div className="hero-grid"><div><span className="kicker">Campaign-year intelligence</span><h1>Campaign <em>↔</em> Enrollment</h1><p>Compare media performance year over year beside the SCCC application and deposit cycle—without moving sensitive spreadsheets off your device.</p></div><div className="hero-note"><span>{yearMode === "compare" ? "Year-over-year view" : "Campaign year"}</span><strong>{yearMode === "compare" ? `${currentYear} vs ${previousYear}` : currentLabel}</strong><small>{currentRange}</small></div></div>
      </header>

      <main>
        {showUploads && <section className="upload-section"><div className="section-heading"><div><span className="eyebrow">Data workspace</span><h2>Update class years</h2></div><p>Advertising and enrollment reporting are labeled by class. Each class window runs August 15 through August 14.</p></div><div className="upload-grid three"><UploadCard title="Newer advertising class" description="Upload the standardized digital advertising workbook" status={currentData} kind="newer-class advertising" onFile={(file) => uploadAdvertising(file, "current")} /><UploadCard title="Comparison advertising class" description="Upload the preceding class workbook" status={previousData} kind="comparison-class advertising" onFile={(file) => uploadAdvertising(file, "previous")} /><UploadCard title="Applications & deposits" description="Upload one ‘Class of YYYY’ workbook at a time" status={admissions} kind="application and deposit" onFile={uploadAdmissions} /></div><div className="privacy-line"><span aria-hidden="true">●</span> Files are processed locally in this browser and are never sent to GitHub or a server. Uploading a class file replaces only that class.</div></section>}

        {message && <div className="message" role="status"><span>{message}</span><button onClick={() => setMessage(null)} aria-label="Dismiss message">×</button></div>}
        {isDemo && <div className="demo-banner"><strong>Preview mode</strong><span>Sample values fill any campaign year that has not been uploaded yet.</span></div>}

        <section className="filter-bar five" aria-label="Dashboard filters">
          <Field label="Campaign year"><select value={yearMode} onChange={(event) => handleYearMode(event.target.value as YearMode)}><option value="compare">Compare {currentYear} vs {previousYear}</option><option value="current">{currentYear}</option><option value="previous">{previousYear}</option></select></Field>
          <Field label="Campaign"><select value={campaign} onChange={handleCampaign}>{CAMPAIGNS.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Subcampaign"><select value={subcampaign} onChange={(event) => setSubcampaign(event.target.value)} disabled={campaign === "Total"}><option>All subcampaigns</option>{subcampaigns.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Channel"><select value={channel} onChange={(event) => setChannel(event.target.value)}>{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Enrollment class"><select value={classYear} onChange={(event) => setClassYear(event.target.value)}>{classYears.map((item) => <option value={item} key={item}>Class of {item}</option>)}</select></Field>
        </section>

        <section className="kpi-grid">
          <article><span>Media spend</span><strong>{money(activeTotals.spend)}</strong>{kpiDelta("spend")}<small>{percent(budgetPace)} of {money(activeTotals.budget)} budget</small></article>
          <article><span>Impressions</span><strong>{number(activeTotals.impressions)}</strong>{kpiDelta("impressions")}<small>{number(activeTotals.clicks)} clicks · {percent(ctr)} CTR</small></article>
          <article><span>Cost per click</span><strong>{moneyCents(cpc)}</strong><small>Blended across selected channels</small></article>
          <article className={campaign !== "SCCC" ? "muted-kpi" : ""}><span>Applications · Class of {classYear}</span><strong>{campaign === "SCCC" ? number(latestApplications) : "SCCC only"}</strong><small>{campaign === "SCCC" ? `${number(latestDeposits)} deposits · ${percent(latestApplications ? latestDeposits / latestApplications : 0)} yield` : "Select SCCC to connect enrollment"}</small></article>
        </section>

        <section className="color-key" aria-label="Chart color reference"><div><span className="eyebrow">Color reference</span><h2>What each chart color means</h2></div><div className="color-items"><span><i style={{ background: COLORS.flagBlue }} />Newer class</span><span><i style={{ background: COLORS.infantryBlue }} />Comparison class</span><span><i style={{ background: COLORS.ringGold }} />Budget / spend bars</span><span><i style={{ background: COLORS.modernBlue }} />Applications</span><span><i style={{ background: COLORS.bigRed }} />Deposits / targeted</span><span><i style={{ background: COLORS.bulldogGray }} />Not reported / grid</span></div></section>

        <section className="dashboard-grid">
          <ChartCard eyebrow="Year-over-year media" title={`${metricLabel(trendMetric)} by campaign month`} className="wide" action={<Field label="Metric"><select value={trendMetric} onChange={(event) => setTrendMetric(event.target.value as Metric)}>{ALL_METRICS.map((item) => <option value={item} key={item}>{metricLabel(item)}</option>)}</select></Field>}><SeriesChart labels={[...MONTHS]} series={trendSeries} formatLeft={metricFormatter(trendMetric)} ariaLabel={`${metricLabel(trendMetric)} by month for the selected campaign years`} /></ChartCard>

          <ChartCard eyebrow="Monthly comparison" title={`${metricLabel(yoyMetric)} YoY by month`} className="wide" action={<Field label="Metric"><select value={yoyMetric} onChange={(event) => setYoyMetric(event.target.value as Metric)}>{ALL_METRICS.map((item) => <option value={item} key={item}>{metricLabel(item)}</option>)}</select></Field>}><div className="table-scroll"><table className="yoy-table"><thead><tr><th>Month</th><th>{currentYear}</th><th>{previousYear}</th><th>Change</th><th>YoY</th></tr></thead><tbody>{MONTHS.map((month, index) => { const current = metricValue(currentMonthly[index], yoyMetric); const previous = metricValue(previousMonthly[index], yoyMetric); const delta = current - previous; const change = previous ? delta / previous : 0; const format = metricFormatter(yoyMetric); return <tr key={month}><td>{month}</td><td>{format(current)}</td><td>{format(previous)}</td><td className={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? "+" : ""}{format(delta)}</td><td className={change >= 0 ? "positive" : "negative"}>{previous ? signedPercent(change) : "—"}</td></tr>; })}</tbody></table></div></ChartCard>

          <ChartCard eyebrow="Source allocation" title={`${metricLabel(mixMetric)} by source`} action={<Field label="Metric"><select value={mixMetric} onChange={(event) => setMixMetric(event.target.value as AdditiveMetric)}>{(["spend", "impressions", "clicks", "budget"] as AdditiveMetric[]).map((item) => <option value={item} key={item}>{metricLabel(item)}</option>)}</select></Field>}><BarList items={channelMix} formatter={metricFormatter(mixMetric)} /><p className="chart-note">Targeted campaigns are listed separately instead of being combined. In Compare mode, allocation reflects {currentYear}.</p></ChartCard>

          <ChartCard eyebrow="Portfolio" title="Subcampaign spend"><BarList items={subcampaignMix} formatter={money} />{!subcampaignMix.length && <p className="empty">No spend appears for this selection.</p>}</ChartCard>

          <ChartCard eyebrow="Directional overlap" title={`Media spend & Class of ${classYear}`} className="wide"><>{campaign === "SCCC" ? <SeriesChart labels={[...MONTHS]} series={combinedSeries} formatLeft={money} formatRight={number} ariaLabel={`SCCC ad spend, applications, and deposits by month for Class of ${classYear}`} /> : <div className="empty-state"><strong>Enrollment is SCCC-only</strong><span>Select SCCC above to view the directional media and enrollment overlay.</span></div>}<p className="chart-note">This overlay shows monthly timing, not person-level attribution.</p></></ChartCard>

          {campaign === "SCCC" && <ChartCard eyebrow="Monthly enrollment" title={`Applications & deposits · Class of ${classYear}`} className="wide"><SeriesChart labels={[...MONTHS]} series={enrollmentMonthlySeries} formatLeft={number} ariaLabel={`Applications and deposits by month for Class of ${classYear}`} /><p className="chart-note">Applications use the Accept Date column; deposits use the Deposit Date column.</p></ChartCard>}

          {campaign === "SCCC" && <ChartCard eyebrow="Class comparison" title={`${enrollmentCompareStage} by class`} className="wide" action={<Field label="Measure"><select value={enrollmentCompareStage} onChange={(event) => setEnrollmentCompareStage(event.target.value as AdmissionStage)}><option value="Applications">Applications</option><option value="Deposits">Deposits</option></select></Field>}><SeriesChart labels={[...MONTHS]} series={cohortSeries} formatLeft={number} ariaLabel={`${enrollmentCompareStage} by month compared across classes`} /></ChartCard>}

          {campaign === "SCCC" && <ChartCard eyebrow="Student origin" title={`${heatStage} by U.S. state · Class of ${classYear}`} className="wide" action={<Field label="Stage"><select value={heatStage} onChange={(event) => setHeatStage(event.target.value as AdmissionStage)}><option value="Applications">Applications</option><option value="Deposits">Deposits</option></select></Field>}>{hasUploadedClass ? <><div className="map-summary"><div className="international-callout"><span>Reported U.S. states</span><strong>{number(reportedStateCount)}</strong><small>Populated from State</small></div><div className="international-callout"><span>International Students</span><strong>{number(internationalStudents)}</strong><small>Blank State cells</small></div></div><USHeatmap values={heatValues} stage={heatStage} /><p className="chart-note">The map is populated directly from the uploaded State column. South Carolina is in-state; blank State cells are reported as International Students. Named values that are not U.S. state abbreviations remain outside the map.</p></> : <div className="empty-state"><strong>Upload enrollment data to populate the map</strong><span>Choose Update data, then upload a “Class of {classYear}” workbook. Preview values are no longer shown on the state map.</span></div>}</ChartCard>}

          <ChartCard eyebrow="Conversion lens" title="SCCC journey"><div className="funnel"><div style={{ width: "100%" }}><span>Impressions</span><strong>{number(activeTotals.impressions)}</strong></div><div style={{ width: "82%" }}><span>Clicks</span><strong>{number(activeTotals.clicks)}</strong></div><div style={{ width: "64%" }}><span>Applications</span><strong>{number(latestApplications)}</strong></div><div style={{ width: "48%" }}><span>Deposits</span><strong>{number(latestDeposits)}</strong></div></div><p className="chart-note">Counts share a reporting window but are not an attributed funnel.</p></ChartCard>
        </section>

        <section className="methodology"><div><span className="eyebrow">Class-year rules</span><h2>How records are grouped</h2></div><div className="rules"><p><strong>Calendar</strong> Class of 2030 aligns to Aug 15, 2025–Aug 14, 2026. Preceding and following classes shift by one year and are displayed only as “Class of YYYY.”</p><p><strong>Advertising</strong> SCCC Instate is displayed as SCCC South Carolina. Reddit rolls into SCCC Regional; conquest rolls into the appropriate campaign.</p><p><strong>Enrollment</strong> Upload one standardized “Class of YYYY” workbook per class. Accept Date drives Applications; Deposit Date drives Deposits. Uploading again replaces only that class.</p></div></section>
      </main>
      <footer><span>The Citadel · Enrollment Marketing</span><span>Local-first analytics · No workbook data is published</span></footer>
    </div>
  );
}
