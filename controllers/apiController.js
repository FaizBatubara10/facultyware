const db = require('../lib/db');
const { getCurrentEmployee } = require('../middlewares/meetingAccess');

const formatTimeValue = (timeValue) => {
  if (!timeValue) {
    return null;
  }

  return String(timeValue).substring(0, 5);
};

const formatDateValue = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const date = new Date(dateValue);

  if (isNaN(date.getTime())) {
    return String(dateValue).substring(0, 10);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
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

const getAccessibleMeetingCondition = () => {
  return `
    LEFT JOIN meeting_participants mp_access
      ON m.id = mp_access.meeting_id
      AND mp_access.employee_id = ?
    WHERE m.organizer_id = ?
       OR mp_access.employee_id IS NOT NULL
  `;
};

const buildMeetingPayload = (meeting) => {
  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    meeting_type: meeting.meeting_type,
    meeting_date: formatDateValue(meeting.meeting_date),
    start_time: formatTimeValue(meeting.start_time),
    end_time: formatTimeValue(meeting.end_time),
    online_link: meeting.online_link,
    status: meeting.status,
    organizer_id: meeting.organizer_id,
    organizer_name: meeting.organizer_name || null,
    internal_participant_count: Number(meeting.internal_participant_count || 0),
    external_participant_count: Number(meeting.external_participant_count || 0)
  };
};

const listMeetings = async (req, res, next) => {
  try {
    await syncMeetingStatuses();

    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Akun tidak memiliki data pegawai.'
      });
    }

    const [meetings] = await db.query(
      `
        SELECT
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
          org.name AS organizer_name,
          COUNT(DISTINCT mp_count.id) AS internal_participant_count,
          COUNT(DISTINCT mep.id) AS external_participant_count
        FROM meetings m
        JOIN employees org
          ON m.organizer_id = org.id
        LEFT JOIN meeting_participants mp_count
          ON m.id = mp_count.meeting_id
          AND mp_count.employee_id <> m.organizer_id
        LEFT JOIN meeting_external_participants mep
          ON m.id = mep.meeting_id
        ${getAccessibleMeetingCondition()}
        GROUP BY
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
          org.name
        ORDER BY m.meeting_date ASC, m.start_time ASC
      `,
      [currentEmployee.id, currentEmployee.id]
    );

    res.json({
      success: true,
      data: meetings.map(buildMeetingPayload)
    });
  } catch (err) {
    next(err);
  }
};

