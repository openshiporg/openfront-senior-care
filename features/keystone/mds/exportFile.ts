import { createHash } from 'node:crypto'
import type { ItemSetDefinition } from './itemSet'

/**
 * The iQIES submission file (INTEGRATIONS I§5, manual_export): one XML document per record, in a ZIP, made by a staff
 * button and uploaded by a person through the iQIES web page. No network call is made from here. The ZIP is written
 * stored (no compression) with CRC-32, which every unzip tool and iQIES accept, so no archive library is needed.
 * Element names follow the MDS item ids; the header carries the item-set and spec versions in force on the ARD.
 */
export const EXPORT_VERIFY_NOTE = 'The XML layout (ASSESSMENT root, item ids as elements, header fields) follows the shape of the CMS MDS 3.0 submission specification; confirm the exact header elements and file naming against the current iQIES data specification before a live upload.'

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export type ExportRecord = { reference: string; kind: string; items: Record<string, string | undefined>; correctionNumber: number }
export type FacilityHeader = { facilityId: string; stateCode: string; softwareVendor: string; softwareName: string; softwareVersion: string }

export function recordXml(record: ExportRecord, def: Pick<ItemSetDefinition, 'items' | 'itemSetVersion' | 'specVersion'>, header: FacilityHeader) {
  const lines = [
    '<?xml version="1.0" standalone="yes"?>',
    '<ASSESSMENT>',
    `<ASMT_SYS_CD>MDS</ASMT_SYS_CD>`,
    `<ITM_SBST_CD>${esc(itemSubset(record.kind))}</ITM_SBST_CD>`,
    `<ITM_SET_VRSN_CD>${esc(def.itemSetVersion)}</ITM_SET_VRSN_CD>`,
    `<SPEC_VRSN_CD>${esc(def.specVersion)}</SPEC_VRSN_CD>`,
    `<STATE_CD>${esc(header.stateCode)}</STATE_CD>`,
    `<FAC_ID>${esc(header.facilityId)}</FAC_ID>`,
    `<PRODN_TEST_CD>2</PRODN_TEST_CD>`,
    `<SFTWR_VNDR_NAME>${esc(header.softwareVendor)}</SFTWR_VNDR_NAME>`,
    `<SFTWR_PROD_NAME>${esc(header.softwareName)}</SFTWR_PROD_NAME>`,
    `<SFTWR_PROD_VRSN_CD>${esc(header.softwareVersion)}</SFTWR_PROD_VRSN_CD>`,
    `<X0100>${record.correctionNumber > 0 ? '2' : '1'}</X0100>`,
    `<CRCTN_NUM>${String(record.correctionNumber).padStart(2, '0')}</CRCTN_NUM>`,
    `<FAC_DOC_ID>${esc(record.reference)}</FAC_DOC_ID>`,
  ]
  for (const item of def.items) {
    if (item.exported === false) continue
    const v = record.items[item.id]
    if (v === undefined || v === '') continue
    lines.push(`<${item.id}>${esc(v)}</${item.id}>`)
  }
  lines.push('</ASSESSMENT>', '')
  return lines.join('\r\n')
}

/** Item subset code by record kind (NC comprehensive, NQ quarterly, NP PPS, ND discharge, NT tracking). */
export function itemSubset(kind: string) {
  if (kind === 'obra_admission' || kind === 'obra_annual' || kind === 'obra_significant_change') return 'NC'
  if (kind === 'obra_quarterly') return 'NQ'
  if (kind === 'pps_5day' || kind === 'ipa') return 'NP'
  if (kind.startsWith('discharge') || kind === 'pps_discharge') return 'ND'
  return 'NT'
}

/* ---------------------------------------------------------------- a stored ZIP (no compression) */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
export function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A ZIP of the given files, stored. A fixed DOS timestamp keeps the bytes (and the hash) the same for the same content. */
export function zipStored(files: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.content, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8)
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28)
    locals.push(local, name, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10)
    central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

/** Reads a stored ZIP back (used by the tests and by the export check). */
export function unzipStored(zip: Buffer) {
  const files: { name: string; content: string; crcOk: boolean }[] = []
  let p = 0
  while (zip.readUInt32LE(p) === 0x04034b50) {
    const crc = zip.readUInt32LE(p + 14), size = zip.readUInt32LE(p + 18), nameLen = zip.readUInt16LE(p + 26), extra = zip.readUInt16LE(p + 28)
    const name = zip.subarray(p + 30, p + 30 + nameLen).toString('utf8')
    const data = zip.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size)
    files.push({ name, content: data.toString('utf8'), crcOk: crc32(data) === crc })
    p += 30 + nameLen + extra + size
  }
  return files
}

export const sha256Hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')

/* ---------------------------------------------------------------- Final Validation Report */

/**
 * Parses the iQIES Final Validation Report a person pastes or uploads (text export). For each record of the submission
 * it finds the line that names its FAC_DOC_ID and reads Accepted / Rejected and any edit numbers (-3xxx, -1xxx). Records
 * the report does not mention stay as they are. verify: the FVR text layout varies by iQIES release.
 */
export const FVR_VERIFY_NOTE = 'FVR parsing matches each record by FAC_DOC_ID and reads Accepted/Rejected and the edit numbers on that line; confirm against a current iQIES FVR export.'
export type FvrOutcome = { reference: string; status: 'accepted' | 'rejected' | 'not_found'; edits: string[] }
export function parseFvr(text: string, references: readonly string[]): FvrOutcome[] {
  const lines = text.split(/\r?\n/)
  return references.map(reference => {
    const hit = lines.filter(line => line.includes(reference))
    if (!hit.length) return { reference, status: 'not_found' as const, edits: [] }
    const joined = hit.join(' ')
    const edits = [...new Set(joined.match(/-[13]\d{3}[a-z]?/g) ?? [])]
    // -3xxx edits are fatal (the record is rejected); -1xxx are warnings.
    const rejected = /\brejected\b/i.test(joined) || edits.some(e => e.startsWith('-3'))
    const accepted = /\baccepted\b/i.test(joined)
    return { reference, status: rejected ? 'rejected' : accepted ? 'accepted' : ('not_found' as const), edits }
  })
}
