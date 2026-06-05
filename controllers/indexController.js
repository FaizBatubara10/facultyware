const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const index = (req, res) => {
  res.render("index", { title: "Express" });
};

const home = async (req, res, next) => {
  try {
    // 1. Query untuk menghitung total meeting di bulan ini
    const queryTotal = `
      SELECT COUNT(*) AS total 
      FROM meetings 
      WHERE MONTH(meeting_date) = MONTH(CURRENT_DATE()) 
      AND YEAR(meeting_date) = YEAR(CURRENT_DATE())
    `;
    const [hasilTotal] = await db.query(queryTotal);
    const totalMeetingBulanIni = hasilTotal[0].total;

    // 2. Query untuk mengambil jadwal meeting terdekat (maksimal 3)
    const queryMendatang = `
      SELECT title, meeting_date, start_time, end_time, meeting_type 
      FROM meetings 
      WHERE meeting_date >= CURRENT_DATE() 
      ORDER BY meeting_date ASC, start_time ASC 
      LIMIT 3
    `;
    const [meetingMendatang] = await db.query(queryMendatang);

    // 3. Render halaman home dengan membawa data dari database
    res.render("home", { 
      title: "Home", 
      user: req.session.username,
      totalMeetingBulanIni: totalMeetingBulanIni,
      meetingMendatang: meetingMendatang
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
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
      username,
    ]);

    if (rows.length === 0) {
      return res.render("login", {
        title: "Login",
        error: "Invalid email or password",
      });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("login", {
        title: "Login",
        error: "Invalid email or password",
      });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.email;

    res.redirect("/home");
  } catch (err) {
    next(err);
  }
};

const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
};

module.exports = {
  index,
  home,
  loginPage,
  login,
  logout
};