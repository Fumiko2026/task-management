import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChalkTray } from './ChalkTray'

describe('ChalkTray', () => {
  it('飾りなので、読み上げには出さない', () => {
    render(<ChalkTray />)
    const tray = screen.getByTestId('chalk-tray')
    expect(tray).toHaveAttribute('aria-hidden', 'true')
    // 押せる部品・文字は、入れない(飾りだけ)
    expect(tray.querySelector('button, a, input')).toBeNull()
    expect(tray).toHaveTextContent('')
  })
})
