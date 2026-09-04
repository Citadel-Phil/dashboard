import * as XLSX from "xlsx";
import { MONTHS, type AdRecord, type AdmissionRecord, type AdmissionStage, type Campaign, type ImportedDataset, type Month } from "./types";

const CURRENT_SOURCE_SHEETS = ["Social", "Google Display", "Google Search", "YouTube", "Targeted"];
const PRIOR_CORE_SHEETS = ["Social", "Google Display", "Google Search", "YouTube"];
const US_STATES = new Set(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"]);

const asText = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => asText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

function monthFrom(value: unknown): Month | null {
  if (value instanceof Date) {
    const name = value.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    return MONTHS.find((month) => month === name) ?? null;
  }
  const text = asText(value).toLowerCase();
  return MONTHS.find((month) => text.includes(month.toLowerCase())) ?? null;
}

function campaignHint(sheetName: string, periodColumn: number, label: string): Campaign | null {
  const normalized = key(label);
  if (sheetName === "Targeted") {
    if (/veteran/.test(normalized)) return "Veterans";
    if (/degree completion|\bdc\b/.test(normalized)) return "Degree Completion";
    if (/\bcgc\b|graduate/.test(normalized)) return "CGC";
    return "SCCC";
  }
  if (periodColumn === 0 || periodColumn === 44) return "SCCC";
  if (periodColumn === 11) return "CGC";
  if (periodColumn === 22) return "Degree Completion";
  if (periodColumn === 33) return "Veterans";
  return null;
}

function canonicalSubcampaign(campaign: Campaign, label: string): string | null {
  const normalized = key(label);
  if (!normalized || normalized === "total" || normalized.endsWith(" total") || /sccc total|cgc total|dp total|veteran total/.test(normalized)) return null;

  if (campaign === "SCCC") {
    if (normalized.includes("reddit")) return "SCCC Regional";
    if (normalized.includes("competitor conquest")) return "SCCC National";
    if (normalized.includes("instate") || normalized.includes("in state")) return "SCCC South Carolina";
    if (/\bsccc nc\b|north carolina/.test(normalized)) return "SCCC NC";
    if (/\bsccc ga\b|georgia/.test(normalized)) return "SCCC GA";
    if (/\bsccc fl\b|florida/.test(normalized)) return "SCCC FL";
    if (normalized.includes("regional") || normalized.includes("key cities")) return "SCCC Regional";
    if (normalized.includes("national")) return "SCCC National";
    if (normalized.includes("band")) return "SCCC Band";
    if (normalized.includes("accepted")) return "Accepted";
    if (normalized.includes("deposited")) return "Deposited";
    if (normalized.includes("amscus")) return "AMSCUS";
    if (normalized.includes("quizlet")) return "Quizlet";
    if (normalized.includes("mntn")) return "MNTN";
    if (normalized === "sccc") return null;
    return "Other SCCC";
  }

  if (campaign === "CGC") {
    if (normalized.includes("competitor conquest")) return "CGC Competitor Conquest";
    if (normalized.includes("education")) return "Education";
    if (normalized.includes("engineering")) return "Engineering";
    if (normalized.includes("humanities")) return "Humanities";
    if (normalized.includes("leadership")) return "Leadership";
    if (/\bmba\b/.test(normalized)) return "MBA";
    if (/project management|\bpm\b/.test(normalized)) return "Project Management";
    if (normalized.includes("science")) return "Science";
    return "Citadel Graduate College";
  }

  if (campaign === "Degree Completion") {
    if (normalized.includes("competitor conquest")) return "DC Competitor Conquest";
    if (normalized.includes("nursing")) return "Nursing";
    if (normalized.includes("engineering")) return "Engineering";
    return "Degree Completion";
  }

  if (normalized.includes("competitor conquest")) return "Veterans Competitor Conquest";
  return "Veterans";
}

function rowsFor(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  }) as unknown[][];
}

export function parseAdvertisingBuffer(buffer: ArrayBuffer, fileName: string): ImportedDataset<AdRecord> {
  return parseAdvertisingCampaignBuffer(buffer, fileName, inferCampaignYear(fileName));
}

