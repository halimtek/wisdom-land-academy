export function loginModeMatchesRole(mode, role) {
  return mode === role;
}

export function destinationForRole(role) {
  return role === 'ADMIN' ? '/admin' : '/library';
}
