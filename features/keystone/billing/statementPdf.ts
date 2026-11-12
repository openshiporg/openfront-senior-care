/**
 * A statement as a one-or-more page PDF, built on request from the stored statement lines. Plain text in Helvetica, no
 * dependency and no file written. Amounts arrive as integer minor-unit strings and are formatted without floats.
 */

export type StatementPdfInput = {
  number: string
  community: string
  resident: string
  month: string
  issuedOn: string
  dueOn: string
  status: string
  totalMinor: string
  paidMinor: string
  /** Posted adjustments and write-offs; the balance is total − paid − adjusted, as on the statement page. */
  adjustedMinor?: string
  lines: { description: string; days: number; amountMinor: string }[]
}

const usd = (minor: string) => {
  const negative = minor.startsWith('-')
  const digits = minor.replace('-', '').padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}$${whole}.${digits.slice(-2)}`
}
const esc = (text: string) => text.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')

export function statementPdf(input: StatementPdfInput): Buffer {
  const adjusted = BigInt(input.adjustedMinor ?? '0')
  const balance = (BigInt(input.totalMinor) - BigInt(input.paidMinor) - adjusted).toString()
  const rows: { text: string; size: number; x: number; right?: string }[] = []
  const add = (text: string, size = 10, right?: string) => rows.push({ text, size, x: 54, right })
  add(input.community, 16)
  add(`Statement ${input.number}`, 12)
  add(`${input.resident}  |  ${input.month}`, 10)
  add(`Issued ${input.issuedOn}  |  Due ${input.dueOn}  |  ${input.status}`, 10)
  add('', 10)
  add('Charges', 11)
  for (const line of input.lines) add(`${line.description}${line.days > 1 ? `  (${line.days} days)` : ''}`, 10, usd(line.amountMinor))
  add('', 10)
  add('Total', 11, usd(input.totalMinor))
  add('Paid', 10, usd(input.paidMinor))
  if (adjusted !== 0n) add('Adjusted', 10, usd(adjusted.toString()))
  add('Balance due', 12, usd(balance))

  const perPage = 48
  const pages: typeof rows[] = []
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage))
  const objects: string[] = []
  const pageIds = pages.map((_, i) => 4 + i * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pages.forEach((page, index) => {
    let y = 780
    const body = page
      .map(row => {
        y -= row.size + 6
        const left = `BT /F1 ${row.size} Tf ${row.x} ${y} Td (${esc(row.text)}) Tj ET`
        const right = row.right ? `BT /F1 ${row.size} Tf ${540 - row.right.length * row.size * 0.55} ${y} Td (${esc(row.right)}) Tj ET` : ''
        return `${left}\n${right}`
      })
      .join('\n')
    const pageId = 4 + index * 2
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`
    objects[pageId + 1] = `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(out)
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
