import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

function getDbConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
    };
  }

  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

export async function queryDb(sql, params = []) {
  const connection = await mysql.createConnection(getDbConfig());

  try {
    const [result] = await connection.execute(sql, params);
    return result;
  } finally {
    await connection.end();
  }
}

export async function createInvitationFixture({
  title,
  organizerId = 2,
  participantEmployeeId = 1,
  participantStatus = 'invited',
  meetingStatus = 'scheduled',
} = {}) {
  const meetingDate = new Date();
  meetingDate.setDate(meetingDate.getDate() + 14);

  const meetingDateString = meetingDate.toISOString().slice(0, 10);

  const meetingResult = await queryDb(
    `
    INSERT INTO meetings
      (title, description, organizer_id, leader_id, meeting_type, meeting_date,
       start_time, end_time, online_link, is_confidential, status,
       organizer_id_id, leader_id_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      title,
      'Data undangan ini dibuat otomatis untuk testing Playwright.',
      organizerId,
      organizerId,
      'online',
      meetingDateString,
      '10:00:00',
      '11:00:00',
      'https://meet.google.com/testing-undangan',
      0,
      meetingStatus,
      organizerId,
      organizerId,
    ]
  );

  const meetingId = meetingResult.insertId;

  const participantResult = await queryDb(
    `
    INSERT INTO meeting_participants
      (meeting_id, employee_id, status, created_at, updated_at)
    VALUES
      (?, ?, ?, NOW(), NOW())
    `,
    [meetingId, participantEmployeeId, participantStatus]
  );

  return {
    meetingId,
    participantId: participantResult.insertId,
    title,
  };
}

export async function cleanupMeetingByTitle(title) {
  const meetings = await queryDb(
    `SELECT id FROM meetings WHERE title = ?`,
    [title]
  );

  if (!meetings.length) return;

  const meetingIds = meetings.map((meeting) => meeting.id);
  const placeholders = meetingIds.map(() => '?').join(',');

  await queryDb(`DELETE FROM meeting_consumption_requests WHERE meeting_id IN (${placeholders})`, meetingIds);
  await queryDb(`DELETE FROM meeting_documents WHERE meeting_id IN (${placeholders})`, meetingIds);
  await queryDb(`DELETE FROM meeting_minutes WHERE meeting_id IN (${placeholders})`, meetingIds);
  await queryDb(`DELETE FROM meeting_external_participants WHERE meeting_id IN (${placeholders})`, meetingIds);
  await queryDb(`DELETE FROM meeting_participants WHERE meeting_id IN (${placeholders})`, meetingIds);
  await queryDb(`DELETE FROM meetings WHERE id IN (${placeholders})`, meetingIds);
}

export async function createCompletedAttendanceFixture({
  title,
  organizerId = 2,
  internalEmployeeId = 1,
  internalStatus = 'confirmed',
  externalStatus = 'invited',
} = {}) {
  const meetingDate = new Date();
  meetingDate.setDate(meetingDate.getDate() - 7);

  const meetingDateString = meetingDate.toISOString().slice(0, 10);

  const meetingResult = await queryDb(
    `
    INSERT INTO meetings
      (title, description, organizer_id, leader_id, meeting_type, meeting_date,
       start_time, end_time, online_link, is_confidential, status,
       organizer_id_id, leader_id_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      title,
      'Data kehadiran ini dibuat otomatis untuk testing Playwright.',
      organizerId,
      organizerId,
      'offline',
      meetingDateString,
      '09:00:00',
      '10:00:00',
      'Ruang Testing Attendance',
      0,
      'completed',
      organizerId,
      organizerId,
    ]
  );

  const meetingId = meetingResult.insertId;

  const internalResult = await queryDb(
    `
    INSERT INTO meeting_participants
      (meeting_id, employee_id, status, created_at, updated_at)
    VALUES
      (?, ?, ?, NOW(), NOW())
    `,
    [meetingId, internalEmployeeId, internalStatus]
  );

  const externalResult = await queryDb(
    `
    INSERT INTO meeting_external_participants
      (meeting_id, name, institution, email, status, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      meetingId,
      'Peserta Eksternal Testing',
      'Instansi Testing',
      `eksternal.testing.${Date.now()}@example.com`,
      externalStatus,
    ]
  );

  return {
    meetingId,
    internalParticipantId: internalResult.insertId,
    externalParticipantId: externalResult.insertId,
    title,
  };
}

export async function getAttendanceStatuses(meetingId) {
  const internal = await queryDb(
    `
    SELECT status
    FROM meeting_participants
    WHERE meeting_id = ?
    ORDER BY id ASC
    `,
    [meetingId]
  );

  const external = await queryDb(
    `
    SELECT status
    FROM meeting_external_participants
    WHERE meeting_id = ?
    ORDER BY id ASC
    `,
    [meetingId]
  );

  return {
    internal: internal.map((row) => row.status),
    external: external.map((row) => row.status),
  };
}

export async function createMinuteFixture({
  title,
  organizerId = 2,
  internalEmployeeId = 1,
  summary = 'Ringkasan notulensi testing Playwright.',
} = {}) {
  const meetingFixture = await createCompletedAttendanceFixture({
    title,
    organizerId,
    internalEmployeeId,
    internalStatus: 'attended',
    externalStatus: 'attended',
  });

  const minuteResult = await queryDb(
    `
    INSERT INTO meeting_minutes
      (meeting_id, file, summary, created_by, employee_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      meetingFixture.meetingId,
      '/assets/uploads/testing-notulensi-playwright.pdf',
      summary,
      organizerId,
      organizerId,
    ]
  );

  return {
    ...meetingFixture,
    minuteId: minuteResult.insertId,
    summary,
  };
}