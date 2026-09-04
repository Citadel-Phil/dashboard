export const MONTHS = ["August", "September", "October", "November", "December", "January", "February", "March", "April", "May", "June", "July"] as const;

export type Month = (typeof MONTHS)[number];
export type Campaign = "SCCC" | "CGC" | "Degree Completion" | "Veterans";

export type AdRecord = {
  source: string;
  campaignYear: string;
  isSummary: boolean;
  campaign: Campaign;
  subcampaign: string;
  originalLabel: string;
  month: Month;
  impressions: number;
  clicks: number;
  spend: number;
  budget: number;
};

export type AdmissionStage = "Applications" | "Deposits";

export type AdmissionRecord = {
  classYear: string;
  stage: AdmissionStage;
  month: Month;
  total: number;
  inState: number;
  outState: number;
  international: number;
  states: Record<string, number>;
};

export type ImportedDataset<T> = {
  fileName: string;
  importedAt: string;
  records: T[];
  warnings: string[];
  campaignYear?: string;
  startDate?: string;
  endDate?: string;
  classFiles?: Record<string, string>;
};
