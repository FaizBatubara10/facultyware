var express = require('express');
var router = express.Router();

const meetingController = require('../controllers/meetingController');
const minuteController = require('../controllers/minuteController');
const { isAuthenticated } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// ── Rute Utama Meeting ──────────────────────────────────────────────────────
router.get('/', isAuthenticated, meetingController.index);
router.get('/create', isAuthenticated, meetingController.create);
router.post('/', isAuthenticated, meetingController.store);

// ── Rute Notulensi (harus SEBELUM /:id agar tidak tertimpa) ────────────────
router.get('/upload-minutes', isAuthenticated, minuteController.renderUploadMinutesForm);
router.post('/upload-minutes', isAuthenticated, upload.single('file_notulensi'), minuteController.processUploadMinutes);

// Hapus notulensi
router.post('/minutes/:id/delete', isAuthenticated, minuteController.deleteMinute);

// Ganti file notulensi
router.post('/minutes/:id/replace', isAuthenticated, upload.single('file_notulensi'), minuteController.replaceMinute);

// Export notulensi sebagai PDF
router.get('/minutes/:id/export-pdf', isAuthenticated, minuteController.exportMinutePdf);

// ── Rute Detail / Edit / Hapus Meeting ─────────────────────────────────────
router.get('/:id', isAuthenticated, meetingController.show);
router.get('/:id/edit', isAuthenticated, meetingController.edit);
router.post('/:id/edit', isAuthenticated, meetingController.update);
router.post('/:id/delete', isAuthenticated, meetingController.destroy);

module.exports = router;