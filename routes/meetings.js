var express = require('express');
var router = express.Router();

const meetingController = require('../controllers/meetingController');
const minuteController = require('../controllers/minuteController');
const { isAuthenticated } = require('../middlewares/auth');
const { isEmployee, canAccessMeeting, isHost } = require('../middlewares/meetingAccess');
const upload = require('../middlewares/upload');

// ── Rute Utama Meeting ──────────────────────────────────────────────────────
router.get('/', isAuthenticated, meetingController.index);

// Create meeting hanya untuk user yang punya data employee
router.get('/create', isAuthenticated, isEmployee, meetingController.create);
router.post('/', isAuthenticated, isEmployee, meetingController.store);

// ── Rute Notulensi (harus SEBELUM /:id agar tidak tertimpa) ────────────────
router.get('/upload-minutes', isAuthenticated, minuteController.renderUploadMinutesForm);
router.post('/upload-minutes', isAuthenticated, upload.fields([{ name: 'file_notulensi', maxCount: 1 },{ name: 'file_dokumentasi', maxCount: 10 }]),minuteController.processUploadMinutes);

// Hapus notulensi
router.post('/minutes/:id/delete', isAuthenticated, minuteController.deleteMinute);

// Ganti file notulensi
router.post('/minutes/:id/replace', isAuthenticated, upload.fields([
  { name: 'file_notulensi', maxCount: 1 },
  { name: 'file_dokumentasi', maxCount: 10 }
]), minuteController.replaceMinute);

// Export notulensi sebagai PDF
router.get('/minutes/:id/export-pdf', isAuthenticated, minuteController.exportMinutePdf);

// Export daftar hadir peserta meeting dalam format Excel
router.get('/:id/export-attendance', isAuthenticated, isHost, meetingController.exportAttendanceExcel);

// Update kehadiran peserta — hanya host dan hanya setelah meeting completed
router.post('/:id/attendance', isAuthenticated, isHost, meetingController.updateAttendance);

// ── Rute Detail Meeting ─────────────────────────────────────────────────────
// Detail meeting hanya untuk host atau peserta internal yang diundang
router.get('/:id', isAuthenticated, canAccessMeeting, meetingController.show);

// ── Rute Edit / Update / Hapus — hanya untuk host ──────────────────────────
router.get('/:id/edit', isAuthenticated, isHost, meetingController.edit);
router.post('/:id/edit', isAuthenticated, isHost, meetingController.update);
router.post('/:id/delete', isAuthenticated, isHost, meetingController.destroy);

module.exports = router;
