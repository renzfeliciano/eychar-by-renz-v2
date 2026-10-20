/**
 * The standard Employee Performance Evaluation Form, PCAS-HRMD-FR-004 (ADR-051).
 * One form for every project, department and job title. It is versioned: each
 * evaluation records the version it was filled in on, so changing the wording
 * or adding a criterion means a new version here and never rewrites a past
 * evaluation. Keep old versions in TEMPLATES so they still print.
 */
export const EVALUATION_FORM_CODE = "PCAS-HRMD-FR-004";

export const RATING_SCALE = [
  { code: "S", label: "Satisfactory" },
  { code: "A", label: "Adequate" },
  { code: "NI", label: "Needs Improvement" },
] as const;

export type RatingCode = (typeof RATING_SCALE)[number]["code"];

export type EvaluationCriterion = { key: string; text: string };
export type EvaluationFactor = { key: string; name: string; criteria: EvaluationCriterion[] };
export type EvaluationTemplate = { version: number; factors: EvaluationFactor[] };

const TEMPLATE_V1: EvaluationTemplate = {
  version: 1,
  factors: [
    {
      key: "dedication",
      name: "Dedication",
      criteria: [
        { key: "dedication.on-time", text: "Reports on time." },
        { key: "dedication.time", text: "Use time constructively." },
      ],
    },
    {
      key: "performance",
      name: "Performance",
      criteria: [
        { key: "performance.knowledge", text: "Good working knowledge of job assignment." },
        { key: "performance.timely", text: "Organizes and performs work in a timely, professional manner." },
      ],
    },
    {
      key: "cooperation",
      name: "Cooperation",
      criteria: [
        { key: "cooperation.assignments", text: "Willingly accepts work assignments." },
        { key: "cooperation.changes", text: "Willingly accepts changes in assignments not directly related to job." },
      ],
    },
    {
      key: "initiative",
      name: "Initiative",
      criteria: [
        { key: "initiative.unsupervised", text: "Performs assigned duties with little or no supervision." },
        { key: "initiative.pressure", text: "Performs assigned duties with little or no supervision, even under pressure." },
        { key: "initiative.deadlines", text: "Strives to meet deadlines." },
      ],
    },
    {
      key: "communication",
      name: "Communication",
      criteria: [{ key: "communication.clear", text: "Communicate clearly and intelligently in person and during telephone contacts." }],
    },
    {
      key: "teamwork",
      name: "Teamwork",
      criteria: [{ key: "teamwork.friction", text: "Works well with fellow employees without friction." }],
    },
    {
      key: "character",
      name: "Character",
      criteria: [{ key: "character.criticism", text: "Accept constructive criticism without unfavorable responses." }],
    },
    {
      key: "responsiveness",
      name: "Responsiveness",
      criteria: [{ key: "responsiveness.stress", text: "Handles stressful situations with tact." }],
    },
    {
      key: "personality",
      name: "Personality",
      criteria: [{ key: "personality.pleasant", text: "Demonstrates a pleasant, calm personality when dealing with customers and fellow employees." }],
    },
    {
      key: "appearance",
      name: "Appearance",
      criteria: [
        { key: "appearance.groomed", text: "Well groomed. Clean. Neat." },
        { key: "appearance.dress", text: "Dresses appropriately for work." },
      ],
    },
    {
      key: "work-habits",
      name: "Work Habits",
      criteria: [
        { key: "work-habits.workstation", text: "Maintains neat and orderly workstation." },
        { key: "work-habits.paperwork", text: "Maintains neat and orderly paperwork." },
      ],
    },
  ],
};

const TEMPLATES: Record<number, EvaluationTemplate> = { 1: TEMPLATE_V1 };

export const CURRENT_TEMPLATE_VERSION = 1;

export function getTemplate(version: number): EvaluationTemplate {
  const template = TEMPLATES[version];
  if (!template) throw new Error(`Unknown evaluation template version ${version}`);
  return template;
}

export function criterionKeys(template: EvaluationTemplate): string[] {
  return template.factors.flatMap((factor) => factor.criteria.map((criterion) => criterion.key));
}

export function ratingLabel(code: string): string {
  return RATING_SCALE.find((rating) => rating.code === code)?.label ?? code;
}
