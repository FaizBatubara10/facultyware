var express = require('express');
var router = express.Router();

const meetingController = require('../controllers/meetingController');
const minuteController = require('../controllers/minuteController');
const { isAuthenticated } = require('../middlewares/auth');
const { isEmployee, isHost } = require('../middlewares/meetingAccess');
const upload = require('../middlewares/upload');

// ── Rute Utama Meeting ──────────────────────────────────────────────────────
router.get('/', isAuthenticated, meetingController.index);

// Create meeting hanya untuk user yang punya data employee
router.get('/create', isAuthenticated, isEmployee, meetingController.create);
router.post('/', isAuthenticated, isEmployee, meetingController.store);

// ── Rute Notulensi (harus SEBELUM /:id agar tidak tertimpa) ────────────────
router.get('/upload-minutes', isAuthenticated, minuteController.renderUploadMinutesForm);
router.post('/upload-minutes', isAuthenticated, upload.single('file_notulensi'), minuteController.processUploadMinutes);

// Hapus notulensi
router.post('/minutes/:id/delete', isAuthenticated, minuteController.deleteMinute);

// Ganti file notulensi
router.post('/minutes/:id/replace', isAuthenticated, upload.single('file_notulensi'), minuteController.replaceMinute);

// Export notulensi sebagai PDF
router.get('/minutes/:id/export-pdf', isAuthenticated, minuteController.exportMinutePdf);

// ── Rute Detail Meeting ─────────────────────────────────────────────────────
router.get('/:id', isAuthenticated, meetingController.show);

// ── Rute Edit / Update / Hapus — hanya untuk host ──────────────────────────
router.get('/:id/edit', isAuthenticated, isHost, meetingController.edit);
router.post('/:id/edit', isAuthenticated, isHost, meetingController.update);
router.post('/:id/delete', isAuthenticated, isHost, meetingController.destroy);

module.exports = router;