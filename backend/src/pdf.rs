use printpdf::{path::{PaintMode, WindingOrder}, *};
use std::io::BufWriter;

// A4 in mm (f32 — printpdf Mm wrapper uses f32)
const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;

const MARGIN_L: f32 = 15.0;
const MARGIN_R: f32 = 15.0;
const MARGIN_TOP: f32 = 20.0;
const MARGIN_BOTTOM: f32 = 15.0;

const USABLE_W: f32 = PAGE_W - MARGIN_L - MARGIN_R;

/// Loads the best available TTF font for German text (includes umlauts).
pub fn load_font_bytes() -> Vec<u8> {
    let candidates: &[&str] = &[
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibri.ttf",
    ];
    for path in candidates {
        if let Ok(bytes) = std::fs::read(path) {
            return bytes;
        }
    }
    panic!(
        "Kein geeigneter Font gefunden. Bitte 'fonts-liberation' installieren \
         (Dockerfile: RUN apt-get install -y fonts-liberation)"
    );
}

// ── PdfBuilder ────────────────────────────────────────────────────────────────

pub struct PdfBuilder {
    title: String,
    items: Vec<Item>,
}

enum Item {
    Heading { text: String },
    SubHeading { text: String },
    KeyValue { key: String, value: String },
    Separator,
    Spacer { mm: f32 },
    Table { headers: Vec<String>, rows: Vec<Vec<String>>, col_widths: Vec<f32> },
    TextBlock { text: String },
}

impl PdfBuilder {
    pub fn new(title: impl Into<String>) -> Self {
        Self { title: title.into(), items: Vec::new() }
    }

    pub fn heading(mut self, text: impl Into<String>) -> Self {
        self.items.push(Item::Heading { text: text.into() });
        self
    }

    #[allow(dead_code)]
    pub fn sub_heading(mut self, text: impl Into<String>) -> Self {
        self.items.push(Item::SubHeading { text: text.into() });
        self
    }

    pub fn key_value(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.items.push(Item::KeyValue { key: key.into(), value: value.into() });
        self
    }

    pub fn separator(mut self) -> Self {
        self.items.push(Item::Separator);
        self
    }

    pub fn spacer(mut self, mm: f32) -> Self {
        self.items.push(Item::Spacer { mm });
        self
    }

    pub fn table(
        mut self,
        headers: Vec<impl Into<String>>,
        rows: Vec<Vec<impl Into<String>>>,
        col_widths: Vec<f32>,
    ) -> Self {
        self.items.push(Item::Table {
            headers: headers.into_iter().map(|h| h.into()).collect(),
            rows: rows.into_iter().map(|r| r.into_iter().map(|c| c.into()).collect()).collect(),
            col_widths,
        });
        self
    }

    pub fn text_block(mut self, text: impl Into<String>) -> Self {
        self.items.push(Item::TextBlock { text: text.into() });
        self
    }

    pub fn build(self, font_bytes: &[u8]) -> anyhow::Result<Vec<u8>> {
        let (doc, page1, layer1) =
            PdfDocument::new(&self.title, Mm(PAGE_W), Mm(PAGE_H), "Content");

        let font = doc.add_external_font(std::io::Cursor::new(font_bytes))?;

        let mut renderer = PageRenderer {
            doc: &doc,
            font: &font,
            page_idx: page1,
            layer_idx: layer1,
            y: PAGE_H - MARGIN_TOP,
        };

        renderer.draw_title(&self.title);

        for item in &self.items {
            match item {
                Item::Heading { text } => renderer.draw_heading(text),
                Item::SubHeading { text } => renderer.draw_sub_heading(text),
                Item::KeyValue { key, value } => renderer.draw_key_value(key, value),
                Item::Separator => renderer.draw_separator(),
                Item::Spacer { mm } => renderer.advance(*mm),
                Item::Table { headers, rows, col_widths } => {
                    renderer.draw_table(headers, rows, col_widths)
                }
                Item::TextBlock { text } => renderer.draw_text_block(text),
            }
        }

        let mut buf = BufWriter::new(Vec::new());
        doc.save(&mut buf)?;
        Ok(buf.into_inner()?)
    }
}

// ── PageRenderer ──────────────────────────────────────────────────────────────

struct PageRenderer<'a> {
    doc: &'a PdfDocumentReference,
    font: &'a IndirectFontRef,
    page_idx: PdfPageIndex,
    layer_idx: PdfLayerIndex,
    y: f32,
}

impl<'a> PageRenderer<'a> {
    fn layer(&self) -> PdfLayerReference {
        self.doc.get_page(self.page_idx).get_layer(self.layer_idx)
    }

    fn advance(&mut self, mm: f32) {
        self.y -= mm;
        if self.y < MARGIN_BOTTOM + 5.0 {
            self.new_page();
        }
    }

