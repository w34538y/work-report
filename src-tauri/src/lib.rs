use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

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

#[derive(Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub body: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub storage_mode: String,   // "local" | "custom"
    pub custom_db_path: Option<String>,
}

// ── App state ──────────────────────────────────────────────────────────────

pub struct DbPath(pub Mutex<PathBuf>);

// ── Helpers ────────────────────────────────────────────────────────────────

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap()
}

fn settings_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("settings.json")
}

fn load_settings(app: &AppHandle) -> Settings {
    fs::read_to_string(settings_path(app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Settings { storage_mode: "local".to_string(), custom_db_path: None })
}

fn save_settings(app: &AppHandle, settings: &Settings) {
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        fs::write(settings_path(app), json).ok();
    }
}

fn resolve_db_path(app: &AppHandle) -> PathBuf {
    let settings = load_settings(app);
    if settings.storage_mode == "custom" {
        if let Some(p) = settings.custom_db_path {
            let path = PathBuf::from(&p);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).ok();
            }
            return path;
        }
    }
    let dir = app_data_dir(app);
    fs::create_dir_all(&dir).ok();
    dir.join("reports.db")
}

fn open_db(db_path: &PathBuf) -> Result<rusqlite::Connection, String> {
    rusqlite::Connection::open(db_path).map_err(|e| e.to_string())
}

fn init_db(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS reports (
            report_date TEXT PRIMARY KEY,
            leave_type  TEXT,
            sections    TEXT NOT NULL DEFAULT '[]'
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS reports_fts
            USING fts5(report_date UNINDEXED, sections, content=reports, content_rowid=rowid);
        CREATE TRIGGER IF NOT EXISTS reports_ai AFTER INSERT ON reports BEGIN
            INSERT INTO reports_fts(rowid, report_date, sections) VALUES (new.rowid, new.report_date, new.sections);
        END;
        CREATE TRIGGER IF NOT EXISTS reports_ad AFTER DELETE ON reports BEGIN
            INSERT INTO reports_fts(reports_fts, rowid, report_date, sections) VALUES ('delete', old.rowid, old.report_date, old.sections);
        END;
        CREATE TRIGGER IF NOT EXISTS reports_au AFTER UPDATE ON reports BEGIN
            INSERT INTO reports_fts(reports_fts, rowid, report_date, sections) VALUES ('delete', old.rowid, old.report_date, old.sections);
            INSERT INTO reports_fts(rowid, report_date, sections) VALUES (new.rowid, new.report_date, new.sections);
        END;",
    ).map_err(|e| e.to_string())
}

fn migrate_json_if_needed(app: &AppHandle, conn: &rusqlite::Connection) {
    let json_dir = app_data_dir(app).join("reports");
    if !json_dir.exists() { return; }

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM reports", [], |r| r.get(0))
        .unwrap_or(0);
    if count > 0 { return; }

    let entries = match fs::read_dir(&json_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut migrated = 0usize;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_json_report(&name) { continue; }
        let content = match fs::read_to_string(entry.path()) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let report: Report = match serde_json::from_str(&content) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let sections_json = serde_json::to_string(&report.sections).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR IGNORE INTO reports (report_date, leave_type, sections) VALUES (?1, ?2, ?3)",
            rusqlite::params![report.report_date, report.leave_type, sections_json],
        ).ok();
        migrated += 1;
    }

    if migrated > 0 {
        eprintln!("[migration] JSON → SQLite: {} reports migrated", migrated);
    }
}

fn is_json_report(name: &str) -> bool {
    if name.len() != 15 { return false; }
    &name[4..5] == "-" && &name[7..8] == "-" && name.ends_with(".json")
        && name[..4].chars().all(|c| c.is_ascii_digit())
        && name[5..7].chars().all(|c| c.is_ascii_digit())
        && name[8..10].chars().all(|c| c.is_ascii_digit())
}

