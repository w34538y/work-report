use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Item {
    pub content: String,
    pub children: Option<Vec<Item>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Section {
    pub project_name: String,
    pub items: Vec<Item>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Report {
    pub report_date: String,
    pub leave_type: Option<String>,
    pub sections: Vec<Section>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ReportSummary {
    pub report_date: String,
    pub preview: String,
    pub leave_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub report_date: String,
    pub content: String,
    pub project_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BackupFile {
    pub version: u32,
    pub exported_at: String,
    pub count: usize,
    pub reports: Vec<Report>,
}

#[derive(Serialize)]
pub struct ClearResult {
    pub ok: bool,
    pub count: Option<usize>,
}

#[derive(Serialize)]
pub struct BackupResult {
    pub ok: bool,
    pub count: Option<usize>,
    pub file_path: Option<String>,
}

#[derive(Serialize)]
pub struct RestoreResult {
    pub ok: bool,
    pub count: Option<usize>,
    pub error: Option<String>,
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn reports_dir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap().join("reports");
    fs::create_dir_all(&dir).ok();
    dir
}

fn report_path(dir: &PathBuf, date: &str) -> PathBuf {
    dir.join(format!("{}.json", date))
}

fn is_report_file(name: &str) -> bool {
    if name.len() != 15 { return false; }
    &name[4..5] == "-" && &name[7..8] == "-" && name.ends_with(".json")
        && name[..4].chars().all(|c| c.is_ascii_digit())
        && name[5..7].chars().all(|c| c.is_ascii_digit())
        && name[8..10].chars().all(|c| c.is_ascii_digit())
}

fn list_files(dir: &PathBuf) -> Vec<String> {
    let mut files: Vec<String> = fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| {
                let name = e.ok()?.file_name().to_string_lossy().to_string();
                if is_report_file(&name) { Some(name) } else { None }
            })
            .collect()
        })
        .unwrap_or_default();
    files.sort();
    files
}

fn simple_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let mut days = secs / 86400;
    let mut year = 1970u64;
    loop {
        let dy = if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 { 366 } else { 365 };
        if days < dy { break; }
        days -= dy;
        year += 1;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let months = if leap { [31u64,29,31,30,31,30,31,31,30,31,30,31] } else { [31u64,28,31,30,31,30,31,31,30,31,30,31] };
    let mut month = 1u64;
    for dm in months { if days < dm { break; } days -= dm; month += 1; }
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, days + 1, h, m, s)
}

// ── Commands (in a module to avoid Rust 1.79+ macro namespace conflicts) ──

mod cmd {
    use super::*;
    use tauri_plugin_dialog::DialogExt;

    #[tauri::command]
    pub fn list_reports(app: AppHandle) -> Vec<ReportSummary> {
        let dir = reports_dir(&app);
        let mut files = list_files(&dir);
        files.reverse();
        files.iter().map(|f| {
            let date = f.trim_end_matches(".json").to_string();
            match fs::read_to_string(dir.join(f)).ok().and_then(|s| serde_json::from_str::<Report>(&s).ok()) {
                Some(r) => {
                    let preview = if let Some(lt) = &r.leave_type {
                        lt.clone()
                    } else {
                        r.sections.iter()
                            .flat_map(|s| s.items.iter().map(|i| i.content.clone()))
                            .take(3).collect::<Vec<_>>().join(" · ")
                    };
                    ReportSummary { report_date: date, preview, leave_type: r.leave_type }
                }
                None => ReportSummary { report_date: date, preview: String::new(), leave_type: None },
            }
        }).collect()
    }

