const db = require('../lib/db');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

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

    const [meetingsData] = await db.query(`
  SELECT id, title, meeting_date as date
  FROM meetings
  WHERE id NOT IN (
    SELECT meeting_id FROM meeting_minutes
  )
  ORDER BY meeting_date DESC
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

    const doc = new PDFDocument({ margin: 50 });
    const safeName = minute.meeting_title.replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="notulensi_${safeName}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('NOTULENSI RAPAT', { align: 'center' });
    doc.fontSize(11).font('Helvetica').text('FTI Meeting System', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    // Info Rapat
    doc.fontSize(12).font('Helvetica-Bold').text('Informasi Rapat');
    doc.moveDown(0.3);
    const meetingDate = new Date(minute.meeting_date).toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const infoRows = [
      ['Judul Rapat',  minute.meeting_title],
      ['Tanggal',      meetingDate],
      ['Waktu',        `${minute.start_time} - ${minute.end_time}`],
      ['Jenis Rapat',  minute.meeting_type],
      ['Status',       minute.status],
    ];
    doc.font('Helvetica').fontSize(11);
    for (const [label, value] of infoRows) {
      doc.text(`${label.padEnd(18)}: ${value || '-'}`);
    }

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(0.8);

    // Peserta
    doc.fontSize(12).font('Helvetica-Bold').text('Daftar Peserta');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11);
    if (participants.length > 0) {
      participants.forEach((p, i) => {
        doc.text(`${i + 1}. ${p.name}${p.employee_number ? ' (' + p.employee_number + ')' : ''}`);
      });
    } else {
      doc.text('Tidak ada peserta terdaftar.');
    }

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(0.8);

    // Ringkasan
    doc.fontSize(12).font('Helvetica-Bold').text('Ringkasan / Catatan');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11);
    if (minute.summary && minute.summary.trim()) {
      doc.text(minute.summary, { lineGap: 4 });
    } else {
      doc.fillColor('#888888').text('Tidak ada catatan yang ditambahkan.').fillColor('#000000');
    }

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(0.8);

    // Lampiran
    doc.fontSize(12).font('Helvetica-Bold').text('Lampiran File');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11);
    if (minute.file) {
      doc.text(`File: ${path.basename(minute.file)}`);
    } else {
      doc.fillColor('#888888').text('Tidak ada file terlampir.').fillColor('#000000');
    }

    doc.moveDown(1.5);

    // Footer
    const uploadedAt = new Date(minute.created_at).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    doc.fontSize(9).fillColor('#aaaaaa')
      .text(`Diunggah pada: ${uploadedAt}`, { align: 'right' })
      .text('Dokumen ini digenerate otomatis oleh FTI Meeting System', { align: 'right' });

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