const db = require('../lib/db');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');

// =========================================================================
// INDEX — Daftar semua meeting
// =========================================================================
const index = async (req, res, next) => {
  try {
    const [meetings] = await db.query(`
      SELECT 
        m.id, m.title, m.description, m.meeting_type,
        m.meeting_date, m.start_time, m.end_time, m.status,
        COUNT(mp.id) AS participant_count
      FROM meetings m
      LEFT JOIN meeting_participants mp ON m.id = mp.meeting_id
      GROUP BY m.id, m.title, m.description, m.meeting_type,
               m.meeting_date, m.start_time, m.end_time, m.status
      ORDER BY m.meeting_date ASC, m.start_time ASC
    `);

    const [employees] = await db.query(`
      SELECT id, name, employee_number
      FROM employees
      WHERE status = 'active'
      ORDER BY name ASC
    `);

    const totalMeetings     = meetings.length;
    const scheduledMeetings = meetings.filter(m => m.status === 'scheduled').length;
    const completedMeetings = meetings.filter(m => m.status === 'completed').length;
    const cancelledMeetings = meetings.filter(m => m.status === 'cancelled').length;

    res.render('meetings/index', {
      title: 'Meeting Dashboard',
      meetings,
      employees,
      stats: {
        total: totalMeetings,
        scheduled: scheduledMeetings,
        completed: completedMeetings,
        cancelled: cancelledMeetings
      }
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// CREATE — Form tambah meeting
// =========================================================================
const create = async (req, res, next) => {
  try {
    const [employees] = await db.query(`
      SELECT id, name, employee_number
      FROM employees
      WHERE status = 'active'
      ORDER BY name ASC
    `);
    res.render('meetings/create', { title: 'Tambah Meeting', employees });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// STORE — Simpan meeting baru
// =========================================================================
const store = async (req, res, next) => {
  const { title, description, meeting_date, start_time, end_time, meeting_type, status, participant_ids } = req.body;

  try {
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    const participants = participant_ids
      ? participant_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))
      : [];

    const organizerId = 1;
    const leaderId = 3;

    const [result] = await db.query(
      `INSERT INTO meetings
        (title, description, organizer_id, leader_id, meeting_type, meeting_date,
         start_time, end_time, is_confidential, status, organizer_id_id, leader_id_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, description || null, organizerId, leaderId, meeting_type, meeting_date,
       start_time, end_time, 0, status, organizerId, leaderId]
    );

    const meetingId = result.insertId;

    for (const employeeId of participants) {
      await db.query(
        `INSERT INTO meeting_participants (meeting_id, employee_id, status, created_at, updated_at)
         VALUES (?, ?, 'invited', NOW(), NOW())`,
        [meetingId, employeeId]
      );
    }

    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// SHOW — Detail meeting
// =========================================================================
const show = async (req, res, next) => {
  const meetingId = req.params.id;
  try {
    const [rows] = await db.query(
      `SELECT id, title, description, meeting_type, meeting_date, start_time, end_time, status
       FROM meetings WHERE id = ?`,
      [meetingId]
    );
    if (rows.length === 0) return res.status(404).send('Meeting tidak ditemukan.');

    const meeting = rows[0];

    const [participants] = await db.query(
      `SELECT mp.id, mp.meeting_id, mp.employee_id, mp.status, e.name, e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ?
       ORDER BY e.name ASC`,
      [meetingId]
    );

    res.render('meetings/show', { title: 'Detail Meeting', meeting, participants });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// EDIT — Form edit meeting
// =========================================================================
const edit = async (req, res, next) => {
  const meetingId = req.params.id;
  try {
    const [rows] = await db.query(
      `SELECT id, title, description, meeting_type, meeting_date, start_time, end_time, status
       FROM meetings WHERE id = ?`,
      [meetingId]
    );
    if (rows.length === 0) return res.status(404).send('Meeting tidak ditemukan.');

    const meeting = rows[0];

    const [employees] = await db.query(
      `SELECT id, name, employee_number FROM employees WHERE status = 'active' ORDER BY name ASC`
    );

    const [selectedParticipants] = await db.query(
      `SELECT mp.employee_id, e.name, e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ?
       ORDER BY e.name ASC`,
      [meetingId]
    );

    const selectedParticipantsData = selectedParticipants.map(p => ({
      id: String(p.employee_id),
      name: p.name,
      number: p.employee_number || ''
    }));

    res.render('meetings/edit', { title: 'Edit Meeting', meeting, employees, selectedParticipantsData });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// UPDATE — Simpan perubahan meeting
// =========================================================================
const update = async (req, res, next) => {
  const meetingId = req.params.id;
  const { title, description, meeting_date, start_time, end_time, meeting_type, status, participant_ids } = req.body;

  try {
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    const participants = participant_ids
      ? participant_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))
      : [];

    await db.query(
      `UPDATE meetings SET title=?, description=?, meeting_date=?, start_time=?,
       end_time=?, meeting_type=?, status=?, updated_at=NOW() WHERE id=?`,
      [title, description || null, meeting_date, start_time, end_time, meeting_type, status, meetingId]
    );

    await db.query(`DELETE FROM meeting_participants WHERE meeting_id = ?`, [meetingId]);

    for (const employeeId of participants) {
      await db.query(
        `INSERT INTO meeting_participants (meeting_id, employee_id, status, created_at, updated_at)
         VALUES (?, ?, 'invited', NOW(), NOW())`,
        [meetingId, employeeId]
      );
    }

    res.redirect(`/meetings/${meetingId}`);
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// DESTROY — Hapus meeting
// =========================================================================
const destroy = async (req, res, next) => {
  const meetingId = req.params.id;
  try {
    await db.query(`DELETE FROM meeting_participants WHERE meeting_id = ?`, [meetingId]);
    await db.query(`DELETE FROM meeting_minutes WHERE meeting_id = ?`, [meetingId]);
    await db.query(`DELETE FROM meetings WHERE id = ?`, [meetingId]);
    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// RENDER UPLOAD MINUTES — Halaman upload notulensi + filter by rapat
// =========================================================================
const renderUploadMinutesForm = async (req, res, next) => {
  try {
    const selectedMeetingId = req.query.meeting_id || null;

    // Untuk dropdown form upload — rapat yang BELUM punya notulensi
const [meetingsData] = await db.query(`
  SELECT id, title, meeting_date as date
  FROM meetings
  WHERE id NOT IN (SELECT meeting_id FROM meeting_minutes)
  ORDER BY meeting_date DESC
`);

// Untuk dropdown filter daftar — rapat yang SUDAH punya notulensi
const [meetingsWithMinutes] = await db.query(`
  SELECT DISTINCT m.id, m.title, m.meeting_date as date
  FROM meetings m
  INNER JOIN meeting_minutes mm ON m.id = mm.meeting_id
  ORDER BY m.meeting_date DESC
`);

    

    let minutesQuery = `
      SELECT mm.id, m.title as meeting_title, mm.file as file_path,
             mm.summary, DATE_FORMAT(mm.created_at, '%d-%m-%Y %H:%i') as uploaded_at
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

    res.render('meetings/upload_minutes', {
      meetings: meetingsData,
      meetingsWithMinutes: meetingsWithMinutes,
      minutesList: historyData,
      selectedMeetingId: selectedMeetingId
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// PROCESS UPLOAD MINUTES — Simpan notulensi baru
// =========================================================================
const processUploadMinutes = async (req, res, next) => {
  try {
    const meetingId    = req.body.meeting_id;
    const summaryText  = req.body.notes || '';
    
    const uploadedFile = req.file;
   
    // Ambil organizer_id dari rapat yang dipilih
const [[meeting]] = await db.query(
  `SELECT organizer_id FROM meetings WHERE id = ?`, [meetingId]
);
const employeeId = meeting.organizer_id;
const createdBy  = meeting.organizer_id;
    if (!uploadedFile) {
      return res.status(400).send('Tidak ada file yang diunggah.');
    }

    if (!employeeId) {
      return res.status(400).send('Pilih nama pengunggah terlebih dahulu.');
    }

    const filePath = '/assets/uploads/' + uploadedFile.filename;

    await db.query(
      `INSERT INTO meeting_minutes (meeting_id, file, summary, created_by, employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [meetingId, filePath, summaryText, createdBy, employeeId]
    );

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// DELETE MINUTE — Hapus notulensi + file fisik
// =========================================================================
const deleteMinute = async (req, res, next) => {
  const minuteId = req.params.id;
  try {
    const [rows] = await db.query(`SELECT file FROM meeting_minutes WHERE id = ?`, [minuteId]);
    if (rows.length === 0) return res.status(404).send('Notulensi tidak ditemukan.');

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
// REPLACE MINUTE — Ganti file notulensi
// =========================================================================
const replaceMinute = async (req, res, next) => {
  const minuteId = req.params.id;
  try {
    if (!req.file) return res.status(400).send('Tidak ada file baru yang diunggah.');

    const [rows] = await db.query(`SELECT file FROM meeting_minutes WHERE id = ?`, [minuteId]);
    if (rows.length === 0) return res.status(404).send('Notulensi tidak ditemukan.');

    const oldFilePath = rows[0].file;
    if (oldFilePath) {
      const absoluteOldPath = path.join(__dirname, '../public', oldFilePath);
      if (fs.existsSync(absoluteOldPath)) fs.unlinkSync(absoluteOldPath);
    }

    const newFilePath = '/assets/uploads/' + req.file.filename;
    await db.query(
      `UPDATE meeting_minutes SET file = ?, updated_at = NOW() WHERE id = ?`,
      [newFilePath, minuteId]
    );

    res.redirect('/meetings/upload-minutes');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
/// EXPORT MINUTE PDF — Generate & download PDF notulensi
// =========================================================================
// EXPORT MINUTE PDF — Generate & download PDF notulensi
// =========================================================================
const exportMinutePdf = async (req, res, next) => {
  const minuteId = req.params.id;
  try {
    const [rows] = await db.query(
      `SELECT mm.id, mm.summary, mm.file, mm.created_at,
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

    const doc = new PDFDocument({ margin: 56, size: 'A4' });
    const safeName = minute.meeting_title.replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="notulensi_${safeName}.pdf"`);
    doc.pipe(res);

    const W = 595 - 56 * 2; // lebar konten
    const GRAY = '#6b7280';
    const DARK = '#111827';
    const GREEN = '#065f46';
    const GREEN_LIGHT = '#d1fae5';
    const LINE = '#e5e7eb';

    // ── Header ────────────────────────────────────────────────────────────
    // Bar hijau di atas
    doc.rect(0, 0, 595, 6).fill(GREEN);

    doc.moveDown(0.5);
    doc.fontSize(22).font('Helvetica-Bold').fillColor(DARK)
      .text('NOTULENSI RAPAT', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor(GRAY)
      .text('FTI Meeting System', { align: 'center' });
    doc.moveDown(0.6);

    // Garis pemisah header
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(1.5).strokeColor(GREEN).stroke();
    doc.moveDown(0.8);

    // ── Box Info Rapat ────────────────────────────────────────────────────
    const meetingDate = new Date(minute.meeting_date).toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Label section
    doc.fontSize(11).font('Helvetica-Bold').fillColor(GREEN)
      .text('INFORMASI RAPAT', 56);
    doc.moveDown(0.3);

    // Box abu
    const boxY = doc.y;
    const infoRows = [
      ['Judul Rapat',  minute.meeting_title],
      ['Tanggal',      meetingDate],
      ['Waktu',        `${minute.start_time.substring(0,5)} – ${minute.end_time.substring(0,5)}`],
      ['Jenis Rapat',  minute.meeting_type.charAt(0).toUpperCase() + minute.meeting_type.slice(1)],
      ['Status',       minute.status.charAt(0).toUpperCase() + minute.status.slice(1)],
    ];
    const rowH = 20;
    const boxH = infoRows.length * rowH + 16;
    doc.rect(56, boxY, W, boxH).fillAndStroke('#f9fafb', LINE);

    let rowY = boxY + 10;
    doc.font('Helvetica').fontSize(10);
    for (const [label, value] of infoRows) {
      doc.fillColor(GRAY).text(label, 68, rowY, { width: 100, lineBreak: false });
      doc.fillColor(DARK).text(`: ${value || '-'}`, 168, rowY, { width: W - 120, lineBreak: false });
      rowY += rowH;
    }

    doc.y = boxY + boxH + 14;
    doc.moveDown(0.2);

    // ── Peserta ───────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(GREEN)
      .text('DAFTAR PESERTA', 56);
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(10).fillColor(DARK);
    if (participants.length > 0) {
      participants.forEach((p, i) => {
        doc.text(
          `${i + 1}.  ${p.name}${p.employee_number ? '  (' + p.employee_number + ')' : ''}`,
          68, doc.y, { lineGap: 3 }
        );
      });
    } else {
      doc.fillColor(GRAY).text('Tidak ada peserta terdaftar.', 68);
    }

    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.moveDown(0.6);

    // ── Ringkasan ─────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(GREEN)
      .text('RINGKASAN / CATATAN', 56);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    if (minute.summary && minute.summary.trim() && minute.summary.trim() !== '-') {
      doc.fillColor(DARK).text(minute.summary, 68, doc.y, { lineGap: 4, width: W - 12 });
    } else {
      doc.fillColor(GRAY).text('Tidak ada catatan yang ditambahkan.', 68);
    }

    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.moveDown(0.6);

    // ── Isi File ──────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(GREEN)
      .text('ISI FILE NOTULENSI', 56);
    doc.moveDown(0.3);

    if (minute.file) {
      const filePath = path.join(__dirname, '..', 'public', minute.file.replace(/^\//, ''));
      const ext = path.extname(minute.file).toLowerCase();

      try {
        if (ext === '.pdf') {
          const fileBuffer = fs.readFileSync(filePath);
          const pdfData = await (pdfParse.default ? pdfParse.default(fileBuffer) : pdfParse(fileBuffer));
          const extracted = (pdfData?.text || '').trim();
          if (extracted) {
            doc.font('Helvetica').fontSize(9.5).fillColor(DARK)
              .text(extracted, 68, doc.y, { lineGap: 3, paragraphGap: 5, width: W - 12 });
          } else {
            doc.font('Helvetica').fontSize(10).fillColor(GRAY)
              .text('Tidak ada teks yang dapat diekstrak dari file PDF ini.', 68);
          }

        } else if (ext === '.docx' || ext === '.doc') {
          const result = await mammoth.extractRawText({ path: filePath });
          const extracted = result.value.trim();
          if (extracted) {
            doc.font('Helvetica').fontSize(9.5).fillColor(DARK)
              .text(extracted, 68, doc.y, { lineGap: 3, paragraphGap: 5, width: W - 12 });
          } else {
            doc.font('Helvetica').fontSize(10).fillColor(GRAY)
              .text('Tidak ada teks yang dapat diekstrak dari file Word ini.', 68);
          }

        } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          doc.image(filePath, 68, doc.y, { fit: [W - 12, 500], align: 'center' });

        } else {
          doc.font('Helvetica').fontSize(10).fillColor(GRAY)
            .text('Format file tidak didukung untuk ditampilkan.', 68);
        }
      } catch (fileErr) {
        console.error('Gagal membaca isi file:', fileErr.message);
        doc.font('Helvetica').fontSize(10).fillColor(GRAY)
          .text('Gagal membaca isi file: ' + fileErr.message, 68);
      }
    } else {
      doc.font('Helvetica').fontSize(10).fillColor(GRAY)
        .text('Tidak ada file terlampir.', 68);
    }

    doc.moveDown(2);

    // ── Footer ────────────────────────────────────────────────────────────
    const uploadedAt = new Date(minute.created_at).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Garis footer
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(1).strokeColor(GREEN).stroke();
    doc.moveDown(0.4);
    doc.fontSize(8).fillColor(GRAY)
      .text(`Diunggah pada: ${uploadedAt}`, 56, doc.y, { align: 'left', continued: true })
      .text('FTI Meeting System', { align: 'right' });

    // Bar hijau di bawah
    doc.rect(0, 830, 595, 6).fill(GREEN);

    doc.end();
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// EXPORTS
// =========================================================================
module.exports = {
  index,
  create,
  store,
  show,
  edit,
  update,
  destroy,
  renderUploadMinutesForm,
  processUploadMinutes,
  deleteMinute,
  replaceMinute,
  exportMinutePdf,
};