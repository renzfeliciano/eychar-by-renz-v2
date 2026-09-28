import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, CompensationModel } from "@/server/db/models";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { ConflictError } from "@/shared/errors";
import { dateKeyToDate } from "@/lib/date-key";
import { seedEmployee, seedPayrollOrganization } from "./fixtures";

describe("CompensationService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("grants pay terms once, then only revises", async () => {
    const { organizationId } = await seedPayrollOrganization();
    const employeeId = await seedEmployee(organizationId, "Angela", { compensation: null });

    const granted = await CompensationService.create(
      {
        organizationId,
        employeeId,
        rateType: "daily",
        rate: 695,
        allowances: [{ name: "Meal", amount: 50, basis: "daily", taxable: false }],
        minimumWageEarner: true,
        effectiveFrom: "2026-01-01",
      },
      {},
    );
    expect(granted).toMatchObject({ rateType: "daily", rate: 695, minimumWageEarner: true });
    expect(granted.effectiveFrom).toEqual(dateKeyToDate("2026-01-01"));

    await expect(
      CompensationService.create({ organizationId, employeeId, rateType: "daily", rate: 700, allowances: [], minimumWageEarner: true }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("closes the current terms the day before a revision starts, so every day resolves exactly one", async () => {
    const { organizationId } = await seedPayrollOrganization();
    const employeeId = await seedEmployee(organizationId, "Carlos", { compensation: { rateType: "monthly", rate: 30000 } });

    await CompensationService.revise(employeeId, organizationId, { rateType: "monthly", rate: 33000, allowances: [], minimumWageEarner: false, effectiveFrom: "2026-10-01", reason: "Annual increase" }, {});

    expect((await CompensationService.getAsOf(employeeId, "2026-09-30"))?.rate).toBe(30000);
    expect((await CompensationService.getAsOf(employeeId, "2026-10-01"))?.rate).toBe(33000);
    const history = await CompensationModel.find({ employeeId }).sort({ effectiveFrom: 1 }).lean();
    expect(history[0].effectiveTo).toEqual(dateKeyToDate("2026-09-30"));
    expect(history[1]).toMatchObject({ reason: "Annual increase" });
  });

  it("refuses a revision dated on or before the current terms' start", async () => {
    const { organizationId } = await seedPayrollOrganization();
    const employeeId = await seedEmployee(organizationId, "Maria");
    await expect(
      CompensationService.revise(employeeId, organizationId, { rateType: "monthly", rate: 1, allowances: [], minimumWageEarner: false, effectiveFrom: "2025-01-01" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("lists today's terms and any change already scheduled", async () => {
    const { organizationId } = await seedPayrollOrganization();
    const employeeId = await seedEmployee(organizationId, "Ben");
    await CompensationService.revise(employeeId, organizationId, { rateType: "monthly", rate: 35000, allowances: [], minimumWageEarner: false, effectiveFrom: "2030-01-01" }, {});

    const [row] = await CompensationService.listForOrganization(organizationId, "2026-09-28");
    expect(row).toMatchObject({ employeeId, current: { rate: 30000 }, upcoming: { rate: 35000 } });
  });

  describe("bulk change", () => {
    async function seedProjectCrew() {
      const { organizationId, projectId, otherProjectId } = await seedPayrollOrganization();
      const low = await seedEmployee(organizationId, "Low", { projectId, compensation: { rateType: "daily", rate: 610 } });
      const high = await seedEmployee(organizationId, "High", { projectId, compensation: { rateType: "daily", rate: 800 } });
      const monthly = await seedEmployee(organizationId, "Office", { projectId, compensation: { rateType: "monthly", rate: 25000 } });
      const elsewhere = await seedEmployee(organizationId, "Elsewhere", { projectId: otherProjectId, compensation: { rateType: "daily", rate: 610 } });
      const unpaid = await seedEmployee(organizationId, "Unpaid", { projectId, compensation: null });
      return { organizationId, projectId, low, high, monthly, elsewhere, unpaid };
    }

    it("previews a wage order for one project's daily-rated staff without changing anything", async () => {
      const { organizationId, projectId, low, high, elsewhere, unpaid } = await seedProjectCrew();

      const preview = await CompensationService.previewBulkChange({
        organizationId,
        projectId,
        rateType: "daily",
        changeType: "raise_to_minimum",
        value: 695,
        effectiveFrom: "2026-10-01",
        reason: "Wage order RB-IV-A-21",
      });

      expect(preview.map((row) => [row.employeeId, row.currentRate, row.newRate, row.status])).toEqual([
        [high, 800, 800, "unchanged"],
        [low, 610, 695, "change"],
        [unpaid, null, null, "skipped"],
      ]);
      expect(preview.find((row) => row.employeeId === unpaid)?.note).toBe("No pay terms yet");
      expect(preview.some((row) => row.employeeId === elsewhere)).toBe(false);
      expect((await CompensationService.getAsOf(low, "2026-10-01"))?.rate).toBe(610);
    });

    it("applies the change as effective-dated revisions sharing one batch, audited once as a batch", async () => {
      const { organizationId, projectId, low, monthly } = await seedProjectCrew();

      const result = await CompensationService.applyBulkChange(
        { organizationId, projectId, changeType: "increase_percent", value: 10, effectiveFrom: "2026-10-01", reason: "Project allowance review" },
        {},
      );

      expect(result).toMatchObject({ applied: 3, skipped: 1 });
      expect((await CompensationService.getAsOf(low, "2026-10-01"))?.rate).toBe(671);
      expect((await CompensationService.getAsOf(monthly, "2026-10-01"))?.rate).toBe(27500);
      expect((await CompensationService.getAsOf(monthly, "2026-09-30"))?.rate).toBe(25000);
      const batch = await CompensationModel.find({ organizationId, batchId: result.batchId }).lean();
      expect(batch).toHaveLength(3);
      expect(batch.every((row) => row.reason === "Project allowance review")).toBe(true);
      const audits = await AuditLogModel.find({ organizationId, action: "compensation.bulk-changed" }).lean();
      expect(audits).toHaveLength(1);
      expect(audits[0].metadata).toMatchObject({ batchId: result.batchId, applied: 3, changeType: "increase_percent", value: 10 });
    });

    it("applies only to the employees picked from the preview", async () => {
      const { organizationId, projectId, low, high } = await seedProjectCrew();
      const result = await CompensationService.applyBulkChange(
        { organizationId, projectId, changeType: "increase_amount", value: 20, effectiveFrom: "2026-10-01", reason: "COLA", employeeIds: [low] },
        {},
      );
      expect(result.applied).toBe(1);
      expect((await CompensationService.getAsOf(low, "2026-10-01"))?.rate).toBe(630);
      expect((await CompensationService.getAsOf(high, "2026-10-01"))?.rate).toBe(800);
    });
  });
});
