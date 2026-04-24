import { useState, useEffect } from 'react'
import { api } from './types'
import Sidebar from './components/Sidebar'
import ReportEditor from './components/ReportEditor'
import ImportModal from './components/ImportModal'
import HelpModal from './components/HelpModal'
import UpdateBanner from './components/UpdateBanner'
import './App.css'

const isMac = navigator.userAgent.includes('Mac')

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dates, setDates] = useState<string[]>([]) // 최신순 정렬

  useEffect(() => {
    api.listReports().then(rs => setDates(rs.map(r => r.report_date)))
  }, [refreshKey])

  const refresh = (savedDate?: string) => {
    setRefreshKey(k => k + 1)
    if (savedDate) setSelectedDate(savedDate)
  }

  const handleNew = () => {
    setSelectedDate(new Date().toISOString().slice(0, 10))
  }

  // dates는 최신순(내림차순) → 더 오래된 날짜 = 인덱스 큰 쪽
  const currentIdx = selectedDate ? dates.indexOf(selectedDate) : -1
  const prevDate = currentIdx >= 0 && currentIdx < dates.length - 1 ? dates[currentIdx + 1] : null
  const nextDate = currentIdx > 0 ? dates[currentIdx - 1] : null

  return (
    <div className="app" data-platform={isMac ? 'darwin' : 'win32'}>
      {isMac && <div className="titlebar" />}
      <div className="app-body">
        <Sidebar
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          onNew={handleNew}
          onImport={() => setShowImport(true)}
          onHelp={() => setShowHelp(true)}
          refreshKey={refreshKey}
        />
        <ReportEditor
          date={selectedDate}
          prevDate={prevDate}
          nextDate={nextDate}
          onSaved={(savedDate) => refresh(savedDate)}
          onDelete={() => { setSelectedDate(null); refresh() }}
          onNavigate={setSelectedDate}
        />
      </div>
      <UpdateBanner />
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refresh() }}
        />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}
