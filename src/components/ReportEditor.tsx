import { useState, useEffect, useCallback } from 'react'
import type { Report, Section, LeaveType } from '../types'
import { api } from '../types'
import { formatForKakao } from '../utils/parser'
import WeeklyRangeModal from './WeeklyRangeModal'

interface Props {
  date: string | null
  onSaved: (savedDate: string) => void
  onDelete: () => void
}

function newSection(): Section {
  return { project_name: '', items: [{ content: '', children: [] }] }
}

const LEAVE_TYPES: LeaveType[] = ['연차', '반차(오전)', '반차(오후)', '반반차']

const LEAVE_EMOJI: Record<LeaveType, string> = {
  '연차': '🏖️',
  '반차(오전)': '🌅',
  '반차(오후)': '🌇',
  '반반차': '⏰',
}

export default function ReportEditor({ date, onSaved, onDelete }: Props) {
  const [report, setReport] = useState<Report | null>(null)
  const [copied, setCopied] = useState(false)
  const [showWeeklyModal, setShowWeeklyModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    if (!date) { setReport(null); return }
    api.getReport(date).then(r => {
      if (r) {
        setIsNew(false)
        setReport(r)
      } else {
        setIsNew(true)
        setReport({ report_date: date, leave_type: null, sections: [newSection()] })
      }
    })
  }, [date])

  const save = useCallback(async () => {
    if (!report) return
    setSaving(true)
    await api.saveReport(report)
    setSaving(false)
    setIsNew(false)
    onSaved(report.report_date)
  }, [report, onSaved])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  const copyKakao = () => {
    if (!report) return
    navigator.clipboard.writeText(formatForKakao(report))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    if (!report) return
    if (!confirm('이 보고서를 삭제할까요?')) return
    await api.deleteReport(report.report_date)
    onDelete()
  }

  const setLeaveType = (lt: LeaveType | null) => {
    if (!report) return
    setReport({ ...report, leave_type: lt })
  }

  const updateSection = (si: number, patch: Partial<Section>) => {
    if (!report) return
    const sections = report.sections.map((s, i) => i === si ? { ...s, ...patch } : s)
    setReport({ ...report, sections })
  }

  const addSection = () => {
    if (!report) return
    setReport({ ...report, sections: [...report.sections, newSection()] })
  }

  const removeSection = (si: number) => {
    if (!report) return
    setReport({ ...report, sections: report.sections.filter((_, i) => i !== si) })
  }

  const updateItem = (si: number, ii: number, content: string) => {
    if (!report) return
    const sections = report.sections.map((s, i) => {
      if (i !== si) return s
      return { ...s, items: s.items.map((item, j) => j === ii ? { ...item, content } : item) }
    })
    setReport({ ...report, sections })
  }

  const updateChild = (si: number, ii: number, ci: number, content: string) => {
    if (!report) return
    const sections = report.sections.map((s, i) => {
      if (i !== si) return s
      return {
        ...s,
        items: s.items.map((item, j) => {
          if (j !== ii) return item
          const children = (item.children || []).map((c, k) => k === ci ? { ...c, content } : c)
          return { ...item, children }
        })
      }
    })
    setReport({ ...report, sections })
  }

  const focusInput = (key: string) => {
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-focus="${key}"]`)?.focus()
    }, 0)
  }

  const addItem = (si: number) => {
    if (!report) return
    const newIndex = report.sections[si].items.length
    const sections = report.sections.map((s, i) =>
      i === si ? { ...s, items: [...s.items, { content: '', children: [] }] } : s
    )
    setReport({ ...report, sections })
    focusInput(`${si}-${newIndex}`)
  }

  const removeItem = (si: number, ii: number) => {
    if (!report) return
    const sections = report.sections.map((s, i) =>
      i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s
    )
    setReport({ ...report, sections })
  }

  const addChild = (si: number, ii: number) => {
    if (!report) return
    const newChildIndex = (report.sections[si].items[ii].children || []).length
    const sections = report.sections.map((s, i) => {
      if (i !== si) return s
      return {
        ...s,
        items: s.items.map((item, j) => {
          if (j !== ii) return item
          return { ...item, children: [...(item.children || []), { content: '' }] }
        })
      }
    })
    setReport({ ...report, sections })
    focusInput(`${si}-${ii}-${newChildIndex}`)
  }

  const removeChild = (si: number, ii: number, ci: number) => {
    if (!report) return
    const sections = report.sections.map((s, i) => {
      if (i !== si) return s
      return {
        ...s,
        items: s.items.map((item, j) => {
          if (j !== ii) return item
          return { ...item, children: (item.children || []).filter((_, k) => k !== ci) }
        })
      }
    })
    setReport({ ...report, sections })
  }

  const addChildAfter = (si: number, ii: number, ci: number) => {
    if (!report) return
    const sections = report.sections.map((s, i) => {
      if (i !== si) return s
      return {
        ...s,
        items: s.items.map((item, j) => {
          if (j !== ii) return item
          const children = [...(item.children || [])]
          children.splice(ci + 1, 0, { content: '' })
          return { ...item, children }
        })
      }
    })
    setReport({ ...report, sections })
    focusInput(`${si}-${ii}-${ci + 1}`)
  }

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, si: number, ii: number) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      addChild(si, ii)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      addItem(si)
    }
  }

  const handleChildKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, si: number, ii: number, ci: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addChildAfter(si, ii, ci)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // 하위 항목 마지막이면 부모 다음 항목으로, 아니면 다음 하위 항목으로
      const children = report?.sections[si].items[ii].children || []
      if (ci === children.length - 1) {
        addItem(si)
      } else {
        focusInput(`${si}-${ii}-${ci + 1}`)
      }
    }
  }

  if (!report) {
    return (
      <main className="editor empty-editor">
        <p>왼쪽에서 날짜를 선택하거나 새 보고서를 작성하세요</p>
      </main>
    )
  }

  const [, m, d] = report.report_date.split('-')
  const isLeave = !!report.leave_type

  return (
    <>
    <main className="editor">
      <div className="editor-header">
        <div className="editor-title">
          {isNew ? (
            <div className="date-edit-row">
              <input
                type="date"
                className="date-input"
                value={report.report_date}
                onChange={e => setReport({ ...report, report_date: e.target.value })}
              />
              <span className="badge-new">새 기록</span>
            </div>
          ) : (
            <h2>{parseInt(m)}월 {parseInt(d)}일 {isLeave ? report.leave_type : '업무보고'}</h2>
          )}
        </div>
        <div className="editor-actions">
          {!isLeave && (
            <>
              <button className="btn-kakao" onClick={copyKakao}>
                {copied ? '✓ 복사됨' : '일간 복사'}
              </button>
              <button className="btn-weekly" onClick={() => setShowWeeklyModal(true)}>
                주간보고 복사
              </button>
            </>
          )}
          <button className="btn-save" onClick={save} disabled={saving}>
            {saving ? '저장중...' : '저장 (⌘S)'}
          </button>
          {!isNew && (
            <button className="btn-danger" onClick={handleDelete}>삭제</button>
          )}
        </div>
      </div>

      <div className="editor-body">
        {/* 기록 유형 선택 */}
        <div className="record-type-bar">
          <button
            className={`record-type-btn ${!isLeave ? 'active-work' : ''}`}
            onClick={() => setLeaveType(null)}
          >업무보고</button>
          {LEAVE_TYPES.map(lt => (
            <button
              key={lt}
              className={`record-type-btn ${report.leave_type === lt ? 'active-leave' : ''}`}
              onClick={() => setLeaveType(lt)}
            >{lt}</button>
          ))}
        </div>

        {isLeave ? (
          <div className="leave-card">
            <span className="leave-emoji">{LEAVE_EMOJI[report.leave_type!]}</span>
            <span className="leave-label">{report.leave_type}</span>
            <p className="leave-sub">이 날은 {report.leave_type}로 기록됩니다</p>
          </div>
        ) : (
          <>
            {report.sections.map((sec, si) => (
              <div key={si} className="section-block">
                <div className="section-header">
                  <span className="section-bracket">[</span>
                  <input
                    className="section-name-input"
                    placeholder="프로젝트명"
                    value={sec.project_name}
                    onChange={e => updateSection(si, { project_name: e.target.value })}
                  />
                  <span className="section-bracket">]</span>
                  {report.sections.length > 1 && (
                    <button className="btn-remove-section" onClick={() => removeSection(si)}>×</button>
                  )}
                </div>

                <div className="items-list">
                  {sec.items.map((item, ii) => (
                    <div key={ii} className="item-group">
                      <div className="item-row">
                        <span className="item-bullet">-</span>
                        <input
                          className="item-input"
                          placeholder="업무 항목 입력 (Tab: 하위항목 추가, Enter: 다음 항목)"
                          value={item.content}
                          data-focus={`${si}-${ii}`}
                          onChange={e => updateItem(si, ii, e.target.value)}
                          onKeyDown={e => handleItemKeyDown(e, si, ii)}
                        />
                        <button className="btn-add-child" onClick={() => addChild(si, ii)} title="하위항목 추가">⌐</button>
                        <button className="btn-remove-item" onClick={() => removeItem(si, ii)}>×</button>
                      </div>

                      {(item.children || []).map((child, ci) => (
                        <div key={ci} className="child-row">
                          <span className="child-indent" />
                          <span className="item-bullet">-</span>
                          <input
                            className="item-input child-input"
                            placeholder="하위 항목"
                            value={child.content}
                            data-focus={`${si}-${ii}-${ci}`}
                            onChange={e => updateChild(si, ii, ci, e.target.value)}
                            onKeyDown={e => handleChildKeyDown(e, si, ii, ci)}
                          />
                          <button className="btn-remove-item" onClick={() => removeChild(si, ii, ci)}>×</button>
                        </div>
                      ))}
                    </div>
                  ))}
                  <button className="btn-add-item" onClick={() => addItem(si)}>+ 항목 추가</button>
                </div>
              </div>
            ))}
            <button className="btn-add-section" onClick={addSection}>+ 프로젝트 섹션 추가</button>
          </>
        )}
      </div>
    </main>
    {showWeeklyModal && (
      <WeeklyRangeModal
        baseDate={report.report_date}
        onClose={() => setShowWeeklyModal(false)}
      />
    )}
    </>
  )
}
