const db = require('../lib/db');

// Menampilkan daftar meeting
const index = async (req, res, next) => {
  try {
    const [meetings] = await db.query(`
      SELECT 
        id,
        title,
        description,
        meeting_type,
        meeting_date,
        start_time,
        end_time,
        status
      FROM meetings
      ORDER BY meeting_date DESC, start_time ASC
    `);

    res.render('meetings/index', {
      title: 'Daftar Meeting',
      meetings
    });
  } catch (err) {
    next(err);
  }
};

// Menampilkan form tambah meeting
const create = (req, res) => {
  res.render('meetings/create', {
    title: 'Tambah Meeting'
  });
};

// Menyimpan data meeting baru ke database
const store = async (req, res, next) => {
  const {
    title,
    description,
    meeting_date,
    start_time,
    end_time,
    meeting_type,
    status
  } = req.body;

  try {
    // Validasi sederhana di sisi server
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    // Untuk sementara memakai employee id 1 dan 3 dari data dummy yang sudah kita insert
    const organizerId = 1;
    const leaderId = 3;

    await db.query(
      `
      INSERT INTO meetings
      (
        title,
        description,
        organizer_id,
        leader_id,
        meeting_type,
        meeting_date,
        start_time,
        end_time,
        is_confidential,
        status,
        organizer_id_id,
        leader_id_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        title,
        description || null,
        organizerId,
        leaderId,
        meeting_type,
        meeting_date,
        start_time,
        end_time,
        0,
        status,
        organizerId,
        leaderId
      ]
    );

    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

// Menampilkan detail meeting berdasarkan id
const show = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    const [rows] = await db.query(
      `
      SELECT 
        id,
        title,
        description,
        meeting_type,
        meeting_date,
        start_time,
        end_time,
        status
      FROM meetings
      WHERE id = ?
      `,
      [meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const meeting = rows[0];

    res.render('meetings/show', {
      title: 'Detail Meeting',
      meeting
    });
  } catch (err) {
    next(err);
  }
};

// Menampilkan form edit meeting berdasarkan id
const edit = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    const [rows] = await db.query(
      `
      SELECT 
        id,
        title,
        description,
        meeting_type,
        meeting_date,
        start_time,
        end_time,
        status
      FROM meetings
      WHERE id = ?
      `,
      [meetingId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Meeting tidak ditemukan.');
    }

    const meeting = rows[0];

    res.render('meetings/edit', {
      title: 'Edit Meeting',
      meeting
    });
  } catch (err) {
    next(err);
  }
};

// Mengupdate data meeting ke database
const update = async (req, res, next) => {
  const meetingId = req.params.id;

  const {
    title,
    description,
    meeting_date,
    start_time,
    end_time,
    meeting_type,
    status
  } = req.body;

  try {
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    await db.query(
      `
      UPDATE meetings
      SET 
        title = ?,
        description = ?,
        meeting_date = ?,
        start_time = ?,
        end_time = ?,
        meeting_type = ?,
        status = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        title,
        description || null,
        meeting_date,
        start_time,
        end_time,
        meeting_type,
        status,
        meetingId
      ]
    );

    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

    // Menghapus data meeting dari database
const destroy = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    await db.query(
      `
      DELETE FROM meetings
      WHERE id = ?
      `,
      [meetingId]
    );

    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  index,
  create,
  store,
  show,
  edit,
  update,
  destroy
};