use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
    #[error("文件操作失败")]
    Io(#[from] std::io::Error),
    #[error("终端操作失败")]
    Pty(#[from] Box<dyn std::error::Error + Send + Sync>),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

pub fn message(error: impl Into<String>) -> AppError {
    AppError::Message(error.into())
}
