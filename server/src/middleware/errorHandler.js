export function notFound(_req, res) {
  res.status(404).json({ message: "Not found" });
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({ message });
}
