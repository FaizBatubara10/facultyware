const db = require('../lib/db');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { getCurrentEmployee } = require('../middlewares/meetingAccess');

const formatTimeValue = (timeValue) => {
  if (!timeValue) return '-';
  return String(timeValue).substring(0, 5);
};

const formatDateValue = (dateValue) => {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

const safeFileName = (value) => {
  return String(value || 'meeting')
    .trim()
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'meeting';
};

const isFinalAttendanceStatus = (status) => {
  return ['attended', 'absent'].includes(status);
};

const getAttendanceStatusLabel = (status) => {
  const labels = {
    invited: 'Diundang',
    confirmed: 'Konfirmasi Hadir',
    declined: 'Berhalangan',
    attended: 'Hadir',
    absent: 'Tidak Hadir'
  };
  return labels[status] || status || '-';
};

const isAttendanceExportReady = (internalParticipants, externalParticipants) => {
  const participantStatuses = [
    ...internalParticipants.map((p) => p.status),
    ...externalParticipants.map((p) => p.status)
  ];
  return participantStatuses.length > 0
    && participantStatuses.every((status) => isFinalAttendanceStatus(status));
};

const parseParticipantIds = (participantIds) => {
  if (!participantIds) return [];
  return participantIds
    .split(',')
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));
};

