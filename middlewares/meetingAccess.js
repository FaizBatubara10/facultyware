// Skeleton — middleware ini belum diimplementasikan.
// Akan diisi nanti untuk validasi akses host/peserta ke meeting tertentu.

const meetingAccess = (req, res, next) => {
  // TODO: implementasi akses kontrol meeting
  next();
};

module.exports = { meetingAccess };