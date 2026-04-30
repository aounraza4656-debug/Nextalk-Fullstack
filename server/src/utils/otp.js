export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function otpExpiresAt() {
  return new Date(Date.now() + 10 * 60 * 1000);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}
