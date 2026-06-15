const db = require('../lib/db');

/*
  Helper:
  Mengecek apakah user login punya data employee.
  Di database project ini, employees.id terhubung ke users.id.
*/
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

/*
  isEmployee:
  Dipakai untuk membatasi fitur create meeting.
  User biasa boleh login, tetapi tidak boleh membuat meeting
  jika tidak punya data di tabel employees.
*/
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

/*
  isHost:
  Dipakai untuk edit, update, dan delete meeting.
  Host adalah employee yang id-nya sama dengan meetings.organizer_id.
*/
const isHost = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    const employee = req.currentEmployee || await getCurrentEmployee(req.session.userId);

    if (!employee) {
      return res.status(403).send('Akses ditolak. Akun ini tidak memiliki data pegawai.');
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
      return res.status(403).send('Akses ditolak. Hanya host yang dapat melakukan tindakan ini.');
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
  isHost
};