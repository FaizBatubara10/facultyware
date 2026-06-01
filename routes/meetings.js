var express = require('express');
var router = express.Router();

const meetingController = require('../controllers/meetingController');

router.get('/', meetingController.index);
router.get('/create', meetingController.create);
router.post('/', meetingController.store);
router.get('/:id', meetingController.show);
router.get('/:id/edit', meetingController.edit);
router.post('/:id', meetingController.update);
router.post('/:id/delete', meetingController.destroy);

module.exports = router;