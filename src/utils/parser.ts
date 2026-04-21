import type { Report, Section, Item } from '../types'

const DATE_HEADER = /\[(\d{1,2})월\s*(\d{1,2})일\s*업무보고\]/
const PROJECT_HEADER = /^\[([^\]]+)\]$/
// 불릿: 앞 공백(탭·스페이스 혼합) + (- 또는 •) + 공백 + 내용
const BULLET = /^(\s*)([-•])\s+(.+)/

export function parseReportText(text: string, startYear: number): Report[] {
  // 줄바꿈 정규화 (\r\n → \n, 단독 \r → \n)
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  const blocks: { month: number; day: number; lines: string[] }[] = []
  let current: { month: number; day: number; lines: string[] } | null = null

  for (const line of lines) {
    const dateMatch = line.match(DATE_HEADER)
    if (dateMatch) {
      if (current) blocks.push(current)
      current = { month: parseInt(dateMatch[1]), day: parseInt(dateMatch[2]), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) blocks.push(current)

  let year = startYear
  let prevMonth = blocks[0]?.month ?? 1

  return blocks.map(block => {
    if (block.month < prevMonth) year++
    prevMonth = block.month

    const dateStr = `${year}-${String(block.month).padStart(2, '0')}-${String(block.day).padStart(2, '0')}`
    const sections: Section[] = []
    let currentSection: Section | null = null
    let currentItem: Item | null = null

    // 이 블록에서 불릿의 최소 들여쓰기를 구해 "최상위 항목" 기준으로 삼는다
    const bulletIndents = block.lines
      .map(l => BULLET.exec(l))
      .filter(Boolean)
      .map(m => m![1].length)

    const minIndent = bulletIndents.length > 0 ? Math.min(...bulletIndents) : 0

    for (const line of block.lines) {
      const trimmed = line.trim()

      // 빈 줄 무시
      if (!trimmed) continue

      // 프로젝트 헤더 ([프로젝트명])
      const projMatch = trimmed.match(PROJECT_HEADER)
      // 날짜 헤더와 동일 패턴이면 건너뜀
      if (projMatch && !trimmed.match(DATE_HEADER)) {
        currentSection = { project_name: projMatch[1].trim(), items: [] }
        sections.push(currentSection)
        currentItem = null
        continue
      }

      if (!currentSection) continue

      // 불릿 항목
      const bulletMatch = BULLET.exec(line)
      if (bulletMatch) {
        const indent = bulletMatch[1].length
        const content = bulletMatch[3].trim()

        if (indent <= minIndent) {
          // 최상위 항목
          currentItem = { content, children: [] }
          currentSection.items.push(currentItem)
        } else {
          // 하위 항목
          if (currentItem) {
            if (!currentItem.children) currentItem.children = []
            currentItem.children.push({ content })
          } else {
            // 부모 없이 하위 항목이 나온 경우 최상위로 처리
            currentItem = { content, children: [] }
            currentSection.items.push(currentItem)
          }
        }
      }
    }

    return { report_date: dateStr, sections }
  })
}

export function getWeekRange(date: string): { start: string; end: string; label: string } {
  const d = new Date(date)
  const day = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)

  const fmt = (dt: Date) => dt.toISOString().slice(0, 10)
  const label = (dt: Date) => `${dt.getMonth() + 1}월 ${dt.getDate()}일`
  return { start: fmt(mon), end: fmt(fri), label: `${label(mon)} ~ ${label(fri)}` }
}

export function formatWeeklyKakao(reports: Report[]): string {
  if (reports.length === 0) return ''
  const { label } = getWeekRange(reports[0].report_date)
  const header = `[주간업무보고] ${label}`
  const body = reports.map(r => formatForKakao(r)).join('\n\n')
  return header + '\n\n' + body
}

export function formatForKakao(report: Report): string {
  const [, m, d] = report.report_date.split('-')
  const header = `[${parseInt(m)}월 ${parseInt(d)}일 업무보고]`

  if (report.leave_type) {
    return `${header}\n${report.leave_type}`
  }

  const body = report.sections.map(sec => {
    const lines = [`[${sec.project_name}]`]
    for (const item of sec.items) {
      lines.push(`- ${item.content}`)
      for (const child of item.children || []) {
        lines.push(`    - ${child.content}`)
      }
    }
    return lines.join('\n')
  }).join('\n')

  return `${header}\n${body}`
}
