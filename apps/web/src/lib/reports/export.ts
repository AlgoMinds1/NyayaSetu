import "server-only";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { ReportResult } from "@/lib/reports/queries";

export const FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ExportFormat = (typeof FORMATS)[number];

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** CSV cell: quoted when needed; cells starting with a formula character are neutralised. */
function csvCell(value: string | number) {
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(report: ReportResult): string {
  const lines = [
    [report.title].map(csvCell).join(","),
    [`Generated ${report.generatedAt}`, report.footer].map(csvCell).join(","),
    "",
    report.columns.map(csvCell).join(","),
    ...report.rows.map((row) => row.map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`; // BOM so Excel reads UTF-8 names correctly
}

export async function toXlsx(report: ReportResult): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(report.generatedAt);
  const sheet = workbook.addWorksheet(report.type.replace(/_/g, " ").slice(0, 31));
  sheet.addRow([report.title]).font = { bold: true, size: 13 };
  sheet.addRow([report.footer]);
  sheet.addRow([]);
  const header = sheet.addRow(report.columns);
  header.font = { bold: true };
  for (const row of report.rows) sheet.addRow(row);
  sheet.columns.forEach((column) => { column.width = 24; });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export function toPdf(report: ReportResult): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(15).text(report.title);
    doc.font("Helvetica").fontSize(9).fillColor("#555")
      .text(`Generated ${report.generatedAt}  |  ${report.footer}`);
    doc.moveDown().fillColor("#000").fontSize(11).text(report.summary);
    doc.moveDown();

    const colWidth = (doc.page.width - 80) / report.columns.length;
    const drawRow = (cells: (string | number)[], bold: boolean) => {
      const y = doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      cells.forEach((cell, i) => doc.text(String(cell), 40 + i * colWidth, y, { width: colWidth - 6 }));
      doc.moveDown(0.4);
    };
    drawRow(report.columns, true);
    for (const row of report.rows) {
      if (doc.y > doc.page.height - 60) doc.addPage();
      drawRow(row, false);
    }
    doc.end();
  });
}
