import { appendAuditEvents, type AuditInput } from './audit'
import { canonicalJson, sha256, toJsonValue } from './canonical'
import { TRANSACTION_OPTIONS, type Db, type Tx } from './db'

/**
 * One business transaction: state changes, ledger postings, the audit events and the outbox
 * messages all commit together or not at all (SM§0). No network I/O happens inside; external effects
 * are outbox messages delivered after commit by the outbox worker.
 */
export type OutboxInput = {
  topic: string
  aggregateType: string
  aggregateId: string
  payload: unknown
  /** Same key → one message, however often the transaction is retried. Defaults to a payload hash. */
  dedupeKey?: string
  availableAt?: Date
}

export class UnitOfWork {
  readonly audits: AuditInput[] = []
  readonly outbox: OutboxInput[] = []
  constructor(readonly tx: Tx, readonly now: Date, readonly requestId: string | null) {}
  audit(event: AuditInput) {
    this.audits.push({ requestId: this.requestId, ...event })
  }
  emit(message: OutboxInput) {
    this.outbox.push(message)
  }
}

export async function flushOutbox(tx: Tx, messages: OutboxInput[], now: Date) {
  if (!messages.length) return
  const rows = messages.map(message => {
    const payload = toJsonValue(message.payload)
    const dedupeKey = message.dedupeKey ?? `${message.topic}:${message.aggregateType}:${message.aggregateId}:${sha256(canonicalJson(payload))}`
    return { topic: message.topic, aggregateType: message.aggregateType, aggregateId: message.aggregateId, dedupeKey, payload: payload as never, status: 'pending', nextAttemptAt: message.availableAt ?? now }
  })
  // One statement. A retried command produces the same dedupe keys; ON CONFLICT DO NOTHING keeps one message.
  await tx.outboxEvent.createMany({ data: rows, skipDuplicates: true })
}

export async function runInTransaction<T>(db: Db, work: (uow: UnitOfWork) => Promise<T>, options: { requestId?: string | null; now?: Date; serializable?: boolean } = {}): Promise<T> {
  return db.$transaction(async tx => {
    const uow = new UnitOfWork(tx, options.now ?? new Date(), options.requestId ?? null)
    const result = await work(uow)
    await flushOutbox(tx, uow.outbox, uow.now)
    // Last: the chain lock is held only for the final moments of the transaction.
    await appendAuditEvents(tx, uow.audits, uow.now)
    return result
  }, options.serializable ? { ...TRANSACTION_OPTIONS, isolationLevel: 'Serializable' } : TRANSACTION_OPTIONS)
}
