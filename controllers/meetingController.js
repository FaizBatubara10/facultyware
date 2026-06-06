const db = require('../lib/db');

// Menampilkan daftar meeting
// Menampilkan daftar meeting
const index = async (req, res, next) => {
  console.log("🚀 YAY! Berhasil masuk ke Controller Meeting!");

  try {
    // Mengambil data meeting beserta jumlah peserta
    const [meetings] = await db.query(`
      SELECT 
        m.id,
        m.title,
        m.description,
        m.meeting_type,
        m.meeting_date,
        m.start_time,
        m.end_time,
        m.status,
        COUNT(mp.id) AS participant_count
      FROM meetings m
      LEFT JOIN meeting_participants mp ON m.id = mp.meeting_id
      GROUP BY 
        m.id,
        m.title,
        m.description,
        m.meeting_type,
        m.meeting_date,
        m.start_time,
        m.end_time,
        m.status
      ORDER BY m.meeting_date ASC, m.start_time ASC
    `);

    // Mengambil daftar employee aktif untuk pilihan peserta di modal create meeting
    const [employees] = await db.query(`
      SELECT 
        id,
        name,
        employee_number
      FROM employees
      WHERE status = 'active'
      ORDER BY name ASC
    `);

    const totalMeetings = meetings.length;
    const scheduledMeetings = meetings.filter(m => m.status === 'scheduled').length;
    const completedMeetings = meetings.filter(m => m.status === 'completed').length;
    const cancelledMeetings = meetings.filter(m => m.status === 'cancelled').length;

    res.render('meetings/index', {
      title: 'Meeting Dashboard',
      meetings,
      employees,
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

// Menampilkan form tambah meeting
const create = async (req, res, next) => {
  try {
    // Mengambil daftar employee aktif untuk pilihan peserta meeting
    const [employees] = await db.query(`
      SELECT 
        id,
        name,
        employee_number
      FROM employees
      WHERE status = 'active'
      ORDER BY name ASC
    `);

    res.render('meetings/create', {
      title: 'Tambah Meeting',
      employees
    });
  } catch (err) {
    next(err);
  }
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
    status,
    participant_ids
  } = req.body;

  try {
    // Validasi sederhana di sisi server
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    // Mengubah participant_ids dari string "1,2,3" menjadi array [1, 2, 3]
    const participants = participant_ids
      ? participant_ids
          .split(',')
          .map(id => parseInt(id))
          .filter(id => !isNaN(id))
      : [];

    // Untuk sementara memakai employee id 1 dan 3 dari data dummy
    const organizerId = 1;
    const leaderId = 3;

    // Simpan data meeting terlebih dahulu
    const [result] = await db.query(
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

    // Mengambil id meeting yang baru dibuat
    const meetingId = result.insertId;

    // Simpan peserta satu per satu ke tabel meeting_participants
    for (const employeeId of participants) {
      await db.query(
        `
        INSERT INTO meeting_participants
        (
          meeting_id,
          employee_id,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NOW(), NOW())
        `,
        [
          meetingId,
          employeeId,
          'invited'
        ]
      );
    }

    res.redirect('/meetings');
  } catch (err) {
    next(err);
  }
};

// Menampilkan detail meeting berdasarkan id
const show = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    // Mengambil data detail meeting
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

    // Mengambil daftar peserta meeting
    const [participants] = await db.query(
      `
      SELECT
        mp.id,
        mp.meeting_id,
        mp.employee_id,
        mp.status,
        e.name,
        e.employee_number
      FROM meeting_participants mp
      JOIN employees e ON mp.employee_id = e.id
      WHERE mp.meeting_id = ?
      ORDER BY e.name ASC
      `,
      [meetingId]
    );

    res.render('meetings/show', {
      title: 'Detail Meeting',
      meeting,
      participants
    });
  } catch (err) {
    next(err);
  }
};

// Menampilkan form edit meeting berdasarkan id
const edit = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    // Mengambil data meeting
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

    // Mengambil semua employee aktif untuk pilihan peserta
    const [employees] = await db.query(
      `
      SELECT 
        id,
        name,
        employee_number
      FROM employees
      WHERE status = 'active'
      ORDER BY name ASC
      `
    );

    // Mengambil peserta yang sudah terdaftar di meeting ini
    const [selectedParticipants] = await db.query(
      `
      SELECT
        mp.employee_id,
        e.name,
        e.employee_number
      FROM meeting_participants mp
      JOIN employees e ON mp.employee_id = e.id
      WHERE mp.meeting_id = ?
      ORDER BY e.name ASC
      `,
      [meetingId]
    );

// Mengubah data peserta lama menjadi format yang lebih aman untuk JavaScript di EJS
const selectedParticipantsData = selectedParticipants.map(participant => {
  return {
    id: String(participant.employee_id),
    name: participant.name,
    number: participant.employee_number || ''
  };
});

res.render('meetings/edit', {
  title: 'Edit Meeting',
  meeting,
  employees,
  selectedParticipantsData
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
    status,
    participant_ids
  } = req.body;

  try {
    if (!title || !meeting_date || !start_time || !end_time || !meeting_type || !status) {
      return res.send('Data wajib belum lengkap. Silakan kembali dan lengkapi form.');
    }

    // Mengubah participant_ids dari string "1,2,3" menjadi array [1, 2, 3]
    const participants = participant_ids
      ? participant_ids
          .split(',')
          .map(id => parseInt(id))
          .filter(id => !isNaN(id))
      : [];

    // Update data utama meeting
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

    // Hapus peserta lama dari meeting ini
    await db.query(
      `
      DELETE FROM meeting_participants
      WHERE meeting_id = ?
      `,
      [meetingId]
    );

    // Simpan ulang peserta yang dipilih
    for (const employeeId of participants) {
      await db.query(
        `
        INSERT INTO meeting_participants
        (
          meeting_id,
          employee_id,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NOW(), NOW())
        `,
        [
          meetingId,
          employeeId,
          'invited'
        ]
      );
    }

    res.redirect(`/meetings/${meetingId}`);
  } catch (err) {
    next(err);
  }
};

// Menghapus data meeting dari database
const destroy = async (req, res, next) => {
  const meetingId = req.params.id;

  try {
    // Hapus data peserta meeting terlebih dahulu
    // Karena meeting_participants memiliki foreign key ke meetings
    await db.query(
      `
      DELETE FROM meeting_participants
      WHERE meeting_id = ?
      `,
      [meetingId]
    );

    // Hapus data notulen meeting jika ada
    // Ini untuk mencegah error foreign key dari tabel meeting_minutes
    await db.query(
      `
      DELETE FROM meeting_minutes
      WHERE meeting_id = ?
      `,
      [meetingId]
    );

    // Setelah data relasi/anak dihapus, baru hapus data meeting utama
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