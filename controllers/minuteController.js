const db = require('../lib/db');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/*
  Helper: format nilai waktu dari database (HH:MM:SS) menjadi HH:MM.
*/
const formatTimeValue = (timeValue) => {
  if (!timeValue) {
    return '-';
  }
  return String(timeValue).substring(0, 5);
};

// =========================================================================
// RENDER UPLOAD MINUTES — Menampilkan halaman upload notulensi
// =========================================================================

const renderUploadMinutesForm = async (req, res, next) => {
  try {
    const selectedMeetingId = req.query.meeting_id || null;

    /*
      Dropdown upload:
      hanya menampilkan meeting yang belum punya notulensi.
    */
    const [meetingsData] = await db.query(`
      SELECT 
        id,
        title,
        meeting_date AS date
      FROM meetings
      WHERE id NOT IN (
        SELECT meeting_id
        FROM meeting_minutes
      )
      ORDER BY meeting_date DESC
    `);

    /*
      Dropdown filter:
      hanya menampilkan meeting yang sudah punya notulensi.
    */
    const [meetingsWithMinutes] = await db.query(`
      SELECT DISTINCT
        m.id,
        m.title,
        m.meeting_date AS date
      FROM meetings m
      INNER JOIN meeting_minutes mm ON m.id = mm.meeting_id
      ORDER BY m.meeting_date DESC
    `);

    let minutesQuery = `
      SELECT 
        mm.id,
        m.title AS meeting_title,
        mm.file AS file_path,
        mm.summary,
        DATE_FORMAT(mm.created_at, '%d-%m-%Y %H:%i') AS uploaded_at
      FROM meeting_minutes mm
      JOIN meetings m ON mm.meeting_id = m.id
    `;

    const params = [];

    if (selectedMeetingId) {
      minutesQuery += ` WHERE mm.meeting_id = ?`;
      params.push(selectedMeetingId);
    }

    minutesQuery += ` ORDER BY mm.created_at DESC`;

    const [historyData] = await db.query(minutesQuery, params);

    res.render('minutes/upload', {
      meetings: meetingsData,
      meetingsWithMinutes,
      minutesList: historyData,
      selectedMeetingId
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// PROCESS UPLOAD MINUTES — Menyimpan file notulensi
// =========================================================================

const processUploadMinutes = async (req, res, next) => {
  try {
    const meetingId = req.body.meeting_id;
    const summaryText = req.body.notes || '';
    const uploadedFile = req.file;

    if (!meetingId) {
      return res.status(400).send('Pilih rapat terlebih dahulu.');
    }

    if (!uploadedFile) {
      return res.status(400).send('Tidak ada file yang diunggah.');
    }

    /*
      Ambil organizer_id dari meeting.
      Di project ini organizer_id dipakai sebagai created_by dan employee_id
      untuk data notulensi.
    */
    const [meetingRows] = await db.query(
      `SELECT organizer_id
       FROM meetings
       WHERE id = ?`,
      [meetingId]
    );

    if (meetingRows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const employeeId = meetingRows[0].organizer_id;
    const createdBy = meetingRows[0].organizer_id;

    if (!employeeId) {
      return res.status(400).send('Data pengunggah tidak ditemukan.');
    }

    const filePath = '/assets/uploads/' + uploadedFile.filename;

    await db.query(
      `INSERT INTO meeting_minutes
        (
          meeting_id,
          file,
          summary,
          created_by,
          employee_id,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        meetingId,
        filePath,
        summaryText,
        createdBy,
        employeeId
      ]
    );

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// DELETE MINUTE — Menghapus notulensi
// =========================================================================

const deleteMinute = async (req, res, next) => {
  const minuteId = req.params.id;

  try {
    const [rows] = await db.query(
      `SELECT file
       FROM meeting_minutes
       WHERE id = ?`,
      [minuteId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Notulensi tidak ditemukan.');
    }

    const filePath = rows[0].file;

    await db.query(
      `DELETE FROM meeting_minutes
       WHERE id = ?`,
      [minuteId]
    );

    /*
      Hapus file fisik dari folder public jika file-nya masih ada.
    */
    if (filePath) {
      const absolutePath = path.join(__dirname, '../public', filePath);

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// REPLACE MINUTE — Mengganti file notulensi
// =========================================================================

const replaceMinute = async (req, res, next) => {
  const minuteId = req.params.id;

  try {
    if (!req.file) {
      return res.status(400).send('Tidak ada file baru yang diunggah.');
    }

    const [rows] = await db.query(
      `SELECT file
       FROM meeting_minutes
       WHERE id = ?`,
      [minuteId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Notulensi tidak ditemukan.');
    }

    const oldFilePath = rows[0].file;

    /*
      Hapus file lama dari folder public.
    */
    if (oldFilePath) {
      const absoluteOldPath = path.join(__dirname, '../public', oldFilePath);

      if (fs.existsSync(absoluteOldPath)) {
        fs.unlinkSync(absoluteOldPath);
      }
    }

    const newFilePath = '/assets/uploads/' + req.file.filename;

    await db.query(
      `UPDATE meeting_minutes
       SET file = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [newFilePath, minuteId]
    );

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// EXPORT MINUTE PDF — Generate PDF notulensi
// =========================================================================

const exportMinutePdf = async (req, res, next) => {
  const minuteId = req.params.id;

  try {
    const [rows] = await db.query(
      `SELECT 
          mm.id,
          mm.summary,
          mm.file,
          mm.created_at,
          m.title AS meeting_title,
          m.meeting_date,
          m.start_time,
          m.end_time,
          m.meeting_type,
          m.status
       FROM meeting_minutes mm
       JOIN meetings m ON mm.meeting_id = m.id
       WHERE mm.id = ?`,
      [minuteId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Notulensi tidak ditemukan.');
    }

    const minute = rows[0];

    const [participants] = await db.query(
      `SELECT 
          e.name,
          e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = (
         SELECT meeting_id
         FROM meeting_minutes
         WHERE id = ?
       )
       ORDER BY e.name ASC`,
      [minuteId]
    );

    const doc = new PDFDocument({
      margin: 56,
      size: 'A4'
    });

    const safeName = minute.meeting_title.replace(/[^a-z0-9]/gi, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="notulensi_${safeName}.pdf"`);

    doc.pipe(res);

    const contentWidth = 595 - 56 * 2;
    const gray = '#6b7280';
    const dark = '#111827';
    const green = '#065f46';
    const line = '#e5e7eb';

    // ---------------------------------------------------------------------
    // Header PDF
    // ---------------------------------------------------------------------

    doc.rect(0, 0, 595, 6).fill(green);

    doc.moveDown(0.5);

    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor(dark)
      .text('NOTULENSI RAPAT', {
        align: 'center'
      });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(gray)
      .text('FTI Meeting System', {
        align: 'center'
      });

    doc.moveDown(0.6);

    doc
      .moveTo(56, doc.y)
      .lineTo(539, doc.y)
      .lineWidth(1.5)
      .strokeColor(green)
      .stroke();

    doc.moveDown(0.8);

    // ---------------------------------------------------------------------
    // Informasi Rapat
    // ---------------------------------------------------------------------

    const meetingDate = new Date(minute.meeting_date).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(green)
      .text('INFORMASI RAPAT', 56);

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

    doc
      .rect(56, boxY, contentWidth, boxHeight)
      .fillAndStroke('#f9fafb', line);

    let rowY = boxY + 10;

    doc
      .font('Helvetica')
      .fontSize(10);

    for (const [label, value] of infoRows) {
      doc
        .fillColor(gray)
        .text(label, 68, rowY, {
          width: 100,
          lineBreak: false
        });

      doc
        .fillColor(dark)
        .text(`: ${value || '-'}`, 168, rowY, {
          width: contentWidth - 120,
          lineBreak: false
        });

      rowY += rowHeight;
    }

    doc.y = boxY + boxHeight + 14;
    doc.moveDown(0.2);

    // ---------------------------------------------------------------------
    // Daftar Peserta
    // ---------------------------------------------------------------------

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(green)
      .text('DAFTAR PESERTA', 56);

    doc.moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(dark);

    if (participants.length > 0) {
      participants.forEach((participant, index) => {
        const employeeNumberText = participant.employee_number
          ? `  (${participant.employee_number})`
          : '';

        doc.text(
          `${index + 1}.  ${participant.name}${employeeNumberText}`,
          68,
          doc.y,
          {
            lineGap: 3
          }
        );
      });
    } else {
      doc
        .fillColor(gray)
        .text('Tidak ada peserta terdaftar.', 68);
    }

    doc.moveDown(0.8);

    doc
      .moveTo(56, doc.y)
      .lineTo(539, doc.y)
      .lineWidth(0.5)
      .strokeColor(line)
      .stroke();

    doc.moveDown(0.6);

    // ---------------------------------------------------------------------
    // Ringkasan / Catatan
    // ---------------------------------------------------------------------

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(green)
      .text('RINGKASAN / CATATAN', 56);

    doc.moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(10);

    if (minute.summary && minute.summary.trim() && minute.summary.trim() !== '-') {
      doc
        .fillColor(dark)
        .text(minute.summary, 68, doc.y, {
          lineGap: 4,
          paragraphGap: 5,
          width: contentWidth - 12
        });
    } else {
      doc
        .fillColor(gray)
        .text('Tidak ada catatan yang ditambahkan.', 68);
    }

    doc.moveDown(0.8);

    doc
      .moveTo(56, doc.y)
      .lineTo(539, doc.y)
      .lineWidth(0.5)
      .strokeColor(line)
      .stroke();

    doc.moveDown(0.6);

    // ---------------------------------------------------------------------
    // Isi File Notulensi
    // ---------------------------------------------------------------------

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(green)
      .text('ISI FILE NOTULENSI', 56);

    doc.moveDown(0.3);

    if (minute.file) {
      const filePath = path.join(
        __dirname,
        '..',
        'public',
        minute.file.replace(/^\//, '')
      );

      const ext = path.extname(minute.file).toLowerCase();

      try {
        if (ext === '.pdf') {
          const fileBuffer = fs.readFileSync(filePath);
          const pdfData = await (
            pdfParse.default
              ? pdfParse.default(fileBuffer)
              : pdfParse(fileBuffer)
          );

          const extractedText = (pdfData?.text || '').trim();

          if (extractedText) {
            doc
              .font('Helvetica')
              .fontSize(9.5)
              .fillColor(dark)
              .text(extractedText, 68, doc.y, {
                lineGap: 3,
                paragraphGap: 5,
                width: contentWidth - 12
              });
          } else {
            doc
              .font('Helvetica')
              .fontSize(10)
              .fillColor(gray)
              .text('Tidak ada teks yang dapat diekstrak dari file PDF ini.', 68);
          }
        } else if (ext === '.docx' || ext === '.doc') {
          const result = await mammoth.extractRawText({
            path: filePath
          });

          const extractedText = result.value.trim();

          if (extractedText) {
            doc
              .font('Helvetica')
              .fontSize(9.5)
              .fillColor(dark)
              .text(extractedText, 68, doc.y, {
                lineGap: 3,
                paragraphGap: 5,
                width: contentWidth - 12
              });
          } else {
            doc
              .font('Helvetica')
              .fontSize(10)
              .fillColor(gray)
              .text('Tidak ada teks yang dapat diekstrak dari file Word ini.', 68);
          }
        } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          doc.image(filePath, 68, doc.y, {
            fit: [contentWidth - 12, 500],
            align: 'center'
          });
        } else {
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(gray)
            .text('Format file tidak didukung untuk ditampilkan.', 68);
        }
      } catch (fileErr) {
        console.error('Gagal membaca isi file:', fileErr.message);

        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(gray)
          .text('Gagal membaca isi file: ' + fileErr.message, 68);
      }
    } else {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(gray)
        .text('Tidak ada file terlampir.', 68);
    }

    doc.moveDown(2);

    // ---------------------------------------------------------------------
    // Footer PDF
    // ---------------------------------------------------------------------

    const uploadedAt = new Date(minute.created_at).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    doc
      .moveTo(56, doc.y)
      .lineTo(539, doc.y)
      .lineWidth(1)
      .strokeColor(green)
      .stroke();

    doc.moveDown(0.4);

    doc
      .fontSize(8)
      .fillColor(gray)
      .text(`Diunggah pada: ${uploadedAt}`, 56, doc.y, {
        align: 'left',
        continued: true
      })
      .text('FTI Meeting System', {
        align: 'right'
      });

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