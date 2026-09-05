const VALID_ROLES = new Set(['user', 'admin']);

function validateRole(value) {
  if (typeof value !== 'string' || !VALID_ROLES.has(value)) {
    return { errorCode: 'INVALID_ROLE' };
  }

  return { value };
}

module.exports = {
  validateRole
};
