// Recolors the native Windows caption/border to match the app's current theme.
// See docs/superpowers/specs/2026-07-01-themed-titlebar-design.md.

#[cfg(windows)]
mod imp {
    /// Parses a `#rrggbb` (or `rrggbb`) string into a Win32 `COLORREF` (`0x00bbggrr`).
    pub fn parse_colorref(hex: &str) -> Result<u32, String> {
        let hex = hex.trim_start_matches('#');
        if hex.len() != 6 {
            return Err(format!("expected #rrggbb, got \"{hex}\""));
        }
        let r = u8::from_str_radix(&hex[0..2], 16).map_err(|e| e.to_string())?;
        let g = u8::from_str_radix(&hex[2..4], 16).map_err(|e| e.to_string())?;
        let b = u8::from_str_radix(&hex[4..6], 16).map_err(|e| e.to_string())?;
        Ok(u32::from_le_bytes([r, g, b, 0]))
    }

    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };

    fn set_attr(hwnd: HWND, attr: windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE, value: u32) {
        let value = COLORREF(value);
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                attr,
                &value as *const COLORREF as *const core::ffi::c_void,
                std::mem::size_of::<COLORREF>() as u32,
            );
        }
    }

    /// Best-effort: each attribute is set independently, since older Windows 11
    /// builds support the border color but not caption/text color.
    pub fn set(hwnd: HWND, bg: &str, text: &str, border: &str) -> Result<(), String> {
        set_attr(hwnd, DWMWA_CAPTION_COLOR, parse_colorref(bg)?);
        set_attr(hwnd, DWMWA_TEXT_COLOR, parse_colorref(text)?);
        set_attr(hwnd, DWMWA_BORDER_COLOR, parse_colorref(border)?);
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::parse_colorref;

        #[test]
        fn parses_rgb_into_bgr_colorref() {
            // #d79a3d -> r=0xd7 g=0x9a b=0x3d -> COLORREF 0x003d9ad7
            assert_eq!(parse_colorref("#d79a3d").unwrap(), 0x003d_9ad7);
        }

        #[test]
        fn accepts_hex_without_leading_hash() {
            assert_eq!(parse_colorref("000000").unwrap(), 0);
        }

        #[test]
        fn white_maps_to_all_bits_set() {
            assert_eq!(parse_colorref("#ffffff").unwrap(), 0x00ff_ffff);
        }

        #[test]
        fn rejects_wrong_length() {
            assert!(parse_colorref("#fff").is_err());
        }
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn set_titlebar_theme(
    window: tauri::WebviewWindow,
    bg: String,
    text: String,
    border: String,
) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    imp::set(hwnd, &bg, &text, &border)
}

#[cfg(not(windows))]
#[tauri::command]
pub fn set_titlebar_theme(
    _window: tauri::WebviewWindow,
    _bg: String,
    _text: String,
    _border: String,
) -> Result<(), String> {
    Ok(())
}
