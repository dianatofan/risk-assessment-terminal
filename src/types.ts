export interface JobData {
  Job_Title: string;
  Industry: string;
  Job_Status: string;
  AI_Impact_Level: string;
  Median_Salary_USD: number;
  Required_Education: string;
  Experience_Required_Years: number;
  Job_Openings_2024: number;
  Projected_Openings_2030: number;
  Remote_Work_Ratio_Percent: number;
  Automation_Risk_Percent: number;
  Location: string;
  Gender_Diversity_Percent: number;
  status: string;
  ai_takeover_response: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'WARNING' | 'SUCCESS';
  message: string;
}
