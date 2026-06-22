const db = require('../lib/db');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const formatTimeValue = (timeValue) => {
  if (!timeValue) return '-';
  return String(timeValue).substring(0, 5);
};

// =========================================================================
// RENDER UPLOAD MINUTES
// =========================================================================

const renderUploadMinutesForm = async (req, res, next) => {
  try {
    const employeeId = req.session.employeeId;
    const selectedMeetingId = req.query.meeting_id || null;

    const [meetingsData] = await db.query(
      `SELECT id, title, meeting_date AS date
       FROM meetings
       WHERE organizer_id = ?
         AND status = 'completed'
         AND id NOT IN (SELECT meeting_id FROM meeting_minutes)
       ORDER BY meeting_date DESC`,
      [employeeId]
    );

    const [meetingsWithMinutes] = await db.query(`
      SELECT DISTINCT m.id, m.title, m.meeting_date AS date
      FROM meetings m
      INNER JOIN meeting_minutes mm ON m.id = mm.meeting_id
      WHERE (
        m.organizer_id = ?
        OR m.id IN (
          SELECT meeting_id FROM meeting_participants
          WHERE employee_id = ? AND status = 'attended'
        )
      )
      ORDER BY m.meeting_date DESC
    `, [employeeId, employeeId]);

    let minutesQuery = `
      SELECT 
        mm.id,
        m.title AS meeting_title,
        mm.file AS file_path,
        mm.summary,
        m.organizer_id,
        DATE_FORMAT(mm.created_at, '%d-%m-%Y %H:%i') AS uploaded_at,
        COUNT(md.id) AS documentation_count
      FROM meeting_minutes mm
      JOIN meetings m ON mm.meeting_id = m.id
      LEFT JOIN meeting_documents md ON md.meeting_id = mm.meeting_id
      WHERE (
        m.organizer_id = ?
        OR mm.meeting_id IN (
          SELECT meeting_id FROM meeting_participants
          WHERE employee_id = ? AND status = 'attended'
        )
      )
    `;

    const params = [employeeId, employeeId];

    if (selectedMeetingId) {
      minutesQuery += ` AND mm.meeting_id = ?`;
      params.push(selectedMeetingId);
    }

    minutesQuery += `
      GROUP BY mm.id, m.title, mm.file, mm.summary, m.organizer_id, mm.created_at
      ORDER BY mm.created_at DESC
    `;

    const [historyData] = await db.query(minutesQuery, params);

    res.render('minutes/upload', {
      meetings: meetingsData,
      meetingsWithMinutes,
      minutesList: historyData,
      selectedMeetingId,
      currentUserId: employeeId,
      messages: req.flash()
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// PROCESS UPLOAD MINUTES
// =========================================================================

const processUploadMinutes = async (req, res, next) => {
  try {
    const employeeId = req.session.employeeId;
    const meetingId = req.body.meeting_id;
    const summaryText = req.body.notes || '';
    const uploadedFile = req.files?.file_notulensi?.[0];
    const dokumentasiFiles = req.files?.file_dokumentasi || [];

    if (!meetingId) return res.status(400).send('Pilih rapat terlebih dahulu.');
    if (!uploadedFile) return res.status(400).send('Tidak ada file yang diunggah.');

    const [meetingRows] = await db.query(
      `SELECT organizer_id, status
       FROM meetings
       WHERE id = ?
         AND organizer_id = ?
         AND status = 'completed'
         AND id NOT IN (SELECT meeting_id FROM meeting_minutes)`,
      [meetingId, employeeId]
    );

    if (meetingRows.length === 0) {
      return res.status(403).send('Anda tidak berhak mengunggah notulensi untuk meeting ini.');
    }

    const filePath = '/assets/uploads/' + uploadedFile.filename;

    await db.query(
      `INSERT INTO meeting_minutes
        (meeting_id, file, summary, created_by, employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [meetingId, filePath, summaryText, employeeId, employeeId]
    );

    if (dokumentasiFiles.length > 0) {
      for (const file of dokumentasiFiles) {
        await db.query(
          `INSERT INTO meeting_documents
            (meeting_id, title, file_path, file_type, uploaded_by, employee_id, uploaded_at, created_at, updated_at)
           VALUES (?, (SELECT title FROM meetings WHERE id = ?), ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [meetingId, meetingId, '/assets/uploads/' + file.filename, file.mimetype, employeeId, employeeId]
        );
      }
    }

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// DELETE MINUTE
// =========================================================================

const deleteMinute = async (req, res, next) => {
  const minuteId = req.params.id;
  const employeeId = req.session.employeeId;

  try {
    const [rows] = await db.query(
      `SELECT mm.file, m.organizer_id
       FROM meeting_minutes mm
       JOIN meetings m ON mm.meeting_id = m.id
       WHERE mm.id = ?`,
      [minuteId]
    );

    if (rows.length === 0) return res.status(404).send('Notulensi tidak ditemukan.');
    if (rows[0].organizer_id !== employeeId) return res.status(403).send('Anda tidak berhak menghapus notulensi ini.');

    const filePath = rows[0].file;
    await db.query(`DELETE FROM meeting_minutes WHERE id = ?`, [minuteId]);

    if (filePath) {
      const absolutePath = path.join(__dirname, '../public', filePath);
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    }

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// REPLACE MINUTE — file notulensi OPSIONAL, dokumentasi bisa ditambah
// =========================================================================

const replaceMinute = async (req, res, next) => {
  const minuteId = req.params.id;
  const employeeId = req.session.employeeId;

  try {
    const notulensiFile = req.files?.file_notulensi?.[0];
    const dokumentasiFiles = req.files?.file_dokumentasi || [];

    // ✅ FIX: Tidak wajib upload file notulensi — boleh hanya tambah dokumentasi
    if (!notulensiFile && dokumentasiFiles.length === 0) {
      return res.status(400).send('Harap unggah file notulensi baru atau foto dokumentasi.');
    }

    const [rows] = await db.query(
      `SELECT mm.file, mm.meeting_id, m.organizer_id
       FROM meeting_minutes mm
       JOIN meetings m ON mm.meeting_id = m.id
       WHERE mm.id = ?`,
      [minuteId]
    );

    if (rows.length === 0) return res.status(404).send('Notulensi tidak ditemukan.');
    if (rows[0].organizer_id !== employeeId) return res.status(403).send('Anda tidak berhak mengganti notulensi ini.');

    // Hanya ganti file notulensi jika ada file baru
    if (notulensiFile) {
      const oldFilePath = rows[0].file;

      if (oldFilePath) {
        const absoluteOldPath = path.join(__dirname, '../public', oldFilePath);
        if (fs.existsSync(absoluteOldPath)) fs.unlinkSync(absoluteOldPath);
      }

      const newFilePath = '/assets/uploads/' + notulensiFile.filename;
      await db.query(
        `UPDATE meeting_minutes SET file = ?, updated_at = NOW() WHERE id = ?`,
        [newFilePath, minuteId]
      );
    }

    // Tambah dokumentasi baru jika ada
    if (dokumentasiFiles.length > 0) {
      const meetingId = rows[0].meeting_id;
      for (const file of dokumentasiFiles) {
        await db.query(
          `INSERT INTO meeting_documents
            (meeting_id, title, file_path, file_type, uploaded_by, employee_id, uploaded_at, created_at, updated_at)
           VALUES (?, (SELECT title FROM meetings WHERE id = ?), ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [meetingId, meetingId, '/assets/uploads/' + file.filename, file.mimetype, employeeId, employeeId]
        );
      }
    }

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// EXPORT MINUTE PDF
// =========================================================================

const exportMinutePdf = async (req, res, next) => {
  const minuteId = req.params.id;

  try {
    const [rows] = await db.query(
      `SELECT 
          mm.id, mm.summary, mm.file, mm.created_at, mm.meeting_id,
          m.title AS meeting_title, m.meeting_date, m.start_time,
          m.end_time, m.meeting_type, m.status
       FROM meeting_minutes mm
       JOIN meetings m ON mm.meeting_id = m.id
       WHERE mm.id = ?`,
      [minuteId]
    );

    if (rows.length === 0) return res.status(404).send('Notulensi tidak ditemukan.');

    const minute = rows[0];

    const [participants] = await db.query(
      `SELECT e.name, e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = (SELECT meeting_id FROM meeting_minutes WHERE id = ?)
       ORDER BY e.name ASC`,
      [minuteId]
    );

    const [dokumentasiRows] = await db.query(
      `SELECT file_path FROM meeting_documents WHERE meeting_id = ? ORDER BY uploaded_at ASC`,
      [minute.meeting_id]
    );

    const doc = new PDFDocument({ margin: 56, size: 'A4' });

    const safeName = minute.meeting_title.replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="notulensi_${safeName}.pdf"`);
    doc.pipe(res);

    const contentWidth = 595 - 56 * 2;
    const gray = '#6b7280';
    const dark = '#111827';
    const green = '#065f46';
    const line = '#e5e7eb';

    // Header
    doc.rect(0, 0, 595, 6).fill(green);
    doc.moveDown(0.5);
    doc.fontSize(22).font('Helvetica-Bold').fillColor(dark).text('NOTULENSI RAPAT', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor(gray).text('FTI Meeting System', { align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(1.5).strokeColor(green).stroke();
    doc.moveDown(0.8);

    // Informasi Rapat
    const meetingDate = new Date(minute.meeting_date).toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('INFORMASI RAPAT', 56);
    doc.moveDown(0.3);

    const infoRows = [
      ['Judul Rapat', minute.meeting_title],
      ['Tanggal', meetingDate],
      ['Waktu', `${formatTimeValue(minute.start_time)} – ${formatTimeValue(minute.end_time)}`],
      ['Jenis Rapat', minute.meeting_type.charAt(0).toUpperCase() + minute.meeting_type.slice(1)],
      ['Status', minute.status.charAt(0).toUpperCase() + minute.status.slice(1)]
    ];

    const boxY = doc.y;
    const rowHeight = 20;
    const boxHeight = infoRows.length * rowHeight + 16;

    doc.rect(56, boxY, contentWidth, boxHeight).fillAndStroke('#f9fafb', line);

    let rowY = boxY + 10;
    doc.font('Helvetica').fontSize(10);

    for (const [label, value] of infoRows) {
      doc.fillColor(gray).text(label, 68, rowY, { width: 100, lineBreak: false });
      doc.fillColor(dark).text(`: ${value || '-'}`, 168, rowY, { width: contentWidth - 120, lineBreak: false });
      rowY += rowHeight;
    }

    doc.y = boxY + boxHeight + 14;
    doc.moveDown(0.2);

    // Daftar Peserta
    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('DAFTAR PESERTA', 56);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(dark);

    if (participants.length > 0) {
      participants.forEach((participant, index) => {
        const empNum = participant.employee_number ? `  (${participant.employee_number})` : '';
        doc.text(`${index + 1}.  ${participant.name}${empNum}`, 68, doc.y, { lineGap: 3 });
      });
    } else {
      doc.fillColor(gray).text('Tidak ada peserta terdaftar.', 68);
    }

    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(0.5).strokeColor(line).stroke();
    doc.moveDown(0.6);

    // Ringkasan / Catatan
    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('RINGKASAN / CATATAN', 56);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);

    if (minute.summary && minute.summary.trim() && minute.summary.trim() !== '-') {
      doc.fillColor(dark).text(minute.summary, 68, doc.y, { lineGap: 4, paragraphGap: 5, width: contentWidth - 12 });
    } else {
      doc.fillColor(gray).text('Tidak ada catatan yang ditambahkan.', 68);
    }

    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(0.5).strokeColor(line).stroke();
    doc.moveDown(0.6);

    // Isi File Notulensi
    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('ISI FILE NOTULENSI', 56);
    doc.moveDown(0.3);

    if (minute.file) {
      const filePath = path.join(__dirname, '..', 'public', minute.file.replace(/^\//, ''));
      const ext = path.extname(minute.file).toLowerCase();

      try {
        if (ext === '.pdf') {
          const fileBuffer = fs.readFileSync(filePath);
          const pdfData = await (pdfParse.default ? pdfParse.default(fileBuffer) : pdfParse(fileBuffer));
          const extractedText = (pdfData?.text || '').trim();

          if (extractedText) {
            doc.font('Helvetica').fontSize(9.5).fillColor(dark)
              .text(extractedText, 68, doc.y, { lineGap: 3, paragraphGap: 5, width: contentWidth - 12 });
          } else {
            doc.font('Helvetica').fontSize(10).fillColor(gray)
              .text('Tidak ada teks yang dapat diekstrak dari file PDF ini.', 68);
          }
        } else if (ext === '.docx' || ext === '.doc') {
          const result = await mammoth.extractRawText({ path: filePath });
          const extractedText = result.value.trim();

          if (extractedText) {
            doc.font('Helvetica').fontSize(9.5).fillColor(dark)
              .text(extractedText, 68, doc.y, { lineGap: 3, paragraphGap: 5, width: contentWidth - 12 });
          } else {
            doc.font('Helvetica').fontSize(10).fillColor(gray)
              .text('Tidak ada teks yang dapat diekstrak dari file Word ini.', 68);
          }
        } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          // ✅ FIX: Gunakan doc.y relatif, bukan koordinat absolut
          const imgY = doc.y;
          doc.image(filePath, 68, imgY, { fit: [contentWidth - 12, 400], align: 'center' });
          doc.y = imgY + 410; // geser cursor setelah gambar
        } else {
          doc.font('Helvetica').fontSize(10).fillColor(gray)
            .text('Format file tidak didukung untuk ditampilkan.', 68);
        }
      } catch (fileErr) {
        console.error('Gagal membaca isi file:', fileErr.message);
        doc.font('Helvetica').fontSize(10).fillColor(gray)
          .text('Gagal membaca isi file: ' + fileErr.message, 68);
      }
    } else {
      doc.font('Helvetica').fontSize(10).fillColor(gray).text('Tidak ada file terlampir.', 68);
    }

    // ✅ FIX: Dokumentasi foto — layout rapi, 2 kolom, cursor digeser dengan benar
    if (dokumentasiRows.length > 0) {
      doc.moveDown(1);
      doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(0.5).strokeColor(line).stroke();
      doc.moveDown(0.6);

      doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('DOKUMENTASI FOTO RAPAT', 56);
      doc.moveDown(0.5);

      const imgW = (contentWidth - 12) / 2;   // lebar tiap foto (2 kolom)
      const imgH = 180;                         // tinggi tetap tiap foto
      const gap  = 8;                           // jarak antar foto

      for (let i = 0; i < dokumentasiRows.length; i++) {
        const dokRow = dokumentasiRows[i];
        const imgPath = path.join(__dirname, '..', 'public', dokRow.file_path.replace(/^\//, ''));

        if (!fs.existsSync(imgPath)) continue;

        const col = i % 2;          // 0 = kiri, 1 = kanan
        const isNewRow = col === 0;

        // Kalau baris baru, cek apakah masih muat di halaman
        if (isNewRow) {
          if (doc.y + imgH + gap > 780) {
            doc.addPage();
            doc.moveDown(0.5);
          }
        }

        const xPos = col === 0 ? 68 : 68 + imgW + gap;
        const yPos = isNewRow ? doc.y : doc.y; // posisi y tetap untuk baris yang sama

        try {
          doc.image(imgPath, xPos, yPos, { fit: [imgW, imgH], align: 'center', valign: 'center' });
        } catch (imgErr) {
          console.error('Gagal memuat foto dokumentasi:', imgErr.message);
          doc.font('Helvetica').fontSize(9).fillColor(gray)
            .text(`[Gagal memuat: ${path.basename(imgPath)}]`, xPos, yPos);
        }

        // Geser cursor ke bawah hanya setelah kolom kanan (atau foto terakhir di baris ganjil)
        if (col === 1 || i === dokumentasiRows.length - 1) {
          doc.y = yPos + imgH + gap;
          doc.moveDown(0.3);
        }
      }
    }

    doc.moveDown(2);

    // Footer
    const uploadedAt = new Date(minute.created_at).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(1).strokeColor(green).stroke();
    doc.moveDown(0.4);
    doc.fontSize(8).fillColor(gray)
      .text(`Diunggah pada: ${uploadedAt}`, 56, doc.y, { align: 'left', continued: true })
      .text('FTI Meeting System', { align: 'right' });

    doc.rect(0, 830, 595, 6).fill(green);
    doc.end();
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
  renderUploadMinutesForm,
  processUploadMinutes,
  deleteMinute,
  replaceMinute,
  exportMinutePdf
};