function inferCampaignYear(fileName: string): string {
  const classMatch = fileName.match(/class\s+of\s+(20\d{2})/i);
  if (classMatch) return `Class of ${classMatch[1]}`;
  const match = fileName.match(/(?:^|\D)(\d{2,4})\s*[-–]\s*(\d{2,4})(?:\D|$)/);
  if (!match) return "Unassigned";
  const end = Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2]);
  return `Class of ${end + 4}`;
}

function campaignYearDates(campaignYear: string) {
  const classMatch = campaignYear.match(/Class of (20\d{2})/i);
  if (classMatch) {
    const classYear = Number(classMatch[1]);
    return { startDate: `${classYear - 5}-08-15`, endDate: `${classYear - 4}-08-14` };
  }
  const match = campaignYear.match(/(\d{4})\D+(\d{2,4})/);
  if (!match) return { startDate: "", endDate: "" };
  const startYear = Number(match[1]);
  const endYear = Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2]);
  return { startDate: `${startYear}-08-15`, endDate: `${endYear}-08-14` };
}

export function parseAdvertisingCampaignBuffer(buffer: ArrayBuffer, fileName: string, campaignYear: string): ImportedDataset<AdRecord> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const records: AdRecord[] = [];
  const warnings: string[] = [];

  const parseSheet = (sheetName: string, isSummary: boolean) => {
    const rows = rowsFor(workbook, sheetName);
    rows.forEach((row, headerRow) => {
      row.forEach((value, impressionsColumn) => {
        if (key(value) !== "impressions" || impressionsColumn === 0) return;
        const periodColumn = impressionsColumn - 1;
        const label = asText(row[periodColumn]) || asText(rows[headerRow - 1]?.[impressionsColumn]) || asText(rows[headerRow - 1]?.[periodColumn]);
        const campaign = campaignHint(sheetName, periodColumn, label);
        if (!campaign) return;
        if (sheetName !== "Targeted" && headerRow <= 1 && campaign === "Degree Completion") return;
        const subcampaign = canonicalSubcampaign(campaign, label);
        if (!subcampaign) return;

        for (let offset = 1; offset <= 14 && headerRow + offset < rows.length; offset += 1) {
          const dataRow = rows[headerRow + offset] ?? [];
          const month = monthFrom(dataRow[periodColumn]);
          if (!month) continue;
          records.push({
            source: sheetName,
            campaignYear,
            isSummary,
            campaign,
            subcampaign,
            originalLabel: label,
            month,
            impressions: asNumber(dataRow[impressionsColumn]),
            clicks: asNumber(dataRow[impressionsColumn + 1]),
            spend: asNumber(dataRow[impressionsColumn + 3]),
            budget: asNumber(dataRow[impressionsColumn + 6]),
          });
        }
      });
    });
  };

  if (workbook.SheetNames.includes("Total")) {
    const required = ["Social", "Google Display", "Google Search", "Targeted"];
    const missing = required.filter((name) => !workbook.SheetNames.includes(name));
    if (missing.length) throw new Error(`This does not look like the current advertising workbook. Missing tab${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
    CURRENT_SOURCE_SHEETS.filter((name) => workbook.SheetNames.includes(name)).forEach((name) => parseSheet(name, false));
    if (!workbook.SheetNames.includes("YouTube")) warnings.push("YouTube tab not found; the import continued without it.");
  } else if (workbook.SheetNames.includes("Overall")) {
    parseSheet("Overall", true);
    PRIOR_CORE_SHEETS.filter((name) => workbook.SheetNames.includes(name)).forEach((name) => parseSheet(name, false));
    warnings.push("Prior-year All channels uses the workbook's Overall summary; channel-level comparisons are available for Social, Google Display, Google Search, and YouTube.");
  } else {
    throw new Error("This does not look like a supported advertising workbook. Expected a Total or Overall tab.");
  }

  if (!records.length) throw new Error("No monthly advertising records were found. Confirm the workbook still uses Impressions, Clicks, Spend, and Budget columns.");
  const dates = campaignYearDates(campaignYear);
  return { fileName, importedAt: new Date().toISOString(), records, warnings, campaignYear, ...dates };
}

export function parseAdmissionsBuffer(buffer: ArrayBuffer, fileName: string): ImportedDataset<AdmissionRecord> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const classMatch = fileName.match(/class\s+of\s+(20\d{2})/i);
  if (!classMatch) throw new Error("Name the workbook ‘Class of 2029.xlsx’, ‘Class of 2030.xlsx’, and so on so the class year can be identified.");
  const classYear = classMatch[1];
  const buckets = new Map<string, { total: number; inState: number; international: number; states: Record<string, number> }>();
  const warnings: string[] = [];
  let sourceRows = 0;
  let omittedLocations = 0;
  for (const sheetName of workbook.SheetNames) {
    const rows = rowsFor(workbook, sheetName);
    const headerRow = rows.findIndex((row) => row.some((cell) => key(cell) === "accept date") && row.some((cell) => key(cell) === "deposit date"));
    if (headerRow < 0) continue;
    const acceptColumn = rows[headerRow].findIndex((cell) => key(cell) === "accept date");
    const depositColumn = rows[headerRow].findIndex((cell) => key(cell) === "deposit date");
    const stateColumn = rows[headerRow].findIndex((cell) => key(cell) === "state");
    rows.slice(headerRow + 1).forEach((row) => {
      const state = asText(row[stateColumn]).toUpperCase();
      const hasLocation = US_STATES.has(state);
      if (state && !hasLocation) omittedLocations += 1;
      ([{ stage: "Applications" as AdmissionStage, value: row[acceptColumn] }, { stage: "Deposits" as AdmissionStage, value: row[depositColumn] }]).forEach(({ stage, value }) => {
        const month = monthFrom(value);
        if (!month) return;
        sourceRows += stage === "Applications" ? 1 : 0;
        const bucketKey = `${stage}|${month}`;
        const bucket = buckets.get(bucketKey) ?? { total: 0, inState: 0, international: 0, states: {} };
        bucket.total += 1;
        if (state === "SC") bucket.inState += 1;
        if (!state) bucket.international += 1;
        if (hasLocation) bucket.states[state] = (bucket.states[state] ?? 0) + 1;
        buckets.set(bucketKey, bucket);
      });
    });
  }
  if (!sourceRows) throw new Error("No student rows were found. The workbook needs Accept Date, Deposit Date, and State columns.");
  if (omittedLocations) warnings.push(`${omittedLocations} non-U.S. or unrecognized locations are included in totals but omitted from the U.S. map.`);
  const records = (["Applications", "Deposits"] as AdmissionStage[]).flatMap((stage) => MONTHS.map((month) => {
    const bucket = buckets.get(`${stage}|${month}`) ?? { total: 0, inState: 0, international: 0, states: {} };
    return { classYear, stage, month, total: bucket.total, inState: bucket.inState, outState: bucket.total - bucket.inState, international: bucket.international, states: bucket.states };
  }));
  return { fileName, importedAt: new Date().toISOString(), records, warnings, classFiles: { [classYear]: fileName } };
}

export function mergeAdmissionsDatasets(existing: ImportedDataset<AdmissionRecord> | null, incoming: ImportedDataset<AdmissionRecord>): ImportedDataset<AdmissionRecord> {
  const classYear = incoming.records[0]?.classYear;
  const kept = existing?.records.filter((record) => record.classYear !== classYear) ?? [];
  return {
    ...incoming,
    fileName: Object.values({ ...(existing?.classFiles ?? {}), ...(incoming.classFiles ?? {}) }).join(", "),
    records: [...kept, ...incoming.records],
    warnings: [...(existing?.warnings ?? []).filter((warning) => !warning.startsWith(`${classYear}:`)), ...incoming.warnings.map((warning) => `${classYear}: ${warning}`)],
    classFiles: { ...(existing?.classFiles ?? {}), ...(incoming.classFiles ?? {}) },
  };
}

const DB_NAME = "citadel-campaign-enrollment";
const STORE = "datasets";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type DatasetName = "advertising" | "advertising-current" | "advertising-previous" | "admissions";

export async function saveDataset<T>(name: DatasetName, value: ImportedDataset<T>): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(value, name);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function loadDataset<T>(name: DatasetName): Promise<ImportedDataset<T> | null> {
  const db = await openDatabase();
  const value = await new Promise<ImportedDataset<T> | null>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(name);
    request.onsuccess = () => resolve((request.result as ImportedDataset<T> | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}
