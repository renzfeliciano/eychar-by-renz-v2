import type { Schema, Query, Aggregate } from "mongoose";
import { viewerSeesHidden } from "./visibility-context";

/**
 * Test data the Super Administrator hid (ADR-034): adds `hiddenFromOthers`
 * and leaves those records out of every read (find, count, distinct,
 * aggregate) unless the viewer may see them. Pass `{ includeHidden: true }`
 * as a query option to read them regardless (the hide/unhide service).
 */
export function hiddenPlugin(schema: Schema) {
  schema.add({ hiddenFromOthers: { type: Boolean, default: false, index: true } });

  async function scopeQuery(this: Query<unknown, unknown>) {
    if (this.getOptions().includeHidden || "hiddenFromOthers" in this.getFilter()) return;
    if (await viewerSeesHidden()) return;
    this.where({ hiddenFromOthers: { $ne: true } });
  }
  for (const operation of ["find", "findOne", "countDocuments", "distinct", "findOneAndUpdate", "updateOne", "updateMany"] as const) {
    schema.pre(operation, scopeQuery);
  }
  schema.pre("aggregate", async function (this: Aggregate<unknown>) {
    if (await viewerSeesHidden()) return;
    this.pipeline().unshift({ $match: { hiddenFromOthers: { $ne: true } } });
  });
}
