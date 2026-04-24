import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ReportEditor from './components/ReportEditor'
import ImportModal from './components/ImportModal'
import HelpModal from './components/HelpModal'
import UpdateBanner from './components/UpdateBanner'
import './App.css'

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = (savedDate?: string) => {
    setRefreshKey(k => k + 1)
    if (savedDate) setSelectedDate(savedDate)
  }

  const handleNew = () => {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10)
    setSelectedDate(dateStr)
  }

  return (
    <div className="app">
      <UpdateBanner />
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
        onSaved={(savedDate) => refresh(savedDate)}
        onDelete={() => { setSelectedDate(null); refresh() }}
      />
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
