import { describe, expect, it } from 'vitest'
import { fromInputValue, isPast, quickDue, toInputValue } from './dueInput'

describe('toInputValue(サーバーの日時 → 入力欄の値。日本時間)', () => {
  it('日本時間の日時は、そのまま', () => {
    expect(toInputValue('2026-11-10T18:00:00+09:00')).toBe('2026-11-10T18:00')
  })

  it('UTC(Z)で届いても、日本時間にする', () => {
    expect(toInputValue('2026-11-10T09:00:00Z')).toBe('2026-11-10T18:00')
  })

  it('日付をまたぐ(UTC では前日の夜でも、日本時間では翌日)', () => {
    expect(toInputValue('2026-11-10T15:30:00Z')).toBe('2026-11-11T00:30')
  })

  it('0 時台と、1けたの月・日・時も、0 でそろえる', () => {
    expect(toInputValue('2026-01-05T00:05:00+09:00')).toBe('2026-01-05T00:05')
  })
})

describe('fromInputValue(入力欄の値 → サーバーに送る日時。+09:00 つき)', () => {
  it('日本時間の時差 +09:00 をつける', () => {
    expect(fromInputValue('2026-11-10T18:00')).toBe('2026-11-10T18:00:00+09:00')
  })

  it('秒がついていても、読める', () => {
    expect(fromInputValue('2026-11-10T18:00:30')).toBe('2026-11-10T18:00:00+09:00')
  })

  it('形が正しくなければ、null', () => {
    expect(fromInputValue('')).toBeNull()
    expect(fromInputValue('あした')).toBeNull()
    expect(fromInputValue('2026-11-10')).toBeNull()
    expect(fromInputValue('2026-11-10 18:00')).toBeNull()
  })

  it('toInputValue と、行って戻ると、同じ瞬間になる', () => {
    const iso = '2026-11-10T15:30:00Z'
    expect(new Date(fromInputValue(toInputValue(iso))!).getTime()).toBe(new Date(iso).getTime())
  })
})

describe('quickDue(今日・明日・来週 → 18:00 の入力欄の値)', () => {
  // 2026-11-10 12:00(日本時間)
  const noon = new Date('2026-11-10T03:00:00Z')

  it('今日・明日・来週(7日後)は、18:00', () => {
    expect(quickDue('today', noon)).toBe('2026-11-10T18:00')
    expect(quickDue('tomorrow', noon)).toBe('2026-11-11T18:00')
    expect(quickDue('nextWeek', noon)).toBe('2026-11-17T18:00')
  })

  it('「今日」は、日本時間の日付で決める(UTC ではまだ前日の夜でも)', () => {
    // 2026-11-11 01:00(日本時間)= UTC では 11/10 16:00
    expect(quickDue('today', new Date('2026-11-10T16:00:00Z'))).toBe('2026-11-11T18:00')
  })

  it('月またぎ・年またぎ・うるう日も、正しく進む', () => {
    expect(quickDue('tomorrow', new Date('2026-11-29T12:00:00+09:00'))).toBe('2026-11-30T18:00')
    expect(quickDue('nextWeek', new Date('2026-11-29T12:00:00+09:00'))).toBe('2026-12-06T18:00')
    expect(quickDue('nextWeek', new Date('2026-12-28T12:00:00+09:00'))).toBe('2027-01-04T18:00')
    expect(quickDue('tomorrow', new Date('2028-02-28T12:00:00+09:00'))).toBe('2028-02-29T18:00')
  })

  it('18:00 を過ぎていても、同じ日の 18:00 を返す(過去かどうかは、決定のときに確認する)', () => {
    expect(quickDue('today', new Date('2026-11-10T22:00:00+09:00'))).toBe('2026-11-10T18:00')
  })
})

describe('isPast', () => {
  const now = new Date('2026-11-10T12:00:00+09:00')

  it('いまより前なら true、あとなら false', () => {
    expect(isPast('2026-11-10T11:59', now)).toBe(true)
    expect(isPast('2026-11-10T12:01', now)).toBe(false)
    expect(isPast('2026-11-09T18:00', now)).toBe(true)
  })

  it('ちょうど、いまは、過去ではない', () => {
    expect(isPast('2026-11-10T12:00', now)).toBe(false)
  })

  it('形が正しくなければ false', () => {
    expect(isPast('', now)).toBe(false)
    expect(isPast('あした', now)).toBe(false)
  })
})
