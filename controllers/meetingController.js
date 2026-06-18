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


const parseExternalParticipants = (externalParticipantsValue) => {
  if (!externalParticipantsValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(externalParticipantsValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    return [];
  }
};

const cleanExternalParticipants = (externalParticipantsValue) => {
  const parsedExternalParticipants = parseExternalParticipants(externalParticipantsValue);
  const uniqueMap = new Map();

  parsedExternalParticipants.forEach((participant) => {
    const name = String(participant.name || '').trim();
    const institution = String(participant.institution || '').trim();
    const email = String(participant.email || '').trim();
    const status = ['invited', 'attended', 'absent'].includes(participant.status)
      ? participant.status
      : 'invited';

    if (!name) {
      return;
    }

    const uniqueKey = `${name.toLowerCase()}|${email.toLowerCase()}|${institution.toLowerCase()}`;

    if (!uniqueMap.has(uniqueKey)) {
      uniqueMap.set(uniqueKey, {
        name,
        institution: institution || null,
        email: email || null,
        status
      });
    }
  });

  return Array.from(uniqueMap.values());
};

const saveExternalParticipants = async (meetingId, externalParticipants) => {
  for (const participant of externalParticipants) {
    await db.query(
      `INSERT INTO meeting_external_participants
        (
          meeting_id,
          name,
          institution,
          email,
          status,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        meetingId,
        participant.name,
        participant.institution,
        participant.email,
        participant.status || 'invited'
      ]
    );
  }
};

const getExternalParticipantsByMeetingId = async (meetingId) => {
  const [externalParticipants] = await db.query(
    `SELECT
        id,
        meeting_id,
        name,
        institution,
        email,
        status
     FROM meeting_external_participants
     WHERE meeting_id = ?
     ORDER BY name ASC`,
    [meetingId]
  );

  return externalParticipants;
};



/*
  Auto update status meeting berdasarkan waktu mulai:
  - scheduled -> completed jika waktu mulai sudah tercapai/lewat
  - draft -> cancelled jika waktu mulai sudah tercapai/lewat

  Catatan:
  Ini berjalan saat halaman/fitur meeting diakses, bukan memakai background cron.
*/
const syncMeetingStatuses = async () => {
  await db.query(`
    UPDATE meetings
    SET status = CASE
          WHEN status = 'scheduled' THEN 'completed'
          WHEN status = 'draft' THEN 'cancelled'
          ELSE status
        END,
        updated_at = NOW()
    WHERE status IN ('scheduled', 'draft')
      AND TIMESTAMP(meeting_date, start_time) <= NOW()
  `);
};

const isMeetingLocked = (meeting) => {
  if (!meeting) {
    return true;
  }

  return ['completed', 'cancelled'].includes(meeting.status);
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
    await syncMeetingStatuses();

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
      host_required: 'Hanya host meeting yang dapat mengedit atau menghapus meeting.',
      meeting_locked: 'Meeting yang sudah completed atau cancelled tidak dapat diedit lagi.'
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
    external_participants,
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
    const externalParticipants = cleanExternalParticipants(external_participants);

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

    await saveExternalParticipants(meetingId, externalParticipants);

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
    await syncMeetingStatuses();

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
          organizer_id,
          TIMESTAMP(meeting_date, start_time) <= NOW() AS has_started
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

    const externalParticipants = await getExternalParticipantsByMeetingId(meetingId);

    const [minutes] = await db.query(
      `SELECT
          id,
          meeting_id,
          file AS file_path,
          summary,
          DATE_FORMAT(created_at, '%d-%m-%Y %H:%i') AS uploaded_at
       FROM meeting_minutes
       WHERE meeting_id = ?
       ORDER BY created_at DESC`,
      [meetingId]
    );

    /*
      isHost dikirim ke view agar tombol Edit/Hapus
      hanya muncul untuk user yang merupakan host meeting ini.
    */
    const currentEmployee = await getCurrentEmployee(req.session.userId);
    const isHost = currentEmployee
      ? Number(meeting.organizer_id) === Number(currentEmployee.id)
      : false;

    const canEditAttendance = isHost
      && Number(meeting.has_started) === 1
      && meeting.status === 'completed';

    const accessMessageMap = {
      meeting_locked: 'Meeting yang sudah completed atau cancelled tidak dapat diedit lagi.',
      attendance_unavailable: 'Kehadiran baru dapat diubah setelah meeting berstatus completed.'
    };

    const accessMessage = accessMessageMap[req.query.access_error] || null;

    res.render('meetings/show', {
      title: 'Detail Meeting',
      meeting,
      participants,
      externalParticipants,
      minutes,
      isHost,
      canEditAttendance,
      accessMessage
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
    await syncMeetingStatuses();

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

    if (isMeetingLocked(meeting)) {
      return res.redirect(`/meetings/${meetingId}?access_error=meeting_locked`);
    }

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

    const selectedExternalParticipantsData = await getExternalParticipantsByMeetingId(meetingId);

    res.render('meetings/edit', {
      title: 'Edit Meeting',
      meeting,
      employees,
      selectedParticipantsData,
      selectedExternalParticipantsData
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
    external_participants,
    online_link
  } = req.body;

  try {
    await syncMeetingStatuses();

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

    const [meetingRows] = await db.query(
      `SELECT id, status
       FROM meetings
       WHERE id = ?`,
      [meetingId]
    );

    if (meetingRows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    if (isMeetingLocked(meetingRows[0])) {
      return res.redirect(`/meetings/${meetingId}?access_error=meeting_locked`);
    }

    /*
      Karena route update sudah memakai isHost,
      currentEmployee.id adalah host meeting.
    */
    const participants = await cleanParticipantIds(participant_ids, currentEmployee.id);
    const externalParticipants = cleanExternalParticipants(external_participants);

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

    await db.query(
      `DELETE FROM meeting_external_participants WHERE meeting_id = ?`,
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

    await saveExternalParticipants(meetingId, externalParticipants);

    res.redirect(`/meetings/${meetingId}`);
  } catch (err) {
    next(err);
  }
};


// =========================================================================
// UPDATE ATTENDANCE — Mengubah status kehadiran peserta
// =========================================================================

const updateAttendance = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    await syncMeetingStatuses();

    const currentEmployee = req.currentEmployee || await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.redirect('/meetings?access_error=employee_required');
    }

    const [meetingRows] = await db.query(
      `SELECT
          id,
          organizer_id,
          status,
          TIMESTAMP(meeting_date, start_time) <= NOW() AS has_started
       FROM meetings
       WHERE id = ?`,
      [meetingId]
    );

    if (meetingRows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const meeting = meetingRows[0];
    const isHost = Number(meeting.organizer_id) === Number(currentEmployee.id);

    if (!isHost) {
      return res.redirect('/meetings?access_error=host_required');
    }

    if (meeting.status !== 'completed' || Number(meeting.has_started) !== 1) {
      return res.redirect(`/meetings/${meetingId}?access_error=attendance_unavailable`);
    }

    const allowedAttendanceStatuses = ['attended', 'absent'];
    const updates = Object.entries(req.body || {});

    for (const [fieldName, value] of updates) {
      if (!allowedAttendanceStatuses.includes(value)) {
        continue;
      }

      if (fieldName.startsWith('internal_status_')) {
        const participantId = parseInt(fieldName.replace('internal_status_', ''), 10);

        if (!isNaN(participantId)) {
          await db.query(
            `UPDATE meeting_participants
             SET status = ?, updated_at = NOW()
             WHERE id = ?
               AND meeting_id = ?`,
            [value, participantId, meetingId]
          );
        }
      }

      if (fieldName.startsWith('external_status_')) {
        const participantId = parseInt(fieldName.replace('external_status_', ''), 10);

        if (!isNaN(participantId)) {
          await db.query(
            `UPDATE meeting_external_participants
             SET status = ?, updated_at = NOW()
             WHERE id = ?
               AND meeting_id = ?`,
            [value, participantId, meetingId]
          );
        }
      }
    }

    res.redirect(`/meetings/${meetingId}#attendance-section`);
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
      `DELETE FROM meeting_external_participants WHERE meeting_id = ?`,
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
    const employeeId = req.session.employeeId;
    const selectedMeetingId = req.query.meeting_id || null;

    /*
      Dropdown upload:
      hanya menampilkan meeting yang dia buat (organizer), 
      statusnya completed, dan belum punya notulensi.
    */
    const [meetingsData] = await db.query(
      `SELECT 
        id,
        title,
        meeting_date AS date
      FROM meetings
      WHERE organizer_id = ?
        AND status = 'completed'
        AND id NOT IN (
          SELECT meeting_id
          FROM meeting_minutes
        )
      ORDER BY meeting_date DESC`,
      [employeeId]
    );

    // ... sisanya (meetingsWithMinutes, minutesQuery, dst) tetap sama

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
// EXPORT ATTENDANCE PDF — Generate PDF daftar hadir peserta meeting
// =========================================================================

const exportAttendancePdf = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    await syncMeetingStatuses();

    const [meetingRows] = await db.query(
      `SELECT
          m.id,
          m.title,
          m.description,
          m.meeting_type,
          m.meeting_date,
          m.start_time,
          m.end_time,
          m.online_link,
          m.status,
          m.organizer_id,
          e.name AS organizer_name,
          e.employee_number AS organizer_number
       FROM meetings m
       JOIN employees e ON m.organizer_id = e.id
       WHERE m.id = ?`,
      [meetingId]
    );

    if (meetingRows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const meeting = meetingRows[0];

    const [internalParticipants] = await db.query(
      `SELECT
          e.name,
          e.employee_number,
          mp.status
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ?
         AND mp.employee_id <> ?
       ORDER BY e.name ASC`,
      [meetingId, meeting.organizer_id]
    );

    const externalParticipants = await getExternalParticipantsByMeetingId(meetingId);

    const statusLabelMap = {
      invited: 'Diundang',
      confirmed: 'Konfirmasi Hadir',
      declined: 'Berhalangan',
      attended: 'Hadir',
      absent: 'Tidak Hadir'
    };

    const doc = new PDFDocument({
      margin: 56,
      size: 'A4'
    });

    const safeName = String(meeting.title || 'meeting').replace(/[^a-z0-9]/gi, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="daftar_hadir_${safeName}.pdf"`);

    doc.pipe(res);

    const green = '#065f46';
    const dark = '#111827';
    const gray = '#6b7280';
    const line = '#e5e7eb';
    const contentWidth = 595 - 56 * 2;

    doc.rect(0, 0, 595, 6).fill(green);
    doc.moveDown(0.5);

    doc
      .fontSize(21)
      .font('Helvetica-Bold')
      .fillColor(dark)
      .text('DAFTAR HADIR PESERTA MEETING', { align: 'center' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(gray)
      .text('FTI Meeting System', { align: 'center' });

    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(1.3).strokeColor(green).stroke();
    doc.moveDown(0.8);

    const meetingDate = new Date(meeting.meeting_date).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const infoRows = [
      ['Judul Meeting', meeting.title],
      ['Tanggal', meetingDate],
      ['Waktu', `${formatTimeValue(meeting.start_time)} - ${formatTimeValue(meeting.end_time)}`],
      ['Tipe', meeting.meeting_type],
      ['Status', meeting.status],
      ['Host', `${meeting.organizer_name}${meeting.organizer_number ? ' (' + meeting.organizer_number + ')' : ''}`]
    ];

    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('INFORMASI MEETING');
    doc.moveDown(0.3);

    const boxY = doc.y;
    const rowHeight = 19;
    const boxHeight = infoRows.length * rowHeight + 14;

    doc.rect(56, boxY, contentWidth, boxHeight).fillAndStroke('#f9fafb', line);

    let rowY = boxY + 9;
    doc.font('Helvetica').fontSize(10);

    for (const [label, value] of infoRows) {
      doc.fillColor(gray).text(label, 68, rowY, { width: 110, lineBreak: false });
      doc.fillColor(dark).text(`: ${value || '-'}`, 188, rowY, { width: contentWidth - 135, lineBreak: false });
      rowY += rowHeight;
    }

    doc.y = boxY + boxHeight + 18;

    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('HOST MEETING');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(dark)
      .text(`1. ${meeting.organizer_name}${meeting.organizer_number ? ' (' + meeting.organizer_number + ')' : ''} - Host`);

    doc.moveDown(0.8);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('PESERTA INTERNAL');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(dark);

    if (internalParticipants.length > 0) {
      internalParticipants.forEach((participant, index) => {
        const statusText = statusLabelMap[participant.status] || participant.status || '-';
        const numberText = participant.employee_number ? ` (${participant.employee_number})` : '';
        doc.text(`${index + 1}. ${participant.name}${numberText} - ${statusText}`, { lineGap: 3 });
      });
    } else {
      doc.fillColor(gray).text('Tidak ada peserta internal tambahan.');
    }

    doc.moveDown(0.8);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('PESERTA EKSTERNAL');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(dark);

    if (externalParticipants.length > 0) {
      externalParticipants.forEach((participant, index) => {
        const statusText = statusLabelMap[participant.status] || participant.status || '-';
        const institutionText = participant.institution ? ` - ${participant.institution}` : '';
        const emailText = participant.email ? ` (${participant.email})` : '';
        doc.text(`${index + 1}. ${participant.name}${institutionText}${emailText} - ${statusText}`, { lineGap: 3 });
      });
    } else {
      doc.fillColor(gray).text('Tidak ada peserta eksternal.');
    }

    doc.moveDown(1.2);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).lineWidth(0.8).strokeColor(line).stroke();
    doc.moveDown(0.5);

    const exportedAt = new Date().toLocaleString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    doc
      .fontSize(8)
      .fillColor(gray)
      .text(`Dicetak pada: ${exportedAt}`, 56, doc.y, { align: 'left', continued: true })
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
  updateAttendance,
  destroy,
  exportAttendancePdf,
  renderUploadMinutesForm,
  processUploadMinutes,
  deleteMinute,
  replaceMinute,
  exportMinutePdf
};