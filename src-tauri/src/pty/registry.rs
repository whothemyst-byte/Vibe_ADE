use parking_lot::Mutex;
use std::collections::HashMap;
use tokio::sync::mpsc;

/// Commands the registry's owner can send to a single PTY actor.
#[derive(Debug)]
pub enum PtyCommand {
    Write(Vec<u8>),
    Resize { rows: u16, cols: u16 },
    Kill,
}

/// Handle to one running PTY actor, stored in the registry.
pub struct PtyHandle {
    pub cmd_tx: mpsc::Sender<PtyCommand>,
}

/// Thread-safe map of terminal id -> actor handle.
#[derive(Default)]
pub struct PtyRegistry {
    inner: Mutex<HashMap<String, PtyHandle>>,
}

impl PtyRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, id: String, handle: PtyHandle) {
        self.inner.lock().insert(id, handle);
    }

    /// Removes and returns the handle if present (used by kill and respawn).
    pub fn remove(&self, id: &str) -> Option<PtyHandle> {
        self.inner.lock().remove(id)
    }

    /// Clones the command sender for an id if present.
    pub fn sender(&self, id: &str) -> Option<mpsc::Sender<PtyCommand>> {
        self.inner.lock().get(id).map(|h| h.cmd_tx.clone())
    }

    pub fn len(&self) -> usize {
        self.inner.lock().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_handle() -> PtyHandle {
        let (cmd_tx, _rx) = mpsc::channel::<PtyCommand>(8);
        PtyHandle { cmd_tx }
    }

    #[test]
    fn insert_remove_roundtrip() {
        let reg = PtyRegistry::new();
        assert_eq!(reg.len(), 0);
        assert!(reg.sender("a").is_none());

        reg.insert("a".into(), dummy_handle());
        assert_eq!(reg.len(), 1);
        assert!(reg.sender("a").is_some());

        let removed = reg.remove("a");
        assert!(removed.is_some());
        assert_eq!(reg.len(), 0);
        assert!(reg.sender("a").is_none());
    }
}
