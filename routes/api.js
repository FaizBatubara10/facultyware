var express = require('express');
var router = express.Router();

const apiController = require('../controllers/apiController');
const { isAuthenticated } = require('../middlewares/auth');

router.get('/meetings', isAuthenticated, apiController.listMeetings);
router.get('/meetings/:id', isAuthenticated, apiController.showMeeting);

module.exports = router;