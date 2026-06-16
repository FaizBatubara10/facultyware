const express = require("express");
const router = express.Router();

const invitationController = require("../controllers/invitationController");
const { isAuthenticated } = require("../middlewares/auth");

// GET /invitations/inbox — daftar undangan pending milik user
router.get("/inbox", isAuthenticated, invitationController.inbox);

// GET /invitations/:participantId — detail undangan
router.get("/:participantId", isAuthenticated, invitationController.detail);

// POST /invitations/:participantId/status — update status (confirmed/declined)
router.post("/:participantId/status", isAuthenticated, invitationController.updateStatus);

module.exports = router;