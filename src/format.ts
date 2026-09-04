const eurFormat = new Intl.NumberFormat('lt-LT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const numberFormat = new Intl.NumberFormat('lt-LT')
const wholeNumberFormat = new Intl.NumberFormat('lt-LT', {
  maximumFractionDigits: 0,
})
const dateShortFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})
const dateLongFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export const formatEur = (value: number | null | undefined) =>
  value === null || value === undefined ? null : eurFormat.format(value)

export const formatAres = (value: number | null | undefined) =>
  value === null || value === undefined
    ? null
    : `${numberFormat.format(value)} a`

export const formatPerAre = (
  priceEur: number | null | undefined,
  areaAres: number | null | undefined,
) =>
  priceEur && areaAres
    ? `${wholeNumberFormat.format(priceEur / areaAres)} €/a`
    : null

export const formatDateShort = (value: number | null | undefined) =>
  value === null || value === undefined
    ? null
    : dateShortFormat.format(new Date(value))

export const formatDateLong = (value: number | null | undefined) =>
  value === null || value === undefined
    ? 'Not yet'
    : dateLongFormat.format(new Date(value))

export const formatAgo = (timestamp: number | null | undefined) => {
  if (timestamp === null || timestamp === undefined) return 'unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** Shows a figure or an em dash when it is unknown. */
export const orDash = (value: string | null) => value ?? '—'
