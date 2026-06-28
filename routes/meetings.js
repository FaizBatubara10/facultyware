var express = require('express');
var router = express.Router();

const meetingController = require('../controllers/meetingController');
const minuteController = require('../controllers/minuteController');
const { isAuthenticated } = require('../middlewares/auth');
const { isEmployee, canAccessMeeting, isHost } = require('../middlewares/meetingAccess');
const upload = require('../middlewares/upload');


router.get('/', isAuthenticated, meetingController.index);


router.get('/create', isAuthenticated, isEmployee, meetingController.create);
router.post('/', isAuthenticated, isEmployee, meetingController.store);


router.get('/upload-minutes', isAuthenticated, minuteController.renderUploadMinutesForm);
router.post('/upload-minutes', isAuthenticated, upload.fields([{ name: 'file_notulensi', maxCount: 1 },{ name: 'file_dokumentasi', maxCount: 10 }]),minuteController.processUploadMinutes);


router.post('/minutes/:id/delete', isAuthenticated, minuteController.deleteMinute);


router.post('/minutes/:id/replace', isAuthenticated, upload.fields([
  { name: 'file_notulensi', maxCount: 1 },
  { name: 'file_dokumentasi', maxCount: 10 }
]), minuteController.replaceMinute);


router.get('/minutes/:id/export-pdf', isAuthenticated, minuteController.exportMinutePdf);


router.get('/:id/export-attendance', isAuthenticated, isHost, meetingController.exportAttendanceExcel);


router.post('/:id/attendance', isAuthenticated, isHost, meetingController.updateAttendance);


router.get('/:id', isAuthenticated, canAccessMeeting, meetingController.show);


router.get('/:id/edit', isAuthenticated, isHost, meetingController.edit);
router.post('/:id/edit', isAuthenticated, isHost, meetingController.update);
router.post('/:id/delete', isAuthenticated, isHost, meetingController.destroy);

module.exports = router;
