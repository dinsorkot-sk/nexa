export interface WhtRate {
  id: string;
  incomeType: string;
  rate: number; // percentage
  description: string;
}

export interface VatConfig {
  rate: number; // percentage, e.g. 7
}

export interface ThaiDateParts {
  day: number;
  month: number;
  yearBE: number;
}