const showMeeting = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    await syncMeetingStatuses();

    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Akun tidak memiliki data pegawai.'
      });
    }

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
          m.online_link,
          m.status,
          m.organizer_id,
          org.name AS organizer_name,
          COUNT(DISTINCT mp_count.id) AS internal_participant_count,
          COUNT(DISTINCT mep.id) AS external_participant_count
        FROM meetings m
        JOIN employees org
          ON m.organizer_id = org.id
        LEFT JOIN meeting_participants mp_count
          ON m.id = mp_count.meeting_id
          AND mp_count.employee_id <> m.organizer_id
        LEFT JOIN meeting_external_participants mep
          ON m.id = mep.meeting_id
        LEFT JOIN meeting_participants mp_access
          ON m.id = mp_access.meeting_id
          AND mp_access.employee_id = ?
        WHERE m.id = ?
          AND (
            m.organizer_id = ?
            OR mp_access.employee_id IS NOT NULL
          )
        GROUP BY
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
          org.name
        LIMIT 1
      `,
      [currentEmployee.id, meetingId, currentEmployee.id]
    );

    if (meetingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Meeting tidak ditemukan atau tidak dapat diakses.'
      });
    }

    const meeting = meetingRows[0];

    const [internalParticipants] = await db.query(
      `
        SELECT
          mp.id,
          mp.employee_id,
          e.name,
          e.employee_number,
          mp.status
        FROM meeting_participants mp
        JOIN employees e
          ON mp.employee_id = e.id
        WHERE mp.meeting_id = ?
          AND mp.employee_id <> ?
        ORDER BY e.name ASC
      `,
      [meetingId, meeting.organizer_id]
    );

    const [externalParticipants] = await db.query(
      `
        SELECT
          id,
          name,
          institution,
          email,
          status
        FROM meeting_external_participants
        WHERE meeting_id = ?
        ORDER BY name ASC
      `,
      [meetingId]
    );

    res.json({
      success: true,
      data: {
        ...buildMeetingPayload(meeting),
        internal_participants: internalParticipants,
        external_participants: externalParticipants
      }
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// UNDANGAN
// =========================================================================

const buildInvitationPayload = (row) => {
  return {
    participant_id: row.participant_id,
    status: row.status,
    invited_at: row.invited_at,
    meeting: {
      id: row.meeting_id,
      title: row.title,
      description: row.description || null,
      meeting_date: formatDateValue(row.meeting_date),
      start_time: formatTimeValue(row.start_time),
      end_time: formatTimeValue(row.end_time),
      meeting_type: row.meeting_type,
      online_platform: row.online_platform || null,
      online_link: row.online_link || null
    }
  };
};

const listInvitations = async (req, res, next) => {
  try {
    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({ success: false, message: 'Akun tidak memiliki data pegawai.' });
    }

    const [rows] = await db.query(
      `
        SELECT 
          mp.id AS participant_id,
          mp.status,
          mp.created_at AS invited_at,
          m.id AS meeting_id,
          m.title,
          m.description,
          m.meeting_date,
          m.start_time,
          m.end_time,
          m.meeting_type,
          m.online_platform,
          m.online_link
        FROM meeting_participants mp
        JOIN meetings m ON mp.meeting_id = m.id
        WHERE mp.employee_id = ?
          AND mp.status = 'invited'
        ORDER BY m.meeting_date ASC, m.start_time ASC
      `,
      [currentEmployee.id]
    );

    res.json({ success: true, data: rows.map(buildInvitationPayload) });
  } catch (err) {
    next(err);
  }
};

const showInvitation = async (req, res, next) => {
  const participantId = req.params.id;

  try {
    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({ success: false, message: 'Akun tidak memiliki data pegawai.' });
    }

    const [rows] = await db.query(
      `
        SELECT 
          mp.id AS participant_id,
          mp.status,
          mp.created_at AS invited_at,
          m.id AS meeting_id,
          m.title,
          m.description,
          m.meeting_date,
          m.start_time,
          m.end_time,
          m.meeting_type,
          m.online_platform,
          m.online_link
        FROM meeting_participants mp
        JOIN meetings m ON mp.meeting_id = m.id
        WHERE mp.id = ?
          AND mp.employee_id = ?
        LIMIT 1
      `,
      [participantId, currentEmployee.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Undangan tidak ditemukan.' });
    }

    const invitation = rows[0];

    const [peserta] = await db.query(
      `
        SELECT e.name, e.employee_number, mp.status
        FROM meeting_participants mp
        JOIN employees e ON mp.employee_id = e.id
        WHERE mp.meeting_id = ?
        ORDER BY e.name ASC
      `,
      [invitation.meeting_id]
    );

    res.json({
      success: true,
      data: {
        ...buildInvitationPayload(invitation),
        participants: peserta
      }
    });
  } catch (err) {
    next(err);
  }
};

const updateInvitationStatus = async (req, res, next) => {
  const participantId = req.params.id;
  const { status } = req.body;

  try {
    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({ success: false, message: 'Akun tidak memiliki data pegawai.' });
    }

    const allowedStatus = ['confirmed', 'declined'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid. Gunakan confirmed atau declined.' });
    }

    const [rows] = await db.query(
      `SELECT id FROM meeting_participants WHERE id = ? AND employee_id = ? LIMIT 1`,
      [participantId, currentEmployee.id]
    );

    if (rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    const finalStatus = status === 'confirmed' ? 'attended' : 'absent';

    await db.query(
      `UPDATE meeting_participants SET status = ?, updated_at = NOW() WHERE id = ?`,
      [finalStatus, participantId]
    );

    res.json({
      success: true,
      message: status === 'confirmed' ? 'Undangan berhasil dikonfirmasi.' : 'Undangan berhasil ditolak.',
      data: { participant_id: Number(participantId), status: finalStatus }
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// NOTULENSI
// =========================================================================

const buildMinutePayload = (row) => {
  return {
    id: row.id,
    file: row.file,
    summary: row.summary,
    created_at: row.created_at,
    meeting: {
      id: row.meeting_id,
      title: row.meeting_title,
      meeting_date: formatDateValue(row.meeting_date),
      status: row.meeting_status
    }
  };
};

const listMinutes = async (req, res, next) => {
  try {
    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({ success: false, message: 'Akun tidak memiliki data pegawai.' });
    }

    const [rows] = await db.query(
      `
        SELECT 
          mm.id,
          mm.file,
          mm.summary,
          mm.created_at,
          m.id AS meeting_id,
          m.title AS meeting_title,
          m.meeting_date,
          m.status AS meeting_status
        FROM meeting_minutes mm
        JOIN meetings m ON mm.meeting_id = m.id
        WHERE m.organizer_id = ?
        ORDER BY mm.created_at DESC
      `,
      [currentEmployee.id]
    );

    res.json({ success: true, data: rows.map(buildMinutePayload) });
  } catch (err) {
    next(err);
  }
};

const showMinute = async (req, res, next) => {
  const minuteId = req.params.id;

  try {
    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({ success: false, message: 'Akun tidak memiliki data pegawai.' });
    }

    const [rows] = await db.query(
      `
        SELECT 
          mm.id,
          mm.file,
          mm.summary,
          mm.created_at,
          m.id AS meeting_id,
          m.title AS meeting_title,
          m.meeting_date,
          m.status AS meeting_status,
          m.organizer_id
        FROM meeting_minutes mm
        JOIN meetings m ON mm.meeting_id = m.id
        WHERE mm.id = ?
        LIMIT 1
      `,
      [minuteId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notulensi tidak ditemukan.' });
    }

    const minute = rows[0];

    if (Number(minute.organizer_id) !== Number(currentEmployee.id)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    res.json({ success: true, data: buildMinutePayload(minute) });
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// DASHBOARD
// =========================================================================

const dashboardStats = async (req, res, next) => {
  try {
    const currentEmployee = await getCurrentEmployee(req.session.userId);

    if (!currentEmployee) {
      return res.status(403).json({ success: false, message: 'Akun tidak memiliki data pegawai.' });
    }

    const employeeId = currentEmployee.id;

    const [hasilTotal] = await db.query(`
      SELECT COUNT(*) AS total 
      FROM meetings 
      WHERE MONTH(meeting_date) = MONTH(CURRENT_DATE()) 
        AND YEAR(meeting_date) = YEAR(CURRENT_DATE())
    `);

    const [meetingMendatang] = await db.query(
      `SELECT DISTINCT m.id, m.title, m.meeting_date, m.start_time, m.end_time, m.meeting_type
       FROM meetings m
       LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id AND mp.employee_id = ?
       WHERE m.meeting_date >= CURRENT_DATE()
         AND (m.organizer_id = ? OR mp.employee_id IS NOT NULL)
       ORDER BY m.meeting_date ASC, m.start_time ASC
       LIMIT 3`,
      [employeeId, employeeId]
    );

    const [hasilPending] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM meeting_participants 
       WHERE employee_id = ? AND status = 'invited'`,
      [employeeId]
    );

    const [hasilNotulenPending] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM meetings 
       WHERE status = 'completed' 
         AND organizer_id = ?
         AND id NOT IN (SELECT meeting_id FROM meeting_minutes)`,
      [employeeId]
    );

    const [hasilTotalPeserta] = await db.query(
      `SELECT COUNT(DISTINCT mp.employee_id) AS total
       FROM meeting_participants mp
       JOIN meetings m ON mp.meeting_id = m.id
       WHERE m.organizer_id = ?`,
      [employeeId]
    );

    const [hasilKehadiran] = await db.query(
      `SELECT 
         SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) AS hadir,
         SUM(CASE WHEN status IN ('attended', 'absent') THEN 1 ELSE 0 END) AS total
       FROM meeting_participants
       WHERE employee_id = ?`,
      [employeeId]
    );

    const jumlahHadir = hasilKehadiran[0].hadir || 0;
    const jumlahTotalTercatat = hasilKehadiran[0].total || 0;
    const persenKehadiran = jumlahTotalTercatat > 0
      ? Math.round((jumlahHadir / jumlahTotalTercatat) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        total_meeting_bulan_ini: hasilTotal[0].total,
        meeting_mendatang: meetingMendatang.map((m) => ({
          id: m.id,
          title: m.title,
          meeting_date: formatDateValue(m.meeting_date),
          start_time: formatTimeValue(m.start_time),
          end_time: formatTimeValue(m.end_time),
          meeting_type: m.meeting_type
        })),
        total_undangan_pending: hasilPending[0].total,
        total_notulen_pending: hasilNotulenPending[0].total,
        total_peserta: hasilTotalPeserta[0].total,
        kehadiran: {
          hadir: jumlahHadir,
          total_tercatat: jumlahTotalTercatat,
          persen: persenKehadiran
        }
      }
    });
  } catch (err) {
    next(err);
  }
};
module.exports = {
  listMeetings,
  showMeeting,
  listInvitations,
  showInvitation,
  updateInvitationStatus,
  listMinutes,
  showMinute,
  dashboardStats
};