fn report_from_row(date: String, leave_type: Option<String>, sections_json: String) -> Report {
    let sections: Vec<Section> = serde_json::from_str(&sections_json).unwrap_or_default();
    Report { report_date: date, leave_type, sections }
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

// ── Commands ───────────────────────────────────────────────────────────────

mod cmd {
    use super::*;
    use tauri_plugin_dialog::DialogExt;

    fn conn(db_path: &State<DbPath>) -> Result<rusqlite::Connection, String> {
        let path = db_path.0.lock().unwrap().clone();
        open_db(&path)
    }

    #[tauri::command]
    pub fn list_reports(db_path: State<DbPath>) -> Vec<ReportSummary> {
        let Ok(c) = conn(&db_path) else { return vec![] };
        let mut stmt = match c.prepare(
            "SELECT report_date, leave_type, sections FROM reports ORDER BY report_date DESC"
        ) { Ok(s) => s, Err(_) => return vec![] };

        stmt.query_map([], |row| {
            let date: String = row.get(0)?;
            let leave_type: Option<String> = row.get(1)?;
            let sections_json: String = row.get(2)?;
            Ok((date, leave_type, sections_json))
        })
        .map(|rows| rows.flatten().map(|(date, leave_type, sections_json)| {
            let preview = if let Some(ref lt) = leave_type {
                lt.clone()
            } else {
                let sections: Vec<Section> = serde_json::from_str(&sections_json).unwrap_or_default();
                sections.iter()
                    .flat_map(|s| s.items.iter().map(|i| i.content.clone()))
                    .take(3).collect::<Vec<_>>().join(" · ")
            };
            ReportSummary { report_date: date, preview, leave_type }
        }).collect())
        .unwrap_or_default()
    }

    #[tauri::command]
    pub fn get_report(db_path: State<DbPath>, date: String) -> Option<Report> {
        let c = conn(&db_path).ok()?;
        c.query_row(
            "SELECT report_date, leave_type, sections FROM reports WHERE report_date = ?1",
            [&date],
            |row| Ok((row.get::<_,String>(0)?, row.get::<_,Option<String>>(1)?, row.get::<_,String>(2)?)),
        ).ok().map(|(d, lt, sj)| report_from_row(d, lt, sj))
    }

    #[tauri::command]
    pub fn save_report(db_path: State<DbPath>, report: Report) -> Result<(), String> {
        let c = conn(&db_path)?;
        let sections_json = serde_json::to_string(&report.sections).map_err(|e| e.to_string())?;
        c.execute(
            "INSERT OR REPLACE INTO reports (report_date, leave_type, sections) VALUES (?1, ?2, ?3)",
            rusqlite::params![report.report_date, report.leave_type, sections_json],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn delete_report(db_path: State<DbPath>, date: String) -> Result<(), String> {
        let c = conn(&db_path)?;
        c.execute("DELETE FROM reports WHERE report_date = ?1", [&date])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn get_reports_by_range(db_path: State<DbPath>, start: String, end: String) -> Vec<Report> {
        let Ok(c) = conn(&db_path) else { return vec![] };
        let mut stmt = match c.prepare(
            "SELECT report_date, leave_type, sections FROM reports WHERE report_date >= ?1 AND report_date <= ?2 ORDER BY report_date"
        ) { Ok(s) => s, Err(_) => return vec![] };

        stmt.query_map([&start, &end], |row| {
            Ok((row.get::<_,String>(0)?, row.get::<_,Option<String>>(1)?, row.get::<_,String>(2)?))
        })
        .map(|rows| rows.flatten().map(|(d, lt, sj)| report_from_row(d, lt, sj)).collect())
        .unwrap_or_default()
    }

    #[tauri::command]
    pub fn search_reports(db_path: State<DbPath>, query: String) -> Vec<SearchResult> {
        let Ok(c) = conn(&db_path) else { return vec![] };
        let q_lower = query.to_lowercase();

        let mut stmt = match c.prepare(
            "SELECT report_date, leave_type, sections FROM reports ORDER BY report_date DESC LIMIT 500"
        ) { Ok(s) => s, Err(_) => return vec![] };

        let mut results = Vec::new();
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_,String>(0)?, row.get::<_,Option<String>>(1)?, row.get::<_,String>(2)?))
        });
        if let Ok(rows) = rows {
            for row in rows.flatten() {
                if results.len() >= 100 { break; }
                let (date, _, sections_json) = row;
                let sections: Vec<Section> = serde_json::from_str(&sections_json).unwrap_or_default();
                for sec in &sections {
                    for item in &sec.items {
                        if item.content.to_lowercase().contains(&q_lower) {
                            results.push(SearchResult {
                                report_date: date.clone(),
                                content: item.content.clone(),
                                project_name: sec.project_name.clone(),
                            });
                        }
                        for child in item.children.iter().flatten() {
                            if child.content.to_lowercase().contains(&q_lower) {
                                results.push(SearchResult {
                                    report_date: date.clone(),
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
    pub async fn clear_all_data(app: AppHandle, db_path: State<'_, DbPath>) -> Result<ClearResult, String> {
        let confirmed = app.dialog()
            .message("모든 보고서를 영구 삭제합니다. 계속하시겠습니까?")
            .title("전체 삭제 확인")
            .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
            .blocking_show();
        if !confirmed { return Ok(ClearResult { ok: false, count: None }); }

        let c = conn(&db_path).map_err(|e| e)?;
        let count: i64 = c.query_row("SELECT COUNT(*) FROM reports", [], |r| r.get(0)).unwrap_or(0);
        c.execute_batch("DELETE FROM reports; INSERT INTO reports_fts(reports_fts) VALUES('rebuild');")
            .map_err(|e| e.to_string())?;
        Ok(ClearResult { ok: true, count: Some(count as usize) })
    }

    #[tauri::command]
    pub async fn backup_data(app: AppHandle, db_path: State<'_, DbPath>) -> Result<BackupResult, String> {
        let file_path = app.dialog().file()
            .add_filter("JSON", &["json"])
            .set_file_name("work_report_backup.json")
            .blocking_save_file();
        let Some(path) = file_path else {
            return Ok(BackupResult { ok: false, count: None, file_path: None });
        };

        let c = conn(&db_path).map_err(|e| e)?;
        let mut stmt = c.prepare("SELECT report_date, leave_type, sections FROM reports ORDER BY report_date")
            .map_err(|e| e.to_string())?;
        let reports: Vec<Report> = stmt.query_map([], |row| {
            Ok((row.get::<_,String>(0)?, row.get::<_,Option<String>>(1)?, row.get::<_,String>(2)?))
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|(d, lt, sj)| report_from_row(d, lt, sj))
        .collect();

        let count = reports.len();
        let backup = BackupFile { version: 1, exported_at: simple_now(), count, reports };
        let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
        let path_str = path.to_string();
        fs::write(&path_str, json).map_err(|e| e.to_string())?;
        Ok(BackupResult { ok: true, count: Some(count), file_path: Some(path_str) })
    }

    #[tauri::command]
    pub async fn restore_data(app: AppHandle, db_path: State<'_, DbPath>) -> Result<RestoreResult, String> {
        let file_path = app.dialog().file()
            .add_filter("JSON", &["json"])
            .blocking_pick_file();
        let Some(path) = file_path else {
            return Ok(RestoreResult { ok: false, count: None, error: None });
        };

        let content = match fs::read_to_string(path.to_string()) {
            Ok(s) => s,
            Err(e) => return Ok(RestoreResult { ok: false, count: None, error: Some(e.to_string()) }),
        };

        let reports: Vec<Report> = if let Ok(b) = serde_json::from_str::<BackupFile>(&content) {
            b.reports
        } else if let Ok(r) = serde_json::from_str::<Vec<Report>>(&content) {
            r
        } else {
            return Ok(RestoreResult { ok: false, count: None, error: Some("올바른 백업 파일이 아닙니다.".to_string()) });
        };

        let c = conn(&db_path).map_err(|e| e)?;
        let count = reports.len();
        for r in reports {
            let sj = serde_json::to_string(&r.sections).unwrap_or_else(|_| "[]".to_string());
            c.execute(
                "INSERT OR REPLACE INTO reports (report_date, leave_type, sections) VALUES (?1, ?2, ?3)",
                rusqlite::params![r.report_date, r.leave_type, sj],
            ).ok();
        }
        Ok(RestoreResult { ok: true, count: Some(count), error: None })
    }

    #[tauri::command]
    pub fn get_settings(app: AppHandle) -> Settings {
        load_settings(&app)
    }

    #[tauri::command]
    pub fn pick_folder(app: AppHandle) -> Option<String> {
        app.dialog().file().blocking_pick_folder().map(|p| p.to_string())
    }

    #[tauri::command]
    pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
        use tauri_plugin_updater::UpdaterExt;
        let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
        match updater.check().await {
            Ok(Some(u)) => Ok(Some(UpdateInfo {
                version: u.version.clone(),
                current_version: u.current_version.clone(),
                body: u.body.clone().unwrap_or_default(),
            })),
            Ok(None) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    #[tauri::command]
    pub async fn install_update(app: AppHandle) -> Result<(), String> {
        use tauri_plugin_updater::UpdaterExt;
        let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
        let update = updater.check().await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "업데이트를 찾을 수 없습니다.".to_string())?;
        update.download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
        Ok(())
    }

    #[tauri::command]
    pub async fn set_storage_mode(
        app: AppHandle,
        db_path: State<'_, DbPath>,
        mode: String,
        custom_path: Option<String>,
    ) -> Result<(), String> {
        let mut settings = load_settings(&app);
        settings.storage_mode = mode.clone();
        settings.custom_db_path = custom_path;
        save_settings(&app, &settings);

        let new_path = resolve_db_path(&app);
        let c = open_db(&new_path)?;
        init_db(&c)?;
        migrate_json_if_needed(&app, &c);
        *db_path.0.lock().unwrap() = new_path;
        Ok(())
    }
}

// ── Entry point ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let db_path = resolve_db_path(app.handle());
            let conn = open_db(&db_path).expect("DB open failed");
            init_db(&conn).expect("DB init failed");
            migrate_json_if_needed(app.handle(), &conn);
            app.manage(DbPath(Mutex::new(db_path)));
            Ok(())
        })
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
            cmd::get_settings,
            cmd::set_storage_mode,
            cmd::pick_folder,
            cmd::check_update,
            cmd::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
