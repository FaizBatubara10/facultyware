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

module.exports = {
  listMeetings,
  showMeeting
};
