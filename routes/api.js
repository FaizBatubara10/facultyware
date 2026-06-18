var express = require('express');
var router = express.Router();

const apiController = require('../controllers/apiController');
const { isAuthenticated } = require('../middlewares/auth');

router.get('/meetings', isAuthenticated, apiController.listMeetings);
router.get('/meetings/:id', isAuthenticated, apiController.showMeeting);
router.get('/invitations', isAuthenticated, apiController.listInvitations);
router.get('/invitations/:id', isAuthenticated, apiController.showInvitation);
router.post('/invitations/:id/status', isAuthenticated, apiController.updateInvitationStatus);

router.get('/minutes', isAuthenticated, apiController.listMinutes);
router.get('/minutes/:id', isAuthenticated, apiController.showMinute);

router.get('/dashboard', isAuthenticated, apiController.dashboardStats);

module.exports = router;