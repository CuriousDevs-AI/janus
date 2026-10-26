/** The shape of a grounded answer from Janus Intelligence, and the questions offered as starting points. */
export type BusinessAnswer = {
  question: string;
  answer: string;
  dataUsed: string[];
  calculation: {
    metric: string;
    period: string;
    filters: string;
    sources: string;
  };
  followups: string[];
  chartType?: "bar" | "none";
  chartData?: { label: string; value: number }[];
};


export const EXAMPLE_QUESTIONS: string[] = [
  "How many leads came from the website this month?",
  "Which salesperson has the highest conversion?",
  "Which customers are at risk?",
  "What are our biggest support problems?",
  "What's our pipeline value?",
];
