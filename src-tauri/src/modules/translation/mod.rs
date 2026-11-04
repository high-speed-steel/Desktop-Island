use crate::modules::{IslandModule, ModuleManifest};
use serde_json::Value;

pub struct TranslationModule {
    manifest: ModuleManifest,
    enabled: bool,
}

impl TranslationModule {
    pub fn new() -> Self {
        let manifest_str = include_str!("manifest.json");
        let manifest: ModuleManifest = serde_json::from_str(manifest_str)
            .expect("無法解析翻譯模組的 manifest.json");
        let enabled = manifest.enabled_by_default;
        Self { manifest, enabled }
    }
}

impl IslandModule for TranslationModule {
    fn manifest(&self) -> ModuleManifest {
        self.manifest.clone()
    }

    fn init(&mut self, _config: Value, _app_handle: &tauri::AppHandle) -> Result<(), String> {
        self.enabled = true;
        // 初始化翻譯快捷鍵與獨立視窗通訊
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
