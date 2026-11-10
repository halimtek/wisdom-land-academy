export function roleIsAllowed(userRole, allowedRoles) {
  return allowedRoles.includes(userRole);
}
