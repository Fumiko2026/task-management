import { describe, expect, it } from 'vitest'
import { makeCard } from '../test/fixtures'
import { dueDisplay, formatDueDate } from './formatDue'

describe('formatDueDate', () => {
  it('日付を「月/日」の短い形にする', () => {
    expect(formatDueDate('2026-10-25T10:00:00+09:00')).toBe('10/25')
  })

  it('UTC で届いた日時も、日本時間の日付にする(UTC では前日の夜でも、日本では翌日になる)', () => {
    // UTC 10/25 15:30 = 日本時間 10/26 0:30
    expect(formatDueDate('2026-10-25T15:30:00Z')).toBe('10/26')
  })

  it('月・日が1けたのときは、0 を付けない', () => {
    expect(formatDueDate('2026-01-05T09:00:00+09:00')).toBe('1/5')
  })
})

describe('dueDisplay', () => {
  const dueAt = '2026-10-25T10:00:00+09:00'

  it('期限なしは、何も出さない', () => {
    expect(dueDisplay(makeCard({ dueStatus: 'NONE' }))).toBeNull()
  })

  it('通常は、アイコンと日付だけ', () => {
    const card = makeCard({ dueStatus: 'NORMAL', dueIcon: '🕒', dueLabel: '通常', dueAt })
    expect(dueDisplay(card)).toEqual({ icon: '🕒', text: '10/25' })
  })

  it('もうすぐは、アイコンと日付と「もうすぐ」', () => {
    const card = makeCard({ dueStatus: 'DUE_SOON', dueIcon: '⏰', dueLabel: 'もうすぐ', dueAt })
    expect(dueDisplay(card)).toEqual({ icon: '⏰', text: '10/25 もうすぐ' })
  })

  it('超過は、アイコンと日付と「超過」', () => {
    const card = makeCard({ dueStatus: 'OVERDUE', dueIcon: '❗', dueLabel: '超過', dueAt })
    expect(dueDisplay(card)).toEqual({ icon: '❗', text: '10/25 超過' })
  })

  it('完了は、アイコンと「完了」', () => {
    const card = makeCard({ dueStatus: 'COMPLETED', dueIcon: '✔', dueLabel: '完了', dueAt })
    expect(dueDisplay(card)).toEqual({ icon: '✔', text: '完了' })
  })
})
