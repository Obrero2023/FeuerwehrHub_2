import { PDFDocument, PDFName } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generiert den Beschaffungsauftrag als PDF.
 * - Falls eine PDF-Vorlage hinterlegt ist: Vorlage befüllen (Template-Modus)
 * - Falls keine Vorlage: generische PDF aus den Formulardaten erzeugen
 */
export async function generateBeschaffungsauftrag(order) {
  const hasTemplate = await checkTemplate();
  if (hasTemplate) {
    await generateFromTemplate(order);
  } else {
    generateGenericPdf(order);
  }
}

async function checkTemplate() {
  try {
    const res = await fetch('/api/settings/pdf', { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Template-Modus (vorhandene PDF-Vorlage befüllen) ─────────────────────────

async function generateFromTemplate(order) {
  const pdfResponse = await fetch('/api/settings/pdf');
  if (!pdfResponse.ok) throw new Error('PDF-Vorlage konnte nicht geladen werden');

  const pdfBytes = await pdfResponse.arrayBuffer();
  const pdfDoc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form     = pdfDoc.getForm();

  const fill = (name, value) => {
    try { form.getTextField(name).setText(value || ''); } catch (_) {}
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return new Date().toLocaleDateString('de-DE');
    return new Date(dateStr).toLocaleDateString('de-DE');
  };

  fill('Name',         order.ordered_by_name || '');
  fill('Telefon',      order.telefon || '');
  fill('Datumsfeld 1', formatDate(order.order_date));
  fill('Anschrift',    order.lieferanschrift || '');

  // Positionen (bis zu 6)
  const positions = order.positions || [{ menge: String(order.quantity), einheit: order.unit, gesamt: '', gegenstand: order.article_name }];
  const fieldMap = [
    ['Anzahl',   'Einheit',   'Gesamt',   'Gegenstand'],
    ['Anzahl 2', 'Einheit 2', 'Gesamt 2', 'Gegenstand 2'],
    ['Anzahl 3', 'Einheit 3', 'Gesamt 3', 'Gegenstand 3'],
    ['Anzahl 4', 'Einheit 4', 'Gesamt 4', 'Gegenstand 4'],
    ['Anzahl 5', 'Einheit 5', 'Gesamt 5', 'Gegenstand 5'],
    ['Anzahl 6', 'Einheit 6', 'Gesamt 6', 'Gegenstand 6'],
  ];
  positions.slice(0, 6).forEach((pos, i) => {
    const [fMenge, fEinheit, fGesamt, fGegenstand] = fieldMap[i];
    fill(fMenge,      pos.menge      || '');
    fill(fEinheit,    pos.einheit    || '');
    fill(fGesamt,     pos.gesamt     || '');
    fill(fGegenstand, pos.gegenstand || '');
  });

  fill('Begründung', order.begruendung || '');
  fill('Händler 1',  order.haendler_1 || '');
  fill('Händler 2',  order.haendler_2 || '');
  fill('Händler 3',  order.haendler_3 || '');

  ['cmdRueck', 'cmdDruck'].forEach(name => {
    try {
      const field = form.getButton(name);
      field.acroField.getWidgets().forEach(widget => {
        const ctx = widget.dict.context;
        widget.dict.set(PDFName.of('Rect'), ctx.obj([0, 0, 0, 0]));
      });
    } catch (_) {}
  });

  form.flatten();

  const outBytes = await pdfDoc.save();
  openPdf(outBytes);
}

// ── Generische PDF (kein Template) ───────────────────────────────────────────

function generateGenericPdf(order) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageW  = 210 - margin * 2;

  const formatDate = (dateStr) => {
    if (!dateStr) return new Date().toLocaleDateString('de-DE');
    return new Date(dateStr).toLocaleDateString('de-DE');
  };

  // ── Kopfzeile ──────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Beschaffungsauftrag', margin, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('für Lieferungen und Leistungen', margin, 26);

  doc.setLineWidth(0.5);
  doc.line(margin, 28, margin + pageW, 28);

  // ── Bedarfsmelder / Telefon / Datum ───────────────────────────────────────
  let y = 36;
  const colW = pageW / 3;

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Bedarfsmelder(in)', margin, y);
  doc.text('Telefon', margin + colW, y);
  doc.text('Datum', margin + colW * 2, y);

  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(order.ordered_by_name || '—', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(order.telefon || '—', margin + colW, y);
  doc.text(formatDate(order.order_date), margin + colW * 2, y);

  // ── Lieferanschrift ───────────────────────────────────────────────────────
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Lieferanschrift', margin, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(order.lieferanschrift || '—', margin, y);

  // ── Positionstabelle ──────────────────────────────────────────────────────
  y += 10;
  const positions = order.positions || [{ menge: String(order.quantity), einheit: order.unit, gesamt: '', gegenstand: order.article_name }];
  const rows = positions.map(p => [
    p.menge      || '',
    p.einheit    || '',
    p.gesamt     || '',
    p.gegenstand || '',
  ]);
  // Leere Zeilen auffüllen damit immer 6 Zeilen da sind
  while (rows.length < 6) rows.push(['', '', '', '']);

  autoTable(doc, {
    startY: y,
    head: [['Menge¹', 'Einheit²', 'Gesamt³', 'Gegenstand / Leistung']],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 2.5 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 35 },
      2: { cellWidth: 25 },
      3: { cellWidth: 'auto' },
    },
  });

  y = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text('¹ Anzahl / Mengenwert   ² Einheit (z.B.: Stück / kg / l / cbm / VE)   ³ Gesamtanzahl (Menge × Stück je VE)', margin, y);
  doc.setTextColor(0);

  // ── Begründung ────────────────────────────────────────────────────────────
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Begründung der Notwendigkeit', margin, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0);
  if (order.begruendung) {
    const lines = doc.splitTextToSize(order.begruendung, pageW);
    doc.text(lines, margin, y);
    y += lines.length * 5;
  } else {
    doc.text('—', margin, y);
    y += 5;
  }

  // ── Händler ───────────────────────────────────────────────────────────────
  const haendler = [order.haendler_1, order.haendler_2, order.haendler_3].filter(Boolean);
  if (haendler.length > 0) {
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Geeignete Händler / Anbieter', margin, y);
    y += 5;
    doc.setFontSize(10);
    doc.setTextColor(0);
    haendler.forEach(h => {
      doc.text(`• ${h}`, margin, y);
      y += 5;
    });
  }

  // ── Unterschrift ──────────────────────────────────────────────────────────
  y += 10;
  doc.setLineWidth(0.3);
  const sigW = pageW / 3 - 5;

  // Gespeicherte Unterschrift einbetten (auf der Bedarfsmelder-Linie)
  const storedSig = localStorage.getItem('ff_signature');
  if (storedSig) {
    const imgFmt = storedSig.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    try {
      doc.addImage(storedSig, imgFmt, margin + sigW + 5, y - 16, sigW, 13);
    } catch (_) {}
  }

  doc.line(margin, y, margin + sigW, y);
  doc.line(margin + sigW + 5, y, margin + sigW * 2 + 5, y);
  doc.line(margin + sigW * 2 + 10, y, margin + pageW, y);

  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Datum', margin, y);
  doc.text('Vor- / Nachname Bedarfsmelder(in)', margin + sigW + 5, y);
  doc.text('Unterschrift Vorgesetzte(r)', margin + sigW * 2 + 10, y);

  // ── Footer ────────────────────────────────────────────────────────────────
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'italic');
  doc.text('Hiermit bitte ich um die Beschaffung der oben beschriebenen Leistungen!', margin, y);

  // PDF öffnen
  openPdf(new Uint8Array(doc.output('arraybuffer')));
}

// ── Einsatzbericht-PDF ────────────────────────────────────────────────────────

export function generateEinsatzbericht(report, ffName = 'FeuerwehrHub') {
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageW  = 210 - margin * 2;

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('de-DE') : '—';
  const fmtTime = (s) => s ? s.slice(0, 5) : '—';
  const val     = (v) => v || '—';

  // ── Kopfzeile ──────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Einsatzbericht', margin, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(ffName, margin, 26);
  doc.setTextColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, 29, margin + pageW, 29);

  let y = 37;

  // ── Basisdaten (3 Spalten) ─────────────────────────────────────────────────
  const col = pageW / 3;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Einsatznummer', margin, y);
  doc.text('Datum', margin + col, y);
  doc.text('Stichwort', margin + col * 2, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(val(report.incident_number), margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fmtDate(report.incident_date), margin + col, y);
  doc.text(val(report.incident_type_label), margin + col * 2, y);
  y += 10;

  // ── Zeiten ────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(100);
  ['Alarmuhrzeit', 'Abfahrt', 'Ankunft', 'Einsatzende'].forEach((label, i) => {
    doc.text(label, margin + i * (pageW / 4), y);
  });
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0);
  [report.alarm_time, report.departure_time, report.arrival_time, report.end_time].forEach((t, i) => {
    doc.text(fmtTime(t), margin + i * (pageW / 4), y);
  });
  y += 10;

  // ── Einsatzort ────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Einsatzort', margin, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0);
  const locationParts = [
    report.street && report.house_number ? `${report.street} ${report.house_number}` : report.street,
    report.postal_code && report.location ? `${report.postal_code} ${report.location}` : report.location,
    report.district,
  ].filter(Boolean);
  doc.text(locationParts.join(', ') || '—', margin, y);
  y += 10;

  // ── Einsatzleiter + Stärke ────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Einsatzleiter', margin, y);
  doc.text('Stärke (F/U/M)', margin + col * 2, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(val(report.incident_commander), margin, y);
  const staerke = `${report.strength_leadership ?? 0}/${report.strength_sub ?? 0}/${report.strength_crew ?? 0}`;
  doc.text(staerke, margin + col * 2, y);
  y += 12;

  // ── Lage ──────────────────────────────────────────────────────────────────
  const addSection = (heading, text) => {
    if (!text) return;
    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(heading, margin, y);
    y += 5;
    doc.setFontSize(10);
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(text, pageW);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 6;
  };

  addSection('Lage / Situation',        report.situation);
  addSection('Maßnahmen',               report.measures);
  addSection('Notizen',                 report.notes);
  addSection('Objekt / Brandursache',   report.fire_object);

  // ── Personenzahlen (nur wenn > 0) ─────────────────────────────────────────
  const casualties = [
    ['Gerettete Personen', report.persons_rescued],
    ['Evakuierte Personen', report.persons_evacuated],
    ['Verletzte Personen', report.persons_injured],
    ['Tote Personen', report.persons_dead],
  ].filter(([, v]) => v && v > 0);

  if (casualties.length) {
    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Personenschäden', margin, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [['Kategorie', 'Anzahl']],
      body: casualties.map(([label, count]) => [label, String(count)]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 25 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Unterschrift ──────────────────────────────────────────────────────────
  if (y > 250) { doc.addPage(); y = 20; }
  y += 5;
  doc.setLineWidth(0.3);
  const sigW = pageW / 3 - 5;
  doc.line(margin, y, margin + sigW, y);
  doc.line(margin + sigW + 5, y, margin + sigW * 2 + 5, y);
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Datum', margin, y);
  doc.text('Unterschrift Einsatzleiter', margin + sigW + 5, y);

  openPdf(new Uint8Array(doc.output('arraybuffer')));
}

// ── Artikel-Bestandsliste ─────────────────────────────────────────────────────

export function generateArtikelListe(articles, ffName = 'FeuerwehrHub', filterInfo = '') {
  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 15;

  // ── Kopfzeile ──────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Bestandsliste', margin, 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`${ffName}${filterInfo ? ' — ' + filterInfo : ''}`, margin, 24);
  doc.text(`Stand: ${new Date().toLocaleDateString('de-DE')}`, 280, 24, { align: 'right' });
  doc.setTextColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, 27, 280, 27);

  // ── Tabelle ───────────────────────────────────────────────────────────────
  const rows = articles.map(a => {
    const ist  = a.current_stock ?? 0;
    const soll = a.min_stock ?? 0;
    const status = soll === 0 ? '—' : ist === 0 ? 'Leer' : ist < soll ? 'Niedrig' : 'OK';
    return [
      a.name,
      a.category || '—',
      a.ean       || '—',
      a.unit,
      String(ist),
      String(soll),
      status,
    ];
  });

  autoTable(doc, {
    startY: 32,
    head: [['Bezeichnung', 'Kategorie', 'EAN', 'Einheit', 'Ist', 'Soll', 'Status']],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 30 },
      2: { cellWidth: 30 },
      3: { cellWidth: 20 },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 15, halign: 'right' },
      6: { cellWidth: 20 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const v = data.cell.raw;
        if (v === 'Leer')   data.cell.styles.textColor = [185, 28, 28];
        if (v === 'Niedrig') data.cell.styles.textColor = [180, 83, 9];
        if (v === 'OK')     data.cell.styles.textColor = [22, 101, 52];
      }
    },
  });

  openPdf(new Uint8Array(doc.output('arraybuffer')));
}

// ── Hilfsfunktion ─────────────────────────────────────────────────────────────

function openPdf(bytes) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
