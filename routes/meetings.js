var express = require('express');
var router = express.Router();

const meetingController = require('../controllers/meetingController');
const { isAuthenticated } = require('../middlewares/auth');

// Semua rute otomatis diawali dengan /meetings (diatur dari app.js)
router.get('/', isAuthenticated, meetingController.index);
router.get('/create', isAuthenticated, meetingController.create);
router.post('/', isAuthenticated, meetingController.store);
router.get('/:id', isAuthenticated, meetingController.show);
router.get('/:id/edit', isAuthenticated, meetingController.edit);
router.post('/:id/edit', isAuthenticated, meetingController.update); 
router.post('/:id/delete', isAuthenticated, meetingController.destroy);

module.exports = router;