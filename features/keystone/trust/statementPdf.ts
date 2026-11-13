import { textPdf, usd, type PdfRow } from '../billing/statementPdf'

/** A quarterly resident funds statement as a PDF, built on request from the frozen TrustStatement row. No dependency. */
export function trustStatementPdf(input: { community: string; resident: string; quarter: string; start: string; end: string; openingMinor: string; inMinor: string; outMinor: string; closingMinor: string; lines: { date: string; reference: string; description: string; inMinor: string; outMinor: string; balanceMinor: string }[] }): Buffer {
  const rows: PdfRow[] = []
  const add = (text: string, size = 10, right?: string) => rows.push({ text, size, x: 54, right })
  add(input.community, 16)
  add(`Resident funds statement, ${input.quarter}`, 12)
  add(`${input.resident}  |  ${input.start} to ${input.end}`, 10)
  add('', 10)
  add('Opening balance', 11, usd(input.openingMinor))
  for (const line of input.lines) {
    const amount = line.inMinor ? usd(line.inMinor) : `-${usd(line.outMinor)}`
    add(`${line.date}  ${line.reference}  ${line.description}`.slice(0, 80), 9, `${amount}   bal ${usd(line.balanceMinor)}`)
  }
  if (!input.lines.length) add('No activity this quarter.', 10)
  add('', 10)
  add('Money in', 10, usd(input.inMinor))
  add('Money out', 10, usd(input.outMinor))
  add('Closing balance', 12, usd(input.closingMinor))
  add('', 10)
  add('Questions about this statement: please contact the business office.', 9)
  return textPdf(rows)
}
