const db = require("../lib/db");

// GET /invitations/inbox
// Tampil semua undangan milik user yang sedang login (status = invited)
// Hanya dari meeting yang bukan draft
const inbox = async (req, res, next) => {
  try {
    const employeeId = req.session.employeeId;

    const [undangan] = await db.query(
      `
      SELECT 
        mp.id AS participant_id,
        mp.status,
        mp.created_at AS invited_at,
        m.id AS meeting_id,
        m.title,
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
        AND m.status != 'draft'
      ORDER BY m.meeting_date ASC, m.start_time ASC
      `,
      [employeeId]
    );

    res.render("invitations/inbox", {
      title: "Kotak Masuk Undangan",
      user: req.session.employeeName,
      undangan,
    });
  } catch (err) {
    next(err);
  }
};

// GET /invitations/:participantId
// Halaman detail undangan tertentu
const detail = async (req, res, next) => {
  try {
    const employeeId = req.session.employeeId;
    const participantId = req.params.participantId;

    // Ambil detail undangan + pastikan milik user yang login
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
        m.online_link,
        m.status AS meeting_status
      FROM meeting_participants mp
      JOIN meetings m ON mp.meeting_id = m.id
      WHERE mp.id = ?
        AND mp.employee_id = ?
      LIMIT 1
      `,
      [participantId, employeeId]
    );

    if (rows.length === 0) {
      return res.status(404).render("error", {
        message: "Undangan tidak ditemukan.",
        error: { status: 404 },
      });
    }

    const undangan = rows[0];

    // Blokir akses detail jika meeting masih draft
    if (undangan.meeting_status === 'draft') {
      return res.status(403).render("error", {
        message: "Undangan ini belum dapat diakses karena rapat masih dalam status draft.",
        error: { status: 403 },
      });
    }

    // Ambil semua peserta rapat yang sama
    const [peserta] = await db.query(
      `
      SELECT 
        e.name,
        e.employee_number,
        mp.status
      FROM meeting_participants mp
      JOIN employees e ON mp.employee_id = e.id
      WHERE mp.meeting_id = ?
      ORDER BY e.name ASC
      `,
      [undangan.meeting_id]
    );

    res.render("invitations/detail", {
      title: `Undangan: ${undangan.title}`,
      user: req.session.employeeName,
      undangan,
      peserta,
    });
  } catch (err) {
    next(err);
  }
};

// POST /invitations/:participantId/status
// Update status undangan: terima -> otomatis 'attended', tolak -> otomatis 'absent'
const updateStatus = async (req, res, next) => {
  try {
    const employeeId = req.session.employeeId;
    const participantId = req.params.participantId;
    const { status } = req.body; // 'confirmed' atau 'declined' dari form

    const allowedStatus = ["confirmed", "declined"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).render("error", {
        message: "Status tidak valid.",
        error: { status: 400 },
      });
    }

    // Pastikan record ini milik user yang login
    const [rows] = await db.query(
      `SELECT mp.id FROM meeting_participants mp
       JOIN meetings m ON mp.meeting_id = m.id
       WHERE mp.id = ? AND mp.employee_id = ? AND m.status != 'draft'
       LIMIT 1`,
      [participantId, employeeId]
    );

    if (rows.length === 0) {
      return res.status(403).render("error", {
        message: "Akses ditolak atau undangan belum dapat direspons.",
        error: { status: 403 },
      });
    }

    // Terima undangan -> langsung tercatat hadir, tolak -> langsung tercatat tidak hadir
    const finalStatus = status === "confirmed" ? "attended" : "absent";

    await db.query(
      `UPDATE meeting_participants SET status = ?, updated_at = NOW() WHERE id = ?`,
      [finalStatus, participantId]
    );

    res.redirect(`/invitations/${participantId}?success=${status}`);
  } catch (err) {
    next(err);
  }
};

module.exports = { inbox, detail, updateStatus };