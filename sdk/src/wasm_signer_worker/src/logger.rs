use log::{Level, Log, Metadata, Record};

struct ConsoleLogger;

static LOGGER: ConsoleLogger = ConsoleLogger;

pub fn init(level: Level) {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(level.to_level_filter());
}

impl Log for ConsoleLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let message = format!("[{}] {}", record.level(), record.args());
        match record.level() {
            Level::Error => console::error(&message),
            Level::Warn => console::warn(&message),
            _ => console::log(&message),
        }
    }

    fn flush(&self) {}
}

#[cfg(target_arch = "wasm32")]
mod console {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = console)]
        pub fn log(s: &str);

        #[wasm_bindgen(js_namespace = console, js_name = warn)]
        pub fn warn(s: &str);

        #[wasm_bindgen(js_namespace = console, js_name = error)]
        pub fn error(s: &str);
    }
}

#[cfg(not(target_arch = "wasm32"))]
mod console {
    pub fn log(s: &str) {
        println!("{s}");
    }

    pub fn warn(s: &str) {
        eprintln!("{s}");
    }

    pub fn error(s: &str) {
        eprintln!("{s}");
    }
}
