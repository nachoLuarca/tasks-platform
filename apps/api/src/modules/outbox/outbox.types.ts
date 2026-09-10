/**
 * Every field here is already shaped the way it goes out over the wire to a
 * webhook subscriber -- see docs/adr/0009-outbox-pattern.md. `type` is
 * always a `TaskActivityType` name today (one outbox row per activity row,
 * written in the same transaction, see activity.service.ts), but is kept as
 * a plain string rather than importing that type here: the outbox module
 * doesn't need to know activity is its only producer, and a future producer
 * (a project-level event, say) wouldn't need a schema change to use it.
 */
export interface RecordOutboxEventInput {
  organizationId: string;
  type: string;
  payload: Record<string, unknown>;
}
