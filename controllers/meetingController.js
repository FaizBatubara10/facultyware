const db = require('../lib/db');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { getCurrentEmployee } = require('../middlewares/meetingAccess');

/*
  ==========================================================================
  HELPER
  ==========================================================================

  File controller ini mengikuti struktur database asli:
  - start_time wajib terisi
  - end_time wajib terisi
  - end_time harus lebih besar dari start_time
*/

const formatTimeValue = (timeValue) => {
  if (!timeValue) {
    return '-';
  }

  return String(timeValue).substring(0, 5);
};

const parseParticipantIds = (participantIds) => {
  if (!participantIds) {
    return [];
  }

  return participantIds
    .split(',')
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));
};

/*
  Membersihkan daftar peserta sebelum disimpan:
  1. Menghapus id duplikat
  2. Menghapus host dari daftar peserta
  3. Memastikan id peserta benar-benar employee aktif
*/
const cleanParticipantIds = async (participantIds, organizerId) => {
  const parsedIds = parseParticipantIds(participantIds);

  const uniqueIds = [...new Set(parsedIds)]
    .filter((id) => Number(id) !== Number(organizerId));

  if (uniqueIds.length === 0) {
    return [];
  }

  const placeholders = uniqueIds.map(() => '?').join(',');

  const [rows] = await db.query(
    `
      SELECT id
      FROM employees
      WHERE status = 'active'
        AND id IN (${placeholders})
    `,
    uniqueIds
  );

  return rows.map((row) => Number(row.id));
};

const isEndTimeValid = (startTime, endTime) => {
  if (!startTime || !endTime) {
    return false;
  }

  return endTime > startTime;
};


const getPagination = (queryPage, totalItems, limit = 5) => {
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
  let page = parseInt(queryPage, 10);

  if (isNaN(page) || page < 1) {
    page = 1;
  }

  if (page > totalPages) {
    page = totalPages;
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    totalItems,
    totalPages
  };
};

const getMonthRange = (monthFilter) => {
  const today = new Date();
  let startDate = null;
  let endDate = null;

  if (monthFilter === 'this_month') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  }

  if (monthFilter === 'next_month') {
    startDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  }

  if (!startDate || !endDate) {
    return null;
  }

  const toSqlDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  return {
    start: toSqlDate(startDate),
    end: toSqlDate(endDate)
  };
};

// =========================================================================
// INDEX — Menampilkan daftar meeting + search database + pagination
// =========================================================================

