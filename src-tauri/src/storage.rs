use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::{
    error::{message, AppResult},
    models::{AppSettings, CommandProfile},
};

const COMMANDS_FILE: &str = "commands.json";
const SETTINGS_FILE: &str = "settings.json";

pub fn load_commands(app: &AppHandle) -> AppResult<Vec<CommandProfile>> {
    let path = app_file(app, COMMANDS_FILE)?;
    if !path.exists() {
        return Ok(default_commands());
    }
    read_json(&path)
}

pub fn save_commands(app: &AppHandle, commands: &[CommandProfile]) -> AppResult<()> {
    validate_commands(commands)?;
    write_json(&app_file(app, COMMANDS_FILE)?, commands)
}

pub fn load_settings(app: &AppHandle) -> AppResult<AppSettings> {
    let path = app_file(app, SETTINGS_FILE)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    read_json(&path)
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> AppResult<()> {
    if !(8..=32).contains(&settings.font_size) {
        return Err(message("终端字号必须在 8 到 32 之间。"));
    }
    if !(500..=100_000).contains(&settings.scrollback) {
        return Err(message("终端滚动缓存必须在 500 到 100000 之间。"));
    }
    if settings.global_shortcut.trim().is_empty() {
        return Err(message("全局快捷键不能为空。"));
    }
    write_json(&app_file(app, SETTINGS_FILE)?, settings)
}

fn app_file(app: &AppHandle, file_name: &str) -> AppResult<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| message(error.to_string()))?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join(file_name))
}

fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> AppResult<T> {
    let content = fs::read_to_string(path)?;
    serde_json::from_str(&content).map_err(|error| message(format!("配置文件格式无效：{error}")))
}

fn write_json<T: serde::Serialize + ?Sized>(path: &PathBuf, value: &T) -> AppResult<()> {
    let content =
        serde_json::to_string_pretty(value).map_err(|error| message(error.to_string()))?;
    let temporary_path = path.with_extension("json.tmp");
    fs::write(&temporary_path, content)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary_path, path)?;
    Ok(())
}

fn validate_commands(commands: &[CommandProfile]) -> AppResult<()> {
    if commands.len() > 500 {
        return Err(message("最多保存 500 条命令。"));
    }
    for command in commands {
        if command.id.trim().is_empty() || command.name.trim().is_empty() {
            return Err(message("命令 ID 和名称不能为空。"));
        }
        if command.name.chars().count() > 200 {
            return Err(message("命令名称不能超过 200 个字符。"));
        }
        if command.command.len() > 16_384 {
            return Err(message("命令内容不能超过 16 KB。"));
        }
    }
    Ok(())
}

fn default_commands() -> Vec<CommandProfile> {
    vec![
        CommandProfile {
            id: "open-powershell".to_string(),
            name: "PowerShell".to_string(),
            command: String::new(),
            shell_id: "powershell".to_string(),
            cwd: String::new(),
            pinned: true,
            confirm_before_run: false,
        },
        CommandProfile {
            id: "git-status".to_string(),
            name: "Git 状态".to_string(),
            command: "git status".to_string(),
            shell_id: "git-bash".to_string(),
            cwd: String::new(),
            pinned: false,
            confirm_before_run: false,
        },
        CommandProfile {
            id: "open-cmd".to_string(),
            name: "CMD".to_string(),
            command: String::new(),
            shell_id: "cmd".to_string(),
            cwd: String::new(),
            pinned: false,
            confirm_before_run: false,
        },
    ]
}
