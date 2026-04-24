import { useState, useEffect } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { parseReportText } from '../utils/parser'
import type { Report, Settings } from '../types'
import { api } from '../types'

interface Props {
  onClose: () => void
  onImported: () => void
}

type Tab = 'text' | 'backup' | 'storage' | 'manage' | 'about'

export default function ImportModal({ onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>('text')

  // 텍스트 이관 상태
  const [text, setText] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<Report[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [textDone, setTextDone] = useState(false)

  // 백업/관리 상태
  const [statusMsg, setStatusMsg] = useState('')
  const [statusType, setStatusType] = useState<'ok' | 'error' | ''>('')
  const [busy, setBusy] = useState(false)

  // 저장 위치 상태
  const [settings, setSettings] = useState<Settings | null>(null)
  const [storageMsg, setStorageMsg] = useState('')
  const [storageMsgType, setStorageMsgType] = useState<'ok' | 'error' | ''>('')

  // 앱 정보 상태
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; current_version: string; body: string } | null | 'none'>('none')
  const [updateChecking, setUpdateChecking] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (tab === 'storage') {
      api.getSettings().then(setSettings)
    }
    if (tab === 'about' && currentVersion === null) {
      getVersion().then(setCurrentVersion).catch(() => {})
    }
  }, [tab])

  const showStatus = (msg: string, type: 'ok' | 'error') => {
    setStatusMsg(msg)
    setStatusType(type)
  }

  const handleParse = () => {
    if (!text.trim()) return
    const parsed = parseReportText(text, year)
    setPreview(parsed)
  }

  const handleTextImport = async () => {
    if (!preview) return
    setImporting(true)
    for (const report of preview) await api.saveReport(report)
    setImporting(false)
    setTextDone(true)
    onImported()
  }

  const handleBackup = async () => {
    setBusy(true)
    setStatusMsg('')
    const result = await api.backupData()
    setBusy(false)
    if (result.ok) showStatus(`✓ ${result.count}개 보고서가 백업되었습니다.`, 'ok')
    else showStatus('백업이 취소되었습니다.', 'error')
  }

  const handleRestore = async () => {
    setBusy(true)
    setStatusMsg('')
    const result = await api.restoreData()
    setBusy(false)
    if (result.ok) {
      showStatus(`✓ ${result.count}개 보고서가 복원되었습니다.`, 'ok')
      onImported()
    } else if (result.error) {
      showStatus(`오류: ${result.error}`, 'error')
    } else {
      showStatus('복원이 취소되었습니다.', 'error')
    }
  }

  const handleClear = async () => {
    setBusy(true)
    setStatusMsg('')
    const result = await api.clearAllData()
    setBusy(false)
    if (result.ok) {
      showStatus(`✓ ${result.count}개 보고서가 모두 삭제되었습니다.`, 'ok')
      onImported()
    } else {
      showStatus('삭제가 취소되었습니다.', 'error')
    }
  }

  const totalItems = preview?.reduce(
    (sum, r) => sum + r.sections.reduce((s, sec) => s + sec.items.length, 0), 0
  ) ?? 0

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h2>데이터 관리</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'text' ? 'active' : ''}`} onClick={() => setTab('text')}>텍스트 이관</button>
          <button className={`modal-tab ${tab === 'backup' ? 'active' : ''}`} onClick={() => setTab('backup')}>백업 / 복원</button>
          <button className={`modal-tab ${tab === 'storage' ? 'active' : ''}`} onClick={() => setTab('storage')}>저장 위치</button>
          <button className={`modal-tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>데이터 관리</button>
          <button className={`modal-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>앱 정보</button>
        </div>

        {/* ── 텍스트 이관 ── */}
        {tab === 'text' && (
          <>
            {!textDone ? (
              <>
                <div className="modal-body">
                  <div className="import-row">
                    <label>기록 시작 연도</label>
                    <input
                      type="number"
                      className="year-input"
                      value={year}
                      onChange={e => { setYear(parseInt(e.target.value)); setPreview(null) }}
                      min={2000}
                      max={2099}
                    />
                    <span className="year-hint">* 월이 역순으로 줄면 자동으로 +1년</span>
                  </div>
                  <textarea
                    className="import-textarea"
                    placeholder={`[4월 15일 업무보고]\n[프로젝트명]\n- 업무항목\n    - 하위항목\n\n[4월 16일 업무보고]\n...`}
                    value={text}
                    onChange={e => { setText(e.target.value); setPreview(null) }}
                  />
                  {preview && (
                    <div className="preview-box">
                      <div className="preview-summary">
                        <strong style={{ color: totalItems > 0 ? '#2ecc71' : '#e74c3c' }}>
                          {preview.length}개 보고서, 총 {totalItems}개 항목 파싱됨
                        </strong>
                        {totalItems === 0 && (
                          <p className="parse-warn">
                            항목이 0개입니다. 불릿이 <code>- 항목</code> 형식인지,<br />
                            프로젝트명이 <code>[이름]</code> 형식인지 확인하세요.
                          </p>
                        )}
                      </div>
                      <ul className="preview-list">
                        {preview.map(r => (
                          <li key={r.report_date} className="preview-report">
                            <span className="preview-date">{r.report_date}</span>
                            {r.sections.length === 0 ? (
                              <span className="preview-empty">섹션 없음</span>
                            ) : r.sections.map((sec, si) => (
                              <div key={si} className="preview-section">
                                <span className="preview-project">[{sec.project_name}]</span>
                                <span className="preview-count">{sec.items.length}개</span>
                                {sec.items.slice(0, 2).map((item, ii) => (
                                  <div key={ii} className="preview-item">· {item.content}</div>
                                ))}
                                {sec.items.length > 2 && (
                                  <div className="preview-more">+{sec.items.length - 2}개 더...</div>
                                )}
                              </div>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn-primary" onClick={handleParse} disabled={!text.trim()}>
                    {preview ? '다시 파싱' : '파싱 미리보기'}
                  </button>
                  {preview && totalItems > 0 && (
                    <button className="btn-save" onClick={handleTextImport} disabled={importing}>
                      {importing ? '이관 중...' : `${preview.length}개 보고서 이관하기`}
                    </button>
                  )}
                  <button className="btn-secondary" onClick={onClose}>닫기</button>
                </div>
              </>
            ) : (
              <div className="modal-body success">
                <p>✓ 이관이 완료되었습니다!</p>
                <button className="btn-primary" onClick={onClose}>닫기</button>
              </div>
            )}
          </>
        )}

        {/* ── 백업 / 복원 ── */}
        {tab === 'backup' && (
          <>
            <div className="modal-body">
              <div className="manage-section">
                <div className="manage-item">
                  <div>
                    <div className="manage-title">백업 만들기</div>
                    <div className="manage-desc">모든 보고서를 JSON 파일로 저장합니다.</div>
                  </div>
                  <button className="btn-primary" onClick={handleBackup} disabled={busy}>
                    백업 저장
                  </button>
                </div>
                <div className="manage-item">
                  <div>
                    <div className="manage-title">백업에서 복원</div>
                    <div className="manage-desc">JSON 백업 파일을 선택해 보고서를 불러옵니다.<br/>기존 데이터와 병합됩니다.</div>
                  </div>
                  <button className="btn-secondary" onClick={handleRestore} disabled={busy}>
                    파일 선택
                  </button>
                </div>
              </div>
              {statusMsg && tab === 'backup' && (
                <div className={`status-msg ${statusType}`}>{statusMsg}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose}>닫기</button>
            </div>
          </>
        )}

        {/* ── 저장 위치 ── */}
        {tab === 'storage' && (
          <>
            <div className="modal-body">
              <div className="manage-section">
                <div className={`manage-item ${settings?.storage_mode === 'local' ? 'storage-active' : ''}`}>
                  <div>
                    <div className="manage-title">로컬 저장 (기본)</div>
                    <div className="manage-desc">앱 데이터 폴더에 저장됩니다.<br/>이 기기에서만 사용됩니다.</div>
                  </div>
                  <button
                    className={settings?.storage_mode === 'local' ? 'btn-save' : 'btn-secondary'}
                    disabled={busy || settings?.storage_mode === 'local'}
                    onClick={async () => {
                      setBusy(true); setStorageMsg('')
                      try {
                        await api.setStorageMode('local')
                        const s = await api.getSettings()
                        setSettings(s)
                        setStorageMsg('✓ 로컬 저장으로 변경되었습니다.')
                        setStorageMsgType('ok')
                      } catch (e) {
                        setStorageMsg(`오류: ${e}`)
                        setStorageMsgType('error')
                      }
                      setBusy(false)
                    }}
                  >
                    {settings?.storage_mode === 'local' ? '사용 중' : '선택'}
                  </button>
                </div>

                <div className={`manage-item ${settings?.storage_mode === 'custom' ? 'storage-active' : ''}`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="manage-title">Google Drive / 폴더 지정</div>
                    <div className="manage-desc">
                      Google Drive for Desktop 동기화 폴더를 지정하면<br/>자동으로 클라우드에 동기화됩니다.
                    </div>
                    {settings?.storage_mode === 'custom' && settings.custom_db_path && (
                      <div className="storage-path">{settings.custom_db_path}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn-primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true); setStorageMsg('')
                        try {
                          const folder = await api.pickFolder()
                          if (!folder) { setBusy(false); return }
                          const dbPath = folder + '/reports.db'
                          await api.setStorageMode('custom', dbPath)
                          const s = await api.getSettings()
                          setSettings(s)
                          setStorageMsg('✓ 폴더가 지정되었습니다. 이제 해당 폴더에 저장됩니다.')
                          setStorageMsgType('ok')
                        } catch (e) {
                          setStorageMsg(`오류: ${e}`)
                          setStorageMsgType('error')
                        }
                        setBusy(false)
                      }}
                    >
                      폴더 선택
                    </button>
                    {settings?.storage_mode === 'custom' && (
                      <span className="storage-badge">사용 중</span>
                    )}
                  </div>
                </div>
              </div>
              {storageMsg && (
                <div className={`status-msg ${storageMsgType}`}>{storageMsg}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose}>닫기</button>
            </div>
          </>
        )}

        {/* ── 데이터 관리 ── */}
        {tab === 'manage' && (
          <>
            <div className="modal-body">
              <div className="manage-section">
                <div className="manage-item danger-item">
                  <div>
                    <div className="manage-title danger-title">전체 삭제</div>
                    <div className="manage-desc">모든 보고서를 영구 삭제합니다.<br/>삭제 전 백업을 권장합니다.</div>
                  </div>
                  <button className="btn-danger" onClick={handleClear} disabled={busy}>
                    전체 삭제
                  </button>
                </div>
              </div>
              {statusMsg && tab === 'manage' && (
                <div className={`status-msg ${statusType}`}>{statusMsg}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose}>닫기</button>
            </div>
          </>
        )}
        {/* ── 앱 정보 ── */}
        {tab === 'about' && (
          <>
            <div className="modal-body">
              <div className="manage-section">
                <div className="about-row">
                  <span className="about-label">현재 버전</span>
                  <span className="about-value">v{currentVersion ?? '...'}</span>
                </div>

                <div className="about-update-area">
                  {updateInfo === 'none' && (
                    <button
                      className="btn-primary"
                      disabled={updateChecking}
                      onClick={async () => {
                        setUpdateChecking(true)
                        try {
                          const info = await api.checkUpdate()
                          setUpdateInfo(info)
                        } catch {
                          setUpdateInfo(null)
                        }
                        setUpdateChecking(false)
                      }}
                    >
                      {updateChecking ? '확인 중...' : '업데이트 확인'}
                    </button>
                  )}

                  {updateInfo === null && (
                    <div className="about-update-status ok">최신 버전입니다.</div>
                  )}

                  {updateInfo && updateInfo !== 'none' && (
                    <div className="about-update-available">
                      <div className="about-update-badge">새 버전 v{updateInfo.version} 사용 가능</div>
                      <button
                        className="btn-save"
                        disabled={installing}
                        onClick={async () => {
                          setInstalling(true)
                          try { await api.installUpdate() } catch { setInstalling(false) }
                        }}
                      >
                        {installing ? '설치 중...' : '지금 업데이트'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose}>닫기</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
