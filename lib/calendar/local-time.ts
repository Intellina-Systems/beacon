import { DateTime } from 'luxon'

export function toLocalInput(iso: string, zone: string, allDay: boolean): string {
  const dt = DateTime.fromISO(iso).setZone(zone)
  return allDay ? dt.toFormat('yyyy-MM-dd') : dt.toFormat("yyyy-MM-dd'T'HH:mm")
}

export function fromLocalInput(local: string, zone: string, allDay: boolean): string {
  const dt = allDay
    ? DateTime.fromFormat(local, 'yyyy-MM-dd', { zone }).startOf('day')
    : DateTime.fromFormat(local, "yyyy-MM-dd'T'HH:mm", { zone })
  return dt.toUTC().toISO() ?? new Date(local).toISOString()
}
