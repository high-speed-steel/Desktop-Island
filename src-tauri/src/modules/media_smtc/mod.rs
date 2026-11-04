use crate::modules::{IslandModule, ModuleManifest};
use serde_json::Value;

pub struct MediaSmtcModule {
    manifest: ModuleManifest,
    enabled: bool,
}

impl MediaSmtcModule {
    pub fn new() -> Self {
        let manifest_str = include_str!("manifest.json");
        let manifest: ModuleManifest = serde_json::from_str(manifest_str)
            .expect("無法解析媒體控制模組的 manifest.json");
        let enabled = manifest.enabled_by_default;
        Self { manifest, enabled }
    }
}

impl IslandModule for MediaSmtcModule {
    fn manifest(&self) -> ModuleManifest {
        self.manifest.clone()
    }

    fn init(&mut self, _config: Value, _app_handle: &tauri::AppHandle) -> Result<(), String> {
        self.enabled = true;
        // 初始化 Windows SMTC 監聽器與歌詞快取
        Ok(())
    }

    fn disable(&mut self) -> Result<(), String> {
        self.enabled = false;
        Ok(())
    }

    fn on_config_change(&mut self, _new_config: Value) -> Result<(), String> {
        Ok(())
    }
}