const cleanParticipantIds = async (participantIds, organizerId) => {
  const parsedIds = parseParticipantIds(participantIds);
  const uniqueIds = [...new Set(parsedIds)].filter((id) => Number(id) !== Number(organizerId));
  if (uniqueIds.length === 0) return [];
  const placeholders = uniqueIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id FROM employees WHERE status = 'active' AND id IN (${placeholders})`,
    uniqueIds
  );
  return rows.map((row) => Number(row.id));
};

const parseExternalParticipants = (externalParticipantsValue) => {
  if (!externalParticipantsValue) return [];
  try {
    const parsed = JSON.parse(externalParticipantsValue);
    if (!Array.isArray(parsed)) return [];
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
    if (!name) return;
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
        (meeting_id, name, institution, email, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [meetingId, participant.name, participant.institution, participant.email, participant.status || 'invited']
    );
  }
};

const getExternalParticipantsByMeetingId = async (meetingId) => {
  const [externalParticipants] = await db.query(
    `SELECT id, meeting_id, name, institution, email, status
     FROM meeting_external_participants
     WHERE meeting_id = ?
     ORDER BY name ASC`,
    [meetingId]
  );
  return externalParticipants;
};

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
  if (!meeting) return true;
  return ['completed', 'cancelled'].includes(meeting.status);
};

const isEndTimeValid = (startTime, endTime) => {
  if (!startTime || !endTime) return false;
  return endTime > startTime;
};

const getPagination = (queryPage, totalItems, limit = 5) => {
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
  let page = parseInt(queryPage, 10);
  if (isNaN(page) || page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  return { page, limit, offset: (page - 1) * limit, totalItems, totalPages };
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
  if (!startDate || !endDate) return null;
  const toSqlDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return { start: toSqlDate(startDate), end: toSqlDate(endDate) };
};

// =========================================================================
// INDEX — Menampilkan daftar meeting + search + pagination
// Hanya tampilkan:
// - meeting yang dibuat sendiri (organizer)
// - meeting dari orang lain yang sudah disetujui (status attended)
// =========================================================================

const index = async (req, res, next) => {
  try {
    await syncMeetingStatuses();

    const currentEmployee = await getCurrentEmployee(req.session.userId);
    const canCreateMeeting = !!currentEmployee;

    const searchKeyword = String(req.query.q || '').trim();
    const selectedStatus = String(req.query.status || 'all');
    const selectedSort = String(req.query.sort || 'latest');
    const allowedStatuses = ['draft', 'scheduled', 'completed', 'cancelled'];
    const allowedSorts = ['latest', 'oldest'];
    const sortMode = allowedSorts.includes(selectedSort) ? selectedSort : 'latest';

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

      const whereSql = whereParts.join(' AND ');
      const orderSql = sortMode === 'oldest'
        ? 'm.meeting_date ASC, m.start_time ASC, m.id ASC'
        : 'm.meeting_date DESC, m.start_time DESC, m.id DESC';

      const [countRows] = await db.query(
        `
          SELECT COUNT(DISTINCT m.id) AS total
          FROM meetings m
          LEFT JOIN meeting_participants mp_access
            ON m.id = mp_access.meeting_id
            AND mp_access.employee_id = ?
            AND mp_access.status = 'attended'
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
            AND mp_access.status = 'attended'
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
          ORDER BY ${orderSql}
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
      user: req.session.employeeName,
      meetings,
      employees,
      canCreateMeeting,
      accessMessage,
      filters: {
        q: searchKeyword,
        status: selectedStatus,
        sort: sortMode
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
    if (!currentEmployee) return res.redirect('/meetings?access_error=employee_required');

    const [employees] = await db.query(
      `SELECT id, name, employee_number
       FROM employees
       WHERE status = 'active' AND id <> ?
       ORDER BY name ASC`,
      [currentEmployee.id]
    );

    res.render('meetings/create', {
      title: 'Tambah Meeting',
      user: req.session.employeeName,
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
    title, description, meeting_date, start_time, end_time,
    meeting_type, status, participant_ids, external_participants, online_link
  } = req.body;

  try {
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }
    if (!isEndTimeValid(start_time, end_time)) {
      return res.send('Waktu selesai harus lebih besar dari waktu mulai.');
    }

    const currentEmployee = req.currentEmployee || await getCurrentEmployee(req.session.userId);
    if (!currentEmployee) return res.redirect('/meetings?access_error=employee_required');

    const organizerId = currentEmployee.id;
    const leaderId = currentEmployee.id;
    const participants = await cleanParticipantIds(participant_ids, organizerId);
    const externalParticipants = cleanExternalParticipants(external_participants);

    const [result] = await db.query(
      `INSERT INTO meetings
        (title, description, organizer_id, leader_id, meeting_type, meeting_date,
         start_time, end_time, online_link, is_confidential, status,
         organizer_id_id, leader_id_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, description || null, organizerId, leaderId, meeting_type, meeting_date,
       start_time, end_time, online_link || null, 0, status, organizerId, leaderId]
    );

    const meetingId = result.insertId;

    for (const employeeId of participants) {
      await db.query(
        `INSERT INTO meeting_participants
          (meeting_id, employee_id, status, created_at, updated_at)
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
          id, title, description, meeting_type, meeting_date,
          start_time, end_time, online_link, status, organizer_id,
          TIMESTAMP(meeting_date, start_time) <= NOW() AS has_started
       FROM meetings
       WHERE id = ?`,
      [meetingId]
    );

    if (rows.length === 0) return res.status(404).send('Meeting tidak ditemukan.');

    const meeting = rows[0];

    const [participants] = await db.query(
      `SELECT mp.id, mp.meeting_id, mp.employee_id, mp.status, e.name, e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ? AND mp.employee_id <> ?
       ORDER BY e.name ASC`,
      [meetingId, meeting.organizer_id]
    );

    const externalParticipants = await getExternalParticipantsByMeetingId(meetingId);

    const [minutes] = await db.query(
      `SELECT id, meeting_id, file AS file_path, summary,
              DATE_FORMAT(created_at, '%d-%m-%Y %H:%i') AS uploaded_at
       FROM meeting_minutes
       WHERE meeting_id = ?
       ORDER BY created_at DESC`,
      [meetingId]
    );

    const currentEmployee = await getCurrentEmployee(req.session.userId);
    const isHost = currentEmployee
      ? Number(meeting.organizer_id) === Number(currentEmployee.id)
      : false;

    const canEditAttendance = isHost
      && Number(meeting.has_started) === 1
      && meeting.status === 'completed';

    const canExportAttendance = isHost && isAttendanceExportReady(participants, externalParticipants);

    const exportAttendanceMessage = canExportAttendance
      ? null
      : 'Export daftar hadir baru aktif setelah meeting completed dan seluruh peserta disimpan sebagai Hadir atau Tidak Hadir.';

    const accessMessageMap = {
      meeting_locked: 'Meeting yang sudah completed atau cancelled tidak dapat diedit lagi.',
      attendance_unavailable: 'Kehadiran baru dapat diubah setelah meeting berstatus completed.',
      attendance_not_ready: 'Daftar hadir belum bisa diexport karena masih ada peserta yang belum diberi status Hadir atau Tidak Hadir.',
      export_unavailable: 'Export daftar hadir hanya bisa dilakukan setelah meeting completed.'
    };

    const accessMessage = accessMessageMap[req.query.access_error] || null;

    res.render('meetings/show', {
      title: 'Detail Meeting',
      user: req.session.employeeName,
      meeting,
      participants,
      externalParticipants,
      minutes,
      isHost,
      canEditAttendance,
      canExportAttendance,
      exportAttendanceMessage,
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
      `SELECT id, title, description, meeting_type, meeting_date,
              start_time, end_time, online_link, status, organizer_id
       FROM meetings WHERE id = ?`,
      [meetingId]
    );

    if (rows.length === 0) return res.status(404).send('Meeting tidak ditemukan.');

    const meeting = rows[0];
    if (isMeetingLocked(meeting)) return res.redirect(`/meetings/${meetingId}?access_error=meeting_locked`);

    const [employees] = await db.query(
      `SELECT id, name, employee_number
       FROM employees
       WHERE status = 'active' AND id <> ?
       ORDER BY name ASC`,
      [meeting.organizer_id]
    );

    const [selectedParticipants] = await db.query(
      `SELECT mp.employee_id, e.name, e.employee_number
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ? AND mp.employee_id <> ?
       ORDER BY e.name ASC`,
      [meetingId, meeting.organizer_id]
    );

    const selectedParticipantsData = selectedParticipants.map((p) => ({
      id: String(p.employee_id),
      name: p.name,
      number: p.employee_number || ''
    }));

    const selectedExternalParticipantsData = await getExternalParticipantsByMeetingId(meetingId);

    res.render('meetings/edit', {
      title: 'Edit Meeting',
      user: req.session.employee,
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
    title, description, meeting_date, start_time, end_time,
    meeting_type, status, participant_ids, external_participants, online_link
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
    if (!currentEmployee) return res.redirect('/meetings?access_error=employee_required');

    const [meetingRows] = await db.query(
      `SELECT id, status FROM meetings WHERE id = ?`,
      [meetingId]
    );

    if (meetingRows.length === 0) return res.status(404).send('Meeting tidak ditemukan.');
    if (isMeetingLocked(meetingRows[0])) return res.redirect(`/meetings/${meetingId}?access_error=meeting_locked`);

    const currentStatus = meetingRows[0].status;
    const allowedNextStatuses = currentStatus === 'draft'
      ? ['draft', 'scheduled', 'cancelled']
      : ['scheduled', 'cancelled'];

    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).send('Status meeting tidak valid.');
    }

    const participants = await cleanParticipantIds(participant_ids, currentEmployee.id);
    const externalParticipants = cleanExternalParticipants(external_participants);

    await db.query(
      `UPDATE meetings
       SET title = ?, description = ?, meeting_date = ?, start_time = ?,
           end_time = ?, meeting_type = ?, online_link = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [title, description || null, meeting_date, start_time, end_time,
       meeting_type, online_link || null, status, meetingId]
    );

    // Peserta internal: diff-based
    const [existingInternalRows] = await db.query(
      `SELECT employee_id FROM meeting_participants WHERE meeting_id = ?`,
      [meetingId]
    );
    const existingInternalIds = existingInternalRows.map((r) => Number(r.employee_id));
    const newInternalIds = participants.map(Number);
    const internalToRemove = existingInternalIds.filter((id) => !newInternalIds.includes(id));
    const internalToAdd = newInternalIds.filter((id) => !existingInternalIds.includes(id));

    if (internalToRemove.length > 0) {
      const placeholders = internalToRemove.map(() => '?').join(',');
      await db.query(
        `DELETE FROM meeting_participants WHERE meeting_id = ? AND employee_id IN (${placeholders})`,
        [meetingId, ...internalToRemove]
      );
    }
    for (const employeeId of internalToAdd) {
      await db.query(
        `INSERT INTO meeting_participants
          (meeting_id, employee_id, status, created_at, updated_at)
         VALUES (?, ?, 'invited', NOW(), NOW())`,
        [meetingId, employeeId]
      );
    }

    // Peserta eksternal: diff-based
    const [existingExternalRows] = await db.query(
      `SELECT id, name, email, institution FROM meeting_external_participants WHERE meeting_id = ?`,
      [meetingId]
    );

    const makeKey = (name, email, institution) =>
      `${String(name || '').trim().toLowerCase()}|${String(email || '').trim().toLowerCase()}|${String(institution || '').trim().toLowerCase()}`;

    const existingExternalMap = new Map(
      existingExternalRows.map((row) => [makeKey(row.name, row.email, row.institution), row.id])
    );
    const newExternalKeys = new Set(
      externalParticipants.map((p) => makeKey(p.name, p.email, p.institution))
    );
    const externalIdsToRemove = existingExternalRows
      .filter((row) => !newExternalKeys.has(makeKey(row.name, row.email, row.institution)))
      .map((row) => row.id);

    if (externalIdsToRemove.length > 0) {
      const placeholders = externalIdsToRemove.map(() => '?').join(',');
      await db.query(
        `DELETE FROM meeting_external_participants WHERE id IN (${placeholders})`,
        externalIdsToRemove
      );
    }

    const externalToAdd = externalParticipants.filter(
      (p) => !existingExternalMap.has(makeKey(p.name, p.email, p.institution))
    );
    await saveExternalParticipants(meetingId, externalToAdd);

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
    if (!currentEmployee) return res.redirect('/meetings?access_error=employee_required');

    const [meetingRows] = await db.query(
      `SELECT id, organizer_id, status,
              TIMESTAMP(meeting_date, start_time) <= NOW() AS has_started
       FROM meetings WHERE id = ?`,
      [meetingId]
    );

    if (meetingRows.length === 0) return res.status(404).send('Meeting tidak ditemukan.');

    const meeting = meetingRows[0];
    const isHost = Number(meeting.organizer_id) === Number(currentEmployee.id);

    if (!isHost) return res.redirect('/meetings?access_error=host_required');
    if (meeting.status !== 'completed' || Number(meeting.has_started) !== 1) {
      return res.redirect(`/meetings/${meetingId}?access_error=attendance_unavailable`);
    }

    const allowedAttendanceStatuses = ['attended', 'absent'];
    const updates = Object.entries(req.body || {});

    for (const [fieldName, value] of updates) {
      if (!allowedAttendanceStatuses.includes(value)) continue;

      if (fieldName.startsWith('internal_status_')) {
        const participantId = parseInt(fieldName.replace('internal_status_', ''), 10);
        if (!isNaN(participantId)) {
          await db.query(
            `UPDATE meeting_participants SET status = ?, updated_at = NOW()
             WHERE id = ? AND meeting_id = ?`,
            [value, participantId, meetingId]
          );
        }
      }

      if (fieldName.startsWith('external_status_')) {
        const participantId = parseInt(fieldName.replace('external_status_', ''), 10);
        if (!isNaN(participantId)) {
          await db.query(
            `UPDATE meeting_external_participants SET status = ?, updated_at = NOW()
             WHERE id = ? AND meeting_id = ?`,
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
    await db.query(`DELETE FROM meeting_participants WHERE meeting_id = ?`, [meetingId]);
    await db.query(`DELETE FROM meeting_minutes WHERE meeting_id = ?`, [meetingId]);
    await db.query(`DELETE FROM meeting_external_participants WHERE meeting_id = ?`, [meetingId]);
    await db.query(`DELETE FROM meetings WHERE id = ?`, [meetingId]);
    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// EXPORT ATTENDANCE EXCEL — Generate Excel daftar hadir peserta meeting
// =========================================================================

const exportAttendanceExcel = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    await syncMeetingStatuses();

    const [meetingRows] = await db.query(
      `SELECT m.id, m.title, m.description, m.meeting_type, m.meeting_date,
              m.start_time, m.end_time, m.online_link, m.status, m.organizer_id,
              e.name AS organizer_name, e.employee_number AS organizer_number
       FROM meetings m
       JOIN employees e ON m.organizer_id = e.id
       WHERE m.id = ?`,
      [meetingId]
    );

    if (meetingRows.length === 0) return res.status(404).send('Meeting tidak ditemukan.');

    const meeting = meetingRows[0];

    const [internalParticipants] = await db.query(
      `SELECT e.name, e.employee_number, mp.status
       FROM meeting_participants mp
       JOIN employees e ON mp.employee_id = e.id
       WHERE mp.meeting_id = ? AND mp.employee_id <> ?
       ORDER BY e.name ASC`,
      [meetingId, meeting.organizer_id]
    );

    const externalParticipants = await getExternalParticipantsByMeetingId(meetingId);

    if (!isAttendanceExportReady(internalParticipants, externalParticipants)) {
      return res.redirect(`/meetings/${meetingId}?access_error=attendance_not_ready#attendance-section`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FTI Meeting System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Daftar Hadir', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    worksheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Nama Peserta', key: 'name', width: 32 },
      { header: 'Tipe Peserta', key: 'type', width: 16 },
      { header: 'Nomor Pegawai / Email', key: 'identity', width: 28 },
      { header: 'Instansi', key: 'institution', width: 26 },
      { header: 'Status Kehadiran', key: 'status', width: 20 }
    ];

    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'DAFTAR HADIR PESERTA MEETING';
    worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F765D' } };
    worksheet.getRow(1).height = 28;

    const infoRows = [
      ['Judul Meeting', meeting.title || '-'],
      ['Tanggal', formatDateValue(meeting.meeting_date)],
      ['Waktu', `${formatTimeValue(meeting.start_time)} - ${formatTimeValue(meeting.end_time)}`],
      ['Tipe Meeting', meeting.meeting_type || '-'],
      ['Status Meeting', 'Completed'],
      ['Penyelenggara', `${meeting.organizer_name || '-'}${meeting.organizer_number ? ' (' + meeting.organizer_number + ')' : ''}`]
    ];

    let currentRow = 3;
    for (const [label, value] of infoRows) {
      worksheet.getCell(`A${currentRow}`).value = label;
      worksheet.getCell(`B${currentRow}`).value = value;
      worksheet.getCell(`A${currentRow}`).font = { bold: true };
      worksheet.mergeCells(`B${currentRow}:F${currentRow}`);
      currentRow += 1;
    }

    currentRow += 1;

    const headerRow = worksheet.getRow(currentRow);
    headerRow.values = ['No', 'Nama Peserta', 'Tipe Peserta', 'Nomor Pegawai / Email', 'Instansi', 'Status Kehadiran'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F765D' } };
    currentRow += 1;

    const attendanceRows = [];
    internalParticipants.forEach((p) => {
      attendanceRows.push({
        name: p.name || '-', type: 'Internal',
        identity: p.employee_number || '-', institution: 'FTI',
        status: getAttendanceStatusLabel(p.status)
      });
    });
    externalParticipants.forEach((p) => {
      attendanceRows.push({
        name: p.name || '-', type: 'Eksternal',
        identity: p.email || '-', institution: p.institution || '-',
        status: getAttendanceStatusLabel(p.status)
      });
    });

    attendanceRows.forEach((p, index) => {
      worksheet.addRow({ no: index + 1, name: p.name, type: p.type, identity: p.identity, institution: p.institution, status: p.status });
    });

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D2C6' } },
          left: { style: 'thin', color: { argb: 'FFD9D2C6' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D2C6' } },
          right: { style: 'thin', color: { argb: 'FFD9D2C6' } }
        };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      if (rowNumber > currentRow - 1 && rowNumber % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFCF7' } };
        });
      }
    });

    worksheet.getColumn('A').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getColumn('F').alignment = { horizontal: 'center', vertical: 'middle' };

    const exportedAtRow = worksheet.lastRow.number + 2;
    worksheet.mergeCells(`A${exportedAtRow}:F${exportedAtRow}`);
    worksheet.getCell(`A${exportedAtRow}`).value = `Diexport pada: ${new Date().toLocaleString('id-ID')}`;
    worksheet.getCell(`A${exportedAtRow}`).font = { italic: true, color: { argb: 'FF6B7280' } };

    const dateStr = meeting.meeting_date instanceof Date ? meeting.meeting_date.toISOString() : meeting.meeting_date;
    const fileName = `Daftar_Hadir_${meeting.title.replace(/\s+/g, '_')}_${dateStr.split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
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
  exportAttendanceExcel
};