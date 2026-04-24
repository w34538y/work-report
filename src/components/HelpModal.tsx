interface Props {
  onClose: () => void
}

export default function HelpModal({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>사용법 안내</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body help-body">

          <section className="help-section">
            <h3>보고서 작성</h3>
            <ol className="help-steps">
              <li>사이드바에서 <strong>+ 새 보고서</strong> 클릭</li>
              <li>날짜 확인 (누락된 날짜는 날짜 입력창에서 수정 가능)</li>
              <li><strong>[프로젝트명]</strong> 입력 후 업무 항목 작성</li>
              <li><strong>저장 (⌘S / Ctrl+S)</strong></li>
            </ol>
          </section>

          <section className="help-section">
            <h3>키보드 단축키</h3>
            <table className="help-shortcut-table">
              <tbody>
                <tr><td><kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd></td><td>보고서 저장</td></tr>
                <tr><td><kbd>Tab</kbd> (항목에서)</td><td>하위 항목 추가</td></tr>
                <tr><td><kbd>Enter</kbd> (항목에서)</td><td>다음 항목 추가</td></tr>
                <tr><td><kbd>Enter</kbd> (하위항목에서)</td><td>다음 하위 항목 추가</td></tr>
                <tr><td><kbd>Tab</kbd> (마지막 하위항목에서)</td><td>부모의 다음 항목으로 이동</td></tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h3>카카오톡 형식 복사</h3>
            <ul className="help-list">
              <li><strong>일간 복사</strong> — 해당 날짜 보고서를 카카오톡 형식으로 클립보드 복사</li>
              <li><strong>주간보고 복사</strong> — 기간을 선택해 해당 기간 보고서 전체 복사</li>
            </ul>
            <div className="help-code">
{`[4월 21일 업무보고]
[프로젝트명]
- 업무 항목
    - 하위 항목`}
            </div>
          </section>

          <section className="help-section">
            <h3>캘린더 뷰</h3>
            <ul className="help-list">
              <li><span className="help-dot dot-work" /> 초록 점 — 업무보고 있음</li>
              <li><span className="help-dot dot-leave" /> 주황 점 — 휴가 기록 (연차/반차)</li>
              <li><span className="help-dot dot-missing" /> 빨간 점 — 과거 평일 중 기록 없음</li>
            </ul>
          </section>

          <section className="help-section">
            <h3>기존 보고서 이관</h3>
            <p className="help-text"><strong>이관</strong> 버튼 → <strong>텍스트 이관</strong> 탭에서 기존 카카오톡 업무보고 텍스트를 붙여넣으면 자동으로 파싱하여 저장합니다.</p>
            <p className="help-text">연도가 바뀌는 시점(12월 → 1월)은 자동으로 감지합니다.</p>
          </section>

          <section className="help-section">
            <h3>백업 & 복원</h3>
            <ul className="help-list">
              <li><strong>이관</strong> 버튼 → <strong>백업/복원</strong> 탭</li>
              <li><strong>백업 저장</strong> — 전체 보고서를 JSON 파일로 내보내기</li>
              <li><strong>파일 선택</strong> — 백업 파일에서 복원 (기존 데이터와 병합)</li>
            </ul>
          </section>

          <section className="help-section">
            <h3>데이터 저장 위치</h3>
            <p className="help-text">보고서는 SQLite 데이터베이스 파일(<code>reports.db</code>)에 저장됩니다.</p>
            <ul className="help-list">
              <li><strong>로컬 모드 (기본)</strong></li>
              <li style={{ paddingLeft: 8 }}>macOS: <code>~/Library/Application Support/com.workreport.archive/reports.db</code></li>
              <li style={{ paddingLeft: 8 }}>Windows: <code>%APPDATA%\com.workreport.archive\reports.db</code></li>
            </ul>
            <p className="help-text" style={{ marginTop: 10 }}>
              <strong>Google Drive 동기화</strong>: <strong>이관 → 저장 위치</strong> 탭에서 Google Drive for Desktop 폴더를 지정하면 여러 기기 간 자동 동기화됩니다.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
