import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { DayNoteModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";
import type { SaveDayNoteInput } from "@/shared/validation/holidays";

/** HR's free-form note per calendar day (ADR-035). */
export const DayNoteService = {
  /** Notes from `from` to `to` (inclusive), keyed by "YYYY-MM-DD". */
  async listBetween(organizationId: string, from: string, to: string): Promise<Record<string, string>> {
    await connectMongoDB();
    const docs = await DayNoteModel.find({
      organizationId: new Types.ObjectId(organizationId),
      status: "active",
      date: { $gte: dateKeyToDate(from), $lte: dateKeyToDate(to) },
    })
      .select("date note")
      .lean<{ date: Date; note: string }[]>();
    return Object.fromEntries(docs.filter((doc) => doc.note).map((doc) => [dateToDateKey(doc.date), doc.note]));
  },

  /** Sets the day's note, or clears it when empty. */
  async save(input: SaveDayNoteInput, actor: { userId?: string }): Promise<{ date: string; note: string | null }> {
    await connectMongoDB();
    const organizationId = new Types.ObjectId(input.organizationId);
    const date = dateKeyToDate(input.date);
    const existing = await DayNoteModel.findOne({ organizationId, date }).lean<{ _id: Types.ObjectId; note: string; status: string } | null>();
    const before = existing?.status === "active" ? existing.note : null;
    const cleared = input.note.length === 0;
    if ((before ?? "") === input.note) return { date: input.date, note: before };

    const saved = await DayNoteModel.findOneAndUpdate<{ _id: Types.ObjectId }>(
      { organizationId, date },
      {
        $set: {
          note: input.note,
          status: cleared ? "cleared" : "active",
          ...(actor.userId ? { updatedByUserId: new Types.ObjectId(actor.userId) } : {}),
        },
      },
      { upsert: true, new: true },
    );

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: cleared ? "day_note.cleared" : "day_note.saved",
      resourceType: "DayNote",
      resourceId: (saved?._id ?? organizationId).toString(),
      before: { date: input.date, note: before },
      after: { date: input.date, note: cleared ? null : input.note },
    });
    return { date: input.date, note: cleared ? null : input.note };
  },
};
