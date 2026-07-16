const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const SESSION_TTL = '12h';
const SESSION_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signSessionToken(subjectId, role) {
  return jwt.sign({ sub: subjectId, role }, env.jwtSecret, { expiresIn: SESSION_TTL });
}

function verifySessionToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  SESSION_COOKIE_MAX_AGE_MS,
};
