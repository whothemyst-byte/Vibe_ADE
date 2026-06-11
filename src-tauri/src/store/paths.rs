use std::path::{Path, PathBuf};

pub fn index_path(base: &Path) -> PathBuf {
    base.join("index.json")
}
pub fn walls_dir(base: &Path) -> PathBuf {
    base.join("walls")
}
pub fn wall_path(base: &Path, id: &str) -> PathBuf {
    walls_dir(base).join(format!("{id}.json"))
}
pub fn thumb_path(base: &Path, id: &str) -> PathBuf {
    walls_dir(base).join(format!("{id}.png"))
}
pub fn backgrounds_dir(base: &Path) -> PathBuf {
    base.join("backgrounds")
}
pub fn presets_path(base: &Path) -> PathBuf {
    base.join("presets.json")
}
pub fn tasks_path(base: &Path) -> PathBuf {
    base.join("tasks.json")
}
pub fn settings_path(base: &Path) -> PathBuf {
    base.join("settings.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn builds_expected_subpaths() {
        let base = Path::new("/data");
        assert!(index_path(base).ends_with("index.json"));
        assert_eq!(wall_path(base, "abc").file_name().unwrap(), "abc.json");
        assert_eq!(
            wall_path(base, "abc").parent().unwrap().file_name().unwrap(),
            "walls"
        );
        assert_eq!(thumb_path(base, "abc").file_name().unwrap(), "abc.png");
        assert_eq!(
            thumb_path(base, "abc").parent().unwrap().file_name().unwrap(),
            "walls"
        );
        assert!(backgrounds_dir(base).ends_with("backgrounds"));
    }
}