    #[tauri::command]
    pub fn get_report(app: AppHandle, date: String) -> Option<Report> {
        let path = report_path(&reports_dir(&app), &date);
        fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok())
    }

    #[tauri::command]
    pub fn save_report(app: AppHandle, report: Report) -> Result<(), String> {
        let path = report_path(&reports_dir(&app), &report.report_date);
        let json = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn delete_report(app: AppHandle, date: String) -> Result<(), String> {
        let path = report_path(&reports_dir(&app), &date);
        if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
        Ok(())
    }

    #[tauri::command]
    pub fn get_reports_by_range(app: AppHandle, start: String, end: String) -> Vec<Report> {
        let dir = reports_dir(&app);
        let files: Vec<String> = list_files(&dir).into_iter().filter(|f| {
            let d = f.trim_end_matches(".json").to_string();
            d >= start && d <= end
        }).collect();
        files.iter().filter_map(|f| {
            fs::read_to_string(dir.join(f)).ok().and_then(|s| serde_json::from_str(&s).ok())
        }).collect()
    }

    #[tauri::command]
    pub fn search_reports(app: AppHandle, query: String) -> Vec<SearchResult> {
        let dir = reports_dir(&app);
        let q = query.to_lowercase();
        let mut files = list_files(&dir);
        files.reverse();
        let mut results = Vec::new();
        for f in &files {
            if results.len() >= 100 { break; }
            if let Some(report) = fs::read_to_string(dir.join(f)).ok()
                .and_then(|s| serde_json::from_str::<Report>(&s).ok())
            {
                for sec in &report.sections {
                    for item in &sec.items {
                        if item.content.to_lowercase().contains(&q) {
                            results.push(SearchResult {
                                report_date: report.report_date.clone(),
                                content: item.content.clone(),
                                project_name: sec.project_name.clone(),
                            });
                        }
                        for child in item.children.iter().flatten() {
                            if child.content.to_lowercase().contains(&q) {
                                results.push(SearchResult {
                                    report_date: report.report_date.clone(),
                                    content: child.content.clone(),
                                    project_name: sec.project_name.clone(),
                                });
                            }
                        }
                    }
                }
            }
        }
        results
    }

    #[tauri::command]
    pub async fn clear_all_data(app: AppHandle) -> ClearResult {
        let confirmed = app.dialog()
            .message("모든 보고서를 영구 삭제합니다. 계속하시겠습니까?")
            .title("전체 삭제 확인")
            .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
            .blocking_show();
        if !confirmed { return ClearResult { ok: false, count: None }; }

        let dir = reports_dir(&app);
        let paths: Vec<_> = fs::read_dir(&dir).map(|rd| {
            rd.filter_map(|e| {
                let entry = e.ok()?;
                let name = entry.file_name().to_string_lossy().to_string();
                if is_report_file(&name) { Some(entry.path()) } else { None }
            }).collect()
        }).unwrap_or_default();
        let count = paths.len();
        for p in paths { fs::remove_file(p).ok(); }
        ClearResult { ok: true, count: Some(count) }
    }

    #[tauri::command]
    pub async fn backup_data(app: AppHandle) -> BackupResult {
        let file_path = app.dialog().file()
            .add_filter("JSON", &["json"])
            .set_file_name("work_report_backup.json")
            .blocking_save_file();
        let Some(path) = file_path else {
            return BackupResult { ok: false, count: None, file_path: None };
        };

        let dir = reports_dir(&app);
        let files = list_files(&dir);
        let reports: Vec<Report> = files.iter().filter_map(|f| {
            fs::read_to_string(dir.join(f)).ok().and_then(|s| serde_json::from_str(&s).ok())
        }).collect();
        let count = reports.len();
        let backup = BackupFile { version: 1, exported_at: simple_now(), count, reports };
        match serde_json::to_string_pretty(&backup) {
            Ok(json) => {
                let path_str = path.to_string();
                match fs::write(&path_str, json) {
                    Ok(_) => BackupResult { ok: true, count: Some(count), file_path: Some(path_str) },
                    Err(_) => BackupResult { ok: false, count: None, file_path: None },
                }
            }
            Err(_) => BackupResult { ok: false, count: None, file_path: None },
        }
    }

    #[tauri::command]
    pub async fn restore_data(app: AppHandle) -> RestoreResult {
        let file_path = app.dialog().file()
            .add_filter("JSON", &["json"])
            .blocking_pick_file();
        let Some(path) = file_path else {
            return RestoreResult { ok: false, count: None, error: None };
        };

        let path_str = path.to_string();
        let content = match fs::read_to_string(&path_str) {
            Ok(s) => s,
            Err(e) => return RestoreResult { ok: false, count: None, error: Some(e.to_string()) },
        };

        let reports: Vec<Report> = if let Ok(b) = serde_json::from_str::<BackupFile>(&content) {
            b.reports
        } else if let Ok(r) = serde_json::from_str::<Vec<Report>>(&content) {
            r
        } else {
            return RestoreResult { ok: false, count: None, error: Some("올바른 백업 파일이 아닙니다.".to_string()) };
        };

        let count = reports.len();
        let dir = reports_dir(&app);
        for r in reports {
            let p = report_path(&dir, &r.report_date);
            if let Ok(json) = serde_json::to_string_pretty(&r) { fs::write(p, json).ok(); }
        }
        RestoreResult { ok: true, count: Some(count), error: None }
    }
}

// ── Entry point ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            cmd::list_reports,
            cmd::get_report,
            cmd::save_report,
            cmd::delete_report,
            cmd::get_reports_by_range,
            cmd::search_reports,
            cmd::clear_all_data,
            cmd::backup_data,
            cmd::restore_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
