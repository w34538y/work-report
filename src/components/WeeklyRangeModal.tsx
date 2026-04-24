import { useState } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { api } from '../types'
import { formatWeeklyKakao } from '../utils/parser'

interface Props {
  baseDate: string
  onClose: () => void
}

export default function WeeklyRangeModal({ baseDate, onClose }: Props) {
  const defaultEnd = baseDate
  const defaultStart = new Date(new Date(baseDate).getTime() - 6 * 86400000).toISOString().slice(0, 10)
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleCopy = async () => {
    if (start > end) return
    setLoading(true)
    try {
      const reports = await api.getReportsByRange(start, end)
      const text = formatWeeklyKakao(reports)
      await writeText(text)
      setCopied(true)
      setTimeout(() => { setCopied(false); onClose() }, 1200)
    } catch (e) {
      console.error('주간보고 복사 실패:', e)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${parseInt(m)}월 ${parseInt(day)}일`
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal weekly-range-modal">
        <div className="modal-header">
          <h2>주간보고 복사</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="range-row">
            <div className="range-field">
              <label>시작일</label>
              <input
                type="date"
                className="date-input"
                value={start}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <span className="range-sep">~</span>
            <div className="range-field">
              <label>종료일</label>
              <input
                type="date"
                className="date-input"
                value={end}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
          </div>
          {start <= end && (
            <p className="range-preview">{fmt(start)} ~ {fmt(end)} 기간의 보고서를 복사합니다</p>
          )}
          {start > end && (
            <p className="range-preview range-error">시작일이 종료일보다 늦습니다</p>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn-primary"
            onClick={handleCopy}
            disabled={loading || copied || start > end}
          >
            {copied ? '✓ 복사됨' : loading ? '복사 중...' : '클립보드에 복사'}
          </button>
          <button className="btn-secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
