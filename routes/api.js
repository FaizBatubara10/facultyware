var express = require('express');
var router = express.Router();

const apiController = require('../controllers/apiController');
const { isAuthenticated } = require('../middlewares/auth');

// API Meeting
router.get('/meetings', isAuthenticated, apiController.listMeetings);
router.get('/meetings/:id', isAuthenticated, apiController.showMeeting);

// API Notulen
router.get('/minutes', isAuthenticated, apiController.listMinutes);
router.get('/minutes/:id', isAuthenticated, apiController.showMinute);

module.exports = router;