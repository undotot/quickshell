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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandProfile {
    pub id: String,
    pub name: String,
    pub command: String,
    pub shell_id: String,
    pub cwd: String,
    pub pinned: bool,
    pub confirm_before_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub font_size: u16,
    pub scrollback: u32,
    pub theme: String,
    #[serde(default = "default_global_shortcut")]
    pub global_shortcut: String,
}

fn default_global_shortcut() -> String {
    "CommandOrControl+Shift+Space".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            font_size: 14,
            scrollback: 5_000,
            theme: "dark".to_string(),
            global_shortcut: default_global_shortcut(),
        }
    }
}
