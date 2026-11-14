/**
 * The levels a new organization starts with, in the order HR reads them
 * (lowest to highest). Starting data only: each organization can add,
 * rename or retire levels under Settings › Catalogs, so nothing in the code
 * depends on these codes. The codes are short and stable because a person's
 * record stores the code, not the name.
 */
export const EDUCATION_LEVEL_DEFAULTS: { code: string; name: string; sortOrder: number }[] = [
  { code: "elementary_graduate", name: "Elementary Graduate", sortOrder: 0 },
  { code: "high_school_graduate", name: "High School / Junior High School Graduate", sortOrder: 1 },
  { code: "senior_high_school_graduate", name: "Senior High School Graduate", sortOrder: 2 },
  { code: "technical_vocational", name: "Technical-Vocational / TESDA Certificate", sortOrder: 3 },
  { code: "college_undergraduate", name: "College Undergraduate", sortOrder: 4 },
  { code: "associate_degree", name: "Associate Degree", sortOrder: 5 },
  { code: "bachelors_degree", name: "Bachelor’s Degree", sortOrder: 6 },
  { code: "post_graduate_units", name: "Post-Graduate Diploma / Units", sortOrder: 7 },
  { code: "masters_degree", name: "Master’s Degree", sortOrder: 8 },
  { code: "doctoral_professional_degree", name: "Doctoral / Professional Degree", sortOrder: 9 },
];
