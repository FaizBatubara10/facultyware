var express = require("express");
var router = express.Router();

const indexController = require("../controllers/indexController");
const { isAuthenticated } = require("../middlewares/auth");

router.get("/", indexController.index);

router.get("/home", isAuthenticated, indexController.home);

router.get("/login", indexController.loginPage);

router.post("/login", indexController.login);

router.get("/logout", indexController.logout);
router.get("/lupa-password", (req, res) => {
  res.render("lupa-password", { title: "Lupa Password" });
});


router.get("/register", (req, res) => {
  res.render("register", { title: "Daftar Akun Baru", error: null });
});

module.exports = router;
