const express = require("express");
const router = express.Router();

const invitationController = require("../controllers/invitationController");
const { isAuthenticated } = require("../middlewares/auth");


router.get("/inbox", isAuthenticated, invitationController.inbox);


router.get("/:participantId", isAuthenticated, invitationController.detail);


router.post("/:participantId/status", isAuthenticated, invitationController.updateStatus);

module.exports = router;