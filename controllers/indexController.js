const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const index = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/home");
  }
  return res.redirect("/login");
};

const home = async (req, res, next) => {
  try {
    const employeeId = req.session.employeeId;

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

    const [hasilTotal] = await db.query(`
      SELECT COUNT(*) AS total 
      FROM meetings 
      WHERE MONTH(meeting_date) = MONTH(CURRENT_DATE()) 
      AND YEAR(meeting_date) = YEAR(CURRENT_DATE())
    `);
    const totalMeetingBulanIni = hasilTotal[0].total;


    const [meetingMendatang] = await db.query(
      `SELECT DISTINCT m.id, m.title, m.meeting_date, m.start_time, m.end_time, m.meeting_type, m.status
       FROM meetings m
       LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id AND mp.employee_id = ?
       WHERE m.status = 'scheduled'
         AND TIMESTAMP(m.meeting_date, m.start_time) > NOW()
         AND (m.organizer_id = ? OR mp.employee_id IS NOT NULL)
       ORDER BY m.meeting_date ASC, m.start_time ASC
       LIMIT 3`,
      [employeeId, employeeId]
    );

    const [undanganTerbaru] = await db.query(
      `SELECT mp.id AS participant_id, m.title, m.meeting_date
       FROM meeting_participants mp
       JOIN meetings m ON mp.meeting_id = m.id
       WHERE mp.employee_id = ? AND mp.status = 'invited'
         AND m.status != 'draft'
       ORDER BY m.meeting_date ASC LIMIT 3`,
      [employeeId]
    );

    const [hasilPending] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM meeting_participants mp
       JOIN meetings m ON mp.meeting_id = m.id
       WHERE mp.employee_id = ? AND mp.status = 'invited'
         AND m.status != 'draft'`,
      [employeeId]
    );
    const totalUndanganPending = hasilPending[0].total;

  
    const [hasilNotulenPending] = await db.query(
  `SELECT COUNT(*) AS total 
   FROM meeting_minutes mm
   JOIN meetings m ON mm.meeting_id = m.id
   WHERE m.organizer_id = ?
      OR mm.meeting_id IN (
        SELECT meeting_id FROM meeting_participants
        WHERE employee_id = ? AND status = 'attended'
      )`,
  [employeeId, employeeId]
);
const totalNotulenPending = hasilNotulenPending[0].total;


   const [notulenTerbaru] = await db.query(`
  SELECT mm.id, m.title AS meeting_title,
    DATE_FORMAT(mm.created_at, '%d %b %Y') AS uploaded_at
  FROM meeting_minutes mm
  JOIN meetings m ON mm.meeting_id = m.id
  WHERE m.organizer_id = ?
     OR mm.meeting_id IN (
       SELECT meeting_id FROM meeting_participants
       WHERE employee_id = ? AND status = 'attended'
     )
  ORDER BY mm.created_at DESC
  LIMIT 3
`, [employeeId, employeeId]);

    const [hasilTotalPeserta] = await db.query(
      `SELECT COUNT(DISTINCT mp.employee_id) AS total
       FROM meeting_participants mp
       JOIN meetings m ON mp.meeting_id = m.id
       WHERE m.organizer_id = ?`,
      [employeeId]
    );
    const totalPeserta = hasilTotalPeserta[0].total;

    
const [hasilRapatBulanan] = await db.query(`
  SELECT MONTH(m.meeting_date) AS bulan, COUNT(DISTINCT m.id) AS total
  FROM meetings m
  LEFT JOIN meeting_participants mp
    ON m.id = mp.meeting_id
    AND mp.employee_id = ?
    AND mp.status = 'attended'
  WHERE YEAR(m.meeting_date) = YEAR(CURRENT_DATE())
    AND (m.organizer_id = ? OR mp.employee_id IS NOT NULL)
  GROUP BY MONTH(m.meeting_date)
`, [employeeId, employeeId]);

    const labelBulanRapat = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const dataRapatBulanan = labelBulanRapat.map((_, idx) => {
      const ditemukan = hasilRapatBulanan.find((r) => r.bulan === idx + 1);
      return ditemukan ? ditemukan.total : 0;
    });

    res.render("home", { 
      title: "Home", 
      user: req.session.employeeName,
      totalMeetingBulanIni,
      meetingMendatang,
      undanganTerbaru,
      totalUndanganPending,
      totalNotulenPending,
      notulenTerbaru,
      totalPeserta,
      labelBulanRapat,
      dataRapatBulanan,
    });
  } catch (err) {
    next(err);
  }
};

const loginPage = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/home");
  }
  res.render("login", { title: "Login", error: null });
};

const login = async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [username]);

    if (rows.length === 0) {
      return res.render("login", { title: "Login", error: "Invalid email or password" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("login", { title: "Login", error: "Invalid email or password" });
    }

    const [employeeRows] = await db.query(
      `SELECT id, name, employee_number
       FROM employees
       WHERE id = ? AND status = 'active'
       LIMIT 1`,
      [user.id]
    );

    if (employeeRows.length === 0) {
      return res.render("login", {
        title: "Login",
        error: "Akun ini belum terhubung dengan data pegawai sehingga tidak dapat masuk ke sistem FTI Meeting.",
      });
    }

    const employee = employeeRows[0];

    req.session.userId = user.id;
    req.session.username = user.email;
    req.session.employeeId = employee.id;
    req.session.employeeName = employee.name;

    res.redirect("/home");
  } catch (err) {
    next(err);
  }
};

const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
};

module.exports = { index, home, loginPage, login, logout };