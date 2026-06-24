var createError = require('http-errors');

// catch 404 and forward to error handler
const notFoundHandler = (req, res, next) => {
  next(createError(404));
};

// error handler
const errorHandler = (err, req, res, next) => {
  console.error('=== APP ERROR ===');
  console.error(err.stack || err.message || err);

  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
};

module.exports = {
  notFoundHandler,
  errorHandler
};
