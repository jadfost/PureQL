// PureQL — Tauri backend entry point
// Handles IPC communication between React frontend and Python core

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
struct HardwareInfo {
    ram_gb: u64,
    cpu_cores: u32,
    gpu: Option<String>,
    os: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProfileResult {
    row_count: usize,
    col_count: usize,
    quality_score: u32,
    issues: Vec<String>,
    duplicate_count: usize,
}

/// Detect hardware specifications
#[tauri::command]
fn detect_hardware() -> HardwareInfo {
    let sys_info = sysinfo::System::new_all();
    
    HardwareInfo {
        ram_gb: sys_info.total_memory() / (1024 * 1024 * 1024),
        cpu_cores: sys_info.cpus().len() as u32,
        gpu: None, // TODO: GPU detection
        os: std::env::consts::OS.to_string(),
    }
}

/// Load and profile a dataset file
#[tauri::command]
async fn load_dataset(path: String) -> Result<String, String> {
    // TODO: Call Python core via PyO3 or subprocess
    // For now, return a placeholder
    Ok(format!("Dataset loaded: {}", path))
}

/// Send a chat message to the AI and get a response
#[tauri::command]
async fn chat_message(message: String) -> Result<String, String> {
    // TODO: Route to Ollama or cloud API via Python core
    Ok(format!("Processing: {}", message))
}

/// Check if Ollama is installed
#[tauri::command]
fn check_ollama() -> bool {
    // Check if ollama binary exists in PATH
    which::which("ollama").is_ok()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_hardware,
            load_dataset,
            chat_message,
            check_ollama,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PureQL");
}
