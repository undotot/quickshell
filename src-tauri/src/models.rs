use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellProfile {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub args: Vec<String>,
    pub available: bool,
}

/// 扩展参数：占位符固定为 {{ext}}，由前端在运行时解析。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExtension {
    pub mode: String,
    #[serde(default = "default_extension_start")]
    pub start: i64,
    #[serde(default = "default_extension_step")]
    pub step: i64,
}

/// 命令配置只保留快捷运行所需的最小字段。
/// 旧版本 commands.json 中的 parameters / kind / scp / execution 等字段
/// 会在反序列化时被忽略，并在下一次保存时自然清除。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub command: String,
    pub shell_id: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub extension: Option<CommandExtension>,
}

pub type CommandRuntimeValues =
    std::collections::HashMap<String, std::collections::HashMap<String, String>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionResult {
    pub started: bool,
    pub success: Option<bool>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_global_shortcut")]
    pub global_shortcut: String,
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_global_shortcut() -> String {
    "CommandOrControl+Space".to_string()
}

fn default_extension_start() -> i64 {
    1
}

fn default_extension_step() -> i64 {
    1
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            global_shortcut: default_global_shortcut(),
        }
    }
}
