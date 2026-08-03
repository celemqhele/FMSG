export interface JobPost {
  role: string;
  date: string;
  key: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  applyUrl: string;
  paraphrase: string;
  snippet: string;
}

export const jobPosts: JobPost[] = [
  {
    role: "country-manager",
    date: "03082026",
    key: "esco-country-manager",
    title: "Country Manager",
    company: "Esco Lifesciences Group",
    location: "Johannesburg, South Africa",
    salary: "",
    applyUrl: "https://www.linkedin.com/jobs/view/4436290792/",
    paraphrase:
      "Esco Lifesciences Group, a Singapore-based, world-leading manufacturer of laboratory equipment, pharmaceutical equipment, bioprocess tools and IVF medical devices trusted in 150+ countries since 1978, is looking for an experienced Country Manager to lead its South African business and drive expansion into neighbouring countries.\n\nYou'll own sales, marketing, pre-sales, service and P&L for the region. Key responsibilities:\n\n• Lead and manage the sales team to hit revenue targets and grow market share across South Africa and neighbouring African markets.\n• Develop sales strategies and action plans to penetrate new markets and increase customer engagement.\n• Monitor sales performance, coach the team and drive accountability.\n• Build and manage a distributor network across the region.\n• Oversee marketing so it aligns with sales objectives and brand positioning; partner with the marketing team on lead-gen and brand-awareness campaigns.\n• Manage pre-sales support so customer solutions meet their needs, and oversee customer service and field service for retention.\n• Recruit, train and mentor sales and marketing staff to build a strong, high-performing team.\n• Work with senior management on long-term regional growth strategy, assessing market trends and the competitive landscape.\n• Analyse financial performance and take corrective action where needed.\n\nThe role reports to the Regional Commercial Leader.",
    snippet:
      "On-site, full-time Country Manager role at Esco Lifesciences Group (world-leading lab & life-science equipment manufacturer) leading sales, marketing, service and P&L across South Africa and neighbouring countries. Requires 10+ years' hands-on sales experience in life-sciences laboratory equipment.",
  },
];

export function getJobPost(role: string, date: string, key: string): JobPost | null {
  return jobPosts.find(
    (p) => p.role === role && p.date === date && p.key === key
  ) ?? null;
}

export function getJobPostByKey(key: string): JobPost | null {
  return jobPosts.find((p) => p.key === key) ?? null;
}
