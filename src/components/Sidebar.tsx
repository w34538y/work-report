import { useState, useEffect } from 'react'
import type { ReportSummary, LeaveType } from '../types'
import { api } from '../types'

interface Props {
  selectedDate: string | null
  onSelect: (date: string) => void
  onNew: () => void
  onImport: () => void
  onHelp: () => void
  refreshKey: number
}

type ViewMode = 'list' | 'calendar'

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function Sidebar({ selectedDate, onSelect, onNew, onImport, onHelp, refreshKey }: Props) {
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ report_date: string; content: string; project_name: string }[] | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())

  useEffect(() => {
    api.listReports().then(setReports)
  }, [refreshKey])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    const timer = setTimeout(() => {
      api.searchReports(searchQuery).then(setSearchResults)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // sync calendar to selected date
  useEffect(() => {
    if (selectedDate && viewMode === 'calendar') {
      const [y, m] = selectedDate.split('-').map(Number)
      setCalYear(y); setCalMonth(m - 1)
    }
  }, [selectedDate, viewMode])

  // date → null(업무보고) or LeaveType
  const reportMap = new Map<string, LeaveType | null>(
    reports.map(r => [r.report_date, r.leave_type ?? null])
  )
  const today = new Date().toISOString().slice(0, 10)

  // 과거 평일 중 기록 없는 날 계산 (표시 중인 달 기준)
  const missingDates = new Set<string>()
  const daysInDisplayMonth = new Date(calYear, calMonth + 1, 0).getDate()
  for (let day = 1; day <= daysInDisplayMonth; day++) {
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (ds >= today) continue
    const dow = new Date(ds).getDay()
    if (dow === 0 || dow === 6) continue // 주말 제외
    if (!reportMap.has(ds)) missingDates.add(ds)
  }

  const grouped = reports.reduce<Record<string, ReportSummary[]>>((acc, r) => {
    const ym = r.report_date.slice(0, 7)
    if (!acc[ym]) acc[ym] = []
    acc[ym].push(r)
    return acc
  }, {})

  const formatDateLabel = (date: string) => {
    const [, m, d] = date.split('-')
    return `${parseInt(m)}월 ${parseInt(d)}일`
  }

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return `${y}년 ${parseInt(m)}월`
  }

  const calendarCells = buildCalendar(calYear, calMonth)
  const calDateStr = (day: number) =>
    `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">업무보고 아카이브</h1>
        <div className="sidebar-actions">
          <button className="btn-primary" onClick={onNew}>+ 새 보고서</button>
          <button className="btn-secondary" onClick={onImport}>이관</button>
          <button className="btn-help" onClick={onHelp} title="사용법 안내">?</button>
        </div>
        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >목록</button>
          <button
            className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >캘린더</button>
        </div>
        {viewMode === 'list' && (
          <input
            className="search-input"
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        )}
      </div>

      {viewMode === 'calendar' ? (
        <div className="calendar-container">
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
            <span className="cal-month-label">{calYear}년 {calMonth + 1}월</span>
            <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          </div>
          <div className="cal-grid">
            {DAYS_KO.map(d => (
              <div key={d} className={`cal-day-header ${d === '일' ? 'sunday' : d === '토' ? 'saturday' : ''}`}>{d}</div>
            ))}
            {calendarCells.map((day, i) => {
              if (!day) return <div key={i} className="cal-cell empty" />
              const dateStr = calDateStr(day)
              const isSelected = selectedDate === dateStr
              const isToday = today === dateStr
              const dow = i % 7
              const isClickable = reportMap.has(dateStr)

              let dotClass = ''
              if (reportMap.has(dateStr)) {
                dotClass = reportMap.get(dateStr) ? 'dot-leave' : 'dot-work'
              } else if (missingDates.has(dateStr)) {
                dotClass = 'dot-missing'
              }

              return (
                <div
                  key={i}
                  className={[
                    'cal-cell',
                    isClickable ? 'has-report' : '',
                    isSelected ? 'selected' : '',
                    isToday ? 'today' : '',
                    dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : ''
                  ].join(' ')}
                  onClick={() => isClickable && onSelect(dateStr)}
                >
                  <span className="cal-day-num">{day}</span>
                  {dotClass && <span className={`cal-dot ${dotClass}`} />}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="report-list">
          {searchResults !== null ? (
            <>
              <div className="month-group-label">검색 결과 ({searchResults.length})</div>
              {searchResults.length === 0 && <div className="empty-state">결과 없음</div>}
              {searchResults.map((r, i) => (
                <div
                  key={i}
                  className={`report-item ${selectedDate === r.report_date ? 'selected' : ''}`}
                  onClick={() => onSelect(r.report_date)}
                >
                  <span className="report-date">{formatDateLabel(r.report_date)}</span>
                  <span className="report-preview highlight">[{r.project_name}] {r.content}</span>
                </div>
              ))}
            </>
          ) : (
            Object.entries(grouped).map(([ym, items]) => (
              <div key={ym}>
                <div className="month-group-label">{formatMonthLabel(ym)}</div>
                {items.map(r => (
                  <div
                    key={r.report_date}
                    className={`report-item ${selectedDate === r.report_date ? 'selected' : ''}`}
                    onClick={() => onSelect(r.report_date)}
                  >
                    <span className="report-date">
                      {formatDateLabel(r.report_date)}
                      {r.leave_type && <span className="leave-badge">{r.leave_type}</span>}
                    </span>
                    {!r.leave_type && r.preview && <span className="report-preview">{r.preview}</span>}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  )
}
