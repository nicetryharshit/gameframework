use std::path::PathBuf;

fn main() {
  tauri_build::build();
  copy_steam_runtime();
}

/// With the `steam` feature, copies the Steamworks runtime library next to the built program, so
/// `cargo run`, `tauri dev` and `tauri build` all find it without a manual copy.
fn copy_steam_runtime() {
  println!("cargo:rerun-if-changed=build.rs");
  if std::env::var_os("CARGO_FEATURE_STEAM").is_none() {
    return;
  }
  let (folder, file) = match std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default().as_str() {
    "windows" => ("win64", "steam_api64.dll"),
    "macos" => ("osx", "libsteam_api.dylib"),
    "linux" => ("linux64", "libsteam_api.so"),
    _ => return,
  };
  let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
  let source = manifest.join("../vendor/steamworks/sdk/redistributable_bin").join(folder).join(file);
  println!("cargo:rerun-if-changed={}", source.display());
  if !source.exists() {
    println!("cargo:warning=Steamworks runtime not found at {}. Install the SDK on the Steam page.", source.display());
    return;
  }
  // OUT_DIR is target/<profile>/build/<package>-<hash>/out, and the program is written to target/<profile>.
  let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
  let Some(profile_dir) = out.ancestors().nth(3) else {
    return;
  };
  if let Err(error) = std::fs::copy(&source, profile_dir.join(file)) {
    println!("cargo:warning=Could not copy {file} next to the program: {error}");
  }
}
