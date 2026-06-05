const db = require('../lib/db');

/**
 * Middleware that automatically fetches the logged-in user from the database
 * and attaches it to res.locals so it is available in ALL EJS views.
 * Access via `currentUser` in any template.
 */
const setCurrentUser = async (req, res, next) => {
  res.locals.currentUser = null;

  if (!req.session.userId) {
    return next();
  }

  try {
    const [rows] = await db.query(
      'SELECT id, name, email FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (rows.length > 0) {
      res.locals.currentUser = rows[0];
    }
  } catch (err) {
    // Non-fatal: user just won't be shown in sidebar
    console.error('setCurrentUser middleware error:', err.message);
  }

  next();
};

module.exports = { setCurrentUser };