const index = async (req, res, next) => {
  try {
    const currentEmployee = await getCurrentEmployee(req.session.userId);
    const canCreateMeeting = !!currentEmployee;

    const searchKeyword = String(req.query.q || '').trim();
    const selectedStatus = String(req.query.status || 'all');
    const selectedMonth = String(req.query.month || 'all');
    const allowedStatuses = ['draft', 'scheduled', 'completed', 'cancelled'];

    let meetings = [];
    let totalFilteredMeetings = 0;
    let pagination = getPagination(req.query.page, 0, 5);

    if (currentEmployee) {
      const whereParts = [
        `(m.organizer_id = ? OR mp_access.employee_id IS NOT NULL)`
      ];
      const params = [currentEmployee.id, currentEmployee.id];

      if (searchKeyword) {
        whereParts.push(`(
          m.title LIKE ?
          OR m.description LIKE ?
          OR m.meeting_type LIKE ?
          OR m.status LIKE ?
        )`);

        const keywordParam = `%${searchKeyword}%`;
        params.push(keywordParam, keywordParam, keywordParam, keywordParam);
      }

      if (allowedStatuses.includes(selectedStatus)) {
        whereParts.push(`m.status = ?`);
        params.push(selectedStatus);
      }

      const monthRange = getMonthRange(selectedMonth);

      if (monthRange) {
        whereParts.push(`m.meeting_date >= ? AND m.meeting_date < ?`);
        params.push(monthRange.start, monthRange.end);
      }

      const whereSql = whereParts.join(' AND ');

      const [countRows] = await db.query(
        `
          SELECT COUNT(DISTINCT m.id) AS total
          FROM meetings m
          LEFT JOIN meeting_participants mp_access
            ON m.id = mp_access.meeting_id
            AND mp_access.employee_id = ?
          WHERE ${whereSql}
        `,
        params
      );

      totalFilteredMeetings = countRows[0].total || 0;
      pagination = getPagination(req.query.page, totalFilteredMeetings, 5);

      const [meetingRows] = await db.query(
        `
          SELECT 
            m.id,
            m.title,
            m.description,
            m.meeting_type,
            m.meeting_date,
            m.start_time,
            m.end_time,
            m.status,
            m.organizer_id,
            COUNT(DISTINCT mp_count.id) AS participant_count
          FROM meetings m
          LEFT JOIN meeting_participants mp_count
            ON m.id = mp_count.meeting_id
            AND mp_count.employee_id <> m.organizer_id
          LEFT JOIN meeting_participants mp_access
            ON m.id = mp_access.meeting_id
            AND mp_access.employee_id = ?
          WHERE ${whereSql}
          GROUP BY 
            m.id,
            m.title,
            m.description,
            m.meeting_type,
            m.meeting_date,
            m.start_time,
            m.end_time,
            m.status,
            m.organizer_id
          ORDER BY m.meeting_date ASC, m.start_time ASC
          LIMIT ? OFFSET ?
        `,
        [...params, pagination.limit, pagination.offset]
      );

      meetings = meetingRows;
    }

    const [employees] = await db.query(`
      SELECT id, name, employee_number
      FROM employees
      WHERE status = 'active'
      ORDER BY name ASC
    `);

    const accessMessageMap = {
      employee_required: 'Akun ini tidak memiliki data pegawai sehingga tidak dapat membuat meeting.',
      meeting_denied: 'Akun ini tidak memiliki akses untuk membuka meeting tersebut.',
      host_required: 'Hanya host meeting yang dapat mengedit atau menghapus meeting.'
    };

    const accessMessage = accessMessageMap[req.query.access_error] || null;

    const totalMeetings = totalFilteredMeetings;
    const scheduledMeetings = meetings.filter((m) => m.status === 'scheduled').length;
    const completedMeetings = meetings.filter((m) => m.status === 'completed').length;
    const cancelledMeetings = meetings.filter((m) => m.status === 'cancelled').length;

    res.render('meetings/index', {
      title: 'Meeting Dashboard',
      meetings,
      employees,
      canCreateMeeting,
      accessMessage,
      filters: {
        q: searchKeyword,
        status: selectedStatus,
        month: selectedMonth
      },
      pagination,
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
// CREATE — Menampilkan form tambah meeting
// =========================================================================

const create = async (req, res, next) => {
  try {
    const currentEmployee = req.currentEmployee || await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.redirect('/meetings?access_error=employee_required');
    }

    /*
      Host tidak ditampilkan di dropdown peserta,
      karena host otomatis menjadi pembuat/penanggung jawab meeting.
    */
    const [employees] = await db.query(
      `
        SELECT id, name, employee_number
        FROM employees
        WHERE status = 'active'
          AND id <> ?
        ORDER BY name ASC
      `,
      [currentEmployee.id]
    );

    res.render('meetings/create', {
      title: 'Tambah Meeting',
      employees,
      currentEmployee
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// STORE — Menyimpan meeting baru
// =========================================================================

const store = async (req, res, next) => {
  const {
    title,
    description,
    meeting_date,
    start_time,
    end_time,
    meeting_type,
    status,
    participant_ids,
    online_link
  } = req.body;

  try {
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    if (!isEndTimeValid(start_time, end_time)) {
      return res.send('Waktu selesai harus lebih besar dari waktu mulai.');
    }

    const currentEmployee = req.currentEmployee || await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.redirect('/meetings?access_error=employee_required');
    }

    /*
      organizer_id dan leader_id memakai employee id,
      bukan asal user biasa.
    */
    const organizerId = currentEmployee.id;
    const leaderId = currentEmployee.id;

    /*
      Bersihkan peserta:
      - tidak boleh dobel
      - host tidak ikut masuk meeting_participants
      - hanya employee aktif
    */
    const participants = await cleanParticipantIds(participant_ids, organizerId);

    const [result] = await db.query(
      `INSERT INTO meetings
        (
          title,
          description,
          organizer_id,
          leader_id,
          meeting_type,
          meeting_date,
          start_time,
          end_time,
          online_link,
          is_confidential,
          status,
          organizer_id_id,
          leader_id_id,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        title,
        description || null,
        organizerId,
        leaderId,
        meeting_type,
        meeting_date,
        start_time,
        end_time,
        online_link || null,
        0,
        status,
        organizerId,
        leaderId
      ]
    );

    const meetingId = result.insertId;

    for (const employeeId of participants) {
      await db.query(
        `INSERT INTO meeting_participants
          (
            meeting_id,
            employee_id,
            status,
            created_at,
            updated_at
          )
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
// SHOW — Menampilkan detail meeting
// =========================================================================

const show = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    const [rows] = await db.query(
      `SELECT 
          id,
          title,
          description,
          meeting_type,
          meeting_date,
          start_time,
          end_time,
          online_link,
          status,
          organizer_id
       FROM meetings
       WHERE id = ?`,
      [meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const meeting = rows[0];

    /*
      Host tidak ditampilkan sebagai peserta.
      Kalau ada data lama yang telanjur menyimpan host di meeting_participants,
      tetap disembunyikan di halaman detail.
    */
    const [participants] = await db.query(
      `SELECT 
          mp.id,
          mp.meeting_id,
          mp.employee_id,
          mp.status,
          e.name,
          e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ?
         AND mp.employee_id <> ?
       ORDER BY e.name ASC`,
      [meetingId, meeting.organizer_id]
    );

    /*
      isHost dikirim ke view agar tombol Edit/Hapus
      hanya muncul untuk user yang merupakan host meeting ini.
    */
    const currentEmployee = await getCurrentEmployee(req.session.userId);
    const isHost = currentEmployee
      ? Number(meeting.organizer_id) === Number(currentEmployee.id)
      : false;

    res.render('meetings/show', {
      title: 'Detail Meeting',
      meeting,
      participants,
      isHost
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// EDIT — Menampilkan form edit meeting
// =========================================================================

const edit = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    const [rows] = await db.query(
      `SELECT 
          id,
          title,
          description,
          meeting_type,
          meeting_date,
          start_time,
          end_time,
          online_link,
          status,
          organizer_id
       FROM meetings
       WHERE id = ?`,
      [meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const meeting = rows[0];

    /*
      Host tidak muncul di dropdown peserta saat edit.
    */
    const [employees] = await db.query(
      `
        SELECT id, name, employee_number
        FROM employees
        WHERE status = 'active'
          AND id <> ?
        ORDER BY name ASC
      `,
      [meeting.organizer_id]
    );

    /*
      Peserta yang sudah tersimpan akan langsung masuk selectedParticipantsData.
      Host tetap dikeluarkan jika ada data lama yang telanjur tersimpan.
    */
    const [selectedParticipants] = await db.query(
      `SELECT 
          mp.employee_id,
          e.name,
          e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ?
         AND mp.employee_id <> ?
       ORDER BY e.name ASC`,
      [meetingId, meeting.organizer_id]
    );

    const selectedParticipantsData = selectedParticipants.map((participant) => ({
      id: String(participant.employee_id),
      name: participant.name,
      number: participant.employee_number || ''
    }));

    res.render('meetings/edit', {
      title: 'Edit Meeting',
      meeting,
      employees,
      selectedParticipantsData
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// UPDATE — Menyimpan perubahan meeting
// =========================================================================

const update = async (req, res, next) => {
  const meetingId = req.params.id;

  const {
    title,
    description,
    meeting_date,
    start_time,
    end_time,
    meeting_type,
    status,
    participant_ids,
    online_link
  } = req.body;

  try {
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    if (!isEndTimeValid(start_time, end_time)) {
      return res.send('Waktu selesai harus lebih besar dari waktu mulai.');
    }

    const currentEmployee = req.currentEmployee || await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.redirect('/meetings?access_error=employee_required');
    }

    /*
      Karena route update sudah memakai isHost,
      currentEmployee.id adalah host meeting.
    */
    const participants = await cleanParticipantIds(participant_ids, currentEmployee.id);

    await db.query(
      `UPDATE meetings
       SET title = ?,
           description = ?,
           meeting_date = ?,
           start_time = ?,
           end_time = ?,
           meeting_type = ?,
           online_link = ?,
           status = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        title,
        description || null,
        meeting_date,
        start_time,
        end_time,
        meeting_type,
        online_link || null,
        status,
        meetingId
      ]
    );

    await db.query(
      `DELETE FROM meeting_participants WHERE meeting_id = ?`,
      [meetingId]
    );

    for (const employeeId of participants) {
      await db.query(
        `INSERT INTO meeting_participants
          (
            meeting_id,
            employee_id,
            status,
            created_at,
            updated_at
          )
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
// DESTROY — Menghapus meeting
// =========================================================================

const destroy = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    await db.query(
      `DELETE FROM meeting_participants WHERE meeting_id = ?`,
      [meetingId]
    );

    await db.query(
      `DELETE FROM meeting_minutes WHERE meeting_id = ?`,
      [meetingId]
    );

    await db.query(
      `DELETE FROM meetings WHERE id = ?`,
      [meetingId]
    );

    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// RENDER UPLOAD MINUTES — Menampilkan halaman upload notulensi
// =========================================================================

const renderUploadMinutesForm = async (req, res, next) => {
  try {
    const selectedMeetingId = req.query.meeting_id || null;

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

    res.render('meetings/upload_minutes', {
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

    doc.rect(0, 0, 595, 6).fill(green);
    doc.moveDown(0.5);

    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor(dark)
      .text('NOTULENSI RAPAT', { align: 'center' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(gray)
      .text('FTI Meeting System', { align: 'center' });

    doc.moveDown(0.6);

    doc
      .moveTo(56, doc.y)
      .lineTo(539, doc.y)
      .lineWidth(1.5)
      .strokeColor(green)
      .stroke();

    doc.moveDown(0.8);

    const meetingDate = new Date(minute.meeting_date).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
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

    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('DAFTAR PESERTA', 56);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(dark);

    if (participants.length > 0) {
      participants.forEach((participant, index) => {
        const employeeNumberText = participant.employee_number
          ? `  (${participant.employee_number})`
          : '';
        doc.text(`${index + 1}.  ${participant.name}${employeeNumberText}`, 68, doc.y, { lineGap: 3 });
      });
    } else {
      doc.fillColor(gray).text('Tidak ada peserta terdaftar.', 68);
    }

    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(0.5).strokeColor(line).stroke();
    doc.moveDown(0.6);

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
            doc.font('Helvetica').fontSize(9.5).fillColor(dark).text(extractedText, 68, doc.y, { lineGap: 3, paragraphGap: 5, width: contentWidth - 12 });
          } else {
            doc.font('Helvetica').fontSize(10).fillColor(gray).text('Tidak ada teks yang dapat diekstrak dari file PDF ini.', 68);
          }
        } else if (ext === '.docx' || ext === '.doc') {
          const result = await mammoth.extractRawText({ path: filePath });
          const extractedText = result.value.trim();

          if (extractedText) {
            doc.font('Helvetica').fontSize(9.5).fillColor(dark).text(extractedText, 68, doc.y, { lineGap: 3, paragraphGap: 5, width: contentWidth - 12 });
          } else {
            doc.font('Helvetica').fontSize(10).fillColor(gray).text('Tidak ada teks yang dapat diekstrak dari file Word ini.', 68);
          }
        } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          doc.image(filePath, 68, doc.y, { fit: [contentWidth - 12, 500], align: 'center' });
        } else {
          doc.font('Helvetica').fontSize(10).fillColor(gray).text('Format file tidak didukung untuk ditampilkan.', 68);
        }
      } catch (fileErr) {
        console.error('Gagal membaca isi file:', fileErr.message);
        doc.font('Helvetica').fontSize(10).fillColor(gray).text('Gagal membaca isi file: ' + fileErr.message, 68);
      }
    } else {
      doc.font('Helvetica').fontSize(10).fillColor(gray).text('Tidak ada file terlampir.', 68);
    }

    doc.moveDown(2);

    const uploadedAt = new Date(minute.created_at).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(1).strokeColor(green).stroke();
    doc.moveDown(0.4);

    doc
      .fontSize(8)
      .fillColor(gray)
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
  exportMinutePdf
};