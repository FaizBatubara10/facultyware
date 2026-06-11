var express = require('express');
var router = express.Router();
var multer = require('multer');
const fs = require('fs');

const meetingController = require('../controllers/meetingController');
const { isAuthenticated } = require('../middlewares/auth');

// Tentukan lokasi folder upload dan buat jika belum ada
const uploadDir = './public/assets/uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi Multer dengan validasi format file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Format file tidak didukung. Gunakan PDF, Word, JPG, atau PNG.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // Maks 10MB
});

// ── Rute Utama Meeting ──────────────────────────────────────────────────────
router.get('/', isAuthenticated, meetingController.index);
router.get('/create', isAuthenticated, meetingController.create);
router.post('/', isAuthenticated, meetingController.store);

// ── Rute Notulensi (harus SEBELUM /:id agar tidak tertimpa) ────────────────
router.get('/upload-minutes', isAuthenticated, meetingController.renderUploadMinutesForm);
router.post('/upload-minutes', isAuthenticated, upload.single('file_notulensi'), meetingController.processUploadMinutes);

// BARU: Hapus notulensi
router.post('/minutes/:id/delete', isAuthenticated, meetingController.deleteMinute);

// BARU: Ganti file notulensi
router.post('/minutes/:id/replace', isAuthenticated, upload.single('file_notulensi'), meetingController.replaceMinute);

// BARU: Export notulensi sebagai PDF
router.get('/minutes/:id/export-pdf', isAuthenticated, meetingController.exportMinutePdf);

// ── Rute Detail / Edit / Hapus Meeting ─────────────────────────────────────
router.get('/:id', isAuthenticated, meetingController.show);
router.get('/:id/edit', isAuthenticated, meetingController.edit);
router.post('/:id/edit', isAuthenticated, meetingController.update);
router.post('/:id/delete', isAuthenticated, meetingController.destroy);

module.exports = router;