import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Who evaluates whom (ADR-051). A rule says: an employee who matches the
 * subject (their current position and/or project) is evaluated by whoever
 * currently holds one of the evaluator positions, in the same project or
 * anywhere in the organization. Rules are data, edited without a deploy, and
 * checked in `order`: the first match wins, so put specific rules (a position)
 * before general ones (anyone on a project).
 *
 * This is a narrow, deliberate use of positions (see ADR-004/ENGINEERING.md §12):
 * it only picks the evaluator of one evaluation. It grants no permission and
 * defines no reporting line; access still comes from role permissions.
 */
const evaluatorRuleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    // Empty list = any position / any project.
    subjectPositionIds: { type: [Schema.Types.ObjectId], default: [], ref: "Position" },
    subjectProjectIds: { type: [Schema.Types.ObjectId], default: [], ref: "Project" },
    evaluatorPositionIds: { type: [Schema.Types.ObjectId], default: [], ref: "Position" },
    evaluatorScope: { type: String, enum: ["same-project", "organization"], required: true, default: "organization" },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  },
  { timestamps: true },
);

evaluatorRuleSchema.index({ organizationId: 1, name: 1 }, { unique: true });
evaluatorRuleSchema.index({ organizationId: 1, order: 1 });

export type EvaluatorRule = InferSchemaType<typeof evaluatorRuleSchema>;

export const EvaluatorRuleModel = models.EvaluatorRule ?? model("EvaluatorRule", evaluatorRuleSchema);
