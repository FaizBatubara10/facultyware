const db = require('../lib/db');


const getCurrentEmployee = async (userId) => {
  if (!userId) {
    return null;
  }

  const [rows] = await db.query(
    `
      SELECT id, name, employee_number
      FROM employees
      WHERE id = ?
        AND status = 'active'
      LIMIT 1
    `,
    [userId]
  );

  return rows.length > 0 ? rows[0] : null;
};


const isEmployee = async (req, res, next) => {
  try {
    const employee = await getCurrentEmployee(req.session.userId);

    if (!employee) {
      return res.redirect('/meetings?access_error=employee_required');
    }

    req.currentEmployee = employee;
    next();
  } catch (err) {
    next(err);
  }
};


const canAccessMeeting = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    const employee = await getCurrentEmployee(req.session.userId);

    if (!employee) {
      return res.redirect('/meetings?access_error=meeting_denied');
    }

    const [rows] = await db.query(
      `
        SELECT 
          m.id,
          m.organizer_id,
          mp.id AS participant_row_id
        FROM meetings m
        LEFT JOIN meeting_participants mp
          ON m.id = mp.meeting_id
          AND mp.employee_id = ?
        WHERE m.id = ?
        LIMIT 1
      `,
      [employee.id, meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const meeting = rows[0];

    const isHost = Number(meeting.organizer_id) === Number(employee.id);
    const isParticipant = !!meeting.participant_row_id;

    if (!isHost && !isParticipant) {
      return res.redirect('/meetings?access_error=meeting_denied');
    }

    req.currentEmployee = employee;
    next();
  } catch (err) {
    next(err);
  }
};

const isHost = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    const employee = req.currentEmployee || await getCurrentEmployee(req.session.userId);

    if (!employee) {
      return res.redirect('/meetings?access_error=employee_required');
    }

    const [rows] = await db.query(
      `
        SELECT organizer_id
        FROM meetings
        WHERE id = ?
      `,
      [meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const organizerId = rows[0].organizer_id;

    if (Number(organizerId) !== Number(employee.id)) {
      return res.redirect('/meetings?access_error=host_required');
    }

    req.currentEmployee = employee;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCurrentEmployee,
  isEmployee,
  canAccessMeeting,
  isHost
};
