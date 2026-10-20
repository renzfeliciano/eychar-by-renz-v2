import { Check } from "lucide-react";
import { EVALUATION_FORM_CODE, RATING_SCALE, getTemplate } from "@/domains/performance/evaluation-template";
import { formatCalendarDate } from "@/lib/date-key";
import { formatDate } from "@/lib/app-time";

const SHORT = { month: "short", day: "numeric", year: "numeric" } as const;

export type SheetData = {
  header: { employeeName: string; evaluatorName: string; jobTitle?: string; projectName?: string; evaluationForName: string };
  periodStart: Date;
  periodEnd: Date;
  templateVersion: number;
  ratings: Record<string, string>;
  goals?: string;
  comments?: string;
  evaluatorAck?: { typedName: string; at: Date };
  employeeAck?: { typedName: string; at: Date; comments?: string };
};

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2 border-b border-[#d4d4d8] py-1.5 text-sm">
      <dt className="w-36 shrink-0 font-semibold">{label}</dt>
      <dd className="min-w-0 flex-1">{value || "—"}</dd>
    </div>
  );
}

/**
 * The filled-in form as it prints: the same layout as the paper form
 * PCAS-HRMD-FR-004, with the typed acknowledgments and blank lines for a
 * manual signature and date. Used on screen after submit, and for printing.
 */
export function EvaluationSheet({ data }: { data: SheetData }) {
  const template = getTemplate(data.templateVersion);
  const { header } = data;

  return (
    <article
      className="mx-auto w-full max-w-3xl rounded-lg border bg-white p-6 text-[#18181b] shadow-[var(--shadow-soft)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      data-testid="evaluation-sheet"
    >
      <h2 className="text-center text-lg font-semibold">Employee Performance Evaluation Form</h2>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
        <Field label="Name" value={header.employeeName} />
        <Field label="Job title" value={header.jobTitle} />
        <Field label="Project assigned" value={header.projectName} />
        <Field label="Period" value={`${formatCalendarDate(data.periodStart, SHORT)} – ${formatCalendarDate(data.periodEnd, SHORT)}`} />
        <Field label="Immediate head" value={header.evaluatorName} />
        <Field label="Evaluation for" value={header.evaluationForName} />
      </dl>

      <p className="mt-4 text-xs">
        <strong>Legend:</strong> {RATING_SCALE.map((rating) => `${rating.code} = ${rating.label}`).join("   ·   ")}
      </p>

      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[#18181b]">
            <th className="py-1.5 pr-2 text-left font-semibold">Evaluation factors</th>
            {RATING_SCALE.map((rating) => (
              <th key={rating.code} className="w-10 py-1.5 text-center font-semibold">
                {rating.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {template.factors.map((factor) =>
            factor.criteria.map((criterion, index) => (
              <tr key={criterion.key} className="border-b border-[#d4d4d8] break-inside-avoid">
                <td className="py-1.5 pr-2">
                  {index === 0 && <span className="mr-2 font-semibold">{factor.name}</span>}
                  <span className="text-[#3f3f46]">{criterion.text}</span>
                </td>
                {RATING_SCALE.map((rating) => (
                  <td key={rating.code} className="text-center">
                    {data.ratings[criterion.key] === rating.code && <Check className="mx-auto size-4" aria-label={`${rating.label}`} />}
                  </td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>

      <section className="mt-5 break-inside-avoid">
        <h3 className="text-sm font-semibold">Goals for next review period</h3>
        <p className="mt-1 min-h-10 text-sm whitespace-pre-wrap">{data.goals || "—"}</p>
      </section>
      <section className="mt-4 break-inside-avoid">
        <h3 className="text-sm font-semibold">Immediate superior comments in performance of employee</h3>
        <p className="mt-1 min-h-10 text-sm whitespace-pre-wrap">{data.comments || "—"}</p>
      </section>

      <section className="mt-6 grid gap-6 sm:grid-cols-2 print:grid-cols-2 break-inside-avoid">
        <div>
          <h3 className="text-sm font-semibold">Evaluation performed by</h3>
          <p className="mt-1 text-sm">{data.evaluatorAck ? `${data.evaluatorAck.typedName} (typed acknowledgment, ${formatDate(data.evaluatorAck.at)})` : "—"}</p>
          <div className="mt-8 border-t border-[#18181b] pt-1 text-xs">Name and signature of immediate superior</div>
          <div className="mt-6 border-t border-[#18181b] pt-1 text-xs">Date</div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Received and confirmed by</h3>
          <p className="mt-1 text-sm">{data.employeeAck ? `${data.employeeAck.typedName} (typed acknowledgment, ${formatDate(data.employeeAck.at)})` : "Not yet acknowledged"}</p>
          <div className="mt-8 border-t border-[#18181b] pt-1 text-xs">Name and signature of employee</div>
          <div className="mt-6 border-t border-[#18181b] pt-1 text-xs">Date</div>
        </div>
      </section>

      {data.employeeAck?.comments && (
        <section className="mt-5 break-inside-avoid">
          <h3 className="text-sm font-semibold">Employee comments</h3>
          <p className="mt-1 text-sm whitespace-pre-wrap">{data.employeeAck.comments}</p>
        </section>
      )}

      <p className="mt-6 text-right text-xs text-[#52525b]">
        {EVALUATION_FORM_CODE} · Employee Performance Evaluation Form
      </p>
    </article>
  );
}
