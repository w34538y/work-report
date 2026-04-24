import { invoke } from '@tauri-apps/api/core'

export type LeaveType = '연차' | '반차(오전)' | '반차(오후)' | '반반차'

export interface Item {
  content: string
  children?: Item[]
}

export interface Section {
  project_name: string
  items: Item[]
}

export interface Report {
  report_date: string
  leave_type?: LeaveType | null
  sections: Section[]
}

export interface ReportSummary {
  report_date: string
  preview: string
  leave_type?: LeaveType | null
}

export interface SearchResult {
  report_date: string
  content: string
  project_name: string
}

export interface Settings {
  storage_mode: 'local' | 'custom'
  custom_db_path?: string | null
}

// Tauri invoke wrapper — same shape as the old window.api
export const api = {
  platform: navigator.userAgent.includes('Mac') ? 'darwin' : 'win32',
  listReports: () => invoke<ReportSummary[]>('list_reports'),
  getReport: (date: string) => invoke<Report | null>('get_report', { date }),
  saveReport: (report: Report) => invoke<void>('save_report', { report }),
  deleteReport: (date: string) => invoke<void>('delete_report', { date }),
  searchReports: (query: string) => invoke<SearchResult[]>('search_reports', { query }),
  getReportsByRange: (start: string, end: string) => invoke<Report[]>('get_reports_by_range', { start, end }),
  clearAllData: () => invoke<{ ok: boolean; count?: number }>('clear_all_data'),
  backupData: () => invoke<{ ok: boolean; count?: number; file_path?: string }>('backup_data'),
  restoreData: () => invoke<{ ok: boolean; count?: number; error?: string }>('restore_data'),
  getSettings: () => invoke<Settings>('get_settings'),
  setStorageMode: (mode: 'local' | 'custom', customPath?: string) => invoke<void>('set_storage_mode', { mode, customPath }),
  pickFolder: () => invoke<string | null>('pick_folder'),
}
