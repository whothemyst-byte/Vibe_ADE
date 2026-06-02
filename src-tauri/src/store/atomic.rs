use anyhow::{Context, Result};
use std::fs;
use std::path::Path;

/// Writes `bytes` to `path` atomically: ensure parent dir, write a temp file in the
/// same dir, then rename over the target (rename is atomic on the same filesystem).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("create_dir_all")?;
    }
    // Unique temp name so concurrent writes to sibling files that share a stem
    // (e.g. <id>.json and <id>.png) never collide on the same temp path.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = path.with_extension(format!("tmp.{nanos}"));
    fs::write(&tmp, bytes).context("write temp")?;
    fs::rename(&tmp, path).context("rename temp over target")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_overwrites_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("nested").join("file.json");

        write_atomic(&target, b"first").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"first");

        write_atomic(&target, b"second").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"second");

        assert!(!target.with_extension("tmp").exists());
    }
}
