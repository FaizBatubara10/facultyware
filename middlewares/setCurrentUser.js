const db = require('../lib/db');

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
    
    console.error('setCurrentUser middleware error:', err.message);
  }

  next();
};

module.exports = { setCurrentUser };