    fn new_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(PAGE_W), Mm(PAGE_H), "Content");
        self.page_idx = page;
        self.layer_idx = layer;
        self.y = PAGE_H - MARGIN_TOP;
    }

    fn ensure_space(&mut self, needed: f32) {
        if self.y - needed < MARGIN_BOTTOM {
            self.new_page();
        }
    }

    fn write_line(&self, text: &str, x: f32, y: f32, size: f32) {
        self.layer().use_text(text, size, Mm(x), Mm(y), self.font);
    }

    fn draw_title(&mut self, text: &str) {
        self.ensure_space(12.0);
        self.write_line(text, MARGIN_L, self.y, 16.0);
        self.y -= 7.0;
        self.draw_separator();
        self.y -= 3.0;
    }

    fn draw_heading(&mut self, text: &str) {
        self.ensure_space(10.0);
        self.write_line(text, MARGIN_L, self.y, 12.0);
        self.y -= 6.0;
        self.draw_separator();
        self.y -= 2.0;
    }

    fn draw_sub_heading(&mut self, text: &str) {
        self.ensure_space(8.0);
        self.write_line(text, MARGIN_L, self.y, 10.0);
        self.y -= 6.0;
    }

    fn draw_key_value(&mut self, key: &str, value: &str) {
        self.ensure_space(6.0);
        let label = format!("{}: {}", key, value);
        self.write_line(&label, MARGIN_L, self.y, 9.0);
        self.y -= 5.0;
    }

    fn draw_separator(&mut self) {
        let layer = self.layer();
        let points = vec![
            (Point::new(Mm(MARGIN_L), Mm(self.y)), false),
            (Point::new(Mm(PAGE_W - MARGIN_R), Mm(self.y)), false),
        ];
        let line = Line { points, is_closed: false };
        layer.set_outline_color(Color::Greyscale(Greyscale::new(0.5, None)));
        layer.set_outline_thickness(0.3);
        layer.add_line(line);
        self.y -= 1.0;
    }

    fn draw_text_block(&mut self, text: &str) {
        let chars_per_line = 90usize;
        let line_h = 5.0;
        for paragraph in text.split('\n') {
            let words: Vec<&str> = paragraph.split_whitespace().collect();
            let mut current = String::new();
            for word in words {
                if current.len() + word.len() + 1 > chars_per_line {
                    self.ensure_space(line_h);
                    self.write_line(&current, MARGIN_L, self.y, 9.0);
                    self.y -= line_h;
                    current = word.to_string();
                } else {
                    if !current.is_empty() { current.push(' '); }
                    current.push_str(word);
                }
            }
            if !current.is_empty() {
                self.ensure_space(line_h);
                self.write_line(&current, MARGIN_L, self.y, 9.0);
                self.y -= line_h;
            }
            self.y -= 2.0;
        }
    }

    fn draw_table(&mut self, headers: &[String], rows: &[Vec<String>], col_widths: &[f32]) {
        let row_h = 6.0_f32;
        let header_h = 7.0_f32;

        self.ensure_space(header_h + row_h);

        // Header background
        {
            let layer = self.layer();
            let rect_points = vec![
                (Point::new(Mm(MARGIN_L), Mm(self.y + 1.0)), false),
                (Point::new(Mm(MARGIN_L + USABLE_W), Mm(self.y + 1.0)), false),
                (Point::new(Mm(MARGIN_L + USABLE_W), Mm(self.y - header_h + 1.0)), false),
                (Point::new(Mm(MARGIN_L), Mm(self.y - header_h + 1.0)), false),
            ];
            let bg = Polygon {
                rings: vec![rect_points],
                mode: PaintMode::Fill,
                winding_order: WindingOrder::NonZero,
            };
            layer.set_fill_color(Color::Greyscale(Greyscale::new(0.85, None)));
            layer.add_polygon(bg);
        }

        let mut x = MARGIN_L + 1.0;
        for (i, header) in headers.iter().enumerate() {
            self.write_line(header, x, self.y - 1.0, 8.5);
            x += col_widths.get(i).copied().unwrap_or(30.0);
        }
        self.y -= header_h;

        for (row_i, row) in rows.iter().enumerate() {
            self.ensure_space(row_h);

            if row_i % 2 == 1 {
                let layer = self.layer();
                let rect_points = vec![
                    (Point::new(Mm(MARGIN_L), Mm(self.y + 1.0)), false),
                    (Point::new(Mm(MARGIN_L + USABLE_W), Mm(self.y + 1.0)), false),
                    (Point::new(Mm(MARGIN_L + USABLE_W), Mm(self.y - row_h + 1.0)), false),
                    (Point::new(Mm(MARGIN_L), Mm(self.y - row_h + 1.0)), false),
                ];
                let bg = Polygon {
                    rings: vec![rect_points],
                    mode: PaintMode::Fill,
                    winding_order: WindingOrder::NonZero,
                };
                layer.set_fill_color(Color::Greyscale(Greyscale::new(0.95, None)));
                layer.add_polygon(bg);
            }

            let mut x = MARGIN_L + 1.0;
            for (i, cell) in row.iter().enumerate() {
                let max_w = col_widths.get(i).copied().unwrap_or(30.0);
                let cell_str = truncate_to_width(cell, max_w);
                self.write_line(&cell_str, x, self.y - 1.0, 8.0);
                x += max_w;
            }
            self.y -= row_h;
        }
        self.y -= 2.0;
    }
}

fn truncate_to_width(s: &str, width_mm: f32) -> String {
    let max_chars = (width_mm / 2.2) as usize;
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_chars.saturating_sub(2)).collect();
        format!("{}..", truncated)
    }
}
