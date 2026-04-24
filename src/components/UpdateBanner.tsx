import { useState, useEffect } from 'react'
import { api } from '../types'

export default function UpdateBanner() {
  const [update, setUpdate] = useState<{ version: string; current_version: string; body: string } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 시작 후 3초 뒤 백그라운드에서 업데이트 확인
    const timer = setTimeout(() => {
      api.checkUpdate().then(setUpdate).catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!update || dismissed) return null

  const handleInstall = async () => {
    setInstalling(true)
    setError(null)
    try {
      await api.installUpdate()
    } catch (e) {
      setInstalling(false)
      setError(String(e))
    }
  }

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <span className="update-icon">🆕</span>
        <div className="update-text">
          <span className="update-title">새 버전 사용 가능</span>
          <span className="update-version">v{update.current_version} → v{update.version}</span>
        </div>
      </div>
      <div className="update-actions">
        {error && <span className="update-error">{error}</span>}
        <button
          className="btn-update-install"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? '설치 중...' : '지금 업데이트'}
        </button>
        <button className="btn-update-dismiss" onClick={() => setDismissed(true)}>✕</button>
      </div>
    </div>
  )
}
