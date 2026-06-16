const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const index = (req, res) => {
  res.render("index", { title: "Express" });
};

const home = async (req, res, next) => {
  try {
    // 1. Total meeting bulan ini
    const [hasilTotal] = await db.query(`
      SELECT COUNT(*) AS total 
      FROM meetings 
      WHERE MONTH(meeting_date) = MONTH(CURRENT_DATE()) 
      AND YEAR(meeting_date) = YEAR(CURRENT_DATE())
    `);
    const totalMeetingBulanIni = hasilTotal[0].total;

    // 2. Meeting mendatang (maks 3)
    const [meetingMendatang] = await db.query(`
      SELECT title, meeting_date, start_time, end_time, meeting_type 
      FROM meetings 
      WHERE meeting_date >= CURRENT_DATE() 
      ORDER BY meeting_date ASC, start_time ASC 
      LIMIT 3
    `);

    // 3. Undangan pending milik user yang login
    const employeeId = req.session.employeeId;

    const [undanganTerbaru] = await db.query(
      `SELECT mp.id AS participant_id, m.title, m.meeting_date
       FROM meeting_participants mp
       JOIN meetings m ON mp.meeting_id = m.id
       WHERE mp.employee_id = ? AND mp.status = 'invited'
       ORDER BY m.meeting_date ASC LIMIT 3`,
      [employeeId]
    );

    const [hasilPending] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM meeting_participants 
       WHERE employee_id = ? AND status = 'invited'`,
      [employeeId]
    );
    const totalUndanganPending = hasilPending[0].total;

    // 4. Notulen pending (meeting completed tapi belum ada notulensi)
    const [hasilNotulenPending] = await db.query(`
      SELECT COUNT(*) AS total 
      FROM meetings 
      WHERE status = 'completed' 
        AND id NOT IN (SELECT meeting_id FROM meeting_minutes)
    `);
    const totalNotulenPending = hasilNotulenPending[0].total;

    // 5. Notulen terbaru (maks 3)
    const [notulenTerbaru] = await db.query(`
      SELECT 
        mm.id,
        m.title AS meeting_title,
        DATE_FORMAT(mm.created_at, '%d %b %Y') AS uploaded_at
      FROM meeting_minutes mm
      JOIN meetings m ON mm.meeting_id = m.id
      ORDER BY mm.created_at DESC
      LIMIT 3
    `);

    res.render("home", { 
      title: "Home", 
      user: req.session.username,
      totalMeetingBulanIni,
      meetingMendatang,
      undanganTerbaru,
      totalUndanganPending,
      totalNotulenPending,
      notulenTerbaru,
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